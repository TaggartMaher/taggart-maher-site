import { PORTFOLIO } from "../../portfolio/data";

export function MysteryPage() {
  const items = PORTFOLIO.mystery;
  return (
    <article className="lite-page">
      <h1>Mystery</h1>
      <p className="lite-lede">Things in development. Codenames only.</p>
      {items.map((item) => (
        <div key={item.id} className="lite-mystery-card">
          <div className="lite-mystery-head">
            <span className="lite-mystery-codename">{item.codename}</span>
            <span className="lite-mystery-eta">ETA {item.eta}</span>
          </div>
          <div className="lite-mystery-expansion">{item.expansion}</div>
          <p>{item.hint}</p>
        </div>
      ))}
    </article>
  );
}
