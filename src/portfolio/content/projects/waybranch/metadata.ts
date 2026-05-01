import type { ProjectMetadata } from "../../types";
import content from "./index.md?raw";

const metadata: ProjectMetadata = {
  id: "waybranch",
  name: "Waybranch",
  year: "2026",
  status: "Upcoming",
  tag: "VFX · Vegetation",
  icon: "🌿",
  oneliner: "Dynamic VFX vegetation generator. Plants that grow, sway, react.",
  stack: ["[ engine ]", "[ language ]", "[ shader stack ]"],
  links: [
    { label: "Site", href: "#" },
    { label: "Devlog", href: "#" },
  ],
  content,
};

export default metadata;
