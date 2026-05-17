import type { ProjectMetadata } from "../../types";
import content from "./index.md?raw";

const metadata: ProjectMetadata = {
  id: "respiratory-model",
  draft: false,
  name: "Respiratory Model",
  year: "2025",
  date: "2025-03",
  tag: "HPC · Medical Sim",
  oneliner: "Anatomically accurate human airway simulation. Billions of points, real-time.",
  stack: ["Rust", "wgpu / WGSL", "egui", "winit", "WebAssembly"],
  links: [
    { label: "Demo Video", href: "https://www.youtube.com/watch?v=li_e7lVD1g0" },
    { label: "Repo", href: "#" },
  ],
  content,
};

export default metadata;
