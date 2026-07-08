import type { ProjectMetadata } from "../../types";
import content from "./index.md?html";

const metadata: ProjectMetadata = {
  id: "this-website",
  name: "This website",
  year: "2026",
  date: "2026-05",
  tag: "VFX · Blender · WGSL",
  oneliner: "How I made this website, with realtime lighting reflections.",
  stack: ["Typescript", "Blender", "Rust", "Python"],
  links: [{ label: "Demo Video", href: "https://github.com/TaggartMaher/taggart-maher-site" }],
  content,
};

export default metadata;
