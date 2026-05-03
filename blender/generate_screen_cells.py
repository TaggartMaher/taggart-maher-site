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


REPO_ROOT = os.path.expanduser("~/rr/taggart-maher-site")


def _read_env_value(name):
    env_path = os.path.join(REPO_ROOT, ".env")
    if not os.path.isfile(env_path):
        return None
    try:
        with open(env_path, "r", encoding="utf-8") as env_file:
            for line in env_file:
                stripped = line.strip()
                if not stripped or stripped.startswith("#") or "=" not in stripped:
                    continue
                key, _, raw_value = stripped.partition("=")
                if key.strip() == name:
                    return raw_value.strip().strip('"').strip("'")
    except OSError:
        return None
    return None


def _read_int_env(name, default):
    raw = _read_env_value(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


SCENE_CELLS_PER_SIDE = _read_int_env("CELLS_PER_SIDE", 9)
STEAM_CELLS_PER_SIDE = _read_int_env("STEAM_CELLS_PER_SIDE", 3)

SCREEN_NAME = "SCREEN"
POSITION_TEMPLATE_NAME = "SCREEN_POSITION"
COMPOSITOR_TREE_NAME = "cells_compositor"
# Cycles names lightgroup sockets `Combined_<groupname>` on the
# Render Layers node.
RENDER_LAYER_LIGHTGROUP_PREFIX = "Combined_"

SCENE_PASS = {
    "cells_per_side": SCENE_CELLS_PER_SIDE,
    "collection_name": "ScenePosition",
    "view_layer_name": "Position",
    "cell_prefix": "SCREEN_CELL_",
    "light_group_prefix": "screen_",
    "compositor_node_prefix": "cells_",
    "output_directory": "//renders/cells/",
    "manifest_filename": "cells_manifest.json",
    "combined_alpha_basename": None,
}

STEAM_PASS = {
    "cells_per_side": STEAM_CELLS_PER_SIDE,
    "collection_name": "SteamScenePosition",
    "view_layer_name": "CoffeeSteam",
    "cell_prefix": "STEAM_CELL_",
    "light_group_prefix": "steam_",
    "compositor_node_prefix": "steam_cells_",
    "output_directory": "//renders/steam_cells/",
    "manifest_filename": "steam_cells_manifest.json",
    # Volume density (1 - transmittance) for the camera ray. Only the
    # Combined output of the view layer carries this — light-group
    # sockets are RGB-only intensity. The bake reads this file's alpha
    # alongside the per-cell EXRs to drive backdrop occlusion.
    "combined_alpha_basename": "steam_combined",
}


def generate_screen_cells(
    cells_per_side,
    collection_name,
    view_layer_name,
    cell_prefix,
    light_group_prefix,
):
    if cells_per_side < 1:
        raise ValueError(f"cells_per_side must be >= 1, got {cells_per_side}")

    screen = bpy.data.objects.get(SCREEN_NAME)
    if screen is None:
        raise RuntimeError(f"Object '{SCREEN_NAME}' not found")

    cell_collection = bpy.data.collections.get(collection_name)
    if cell_collection is None:
        raise RuntimeError(f"Collection '{collection_name}' not found")

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
        if existing_object.name.startswith(cell_prefix):
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

        cell_name = f"{cell_prefix}{face_index}"
        cell_mesh = bpy.data.meshes.new(f"{cell_name}_MESH")
        cell_bmesh.to_mesh(cell_mesh)
        cell_bmesh.free()

        cell_object = bpy.data.objects.new(cell_name, cell_mesh)
        cell_object.parent = screen
        cell_object["uv_origin"] = uv_origin
        cell_object["uv_size"] = uv_size

        if cell_material is not None:
            cell_object.data.materials.append(cell_material)

        cell_object.lightgroup = f"{light_group_prefix}{face_index}"
        cell_collection.objects.link(cell_object)

    source_bmesh.free()

    view_layer = bpy.context.scene.view_layers.get(view_layer_name)
    if view_layer is None:
        print(f"[warn] view layer '{view_layer_name}' not found — skipping AOVs")
    else:
        stale_groups = [
            light_group for light_group in view_layer.lightgroups
            if light_group.name.startswith(light_group_prefix)
        ]
        for stale in stale_groups:
            view_layer.lightgroups.remove(stale)

        for face_index in range(expected_count):
            view_layer.lightgroups.add(name=f"{light_group_prefix}{face_index}")

    print(
        f"[ok] generated {expected_count} cells ({cells_per_side}x{cells_per_side}) "
        f"in '{collection_name}' for view layer '{view_layer_name}'"
    )


def setup_cell_compositor(
    output_directory,
    view_layer_name,
    light_group_prefix,
    compositor_node_prefix,
    combined_alpha_basename,
):
    scene = bpy.context.scene
    if scene.render.engine != "CYCLES":
        print(f"[warn] render engine is '{scene.render.engine}' — light groups require CYCLES")

    view_layer = scene.view_layers.get(view_layer_name)
    if view_layer is None:
        print(f"[warn] view layer '{view_layer_name}' not found — skipping compositor setup")
        return

    # Adds "Denoising Normal" and "Denoising Albedo" outputs to the
    # Render Layers node so per-cell Denoise nodes can use them as
    # guidance — visibly better than RGB-only denoising at the low
    # sample counts a per-cell pass affords.
    view_layer.cycles.denoising_store_passes = True

    cell_groups = sorted(
        light_group.name for light_group in view_layer.lightgroups
        if light_group.name.startswith(light_group_prefix)
    )
    if not cell_groups:
        print(f"[warn] no {light_group_prefix}* light groups found — skipping compositor setup")
        return

    node_tree = scene.compositing_node_group
    if node_tree is None:
        node_tree = bpy.data.node_groups.new(COMPOSITOR_TREE_NAME, "CompositorNodeTree")
        scene.compositing_node_group = node_tree
        print(f"[info] created new compositor tree '{COMPOSITOR_TREE_NAME}'")
    else:
        print(f"[info] reusing existing compositor tree '{node_tree.name}'")

    for node in list(node_tree.nodes):
        if node.name.startswith(compositor_node_prefix):
            node_tree.nodes.remove(node)

    render_layers_node = node_tree.nodes.new("CompositorNodeRLayers")
    render_layers_node.name = f"{compositor_node_prefix}renderlayers"
    render_layers_node.label = f"{compositor_node_prefix}{view_layer_name} view layer"
    render_layers_node.layer = view_layer_name
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
        denoise_node.name = f"{compositor_node_prefix}denoise_{group_name}"
        denoise_node.label = f"{compositor_node_prefix}denoise {group_name}"
        denoise_node.location = (-300, -400 - cell_index * 60)

        file_output_node = node_tree.nodes.new("CompositorNodeOutputFile")
        file_output_node.name = f"{compositor_node_prefix}output_{group_name}"
        file_output_node.label = f"{compositor_node_prefix}{group_name}"
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

    if combined_alpha_basename is not None:
        # The Render Layers node's "Image" socket is the Combined RGBA
        # output of the view layer. With film_transparent = True and a
        # holdout, alpha = 1 - transmittance for the camera ray —
        # exactly the volume density the runtime needs to occlude the
        # backdrop. Light-group sockets can't carry this.
        combined_socket = render_layers_node.outputs.get("Image")
        if combined_socket is None:
            print("[warn] render layers node has no 'Image' socket — skipping combined-alpha output")
        else:
            # Same denoise treatment as the per-cell light groups so
            # the alpha (volume density) and the RGB scatter come out
            # of OIDN clean — important at moderate sample counts
            # where the camera-ray transmittance integral is noisy.
            combined_denoise_node = node_tree.nodes.new("CompositorNodeDenoise")
            combined_denoise_node.name = f"{compositor_node_prefix}denoise_combined"
            combined_denoise_node.label = f"{compositor_node_prefix}denoise {combined_alpha_basename}"
            combined_denoise_node.location = (-300, -300)

            combined_output_node = node_tree.nodes.new("CompositorNodeOutputFile")
            combined_output_node.name = f"{compositor_node_prefix}output_combined"
            combined_output_node.label = f"{compositor_node_prefix}{combined_alpha_basename}"
            combined_output_node.location = (-100, -300)
            combined_output_node.directory = output_directory
            combined_output_node.file_name = f"{combined_alpha_basename}_####"
            combined_output_node.format.file_format = "OPEN_EXR_MULTILAYER"
            combined_output_node.format.color_mode = "RGBA"
            combined_output_node.format.color_depth = "32"
            combined_output_node.format.exr_codec = "ZIP"
            combined_output_node.file_output_items.new(
                socket_type="RGBA", name=combined_alpha_basename
            )
            node_tree.links.new(combined_socket, combined_denoise_node.inputs["Image"])
            if denoise_normal_socket is not None:
                node_tree.links.new(denoise_normal_socket, combined_denoise_node.inputs["Normal"])
            if denoise_albedo_socket is not None:
                node_tree.links.new(denoise_albedo_socket, combined_denoise_node.inputs["Albedo"])
            node_tree.links.new(
                combined_denoise_node.outputs["Image"],
                combined_output_node.inputs[combined_alpha_basename],
            )
            connected += 1

    print(f"[ok] compositor wired: {connected} File Output nodes -> {output_directory}")
    if missing:
        print(f"[warn] missing render-layer sockets: {missing}")


def write_cells_manifest(cells_per_side, output_directory, cell_prefix, manifest_filename):
    """Map face_index -> screen-plane (col, row). bmesh's
    subdivide+grid_fill doesn't emit faces row-major; the Rust bake
    binary consumes this manifest to weight Σ_K (col_K, row_K) ·
    cell_K.b correctly when assembling position.exr."""
    manifest_cells = []
    for face_index in range(cells_per_side * cells_per_side):
        cell_object = bpy.data.objects.get(f"{cell_prefix}{face_index}")
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
    manifest_path = os.path.join(resolved_directory, manifest_filename)
    with open(manifest_path, "w", encoding="utf-8") as manifest_file:
        json.dump(manifest, manifest_file, indent=2)
        manifest_file.write("\n")
    print(f"[ok] wrote cells manifest -> {manifest_path}")


def run_pass(pass_config):
    print(f"[pass] {pass_config['view_layer_name']}")
    generate_screen_cells(
        pass_config["cells_per_side"],
        pass_config["collection_name"],
        pass_config["view_layer_name"],
        pass_config["cell_prefix"],
        pass_config["light_group_prefix"],
    )
    setup_cell_compositor(
        pass_config["output_directory"],
        pass_config["view_layer_name"],
        pass_config["light_group_prefix"],
        pass_config["compositor_node_prefix"],
        pass_config["combined_alpha_basename"],
    )
    write_cells_manifest(
        pass_config["cells_per_side"],
        pass_config["output_directory"],
        pass_config["cell_prefix"],
        pass_config["manifest_filename"],
    )


run_pass(SCENE_PASS)
run_pass(STEAM_PASS)
