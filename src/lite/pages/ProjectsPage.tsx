import { Link } from "../../router/Link";
import { PROJECTS } from "../../portfolio/content/projects";

export function ProjectsPage() {
  return (
    <article className="lite-page">
      <h1>Projects</h1>
      <p className="lite-lede">Shipped and in-progress work.</p>
      <ul className="lite-card-list">
        {PROJECTS.map((project) => (
          <li key={project.id}>
            <Link to={"/projects/" + project.id} className="lite-card">
              <div className="lite-card-meta">
                {project.tag} · {project.year}
                {project.status ? " · " + project.status : ""}
              </div>
              <h2 className="lite-card-title">
                {project.icon} {project.name}
              </h2>
              <p className="lite-card-excerpt">{project.oneliner}</p>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
