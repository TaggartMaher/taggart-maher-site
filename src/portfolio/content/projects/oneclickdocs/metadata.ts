import type { ProjectMetadata } from "../../types";
import content from "./index.md?html";

const metadata: ProjectMetadata = {
  id: "oneclickdocs",
  draft: true,
  name: "One Click Docs BMS",
  year: "2024",
  date: "2024-03",
  tag: "Orchestration · SaaS",
  oneliner:
    "App orchestration software for business management systems — deploy a fully-featured demo per lead in minutes.",
  stack: ["TypeScript", "React", "Node", "Express", "AWS", "Docker", "Puppeteer"],
  links: [{ label: "Site", href: "#" }],
  content,
};

export default metadata;
