// Portfolio content for the sections that stay hardcoded: About,
// Experience, Mystery. Projects and Blog have moved to
// `./content/{projects,blog}` where each entry has a typed
// `metadata.ts` and a sibling `index.md` body.

export interface AboutData {
  headline: string;
  tldr: string;
  facts: Array<[string, string]>;
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
      [
        "languages",
        "TypeScript / Javascript · Rust · PHP · Ruby · Python · Java · C++ · SQL · HTML · CSS",
      ],
      ["frontend", "React · Next.js · Tailwind CSS · Blade · Vue · Svelte"],
      [
        "backend",
        "NodeJS · Laravel · ExpressJS · Prisma · Docker · AWS (EC2, ECR) · Payment Gateways · Automated Payments · Business Automation",
      ],
      ["specialty", "3D Graphics · 3D Modeling · 3D Printing · Graphics Programming"],
      [
        "methodology",
        "TDD · Agile/SCRUM · Jira · Git · Webscraping · SEO · CRM · Analytics · Audit Trails · Cursor · Gemini · ChatGPT",
      ],
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
        "Developed a high-performance anatomically accurate model of human airway structures.",
        "Collaborating with Dr. Raoul Schorer (Geneva University, Switzerland) to integrate stochastic simulation techniques, correlating capnography measurements (CO2 concentration) with lung morphology for academic publication.",
        "Built a full-stack, cross-platform interface for real-time manipulation of complex mathematical lung morphology parameters.",
        "Designed and implemented an algorithm to process billions of 3D vectors at subsecond speeds.",
        "On track to publish results in an academic journal.",
        "Technical Skills: Rust, wgpu (WGSL shader language), egui, serde, cgmath, winit, WASM.",
      ],
    },
    {
      year: "Dec 2024 — Jan 2026",
      role: "Full Stack Developer",
      org: "The Land Geek, GeekPay.io",
      where: "United States",
      kind: "work",
      bullets: [
        "Managed a finance platform which processed automated payments for lenders and property firms.",
        "Migrated the payment processing, notification, and webhook queue system from a legacy codebase (Ruby) to Laravel PHP.",
        "Collaborated with team members to fully deprecate a legacy system dependency, allowing the business more freedom to develop new systems at a more affordable pace.",
        "Discovered compatibility issues with legacy systems to prevent high-impact bugs.",
        "Created official reports with impact analysis for cross-team collaboration on sitewide issues and deployments.",
        "Worked closely with business owners / customers to identify pain points.",
        "Directly resolved hundreds of customer support issues, working closely with the customer support team to identify trends and adjust course to align with demand.",
        "Wrote dozens of tools to audit financial records, and identify bug impacts.",
        "Analyzed logs to identify and repair race conditions and unexpected states.",
        "Produced long-term plans for migrations, refactors, and new features aligned with business needs to meet market demands.",
        "Analyzed hundreds of Jira tickets to reconcile into actionable plans.",
        "Technical skills: PHP, Laravel, Postgres, Heroku, Sentry, Redis, Ruby, Blade, OAuth, Payment Processing, Alpine.js, Notification systems, cron jobs, Pest, Dusk (Automated Testing Framework), and Tailwind.",
      ],
    },
    {
      year: "Jun 2023 — Dec 2024",
      role: "Co-Founder & Full Stack Developer",
      org: "One Click Docs",
      where: "Newark, DE",
      kind: "work",
      bullets: [
        "Co-Founded a software company which developed multiple web apps to help small businesses.",
        "Fully automated a process for an insurance agent which required 20+ hours per week of work by leveraging web scraping and document parsing.",
        "Built an in-house platform to deploy and manage multiple clients' web applications which improved lead retention by deploying demo apps with full account management, notification, and CRM features within minutes.",
        "Used web scraping to provide unique solutions to clients, automating processes without the availability of official APIs for services.",
        "Built an entire CRM system for a travel agency to meet requirements for a high volume of travel applications.",
        "Designed and developed a Travel Visa web application to instantly validate visa photos based on ICAO visa photo regulations.",
        "Implemented OCR for Passport Scanning auto fill.",
        "Created modular visa application forms to standardize the frontend implementation for over 20 countries with changing requirements and response types.",
        "Technical skills: Typescript, React, Node.js, Express.js, AWS (EC2, S3, DynamoDB, Rekognition, CloudFormation), Websockets, Bash Scripting, Docker, REST APIs, Web Scraping with Puppeteer, document parsing and templating.",
      ],
    },
    {
      year: "Jan 2022 — Jun 2023",
      role: "Full Stack Developer and Sales Assistant",
      org: "Classic Imports & Design",
      where: "Towson, MD",
      kind: "work",
      bullets: [
        "Expanded a Luxury Furniture E-Commerce Catalog and managed sales over the phone.",
        "Doubled the business' revenue in under 12 months using Python software to list popular new products that otherwise would have taken tremendous manual entry.",
        "Designed the website homepage, menus, search catalog, and individual product pages.",
        "Leveraged custom software to increase the listed inventory from 2,000 to 20,000 products, having immediate impact on sales as observed through google analytics.",
        "Technical Skills: Python, PHP, Javascript, Selenium web scraping, and document parsing.",
      ],
    },
    {
      year: "2020",
      role: "Aerospace",
      org: "Applications and Research Laboratory",
      where: "Howard County, MD",
      kind: "school",
      bullets: ["Worked with electronics, physics, CAD design, and engineering workflows."],
    },
    {
      year: "Grad. 2022",
      role: "Diploma",
      org: "Howard High School",
      where: "Howard County, MD",
      kind: "school",
      bullets: [],
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
