// Aggregator for all blog posts. Order here is the order they appear
// in the Blog window.

import type { BlogMetadata } from "../types";
import truncatedTetrahedron from "./truncated-tetrahedron/metadata";
import scrapingForms from "./scraping-forms/metadata";
import branchPrinting from "./branch-printing/metadata";
import theForge from "./the-forge/metadata";

export const BLOG_POSTS: BlogMetadata[] = [
  truncatedTetrahedron,
  scrapingForms,
  branchPrinting,
  theForge,
];
