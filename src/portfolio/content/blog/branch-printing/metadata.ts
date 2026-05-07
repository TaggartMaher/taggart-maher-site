import type { BlogMetadata } from "../../types";
import content from "./index.md?raw";

const metadata: BlogMetadata = {
  id: "branch-printing",
  draft: true,
  title: "3D Printing Branch Structures",
  year: "2021",
  date: "2021-09-20",
  tag: "Fabrication",
  icon: "🌳",
  excerpt: "[ Notes on slicing, supports, and what works for organic branch geometry. ]",
  readtime: "[ X min ]",
  content,
};

export default metadata;
