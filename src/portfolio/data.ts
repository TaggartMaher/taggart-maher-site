// Portfolio content for the sections that stay hardcoded: About,
// Experience, Mystery. Projects and Blog have moved to
// `./content/{projects,blog}` where each entry has a typed
// `metadata.ts` and a sibling `index.md` body.

export interface AboutData {
  headline: string;
  tldr: string;
  facts: Array<[string, string]>;
  longform: string[];
  links: Array<{ label: string; hint: string; href: string }>;
}

export interface ExperienceRow {
  year: string;
  role: string;
  org: string;
  where: string;
  kind: "work" | "school";
  bullets: string[];
}

export interface MysteryEntry {
  id: string;
  codename: string;
  expansion: string;
  hint: string;
  classified: string;
  eta: string;
}

export interface PortfolioData {
  user: string;
  host: string;
  name: string;
  role: string;
  blurb: string;
  about: AboutData;
  experience: ExperienceRow[];
  mystery: MysteryEntry[];
}

export const PORTFOLIO: PortfolioData = {
  user: "taggart",
  host: "tm-portfolio",
  name: "Taggart Maher",
  role: "Full Stack Developer",
  blurb:
    "Entrepreneurial software engineer who works closely with business owners to identify pain points and ship custom solutions that move the needle.",

  about: {
    headline: "Hello",
    tldr: "I'm a Fullstack developer. I have a lot of experience with data migration and business interfaces. I also spend a lot of my time working with 3D simulations and graphics. See my projects page, I do a lot.",
    facts: [
      ["name", "Taggart Maher"],
      ["role", "Full Stack Developer"],
      ["location", "Newark, DE"],
      ["email", "taggart.maher@gmail.com"],
      ["status", "[ open to work ]"],
      ["languages", "TypeScript · Rust · PHP · Python · Ruby · Java · C++ · SQL"],
      ["frontend", "React · Next.js · Tailwind · Vue · Svelte · Blade"],
      ["backend", "Node · Laravel · Express · Prisma · Docker · AWS"],
      ["specialty", "3D graphics · 3D modeling · 3D printing · graphics programming"],
    ],
    longform: [
      "I'm an entrepreneurial software engineer based in Newark, DE. Most of my career has been spent embedded with business owners — figuring out where the pain points are and writing the software that actually fixes it. I've shipped production systems for finance, insurance, ecommerce, and travel.",
      "Outside of contract work I'm usually deep in something graphics-adjacent. I'll never stop my obsession with high-performance computing. I have to push the limits of what these machines can do.",
      "If you're interested in what I do, I'd love to hear from you!",
    ],
    links: [
      {
        label: "GitHub",
        hint: "[ github.com/TaggartMaher ]",
        href: "https://github.com/TaggartMaher",
      },
      {
        label: "LinkedIn",
        hint: "[ linkedin.com/in/taggart-maher ]",
        href: "https://www.linkedin.com/in/taggart-maher/",
      },
      { label: "Email", hint: "taggart.maher@gmail.com", href: "mailto:taggart.maher@gmail.com" },
      {
        label: "Youtube (VFX, Projects, etc.)",
        hint: "[ @tagxialo ]",
        href: "https://www.youtube.com/@tagxialo",
      },
    ],
  },

  experience: [
    {
      year: "Oct 2025 — Present",
      role: "Independent Academic Research",
      org: "Respiratory Model Simulation Platform",
      where: "Remote",
      kind: "work",
      bullets: [
        "Building a high-performance, anatomically accurate model of human airway structures.",
        "Collaborating with Dr. Raoul Schorer (Geneva University Hospitals) to correlate capnography (CO₂) measurements with lung morphology for academic publication.",
        "Designed an algorithm to manage billions of points in 3D space at high speeds.",
        "Stack: Rust, wgpu (WGSL), egui, serde, cgmath, winit, WebAssembly.",
      ],
    },
    {
      year: "Dec 2024 — Jan 2026",
      role: "Full Stack Developer",
      org: "The Land Geek",
      where: "United States · Remote",
      kind: "work",
      bullets: [
        "Finance management platform processing automated payments for the land-flipping industry.",
        "Migrated payment processing, notification, and webhook queues from a legacy Ruby codebase to Laravel/PHP.",
        "Diagnosed and repaired race conditions; added unit tests to lock in correctness.",
        "Resolved hundreds of customer support tickets, identified trends, and adjusted roadmap accordingly.",
        "Wrote tooling to audit financial records and adapt legacy database entries during cutover.",
        "Stack: PHP, Laravel, Postgres, Heroku, Sentry, Redis, Ruby, Blade, OAuth, Alpine.js, Pest, Dusk, Tailwind.",
      ],
    },
    {
      year: "Jun 2023 — Feb 2025",
      role: "Co-Founder & Full Stack Developer",
      org: "One Click Docs",
      where: "Newark, DE",
      kind: "work",
      bullets: [
        "Co-founded a software company shipping multiple BMS web applications for small businesses.",
        "Automated 20+ hours/week of an insurance agent's work via web scraping and document parsing.",
        "Built a CRM-driven BMS that cut paperwork load by ~50%.",
        "Shipped a Travel Visa Photobooth (ICAO-compliant) MVP in 2 weeks using AWS Rekognition + custom TS image-processing.",
        "OCR passport scanning that captures 10 frames and picks the sharpest — built for elderly users with shaky hands.",
        "Architected an in-house platform to deploy & manage client web apps in minutes (full account / notifications / CRM).",
        "Stack: TypeScript, React, Node, Express, AWS (EC2, S3, DynamoDB, Rekognition, CloudFormation), WebSockets, Docker, Puppeteer.",
      ],
    },
    {
      year: "Jan 2022 — May 2023",
      role: "Full Stack Developer & Sales Assistant",
      org: "Classic Imports & Design",
      where: "Towson, MD",
      kind: "work",
      bullets: [
        "Luxury furniture ecommerce — took initiative to rebuild the site and scale the catalog.",
        "Doubled revenue in under 12 months by automating product listing.",
        "Built an in-house data miner (Python + Selenium) to scrape wholesale catalogs that had no machine-readable feed.",
        "Grew listed inventory from 2,000 → 20,000 products with immediate sales impact.",
        "Designed the homepage, menus, search catalog, and product pages. Ran SEO and ad campaigns.",
        "Stack: Python, PHP, JavaScript, Selenium.",
      ],
    },
    {
      year: "Dec 2021 — Feb 2022",
      role: "CAD Technician (Freelance)",
      org: "Eastern Tech Corporation",
      where: "Howard County, MD",
      kind: "work",
      bullets: [
        "Translated hand sketches into ASME & ISO standardized technical drawings for an overseas manufacturer.",
        "Used Fusion 360 to create schematics for CNC-machined glass and steel.",
      ],
    },
    {
      year: "2020",
      role: "Aerospace Engineering",
      org: "Applications and Research Laboratory",
      where: "Howard County, MD",
      kind: "work",
      bullets: ["[ Brief description of work / role at ARL ]"],
    },
    {
      year: "—",
      role: "Diploma",
      org: "Howard High School",
      where: "Howard County, MD",
      kind: "school",
      bullets: ["[ Anything you want to add — coursework, clubs, awards ]"],
    },
  ],

  mystery: [
    {
      id: "htle",
      codename: "HTLE",
      expansion: "High Throughput Lattice Engine",
      hint: "A next-gen voxel physics & chemical game engine.",
      classified: "[ what's behind the curtain ]",
      eta: "[ ??? ]",
    },
    {
      id: "tat-map",
      codename: "TAT-MAP",
      expansion: "Tattoo Mapping",
      hint: "Realtime 3D projection of tattoos, tracking the human body in motion.",
      classified: "[ what's behind the curtain ]",
      eta: "[ ??? ]",
    },
  ],
};
