import { PORTFOLIO } from "../../portfolio/data";

export function ExperiencePage() {
  const rows = PORTFOLIO.experience;
  return (
    <article className="lite-page">
      <h1>Experience</h1>
      <p className="lite-lede">A log of where I've spent my time professionally.</p>
      <ol className="lite-timeline">
        {rows.map((row, rowIndex) => (
          <li key={rowIndex} className="lite-timeline-row">
            <div className="lite-timeline-year">{row.year}</div>
            <div className="lite-timeline-head">
              <span className="lite-timeline-role">{row.role}</span>
              <span className="lite-timeline-org">{row.org}</span>
              <span className="lite-timeline-where">— {row.where}</span>
            </div>
            <ul className="lite-timeline-bullets">
              {row.bullets.map((bullet, bulletIndex) => (
                <li key={bulletIndex}>{bullet}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </article>
  );
}
