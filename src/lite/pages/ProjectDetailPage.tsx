import { Link } from "../../router/Link";
import { Markdown } from "../../portfolio/content/Markdown";
import { PROJECTS } from "../../portfolio/content/projects";
import { CopyLinkButton } from "../../shared/CopyLinkButton";
import { NotFoundPage } from "./NotFoundPage";

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const project = PROJECTS.find((entry) => entry.id === projectId);
  if (!project) return <NotFoundPage />;
  return (
    <article className="lite-page">
      <Link to="/projects" className="lite-detail-back">
        ← all projects
      </Link>
      <p className="lite-detail-meta">
        {project.tag} · {project.year}
        {project.status ? " · " + project.status : ""}
      </p>
      <h1>
        {project.icon} {project.name}
      </h1>
      <p className="lite-lede">{project.oneliner}</p>
      <Markdown>{project.content}</Markdown>
      <h3>Stack</h3>
      <div className="lite-chip-row">
        {project.stack.map((tech) => (
          <span key={tech} className="lite-chip">
            {tech}
          </span>
        ))}
      </div>
      {project.links.length > 0 && (
        <>
          <h3>Links</h3>
          <ul className="lite-link-list">
            {project.links.map((link) => (
              <li key={link.label}>
                <a href={link.href}>
                  <span className="lite-link-name">{link.label}</span>
                  <span className="lite-link-hint">↗</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <CopyLinkButton />
    </article>
  );
}
