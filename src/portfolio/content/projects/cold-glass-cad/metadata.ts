import type { ProjectMetadata } from "../../types";
import content from "./index.md?raw";

const metadata: ProjectMetadata = {
  id: "cold-glass-cad",
  name: "Cold Glass CAD Drawings",
  year: "2022",
  date: "2022-03",
  tag: "CAD · Glass Art",
  oneliner: "ASME/ISO technical drawings for CNC-machined glass and steel.",
  stack: ["Fusion 360", "ASME / ISO drafting standards"],
  links: [{ label: "Gallery", href: "#" }],
  content,
};

export default metadata;
