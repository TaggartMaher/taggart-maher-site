import type { BlogMetadata } from "../../types";
import content from "./index.md?raw";

const metadata: BlogMetadata = {
  id: "truncated-tetrahedron",
  draft: true,
  title: "A Truncated Tetrahedron Obsession",
  year: "2024",
  date: "2024-06-01",
  tag: "Geometry",
  icon: "🔺",
  excerpt: "[ Why I can't stop thinking about this particular polyhedron. ]",
  readtime: "[ X min ]",
  content,
};

export default metadata;
