import type { ProjectMetadata } from "../../types";
import content from "./index.md?raw";

const metadata: ProjectMetadata = {
  id: "bond-synth",
  name: "Bond Synth",
  year: "2023",
  tag: "Desktop · Insurance Automation",
  icon: "🪪",
  oneliner:
    "Desktop tool that automates insurance agent workflows — replaced 20+ hours/week of manual work.",
  stack: ["TypeScript", "Puppeteer", "Document parsing"],
  links: [{ label: "Site", href: "#" }],
  content,
};

export default metadata;
