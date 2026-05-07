import type { ProjectMetadata } from "../../types";
import content from "./index.md?raw";

const metadata: ProjectMetadata = {
  id: "respiratory-model",
  draft: true,
  name: "Respiratory Model",
  year: "2025",
  date: "2025-03",
  tag: "HPC · Medical Sim",
  oneliner: "Anatomically accurate human airway simulation. Billions of points, real-time.",
  stack: ["Rust", "wgpu / WGSL", "egui", "winit", "WebAssembly"],
  links: [
    { label: "Writeup", href: "#" },
    { label: "Repo", href: "#" },
  ],
  content,
};

export default metadata;
