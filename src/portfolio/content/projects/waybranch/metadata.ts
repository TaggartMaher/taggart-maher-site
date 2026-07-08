import type { ProjectMetadata } from "../../types";
import content from "./index.md?html";

const metadata: ProjectMetadata = {
  id: "waybranch",
  draft: true,
  name: "Waybranch",
  year: "2026",
  date: "2026-01",
  status: "Upcoming",
  tag: "VFX · Vegetation",
  oneliner: "Dynamic VFX vegetation generator. Plants that grow, sway, react.",
  stack: ["[ engine ]", "[ language ]", "[ shader stack ]"],
  links: [
    { label: "Site", href: "#" },
    { label: "Devlog", href: "#" },
  ],
  content,
};

export default metadata;
