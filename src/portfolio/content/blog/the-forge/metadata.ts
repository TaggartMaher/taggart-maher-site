import type { BlogMetadata } from "../../types";
import content from "./index.md?raw";

const metadata: BlogMetadata = {
  id: "the-forge",
  draft: true,
  title: "The Forge",
  year: "2021",
  date: "2021-04-05",
  tag: "Hardware",
  icon: "🔨",
  excerpt: "[ My desktop build — parts, reasoning, photos, what I'd do differently. ]",
  readtime: "[ X min ]",
  content,
};

export default metadata;
