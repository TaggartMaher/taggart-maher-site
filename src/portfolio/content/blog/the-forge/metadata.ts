import type { BlogMetadata } from "../../types";
import content from "./index.md?html";

const metadata: BlogMetadata = {
  id: "the-forge",
  title: "The Forge",
  year: "2021",
  date: "2021-04-05",
  tag: "Hardware",
  icon: "🔨",
  excerpt: "My desktop build — the parts I picked, why, and what it actually feels like to use.",
  readtime: "5 min",
  content,
};

export default metadata;
