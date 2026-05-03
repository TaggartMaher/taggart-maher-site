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
              Taggart Maher
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
            {NAV_ENTRIES.filter((entry) => entry.to !== "/").map((entry) => (
              <Link
                key={entry.to}
                to={entry.to}
                className={"lite-nav-link" + (isActivePath(router.path, entry.to) ? " active" : "")}
              >
                {entry.label}
              </Link>
            ))}
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
