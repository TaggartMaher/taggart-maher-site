import type { ProjectMetadata } from "../../types";
import content from "./index.md?raw";

const metadata: ProjectMetadata = {
  id: "token-monster",
  name: "Token Monster",
  year: "2025",
  date: "2025-09",
  tag: "AI · Tooling",
  oneliner: "A layered AI agent programming interface.",
  stack: ["[ language ]", "[ model API ]", "[ frontend ]"],
  links: [
    { label: "Demo", href: "#" },
    { label: "Repo", href: "#" },
  ],
  content,
};

export default metadata;
