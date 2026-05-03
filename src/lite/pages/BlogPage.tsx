import { Link } from "../../router/Link";
import { BLOG_POSTS } from "../../portfolio/content/blog";

export function BlogPage() {
  return (
    <article className="lite-page">
      <h1>Blog</h1>
      <p className="lite-lede">Posts. Some technical, some less so.</p>
      <ul className="lite-card-list">
        {BLOG_POSTS.map((post) => (
          <li key={post.id}>
            <Link to={"/blog/" + post.id} className="lite-card">
              <div className="lite-card-meta">
                {post.icon ? post.icon + " " : ""}
                {post.tag} · {post.year} · {post.readtime}
              </div>
              <h2 className="lite-card-title">{post.title}</h2>
              <p className="lite-card-excerpt">{post.excerpt}</p>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
