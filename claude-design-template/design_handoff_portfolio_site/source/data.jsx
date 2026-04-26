// Portfolio content. Real data from Taggart's resume + projects + blog + mystery.

const PORTFOLIO = {
  user: "taggart",
  host: "tm-portfolio",
  name: "Taggart Maher",
  role: "Full Stack Developer",
  blurb:
    "Entrepreneurial software engineer who works closely with business owners to identify pain points and ship custom solutions that move the needle.",

  about: {
    headline: "Hi, I'm Taggart.",
    tldr: "Full-stack developer with a track record of shipping production systems in high-stakes environments. I gravitate toward simulation, graphics, and any problem nobody else wants to touch.",
    facts: [
      ["name", "Taggart Maher"],
      ["role", "Full Stack Developer"],
      ["location", "Newark, DE"],
      ["email", "taggart.maher@gmail.com"],
      ["phone", "443-832-5786"],
      ["status", "[ open to work / employed / etc ]"],
      ["languages", "TypeScript · Rust · PHP · Python · Ruby · Java · C++ · SQL"],
      ["frontend", "React · Next.js · Tailwind · Vue · Svelte · Blade"],
      ["backend", "Node · Laravel · Express · Prisma · Docker · AWS"],
      ["specialty", "3D graphics · 3D modeling · 3D printing · graphics programming"],
    ],
    longform: [
      "I'm an entrepreneurial software engineer based in Newark, DE. Most of my career has been spent embedded with business owners — figuring out where the real pain is and writing the software that actually fixes it. I've shipped production systems for finance, insurance, ecommerce, and travel, and I tend to end up writing the part nobody else wants to write.",
      "Outside of contract work I'm usually deep in something graphics-adjacent: a respiratory simulation in Rust + wgpu, a voxel engine, real-time vegetation, projection mapping. I like working at the seam between simulation and interface.",
      "If you're a recruiter: yes, probably interested. If you're a friend: hi.",
    ],
    links: [
      { label: "GitHub", hint: "[ github.com/handle ]", href: "#" },
      { label: "LinkedIn", hint: "[ linkedin.com/in/handle ]", href: "#" },
      { label: "Email", hint: "taggart.maher@gmail.com", href: "mailto:taggart.maher@gmail.com" },
      { label: "Phone", hint: "443-832-5786", href: "tel:+14438325786" },
      { label: "Resume", hint: "[ resume.pdf ]", href: "#" },
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

  // PROJECTS — most recent first.
  projects: [
    {
      id: "waybranch",
      name: "Waybranch",
      year: "2026",
      status: "Upcoming",
      tag: "VFX · Vegetation",
      icon: "🌿",
      oneliner: "Dynamic VFX vegetation generator. Plants that grow, sway, react.",
      details:
        "[ Replace with the real pitch — what kind of generator, what runtime, who it's for, what makes it different from existing tools. ]",
      stack: ["[ engine ]", "[ language ]", "[ shader stack ]"],
      links: [
        { label: "Site", href: "#" },
        { label: "Devlog", href: "#" },
      ],
    },
    {
      id: "token-monster",
      name: "Token Monster",
      year: "2025",
      tag: "AI · Tooling",
      icon: "🐉",
      oneliner: "A layered AI agent programming interface.",
      details:
        "[ What 'layered' means here — orchestration model, UI affordances, what it solves that flat agent tools don't. ]",
      stack: ["[ language ]", "[ model API ]", "[ frontend ]"],
      links: [
        { label: "Demo", href: "#" },
        { label: "Repo", href: "#" },
      ],
    },
    {
      id: "respiratory-model",
      name: "Respiratory Model",
      year: "2025",
      tag: "HPC · Medical Sim",
      icon: "🫁",
      oneliner: "Anatomically accurate human airway simulation. Billions of points, real-time.",
      details:
        "Independent academic research collaboration with Dr. Raoul Schorer at Geneva University Hospitals. Stochastic simulation correlating capnography (CO₂) measurements with lung morphology, for academic publication. Built a full-stack cross-platform interface for real-time manipulation of complex mathematical morphology parameters, plus an algorithm to manage billions of 3D points at speed.",
      stack: ["Rust", "wgpu / WGSL", "egui", "winit", "WebAssembly"],
      links: [
        { label: "Writeup", href: "#" },
        { label: "Repo", href: "#" },
      ],
    },
    {
      id: "rc-audio",
      name: "RC Car Audio Simulation",
      year: "2024",
      tag: "Audio · Fluid Sim",
      icon: "🏎",
      oneliner:
        "Realistic onboard engine audio for RC cars, generated via open-source fluid simulation.",
      details:
        "[ Which fluid simulator, how the audio is derived from the sim, hardware setup on the car, demo recordings. ]",
      stack: ["[ fluid sim ]", "[ DSP / audio runtime ]", "[ embedded ]"],
      links: [
        { label: "Video", href: "#" },
        { label: "Code", href: "#" },
      ],
    },
    {
      id: "blueshift",
      name: "Project Blueshift",
      year: "2023",
      tag: "Minecraft · Realtime Render",
      icon: "⛏",
      oneliner:
        "Minecraft plugin that renders node-based megastructures in real time for unique gameplay.",
      details:
        "[ Node graph model, how rendering survives chunk loading, what gameplay it enables, server scale. ]",
      stack: ["Java", "Spigot/Paper", "[ render strategy ]"],
      links: [
        { label: "Plugin", href: "#" },
        { label: "Demo Video", href: "#" },
      ],
    },
    {
      id: "oneclickdocs",
      name: "One Click Docs BMS",
      year: "2024",
      tag: "Orchestration · SaaS",
      icon: "📑",
      oneliner:
        "App orchestration software for business management systems — deploy a fully-featured demo per lead in minutes.",
      details:
        "Co-founded as a software company. Architected an in-house platform that deploys and manages client web apps with full account management, notification, and CRM features. Companion products included a CRM-driven BMS (cut paperwork ~50%), an ICAO Travel Visa Photobooth (AWS Rekognition + custom TS image processing), and OCR passport scanning tuned for elderly users with shaky hands.",
      stack: ["TypeScript", "React", "Node", "Express", "AWS", "Docker", "Puppeteer"],
      links: [{ label: "Site", href: "#" }],
    },
    {
      id: "bond-synth",
      name: "Bond Synth",
      year: "2023",
      tag: "Desktop · Insurance Automation",
      icon: "🪪",
      oneliner:
        "Desktop tool that automates insurance agent workflows — replaced 20+ hours/week of manual work.",
      details:
        "Built for an insurance agent client of One Click Docs. Combined web scraping + document parsing to fully automate a workflow that previously consumed an entire day per week.",
      stack: ["TypeScript", "Puppeteer", "Document parsing"],
      links: [{ label: "Site", href: "#" }],
    },
    {
      id: "wholesale-miner",
      name: "Wholesale Ecommerce Data Miner",
      year: "2022",
      tag: "Scraping · Ecommerce",
      icon: "🛋",
      oneliner:
        "Product data miner for luxury furniture wholesale. Took catalog from 2,000 → 20,000 SKUs.",
      details:
        "Built at Classic Imports & Design. Wholesale suppliers didn't provide machine-readable feeds, so I wrote a Python + Selenium pipeline to scrape catalog pages for images, specs, and product data. Doubled business revenue in under 12 months — confirmed via Google Analytics.",
      stack: ["Python", "Selenium", "PHP", "JavaScript"],
      links: [{ label: "Live site", href: "https://classicimportusa.com/" }],
    },
    {
      id: "cold-glass-cad",
      name: "Cold Glass CAD Drawings",
      year: "2022",
      tag: "CAD · Glass Art",
      icon: "🔷",
      oneliner: "ASME/ISO technical drawings for CNC-machined glass and steel.",
      details:
        "Freelance for Eastern Tech Corporation. Translated hand-drawn sketches into manufacturing-standard technical drawings for an overseas manufacturer using Fusion 360.",
      stack: ["Fusion 360", "ASME / ISO drafting standards"],
      links: [{ label: "Gallery", href: "#" }],
    },
  ],

  blog: [
    {
      id: "truncated-tetrahedron",
      title: "A Truncated Tetrahedron Obsession",
      year: "2024",
      tag: "Geometry",
      excerpt: "[ Why I can't stop thinking about this particular polyhedron. ]",
      readtime: "[ X min ]",
      href: "#",
    },
    {
      id: "scraping-forms",
      title: "Advanced Web Scraping for Forms and Logins",
      year: "2022",
      tag: "Engineering",
      excerpt:
        "[ Practical techniques for getting past auth-walled forms when you have legitimate access. ]",
      readtime: "[ X min ]",
      href: "#",
    },
    {
      id: "branch-printing",
      title: "3D Printing Branch Structures",
      year: "2021",
      tag: "Fabrication",
      excerpt: "[ Notes on slicing, supports, and what works for organic branch geometry. ]",
      readtime: "[ X min ]",
      href: "#",
    },
    {
      id: "the-forge",
      title: "The Forge",
      year: "2021",
      tag: "Hardware",
      excerpt: "[ My desktop build — parts, reasoning, photos, what I'd do differently. ]",
      readtime: "[ X min ]",
      href: "#",
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

window.PORTFOLIO = PORTFOLIO;
