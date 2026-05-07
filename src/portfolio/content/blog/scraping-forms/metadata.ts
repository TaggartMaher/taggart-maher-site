import type { BlogMetadata } from "../../types";
import content from "./index.md?raw";

const metadata: BlogMetadata = {
  id: "scraping-forms",
  draft: true,
  title: "Advanced Web Scraping for Forms and Logins",
  year: "2022",
  date: "2022-08-15",
  tag: "Engineering",
  icon: "🕷",
  excerpt:
    "[ Practical techniques for getting past auth-walled forms when you have legitimate access. ]",
  readtime: "[ X min ]",
  content,
};

export default metadata;
