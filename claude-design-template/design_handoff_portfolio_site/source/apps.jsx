// App content components — what goes inside each window.

const { useState: auS } = React;

// Global opener — set by Desktop on mount so any app can open another.
const openWindow = (id) => window.__openApp && window.__openApp(id);

// ── File Manager-style listing of "Home" ──────────────────────────
function HomeApp({ onOpen }) {
  const items = [
    { id: "about", icon: "👤", label: "About Me", sub: "who I am", kind: "folder" },
    { id: "experience", icon: "📅", label: "Experience", sub: "where I've been", kind: "folder" },
    { id: "projects", icon: "🛠", label: "Projects", sub: "what I've built", kind: "folder" },
    { id: "blog", icon: "📝", label: "Blog", sub: "things I wrote", kind: "folder" },
    {
      id: "mystery",
      icon: "🔒",
      label: "Mystery",
      sub: "in development",
      kind: "folder",
      classified: true,
    },
    { id: "readme", icon: "📄", label: "README.md", sub: "start here", kind: "file" },
    { id: "contact", icon: "✉", label: "Contact", sub: "reach out", kind: "shortcut" },
  ];
  const [sel, setSel] = auS(null);
  return (
    <div
      className="dol"
      onClick={(e) => {
        if (e.target.classList.contains("dol-grid") || e.target.classList.contains("dol-body"))
          setSel(null);
      }}
    >
      <Toolbar path="/home/taggart" />
      <div className="dol-body">
        <Sidebar onOpen={onOpen} active="home" />
        <div className="dol-grid">
          {items.map((it) => (
            <button
              key={it.id}
              className={
                "dol-item" + (it.classified ? " classified" : "") + (sel === it.id ? " sel" : "")
              }
              onClick={() => setSel(it.id)}
              onDoubleClick={() => onOpen(it.id)}
            >
              <div className="dol-ico">{it.icon}</div>
              <div className="dol-name">{it.label}</div>
              <div className="dol-sub mono">{it.sub}</div>
            </button>
          ))}
        </div>
      </div>
      <Statusbar
        count={items.length}
        hint={
          sel
            ? `"${items.find((i) => i.id === sel).label}" — double-click to open`
            : "Double-click any item to open · single-click to select"
        }
      />
    </div>
  );
}

// ── About ──────────────────────────────────────────────────────────
function AboutApp() {
  const a = window.PORTFOLIO.about;
  return (
    <div className="dol">
      <Toolbar path="/home/taggart/About Me" />
      <div className="dol-body">
        <Sidebar active="about" />
        <div className="doc-pad">
          <div className="readme-meta mono">about.md · ~ · last edited [date]</div>
          <h1 className="serif">{a.headline}</h1>
          <p className="lede">{a.tldr}</p>

          <h3>Fact sheet</h3>
          <table className="kv">
            <tbody>
              {a.facts.map(([k, v]) => (
                <tr key={k}>
                  <th className="mono">{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Long form</h3>
          {a.longform.map((p, i) => (
            <p key={i}>{p}</p>
          ))}

          <h3>Channels</h3>
          <ul className="links">
            {a.links.map((l) => (
              <li key={l.label}>
                <a href={l.href} className="link-row">
                  <span className="link-name">{l.label}</span>
                  <span className="link-hint mono">{l.hint}</span>
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
function ExperienceApp() {
  const rows = window.PORTFOLIO.experience;
  return (
    <div className="dol">
      <Toolbar path="/home/taggart/Experience" />
      <div className="dol-body">
        <Sidebar active="experience" />
        <div className="doc-pad">
          <h1 className="serif">Experience</h1>
          <p className="lede">A log of where I've spent my time professionally.</p>
          <ol className="timeline">
            {rows.map((row, i) => (
              <li key={i} className={"tl-row tl-" + row.kind}>
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
                    {row.bullets.map((b, j) => (
                      <li key={j}>{b}</li>
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

// ── Projects (file-manager grid + detail pane) ────────────────────
function ProjectsApp() {
  const projects = window.PORTFOLIO.projects;
  const [sel, setSel] = auS(projects[0].id);
  const [view, setView] = auS("grid"); // grid | list
  const cur = projects.find((p) => p.id === sel);

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
              {projects.map((p) => (
                <button
                  key={p.id}
                  className={"proj-card" + (sel === p.id ? " sel" : "")}
                  onClick={() => setSel(p.id)}
                >
                  <div className="proj-thumb">
                    <div className="thumb-ico">{p.icon}</div>
                    <div className="thumb-stripes"></div>
                    <div className="thumb-tag mono">[ thumb ]</div>
                    {p.status && <div className="status-pill mono">{p.status}</div>}
                  </div>
                  <div className="proj-name">{p.name}</div>
                  <div className="proj-tag mono">
                    {p.tag} · {p.year}
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
                {projects.map((p) => (
                  <tr key={p.id} className={sel === p.id ? "sel" : ""} onClick={() => setSel(p.id)}>
                    <td className="row-ico">{p.icon}</td>
                    <td className="row-name">
                      {p.name}
                      {p.status && <span className="status-pill mono inline">{p.status}</span>}
                    </td>
                    <td className="row-tag mono">{p.tag}</td>
                    <td className="row-year mono">{p.year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <aside className="proj-detail">
          {cur && (
            <>
              <div className="detail-thumb">
                <div className="thumb-ico big">{cur.icon}</div>
                <div className="thumb-stripes"></div>
                <div className="thumb-tag mono">[ project image ]</div>
              </div>
              <div className="detail-pad">
                <div className="detail-meta mono">
                  {cur.tag} · {cur.year}
                  {cur.status && " · " + cur.status}
                </div>
                <h2 className="serif">{cur.name}</h2>
                <p className="lede">{cur.oneliner}</p>
                <p>{cur.details}</p>
                <div className="kv-mini">
                  <div className="kv-mini-k mono">stack</div>
                  <div className="kv-mini-v">
                    {cur.stack.map((s) => (
                      <span key={s} className="chip mono">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="detail-links">
                  {cur.links.map((l) => (
                    <a key={l.label} className="btn-go mono" href={l.href}>
                      {l.label} ↗
                    </a>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
      <Statusbar count={projects.length} hint={"selected: " + (cur ? cur.name : "—")} />
    </div>
  );
}

// ── Blog ──────────────────────────────────────────────────────────
function BlogApp() {
  const posts = window.PORTFOLIO.blog;
  return (
    <div className="dol">
      <Toolbar path="/home/taggart/Blog" />
      <div className="dol-body">
        <Sidebar active="blog" />
        <div className="doc-pad">
          <h1 className="serif">Blog</h1>
          <p className="lede">Posts. Some technical, some less so.</p>
          <ul className="post-list">
            {posts.map((p) => (
              <li key={p.id} className="post">
                <a href={p.href} className="post-link">
                  <div className="post-h">
                    <span className="post-tag mono">{p.tag}</span>
                    <span className="post-meta mono">
                      {p.year} · {p.readtime}
                    </span>
                  </div>
                  <h3 className="serif">{p.title}</h3>
                  <p className="post-ex">{p.excerpt}</p>
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

// ── Mystery (redacted) ────────────────────────────────────────────
function MysteryApp() {
  const items = window.PORTFOLIO.mystery;
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
            {items.map((m) => (
              <div key={m.id} className="mys-card">
                <div className="mys-hdr">
                  <div className="mys-codename mono">{m.codename}</div>
                  <div className="mys-eta mono">ETA {m.eta}</div>
                </div>
                <div className="mys-expansion mono">{m.expansion}</div>
                <p className="mys-hint">{m.hint}</p>
                <div className="mys-redacted">
                  <div className="redact-line"></div>
                  <div className="redact-line short"></div>
                  <div className="redact-line"></div>
                  <div className="redact-line med"></div>
                </div>
                <div className="mys-foot mono">{m.classified}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── README ───────────────────────────────────────────────────────
function ReadmeApp() {
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
function ContactApp() {
  const a = window.PORTFOLIO.about;
  return (
    <div className="page-pad">
      <Toolbar path="/home/taggart/Contact" />
      <div className="doc-pad">
        <h1 className="serif">Contact</h1>
        <p className="lede">Pick a channel.</p>
        <ul className="links big">
          {a.links.map((l) => (
            <li key={l.label}>
              <a href={l.href} className="link-row">
                <span className="link-name">{l.label}</span>
                <span className="link-hint mono">{l.hint}</span>
                <span className="link-go mono">open ↗</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Shared chrome bits ───────────────────────────────────────────
function Toolbar({ path, right }) {
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

function Sidebar({ onOpen, active }) {
  const places = [
    { id: "home", icon: "🏠", label: "Home" },
    { id: "about", icon: "👤", label: "About Me" },
    { id: "experience", icon: "📅", label: "Experience" },
    { id: "projects", icon: "🛠", label: "Projects" },
    { id: "blog", icon: "📝", label: "Blog" },
    { id: "mystery", icon: "🔒", label: "Mystery" },
  ];
  const handler = onOpen || openWindow;
  return (
    <aside className="sidebar">
      <div className="sb-section mono">PLACES</div>
      {places.map((p) => (
        <button
          key={p.id}
          className={"sb-item" + (active === p.id ? " active" : "")}
          onClick={() => handler(p.id)}
        >
          <span className="sb-icon">{p.icon}</span>
          <span>{p.label}</span>
        </button>
      ))}
    </aside>
  );
}

function Statusbar({ count, hint }) {
  return (
    <div className="statusbar mono">
      <span>{count} items</span>
      <span>{hint}</span>
    </div>
  );
}

window.HomeApp = HomeApp;
window.AboutApp = AboutApp;
window.ExperienceApp = ExperienceApp;
window.ProjectsApp = ProjectsApp;
window.BlogApp = BlogApp;
window.MysteryApp = MysteryApp;
window.ReadmeApp = ReadmeApp;
window.ContactApp = ContactApp;
