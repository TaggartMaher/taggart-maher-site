import { useCallback, useEffect, type ReactNode } from "react";
import { Link } from "../router/Link";
import { useRouter } from "../router/useRouter";
import { InternalLinkProvider } from "../portfolio/content/Markdown";

interface NavEntry {
  to: string;
  label: string;
}

const NAV_ENTRIES: NavEntry[] = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/experience", label: "Experience" },
  { to: "/projects", label: "Projects" },
  { to: "/blog", label: "Blog" },
  { to: "/mystery", label: "Mystery" },
  { to: "/contact", label: "Contact" },
  { to: "/settings", label: "Settings" },
];

function isActivePath(currentPath: string, navEntryPath: string): boolean {
  if (navEntryPath === "/") return currentPath === "/";
  return currentPath === navEntryPath || currentPath.startsWith(navEntryPath + "/");
}

export function Layout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const handleInternalNavigate = useCallback(
    (href: string) => {
      router.navigate(href);
    },
    [router],
  );
  // Reset scroll on path change. Without this, navigating from deep in
  // a long page (e.g. far down /blog/foo) lands in the new page already
  // scrolled past its top.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo(0, 0);
  }, [router.path]);
  return (
    <InternalLinkProvider onNavigate={handleInternalNavigate}>
      <div className="lite-shell">
        <nav className="lite-nav">
          <div className="lite-nav-inner">
            <Link to="/" className="lite-nav-brand" aria-label="Home — Taggart Maher">
              Tag M.
              <svg
                className="lite-nav-home-icon"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 11.5 12 4l9 7.5" />
                <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
              </svg>
            </Link>
            <div className="lite-nav-links">
              {NAV_ENTRIES.filter((entry) => entry.to !== "/").map((entry) => {
                const isSettings = entry.to === "/settings";
                const className =
                  "lite-nav-link" +
                  (isActivePath(router.path, entry.to) ? " active" : "") +
                  (isSettings ? " lite-nav-settings" : "");
                return (
                  <Link key={entry.to} to={entry.to} className={className}>
                    {isSettings && (
                      <svg
                        className="lite-nav-settings-icon"
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
                      </svg>
                    )}
                    {entry.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
        <main className="lite-main">{children}</main>
        <footer className="lite-footer">
          <div className="lite-footer-inner">
            <span>taggart.maher@gmail.com</span>
            <Link to="/settings">Site Settings</Link>
          </div>
        </footer>
      </div>
    </InternalLinkProvider>
  );
}
