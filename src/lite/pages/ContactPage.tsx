import { PORTFOLIO } from "../../portfolio/data";

export function ContactPage() {
  const about = PORTFOLIO.about;
  return (
    <article className="lite-page">
      <h1>Contact</h1>
      <p className="lite-lede">Pick a channel.</p>
      <ul className="lite-link-list">
        {about.links.map((link) => (
          <li key={link.label}>
            <a href={link.href}>
              <span className="lite-link-name">{link.label}</span>
              <span className="lite-link-hint">{link.hint}</span>
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}
