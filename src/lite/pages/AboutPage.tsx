import { PORTFOLIO } from "../../portfolio/data";

export function AboutPage() {
  const about = PORTFOLIO.about;
  return (
    <article className="lite-page">
      <h1>{about.headline}</h1>
      <p className="lite-lede">{about.tldr}</p>

      <h2>Fact sheet</h2>
      <table className="lite-fact-table">
        <tbody>
          {about.facts.map(([factKey, factValue]) => (
            <tr key={factKey}>
              <th>{factKey}</th>
              <td>{factValue}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Long form</h2>
      {about.longform.map((paragraph, paragraphIndex) => (
        <p key={paragraphIndex}>{paragraph}</p>
      ))}

      <h2>Channels</h2>
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
