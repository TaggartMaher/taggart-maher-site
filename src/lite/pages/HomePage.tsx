import { Markdown } from "../../portfolio/content/Markdown";
import { README_MARKDOWN } from "../../portfolio/content/readme";

export function HomePage() {
  return (
    <article className="lite-page">
      <Markdown>{README_MARKDOWN}</Markdown>
    </article>
  );
}
