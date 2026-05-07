import type { ProjectMetadata } from "../../types";
import content from "./index.md?raw";

const metadata: ProjectMetadata = {
  id: "blueshift",
  draft: true,
  name: "Project Blueshift",
  year: "2023",
  date: "2023-06",
  tag: "Minecraft · Realtime Render",
  oneliner:
    "Minecraft plugin that renders node-based megastructures in real time for unique gameplay.",
  stack: ["Java", "Spigot/Paper", "[ render strategy ]"],
  links: [
    { label: "Plugin", href: "#" },
    { label: "Demo Video", href: "#" },
  ],
  content,
};

export default metadata;
