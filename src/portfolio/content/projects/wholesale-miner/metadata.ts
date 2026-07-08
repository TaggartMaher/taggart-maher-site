import type { ProjectMetadata } from "../../types";
import content from "./index.md?html";

const metadata: ProjectMetadata = {
  id: "wholesale-miner",
  draft: true,
  name: "Wholesale Ecommerce Data Miner",
  year: "2022",
  date: "2022-09",
  tag: "Scraping · Ecommerce",
  oneliner:
    "Product data miner for luxury furniture wholesale. Took catalog from 2,000 → 20,000 SKUs.",
  stack: ["Python", "Selenium", "PHP", "JavaScript"],
  links: [{ label: "Live site", href: "https://classicimportusa.com/" }],
  content,
};

export default metadata;
