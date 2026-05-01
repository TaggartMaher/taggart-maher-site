import type { ProjectMetadata } from "../../types";
import content from "./index.md?raw";

const metadata: ProjectMetadata = {
  id: "oneclickdocs",
  name: "One Click Docs BMS",
  year: "2024",
  tag: "Orchestration · SaaS",
  icon: "📑",
  oneliner:
    "App orchestration software for business management systems — deploy a fully-featured demo per lead in minutes.",
  stack: ["TypeScript", "React", "Node", "Express", "AWS", "Docker", "Puppeteer"],
  links: [{ label: "Site", href: "#" }],
  content,
};

export default metadata;
