import type { ProjectMetadata } from "../../types";
import content from "./index.md?raw";

const metadata: ProjectMetadata = {
  id: "rc-audio",
  name: "RC Car Audio Simulation",
  year: "2024",
  tag: "Audio · Fluid Sim",
  icon: "🏎",
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
