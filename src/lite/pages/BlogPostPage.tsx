import { Link } from "../../router/Link";
import { Markdown } from "../../portfolio/content/Markdown";
import { BLOG_POSTS } from "../../portfolio/content/blog";
import { CopyLinkButton } from "../../shared/CopyLinkButton";
import { NotFoundPage } from "./NotFoundPage";

export function BlogPostPage({ postId }: { postId: string }) {
  const post = BLOG_POSTS.find((entry) => entry.id === postId);
  if (!post) return <NotFoundPage />;
  return (
    <article className="lite-page">
      <Link to="/blog" className="lite-detail-back">
        ← all posts
      </Link>
      <p className="lite-detail-meta">
        {post.icon ? post.icon + " " : ""}
        {post.tag} · {post.date} · {post.readtime}
      </p>
      <h1>{post.title}</h1>
      <Markdown>{post.content}</Markdown>
      {post.links && post.links.length > 0 && (
        <>
          <h3>Links</h3>
          <ul className="lite-link-list">
            {post.links.map((link) => (
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
