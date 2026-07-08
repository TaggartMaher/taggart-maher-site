<script lang="ts">
  import { matchRoute } from "../router/matchRoute";
  import { getRouter } from "../router/routerContext";
  import HomePage from "./pages/HomePage.svelte";
  import AboutPage from "./pages/AboutPage.svelte";
  import ExperiencePage from "./pages/ExperiencePage.svelte";
  import ProjectsPage from "./pages/ProjectsPage.svelte";
  import ProjectDetailPage from "./pages/ProjectDetailPage.svelte";
  import BlogPage from "./pages/BlogPage.svelte";
  import BlogPostPage from "./pages/BlogPostPage.svelte";
  import MysteryPage from "./pages/MysteryPage.svelte";
  import ContactPage from "./pages/ContactPage.svelte";
  import SettingsPage from "./pages/SettingsPage.svelte";
  import NotFoundPage from "./pages/NotFoundPage.svelte";

  const router = getRouter();

  const projectMatch = $derived(matchRoute("/projects/:id", router.path));
  const blogMatch = $derived(matchRoute("/blog/:id", router.path));
</script>

{#if matchRoute("/", router.path)}
  <HomePage />
{:else if matchRoute("/about", router.path)}
  <AboutPage />
{:else if matchRoute("/experience", router.path)}
  <ExperiencePage />
{:else if matchRoute("/projects", router.path)}
  <ProjectsPage />
{:else if projectMatch}
  <ProjectDetailPage projectId={projectMatch.params.id} />
{:else if matchRoute("/blog", router.path)}
  <BlogPage />
{:else if blogMatch}
  <BlogPostPage postId={blogMatch.params.id} />
{:else if matchRoute("/mystery", router.path)}
  <MysteryPage />
{:else if matchRoute("/contact", router.path)}
  <ContactPage />
{:else if matchRoute("/settings", router.path)}
  <SettingsPage />
{:else}
  <NotFoundPage />
{/if}
