import { createContext, memo, useContext, type MouseEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownProps {
  children: string;
  className?: string;
}

// Hook for the surrounding shell to intercept internal links (paths
// that start with "/"). When set, internal-link clicks call the
// callback instead of triggering a full page navigation. External
// links (http(s)://, mailto:, tel:, schemes) are unaffected and open
// in a new tab where appropriate.
export type InternalLinkHandler = (href: string) => void;

const InternalLinkContext = createContext<InternalLinkHandler | null>(null);

export function InternalLinkProvider({
  onNavigate,
  children,
}: {
  onNavigate: InternalLinkHandler;
  children: ReactNode;
}) {
  return <InternalLinkContext.Provider value={onNavigate}>{children}</InternalLinkContext.Provider>;
}

const REMARK_PLUGINS = [remarkGfm];

function isInternalHref(href: string | undefined): href is string {
  return typeof href === "string" && href.startsWith("/");
}

function isHttpHref(href: string | undefined): href is string {
  return typeof href === "string" && /^https?:\/\//i.test(href);
}

interface AnchorComponentProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string;
  children?: ReactNode;
}

function AnchorComponent({ href, children, ...rest }: AnchorComponentProps) {
  const internalHandler = useContext(InternalLinkContext);
  const externalHttp = isHttpHref(href);
  function handleClick(event: MouseEvent<HTMLAnchorElement>): void {
    // Modifier keys and non-primary buttons fall through to the
    // browser so middle-click / cmd-click open in a new tab.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    if (!isInternalHref(href)) return;
    if (!internalHandler) return;
    event.preventDefault();
    internalHandler(href);
  }
  return (
    <a
      href={href}
      target={externalHttp ? "_blank" : undefined}
      rel={externalHttp ? "noreferrer noopener" : undefined}
      onClick={handleClick}
      {...rest}
    >
      {children}
    </a>
  );
}

const COMPONENTS = {
  a: AnchorComponent,
};

// Thin wrapper around react-markdown so the rest of the app doesn't
// import the plugin chain directly. GFM gives us tables, autolinks,
// strikethrough, and task lists. External http(s) links open in a new
// tab; internal "/route" links are intercepted by InternalLinkProvider
// when one is present (lite Layout, Portfolio shell), otherwise fall
// through to a normal browser navigation. Memoized on `children` so
// surrounding re-renders don't rebuild the markdown AST.
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
