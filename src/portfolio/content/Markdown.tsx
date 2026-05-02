import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownProps {
  children: string;
  className?: string;
}

// Plugin list and component overrides are module-level so React sees
// stable references across renders — without that, react-markdown
// re-parses the AST on every parent render. The Portfolio shell
// re-renders frequently (window drags, clock ticks, the snapDOM
// rasterization loop), so this matters.
const REMARK_PLUGINS = [remarkGfm];

const COMPONENTS = {
  a: ({
    href,
    children,
    ...rest
  }: {
    href?: string;
    children?: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    const isExternal = !!href && /^https?:\/\//i.test(href);
    return (
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noreferrer noopener" : undefined}
        {...rest}
      >
        {children}
      </a>
    );
  },
};

// Thin wrapper around react-markdown so the rest of the app doesn't
// import the plugin chain directly. GFM gives us tables, autolinks,
// strikethrough, and task lists. External links open in a new tab.
// Memoized on `children` (the markdown source) so that re-renders of
// the surrounding window — window drags, clock ticks — don't rebuild
// the markdown AST.
function MarkdownInner({ children, className }: MarkdownProps) {
  return (
    <div className={"md" + (className ? " " + className : "")}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownInner);
