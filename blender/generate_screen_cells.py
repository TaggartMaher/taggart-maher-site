"""
Subdivide SCREEN's mesh into N×N cells, turn each cell face into its own
object with its own Cycles Light Group, and wire up the Compositor so
each light group renders to its own EXR sequence.

Re-runs are idempotent: existing SCREEN_CELL_* objects, screen_*
light-group AOVs, and the cells_compositor node tree are wiped and
rebuilt.

Assumes the .blend has:
  - SCREEN              — quad whose mesh is subdivided to make cells.
  - SCREEN_POSITION     — its material slot 0 supplies the cell material.
  - ScenePosition       — collection cells are linked into.
  - Position            — view layer; light-group AOVs are added here.
  - render engine: Cycles.
"""

import json
import os

import bpy # type: ignore
import bmesh # type: ignore


CELLS_PER_SIDE = 9
OUTPUT_DIRECTORY = "//renders/cells/"

SCREEN_NAME = "SCREEN"
POSITION_TEMPLATE_NAME = "SCREEN_POSITION"
CELL_COLLECTION_NAME = "ScenePosition"
CELL_VIEW_LAYER_NAME = "Position"
CELL_PREFIX = "SCREEN_CELL_"
LIGHT_GROUP_PREFIX = "screen_"
COMPOSITOR_TREE_NAME = "cells_compositor"
# Cycles names lightgroup sockets `Combined_<groupname>` on the
# Render Layers node.
RENDER_LAYER_LIGHTGROUP_PREFIX = "Combined_"


def generate_screen_cells(cells_per_side):
    if cells_per_side < 1:
        raise ValueError(f"CELLS_PER_SIDE must be >= 1, got {cells_per_side}")

    screen = bpy.data.objects.get(SCREEN_NAME)
    if screen is None:
        raise RuntimeError(f"Object '{SCREEN_NAME}' not found")

    cell_collection = bpy.data.collections.get(CELL_COLLECTION_NAME)
    if cell_collection is None:
        raise RuntimeError(f"Collection '{CELL_COLLECTION_NAME}' not found")

    position_template = bpy.data.objects.get(POSITION_TEMPLATE_NAME)
    cell_material = None
    if position_template is not None and position_template.material_slots:
        cell_material = position_template.material_slots[0].material
        # Disable render for the template — coplanar with cells, would
        # absorb their emission and blank the AOVs.
        if not position_template.hide_render:
            position_template.hide_render = True
            print(f"[info] disabled render for '{POSITION_TEMPLATE_NAME}'")
    if cell_material is None:
        print(f"[warn] no material on '{POSITION_TEMPLATE_NAME}' — cells will have none")

    for existing_object in list(bpy.data.objects):
        if existing_object.name.startswith(CELL_PREFIX):
            mesh_data = existing_object.data
            bpy.data.objects.remove(existing_object, do_unlink=True)
            if mesh_data and mesh_data.users == 0:
                bpy.data.meshes.remove(mesh_data)

    source_bmesh = bmesh.new()
    source_bmesh.from_mesh(screen.data)
    cuts = cells_per_side - 1
    if cuts > 0:
        bmesh.ops.subdivide_edges(
            source_bmesh,
            edges=source_bmesh.edges[:],
            cuts=cuts,
            use_grid_fill=True,
        )
    source_bmesh.faces.ensure_lookup_table()
    source_uv_layer = source_bmesh.loops.layers.uv.active

    expected_count = cells_per_side * cells_per_side
    if len(source_bmesh.faces) != expected_count:
        print(
            f"[warn] subdivide produced {len(source_bmesh.faces)} faces, "
            f"expected {expected_count} — SCREEN may not be a simple quad"
        )

    for face_index, source_face in enumerate(source_bmesh.faces):
        cell_bmesh = bmesh.new()
        vertex_map = {}
        for source_loop in source_face.loops:
            new_vertex = cell_bmesh.verts.new(source_loop.vert.co)
            vertex_map[source_loop.vert] = new_vertex
        new_face = cell_bmesh.faces.new(
            [vertex_map[loop.vert] for loop in source_face.loops]
        )

        uv_origin = (0.0, 0.0)
        uv_size = (1.0, 1.0)
        if source_uv_layer is not None:
            source_uvs = [tuple(loop[source_uv_layer].uv) for loop in source_face.loops]
            u_values = [uv[0] for uv in source_uvs]
            v_values = [uv[1] for uv in source_uvs]
            u_min, u_max = min(u_values), max(u_values)
            v_min, v_max = min(v_values), max(v_values)
            u_span = u_max - u_min
            v_span = v_max - v_min
            uv_origin = (u_min, v_min)
            uv_size = (u_span, v_span)

            cell_uv_layer = cell_bmesh.loops.layers.uv.new("UVMap")
            for source_uv, new_loop in zip(source_uvs, new_face.loops):
                stretched_u = (source_uv[0] - u_min) / u_span if u_span > 1e-9 else 0.0
                stretched_v = (source_uv[1] - v_min) / v_span if v_span > 1e-9 else 0.0
                new_loop[cell_uv_layer].uv = (stretched_u, stretched_v)

        cell_name = f"{CELL_PREFIX}{face_index}"
        cell_mesh = bpy.data.meshes.new(f"{cell_name}_MESH")
        cell_bmesh.to_mesh(cell_mesh)
        cell_bmesh.free()

        cell_object = bpy.data.objects.new(cell_name, cell_mesh)
        cell_object.parent = screen
        cell_object["uv_origin"] = uv_origin
        cell_object["uv_size"] = uv_size

        if cell_material is not None:
            cell_object.data.materials.append(cell_material)

        cell_object.lightgroup = f"{LIGHT_GROUP_PREFIX}{face_index}"
        cell_collection.objects.link(cell_object)

    source_bmesh.free()

    view_layer = bpy.context.scene.view_layers.get(CELL_VIEW_LAYER_NAME)
    if view_layer is None:
        print(f"[warn] view layer '{CELL_VIEW_LAYER_NAME}' not found — skipping AOVs")
    else:
        stale_groups = [
            light_group for light_group in view_layer.lightgroups
            if light_group.name.startswith(LIGHT_GROUP_PREFIX)
        ]
        for stale in stale_groups:
            view_layer.lightgroups.remove(stale)

        for face_index in range(expected_count):
            view_layer.lightgroups.add(name=f"{LIGHT_GROUP_PREFIX}{face_index}")

    print(f"[ok] generated {expected_count} cells ({cells_per_side}x{cells_per_side})")


def setup_cell_compositor(output_directory):
    scene = bpy.context.scene
    if scene.render.engine != "CYCLES":
        print(f"[warn] render engine is '{scene.render.engine}' — light groups require CYCLES")

    view_layer = scene.view_layers.get(CELL_VIEW_LAYER_NAME)
    if view_layer is None:
        print(f"[warn] view layer '{CELL_VIEW_LAYER_NAME}' not found — skipping compositor setup")
        return

    # Adds "Denoising Normal" and "Denoising Albedo" outputs to the
    # Render Layers node so per-cell Denoise nodes can use them as
    # guidance — visibly better than RGB-only denoising at the low
    # sample counts a per-cell pass affords.
    view_layer.cycles.denoising_store_passes = True

    cell_groups = sorted(
        light_group.name for light_group in view_layer.lightgroups
        if light_group.name.startswith(LIGHT_GROUP_PREFIX)
    )
    if not cell_groups:
        print("[warn] no screen_* light groups found — skipping compositor setup")
        return

    node_tree = scene.compositing_node_group
    if node_tree is None:
        node_tree = bpy.data.node_groups.new(COMPOSITOR_TREE_NAME, "CompositorNodeTree")
        scene.compositing_node_group = node_tree
        print(f"[info] created new compositor tree '{COMPOSITOR_TREE_NAME}'")
    else:
        print(f"[info] reusing existing compositor tree '{node_tree.name}'")

    cells_node_prefix = "cells_"
    for node in list(node_tree.nodes):
        if node.name.startswith(cells_node_prefix):
            node_tree.nodes.remove(node)

    render_layers_node = node_tree.nodes.new("CompositorNodeRLayers")
    render_layers_node.name = "cells_renderlayers"
    render_layers_node.label = "cells: Position view layer"
    render_layers_node.layer = CELL_VIEW_LAYER_NAME
    render_layers_node.location = (-600, -400)

    # Geometry doesn't change per light group, so a single Normal /
    # Albedo source feeds every cell's Denoise node.
    denoise_normal_socket = render_layers_node.outputs.get("Denoising Normal")
    denoise_albedo_socket = render_layers_node.outputs.get("Denoising Albedo")
    if denoise_normal_socket is None or denoise_albedo_socket is None:
        print("[warn] denoising data sockets missing from render layers node")

    connected = 0
    missing = []
    for cell_index, group_name in enumerate(cell_groups):
        socket_name = f"{RENDER_LAYER_LIGHTGROUP_PREFIX}{group_name}"
        if socket_name not in render_layers_node.outputs:
            missing.append(socket_name)
            continue

        denoise_node = node_tree.nodes.new("CompositorNodeDenoise")
        denoise_node.name = f"cells_denoise_{group_name}"
        denoise_node.label = f"cells: denoise {group_name}"
        denoise_node.location = (-300, -400 - cell_index * 60)

        file_output_node = node_tree.nodes.new("CompositorNodeOutputFile")
        file_output_node.name = f"cells_output_{group_name}"
        file_output_node.label = f"cells: {group_name}"
        file_output_node.location = (-100, -400 - cell_index * 60)
        file_output_node.directory = output_directory
        file_output_node.file_name = f"{group_name}_####"
        file_output_node.format.file_format = "OPEN_EXR_MULTILAYER"
        file_output_node.format.color_mode = "RGBA"
        file_output_node.format.color_depth = "32"
        file_output_node.format.exr_codec = "ZIP"

        file_output_node.file_output_items.new(socket_type="RGBA", name=group_name)

        node_tree.links.new(
            render_layers_node.outputs[socket_name],
            denoise_node.inputs["Image"],
        )
        if denoise_normal_socket is not None:
            node_tree.links.new(denoise_normal_socket, denoise_node.inputs["Normal"])
        if denoise_albedo_socket is not None:
            node_tree.links.new(denoise_albedo_socket, denoise_node.inputs["Albedo"])
        node_tree.links.new(
            denoise_node.outputs["Image"],
            file_output_node.inputs[group_name],
        )
        connected += 1

    print(f"[ok] compositor wired: {connected} File Output nodes -> {output_directory}")
    if missing:
        print(f"[warn] missing render-layer sockets: {missing}")


def write_cells_manifest(cells_per_side, output_directory):
    """Map face_index -> screen-plane (col, row). bmesh's
    subdivide+grid_fill doesn't emit faces row-major; the web build
    consumes this manifest to upload `u_cellGrid` to the shader."""
    manifest_cells = []
    for face_index in range(cells_per_side * cells_per_side):
        cell_object = bpy.data.objects.get(f"{CELL_PREFIX}{face_index}")
        if cell_object is None:
            print(f"[warn] manifest: cell {face_index} not found — skipping")
            continue
        uv_origin = tuple(cell_object.get("uv_origin", (0.0, 0.0)))
        uv_size = tuple(cell_object.get("uv_size", (1.0, 1.0)))
        # uv_size is the same for every cell in a regular subdivision,
        # so uv_origin / uv_size is the cell's integer (col, row).
        column = round(uv_origin[0] / uv_size[0]) if uv_size[0] > 1e-9 else 0
        row = round(uv_origin[1] / uv_size[1]) if uv_size[1] > 1e-9 else 0
        manifest_cells.append({
            "index": face_index,
            "col": column,
            "row": row,
            "uvOrigin": [uv_origin[0], uv_origin[1]],
            "uvSize": [uv_size[0], uv_size[1]],
        })

    manifest = {"cellsPerSide": cells_per_side, "cells": manifest_cells}
    resolved_directory = bpy.path.abspath(output_directory)
    os.makedirs(resolved_directory, exist_ok=True)
    manifest_path = os.path.join(resolved_directory, "cells_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as manifest_file:
        json.dump(manifest, manifest_file, indent=2)
        manifest_file.write("\n")
    print(f"[ok] wrote cells manifest -> {manifest_path}")


generate_screen_cells(CELLS_PER_SIDE)
setup_cell_compositor(OUTPUT_DIRECTORY)
write_cells_manifest(CELLS_PER_SIDE, OUTPUT_DIRECTORY)
