import { createContext, useContext, useState, type ReactNode } from "react";
import { PORTFOLIO } from "./data";

export type AppId =
  | "home"
  | "about"
  | "experience"
  | "projects"
  | "blog"
  | "mystery"
  | "readme"
  | "contact";

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
  const places: Array<{ id: AppId; icon: string; label: string }> = [
    { id: "home", icon: "🏠", label: "Home" },
    { id: "about", icon: "👤", label: "About Me" },
    { id: "experience", icon: "📅", label: "Experience" },
    { id: "projects", icon: "🛠", label: "Projects" },
    { id: "blog", icon: "📝", label: "Blog" },
    { id: "mystery", icon: "🔒", label: "Mystery" },
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
    icon: string;
    label: string;
    sub: string;
    classified?: boolean;
  }> = [
    { id: "about", icon: "👤", label: "About Me", sub: "who I am" },
    { id: "experience", icon: "📅", label: "Experience", sub: "where I've been" },
    { id: "projects", icon: "🛠", label: "Projects", sub: "what I've built" },
    { id: "blog", icon: "📝", label: "Blog", sub: "things I wrote" },
    { id: "mystery", icon: "🔒", label: "Mystery", sub: "in development", classified: true },
    { id: "readme", icon: "📄", label: "README.md", sub: "start here" },
    { id: "contact", icon: "✉", label: "Contact", sub: "reach out" },
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
  const projects = PORTFOLIO.projects;
  const [selectedId, setSelectedId] = useState(projects[0].id);
  const [view, setView] = useState<"grid" | "list">("grid");
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
                <p>{current.details}</p>
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
  const posts = PORTFOLIO.blog;
  return (
    <div className="dol">
      <Toolbar path="/home/taggart/Blog" />
      <div className="dol-body">
        <Sidebar active="blog" />
        <div className="doc-pad">
          <h1 className="serif">Blog</h1>
          <p className="lede">Posts. Some technical, some less so.</p>
          <ul className="post-list">
            {posts.map((post) => (
              <li key={post.id} className="post">
                <a href={post.href} className="post-link">
                  <div className="post-h">
                    <span className="post-tag mono">{post.tag}</span>
                    <span className="post-meta mono">
                      {post.year} · {post.readtime}
                    </span>
                  </div>
                  <h3 className="serif">{post.title}</h3>
                  <p className="post-ex">{post.excerpt}</p>
                  <div className="post-go mono">read post →</div>
                </a>
              </li>
            ))}
          </ul>
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
        <div className="readme-meta mono">README.md · plain text · 2 KB</div>
        <h1 className="serif">tm-portfolio</h1>
        <p className="lede">
          Welcome. This site is laid out like a desktop because I think it's a more honest analogy
          for the way information actually fits together.
        </p>

        <h3 className="mono"># navigating</h3>
        <ul>
          <li>
            <b>Double-click</b> a folder on the desktop to open it.
          </li>
          <li>
            Use the <b>taskbar</b> at the bottom to switch between open windows.
          </li>
          <li>
            Click the <b>app launcher</b> (bottom-left) to open any section directly.
          </li>
          <li>
            Press <kbd>Esc</kbd> to close the focused window.
          </li>
        </ul>

        <h3 className="mono"># what's where</h3>
        <ul>
          <li>
            <b>About Me</b> — bio, fact sheet, links
          </li>
          <li>
            <b>Experience</b> — work / school timeline
          </li>
          <li>
            <b>Projects</b> — shipped & in-progress work
          </li>
          <li>
            <b>Blog</b> — posts and writeups
          </li>
          <li>
            <b>Mystery</b> — things in development I can't fully explain
          </li>
        </ul>

        <h3 className="mono"># for skimmers</h3>
        <p>
          Each section opens with a short summary at the top. The Projects window is split — pick a
          card on the left, read the gist on the right.
        </p>
      </div>
    </div>
  );
}

// ── Contact ──────────────────────────────────────────────────────

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
