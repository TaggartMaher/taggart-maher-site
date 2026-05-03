import { matchRoute } from "../router/matchRoute";
import { useRouter } from "../router/useRouter";
import { HomePage } from "./pages/HomePage";
import { AboutPage } from "./pages/AboutPage";
import { ExperiencePage } from "./pages/ExperiencePage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { BlogPage } from "./pages/BlogPage";
import { BlogPostPage } from "./pages/BlogPostPage";
import { MysteryPage } from "./pages/MysteryPage";
import { ContactPage } from "./pages/ContactPage";
import { SettingsPage } from "./pages/SettingsPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export function Routes() {
  const { path } = useRouter();
  if (matchRoute("/", path)) return <HomePage />;
  if (matchRoute("/about", path)) return <AboutPage />;
  if (matchRoute("/experience", path)) return <ExperiencePage />;
  if (matchRoute("/projects", path)) return <ProjectsPage />;
  const projectMatch = matchRoute("/projects/:id", path);
  if (projectMatch) return <ProjectDetailPage projectId={projectMatch.params.id} />;
  if (matchRoute("/blog", path)) return <BlogPage />;
  const blogMatch = matchRoute("/blog/:id", path);
  if (blogMatch) return <BlogPostPage postId={blogMatch.params.id} />;
  if (matchRoute("/mystery", path)) return <MysteryPage />;
  if (matchRoute("/contact", path)) return <ContactPage />;
  if (matchRoute("/settings", path)) return <SettingsPage />;
  return <NotFoundPage />;
}
