import "./portfolio.css";

interface ProjectEntry {
  title: string;
  summary: string;
  link?: { label: string; href: string };
}

const projects: ProjectEntry[] = [
  {
    title: "Project One — Placeholder",
    summary:
      "Short placeholder description of a project. One or two sentences explaining what it is and what role I played.",
    link: { label: "github.com/example/one", href: "https://example.com/one" },
  },
  {
    title: "Project Two — Placeholder",
    summary: "Another placeholder. Real entries will go here once the content pass happens.",
    link: { label: "example.com/two", href: "https://example.com/two" },
  },
  {
    title: "Project Three — Placeholder",
    summary: "A third placeholder entry to balance out the layout.",
  },
];

export function Portfolio() {
  return (
    <article className="portfolio">
      <header className="portfolio-header">
        <h1>Taggart Maher</h1>
        <p className="portfolio-tagline">Software engineer. Placeholder tagline.</p>
      </header>

      <section className="portfolio-section">
        <h2>About</h2>
        <p>
          Placeholder bio. A few sentences about who I am, what I work on, and what I care about
          professionally. Real copy will replace this once the content pass happens.
        </p>
      </section>

      <section className="portfolio-section">
        <h2>Projects</h2>
        <ul className="portfolio-projects">
          {projects.map((project) => (
            <li key={project.title} className="portfolio-project">
              <h3>{project.title}</h3>
              <p>{project.summary}</p>
              {project.link && (
                <a href={project.link.href} target="_blank" rel="noreferrer noopener">
                  {project.link.label}
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="portfolio-section">
        <h2>Contact</h2>
        <ul className="portfolio-contact">
          <li>
            <a href="mailto:taggart.maher@gmail.com">taggart.maher@gmail.com</a>
          </li>
          <li>
            <a href="https://github.com/TaggartMaher" target="_blank" rel="noreferrer noopener">
              github.com/TaggartMaher
            </a>
          </li>
        </ul>
      </section>
    </article>
  );
}
