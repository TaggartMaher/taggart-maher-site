import { createContext, useContext, useState, type ReactNode } from "react";
import { PORTFOLIO } from "./data";
import { PROJECTS } from "./content/projects";
import { BLOG_POSTS } from "./content/blog";
import { Markdown } from "./content/Markdown";
import { README_MARKDOWN } from "./content/readme";
import { Icon } from "./Icon";
import { SettingsView } from "../settings/SettingsView";
import { CopyLinkButton } from "../shared/CopyLinkButton";

export type AppId =
  | "home"
  | "about"
  | "experience"
  | "projects"
  | "blog"
  | "mystery"
  | "readme"
  | "contact"
  | "settings";

export interface WindowOpener {
  openApp: (appId: AppId) => void;
}

const WindowOpenerContext = createContext<WindowOpener | null>(null);

export function WindowOpenerProvider({
  opener,
  children,
}: {
  opener: WindowOpener;
  children: ReactNode;
}) {
  return <WindowOpenerContext.Provider value={opener}>{children}</WindowOpenerContext.Provider>;
}

function useOpenApp(): (appId: AppId) => void {
  const opener = useContext(WindowOpenerContext);
  return opener
    ? opener.openApp
    : () => {
        // Render-only contexts (tests, the texture-rasterization snapshot)
        // don't have an opener — links become no-ops there.
      };
}

// Selection state for the projects and blog windows is owned by the
// Portfolio shell so the URL router can drive it directly. The two
// app components read it through this context. When no provider is
// mounted (tests, screenshots), the context falls back to a fixed
// default and selection-change calls are no-ops.
export interface SelectionState {
  projectsSelectedId: string;
  setProjectsSelectedId: (id: string) => void;
  blogSelectedId: string | null;
  setBlogSelectedId: (id: string | null) => void;
}

const SelectionContext = createContext<SelectionState | null>(null);

export function SelectionProvider({
  state,
  children,
}: {
  state: SelectionState;
  children: ReactNode;
}) {
  return <SelectionContext.Provider value={state}>{children}</SelectionContext.Provider>;
}

function useProjectsSelection(): {
  selectedId: string;
  setSelectedId: (id: string) => void;
} {
  const context = useContext(SelectionContext);
  if (context) {
    return {
      selectedId: context.projectsSelectedId,
      setSelectedId: context.setProjectsSelectedId,
    };
  }
  return {
    selectedId: PROJECTS[0].id,
    setSelectedId: () => {
      // No provider — selection persisted nowhere. Used by the
      // rasterization snapshot pass and tests.
    },
  };
}

function useBlogSelection(): {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
} {
  const context = useContext(SelectionContext);
  if (context) {
    return {
      selectedId: context.blogSelectedId,
      setSelectedId: context.setBlogSelectedId,
    };
  }
  return {
    selectedId: null,
    setSelectedId: () => {
      // No provider — same reasoning as useProjectsSelection.
    },
  };
}

// ── Shared chrome bits ─────────────────────────────────────────────

interface ToolbarProps {
  path: string;
  right?: ReactNode;
}

function Toolbar({ path, right }: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="tb-nav">
        <button className="nav-btn" disabled>
          ‹
        </button>
        <button className="nav-btn" disabled>
          ›
        </button>
        <button className="nav-btn" disabled>
          ↑
        </button>
      </div>
      <div className="tb-path mono">{path}</div>
      {right && <div className="tb-right">{right}</div>}
    </div>
  );
}

interface SidebarProps {
  active: AppId;
}

function Sidebar({ active }: SidebarProps) {
  const openApp = useOpenApp();
  const places: Array<{ id: AppId; icon: ReactNode; label: string }> = [
    { id: "home", icon: <Icon name="house" />, label: "Home" },
    { id: "about", icon: <Icon name="person" />, label: "About Me" },
    { id: "experience", icon: <Icon name="brain" />, label: "Experience" },
    { id: "projects", icon: <Icon name="wrench" />, label: "Projects" },
    { id: "blog", icon: <Icon name="pencil" />, label: "Blog" },
    { id: "mystery", icon: <Icon name="lock" />, label: "Mystery" },
  ];
  return (
    <aside className="sidebar">
      <div className="sb-section mono">PLACES</div>
      {places.map((place) => (
        <button
          key={place.id}
          className={"sb-item" + (active === place.id ? " active" : "")}
          onClick={() => openApp(place.id)}
        >
          <span className="sb-icon">{place.icon}</span>
          <span>{place.label}</span>
        </button>
      ))}
    </aside>
  );
}

interface StatusbarProps {
  count: number;
  hint: string;
}

function Statusbar({ count, hint }: StatusbarProps) {
  return (
    <div className="statusbar mono">
      <span>{count} items</span>
      <span>{hint}</span>
    </div>
  );
}

// ── Home (file manager) ────────────────────────────────────────────

export function HomeApp() {
  const openApp = useOpenApp();
  const items: Array<{
    id: AppId;
    icon: ReactNode;
    label: string;
    sub: string;
    classified?: boolean;
  }> = [
    { id: "about", icon: <Icon name="person" />, label: "About Me", sub: "who I am" },
    { id: "experience", icon: <Icon name="brain" />, label: "Experience", sub: "where I've been" },
    { id: "projects", icon: <Icon name="wrench" />, label: "Projects", sub: "what I've built" },
    { id: "blog", icon: <Icon name="pencil" />, label: "Blog", sub: "things I wrote" },
    {
      id: "mystery",
      icon: <Icon name="lock" />,
      label: "Mystery",
      sub: "in development",
      classified: true,
    },
    { id: "readme", icon: <Icon name="document" />, label: "README.md", sub: "start here" },
    { id: "contact", icon: <Icon name="envelope" />, label: "Contact", sub: "reach out" },
  ];
  const [selectedId, setSelectedId] = useState<AppId | null>(null);
  const selected = selectedId ? items.find((item) => item.id === selectedId) : null;

  function handleBackgroundClick(event: React.MouseEvent<HTMLDivElement>): void {
    const target = event.target as HTMLElement;
    if (target.classList.contains("dol-grid") || target.classList.contains("dol-body")) {
      setSelectedId(null);
    }
  }

  return (
    <div className="dol" onClick={handleBackgroundClick}>
      <Toolbar path="/home/taggart" />
      <div className="dol-body">
        <Sidebar active="home" />
        <div className="dol-grid">
          {items.map((item) => (
            <button
              key={item.id}
              className={
                "dol-item" +
                (item.classified ? " classified" : "") +
                (selectedId === item.id ? " sel" : "")
              }
              onClick={() => setSelectedId(item.id)}
              onDoubleClick={() => openApp(item.id)}
            >
              <div className="dol-ico">{item.icon}</div>
              <div className="dol-name">{item.label}</div>
              <div className="dol-sub mono">{item.sub}</div>
            </button>
          ))}
        </div>
      </div>
      <Statusbar
        count={items.length}
        hint={
          selected
            ? `"${selected.label}" — double-click to open`
            : "Double-click any item to open · single-click to select"
        }
      />
    </div>
  );
}

// ── About ──────────────────────────────────────────────────────────

export function AboutApp() {
  const about = PORTFOLIO.about;
  return (
    <div className="dol">
      <Toolbar path="/home/taggart/About Me" />
      <div className="dol-body">
        <Sidebar active="about" />
        <div className="doc-pad">
          <div className="readme-meta mono">about.md · ~ · last edited [date]</div>
          <h1 className="serif">{about.headline}</h1>
          <p className="lede">{about.tldr}</p>

          <h3>Fact sheet</h3>
          <table className="kv">
            <tbody>
              {about.facts.map(([key, value]) => (
                <tr key={key}>
                  <th className="mono">{key}</th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Long form</h3>
          {about.longform.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}

          <h3>Channels</h3>
          <ul className="links">
            {about.links.map((link) => (
              <li key={link.label}>
                <a href={link.href} className="link-row">
                  <span className="link-name">{link.label}</span>
                  <span className="link-hint mono">{link.hint}</span>
                  <span className="link-go mono">open ↗</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ── Experience ────────────────────────────────────────────────────

export function ExperienceApp() {
  const rows = PORTFOLIO.experience;
  return (
    <div className="dol">
      <Toolbar path="/home/taggart/Experience" />
      <div className="dol-body">
        <Sidebar active="experience" />
        <div className="doc-pad">
          <h1 className="serif">Experience</h1>
          <p className="lede">A log of where I've spent my time professionally.</p>
          <ol className="timeline">
            {rows.map((row, index) => (
              <li key={index} className={"tl-row tl-" + row.kind}>
                <div className="tl-year mono">{row.year}</div>
                <div className="tl-rail">
                  <span className="tl-dot"></span>
                </div>
                <div className="tl-body">
                  <div className="tl-head">
                    <span className="tl-role serif">{row.role}</span>
                    <span className="tl-org">{row.org}</span>
                    <span className="tl-where mono">— {row.where}</span>
                  </div>
                  <ul className="tl-bullets">
                    {row.bullets.map((bullet, bulletIndex) => (
                      <li key={bulletIndex}>{bullet}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

// ── Projects (split view) ─────────────────────────────────────────

export function ProjectsApp() {
  const projects = PROJECTS;
  const { selectedId, setSelectedId } = useProjectsSelection();
  const [view, setView] = useState<"grid" | "list">("list");
  const current = projects.find((project) => project.id === selectedId);

  return (
    <div className="dol">
      <Toolbar
        path="/home/taggart/Projects"
        right={
          <div className="vw-toggle mono">
            <button className={view === "grid" ? "on" : ""} onClick={() => setView("grid")}>
              ▦ grid
            </button>
            <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>
              ≡ list
            </button>
            <CopyLinkButton />
          </div>
        }
      />
      <div className="proj-split">
        <div className={"proj-list " + view}>
          {view === "grid" ? (
            <div className="proj-grid">
              {projects.map((project) => (
                <button
                  key={project.id}
                  className={"proj-card" + (selectedId === project.id ? " sel" : "")}
                  onClick={() => setSelectedId(project.id)}
                >
                  <div className="proj-thumb">
                    <div className="thumb-ico">{project.icon}</div>
                    <div className="thumb-stripes"></div>
                    <div className="thumb-tag mono">[ thumb ]</div>
                    {project.status && <div className="status-pill mono">{project.status}</div>}
                  </div>
                  <div className="proj-name">{project.name}</div>
                  <div className="proj-tag mono">
                    {project.tag} · {project.year}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <table className="proj-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Name</th>
                  <th>Tag</th>
                  <th>Year</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr
                    key={project.id}
                    className={selectedId === project.id ? "sel" : ""}
                    onClick={() => setSelectedId(project.id)}
                  >
                    <td className="row-ico">{project.icon}</td>
                    <td className="row-name">
                      {project.name}
                      {project.status && (
                        <span className="status-pill mono inline">{project.status}</span>
                      )}
                    </td>
                    <td className="row-tag mono">{project.tag}</td>
                    <td className="row-year mono">{project.year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <aside className="proj-detail">
          {current && (
            <>
              <div className="detail-thumb">
                <div className="thumb-ico big">{current.icon}</div>
                <div className="thumb-stripes"></div>
                <div className="thumb-tag mono">[ project image ]</div>
              </div>
              <div className="detail-pad">
                <div className="detail-meta mono">
                  {current.tag} · {current.year}
                  {current.status && " · " + current.status}
                </div>
                <h2 className="serif">{current.name}</h2>
                <p className="lede">{current.oneliner}</p>
                <Markdown>{current.content}</Markdown>
                <div className="kv-mini">
                  <div className="kv-mini-k mono">stack</div>
                  <div className="kv-mini-v">
                    {current.stack.map((tech) => (
                      <span key={tech} className="chip mono">
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="detail-links">
                  {current.links.map((link) => (
                    <a key={link.label} className="btn-go mono" href={link.href}>
                      {link.label} ↗
                    </a>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
      <Statusbar count={projects.length} hint={"selected: " + (current ? current.name : "—")} />
    </div>
  );
}

// ── Blog ──────────────────────────────────────────────────────────

export function BlogApp() {
  const posts = BLOG_POSTS;
  const { selectedId, setSelectedId } = useBlogSelection();
  const selected = selectedId ? posts.find((post) => post.id === selectedId) : null;

  return (
    <div className="dol">
      <Toolbar
        path={"/home/taggart/Blog" + (selected ? "/" + selected.id + ".md" : "")}
        right={
          <div className="vw-toggle mono">
            {selected && <button onClick={() => setSelectedId(null)}>‹ index</button>}
            {selected && <CopyLinkButton />}
          </div>
        }
      />
      <div className="dol-body">
        <Sidebar active="blog" />
        <div className="doc-pad">
          {selected ? (
            <article>
              <div className="post-h">
                <span className="post-tag mono">
                  {selected.icon ? selected.icon + " " : ""}
                  {selected.tag}
                </span>
                <span className="post-meta mono">
                  {selected.date} · {selected.readtime}
                </span>
              </div>
              <Markdown>{selected.content}</Markdown>
              {selected.links && selected.links.length > 0 && (
                <div className="detail-links">
                  {selected.links.map((link) => (
                    <a key={link.label} className="btn-go mono" href={link.href}>
                      {link.label} ↗
                    </a>
                  ))}
                </div>
              )}
            </article>
          ) : (
            <>
              <h1 className="serif">Blog</h1>
              <p className="lede">Posts. Some technical, some less so.</p>
              <ul className="post-list">
                {posts.map((post) => (
                  <li key={post.id} className="post">
                    <button
                      type="button"
                      className="post-link"
                      onClick={() => setSelectedId(post.id)}
                    >
                      <div className="post-h">
                        <span className="post-tag mono">
                          {post.icon ? post.icon + " " : ""}
                          {post.tag}
                        </span>
                        <span className="post-meta mono">
                          {post.year} · {post.readtime}
                        </span>
                      </div>
                      <h3 className="serif">{post.title}</h3>
                      <p className="post-ex">{post.excerpt}</p>
                      <div className="post-go mono">read post →</div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Mystery ───────────────────────────────────────────────────────

export function MysteryApp() {
  const items = PORTFOLIO.mystery;
  return (
    <div className="dol mystery">
      <Toolbar path="/home/taggart/Mystery" />
      <div className="dol-body">
        <Sidebar active="mystery" />
        <div className="doc-pad">
          <div className="cls-banner mono">⚠ CLASSIFIED — IN DEVELOPMENT</div>
          <h1 className="serif">Mystery</h1>
          <p className="lede">
            Things I'm working on but can't really explain yet. Codenames only.
          </p>
          <div className="mys-grid">
            {items.map((item) => (
              <div key={item.id} className="mys-card">
                <div className="mys-hdr">
                  <div className="mys-codename mono">{item.codename}</div>
                  <div className="mys-eta mono">ETA {item.eta}</div>
                </div>
                <div className="mys-expansion mono">{item.expansion}</div>
                <p className="mys-hint">{item.hint}</p>
                <div className="mys-redacted">
                  <div className="redact-line"></div>
                  <div className="redact-line short"></div>
                  <div className="redact-line"></div>
                  <div className="redact-line med"></div>
                </div>
                <div className="mys-foot mono">{item.classified}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── README ────────────────────────────────────────────────────────

export function ReadmeApp() {
  return (
    <div className="page-pad">
      <Toolbar path="/home/taggart/README.md" />
      <div className="doc-pad readme">
        <div className="readme-meta mono">README.md · plain text</div>
        <Markdown>{README_MARKDOWN}</Markdown>
      </div>
    </div>
  );
}

// ── Contact ──────────────────────────────────────────────────────

// ── Settings ─────────────────────────────────────────────────────

export function SettingsApp() {
  return (
    <div className="page-pad">
      <Toolbar path="/home/taggart/Settings" />
      <div className="doc-pad readme">
        <SettingsView />
      </div>
    </div>
  );
}

export function ContactApp() {
  const about = PORTFOLIO.about;
  return (
    <div className="page-pad">
      <Toolbar path="/home/taggart/Contact" />
      <div className="doc-pad">
        <h1 className="serif">Contact</h1>
        <p className="lede">Pick a channel.</p>
        <ul className="links big">
          {about.links.map((link) => (
            <li key={link.label}>
              <a href={link.href} className="link-row">
                <span className="link-name">{link.label}</span>
                <span className="link-hint mono">{link.hint}</span>
                <span className="link-go mono">open ↗</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
