import { Link } from "../../router/Link";

export function NotFoundPage() {
  return (
    <article className="lite-page">
      <h1>Not found</h1>
      <p className="lite-lede">No page at this path.</p>
      <p>
        <Link to="/">← back home</Link>
      </p>
    </article>
  );
}
