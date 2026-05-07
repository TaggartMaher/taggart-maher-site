import type { ProjectMetadata } from "../../types";
import content from "./index.md?raw";

const metadata: ProjectMetadata = {
  id: "rc-audio",
  draft: true,
  name: "RC Car Audio Simulation",
  year: "2024",
  date: "2024-09",
  tag: "Audio · Fluid Sim",
  oneliner:
    "Realistic onboard engine audio for RC cars, generated via open-source fluid simulation.",
  stack: ["[ fluid sim ]", "[ DSP / audio runtime ]", "[ embedded ]"],
  links: [
    { label: "Video", href: "#" },
    { label: "Code", href: "#" },
  ],
  content,
};

export default metadata;
