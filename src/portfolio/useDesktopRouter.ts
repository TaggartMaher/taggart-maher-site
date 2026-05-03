import { useEffect, useRef } from "react";
import { matchRoute } from "../router/matchRoute";
import { useRouter } from "../router/useRouter";
import type { AppId } from "./apps";

// URL ↔ desktop window state synchronization.
//
// Two flows:
//   1. URL → state. Whenever the live router path changes, map it to
//      an AppId (with optional sub-id for projects/blog) and tell the
//      Portfolio shell to open that window. Used both on first mount
//      (deep links like /blog/the-forge) and after <Link> clicks
//      inside markdown.
//   2. State → URL. Whenever the focused window changes or a
//      projects/blog selection changes, write the matching path back
//      with replaceState so the browser back/forward stack walks
//      window-level focus changes only, not selection-level ones.

export interface DesktopRouterTarget {
  appId: AppId;
  // For projects: the sub-id selects a project in the split view
  // without collapsing the layout. For blog: the sub-id switches the
  // window into the single-post view. null/undefined leaves the
  // selection as-is.
  projectsSubId?: string;
  blogSubId?: string | null;
}

export interface DesktopRouterCallbacks {
  // Called when the URL changes (initial mount included). The shell
  // should open/focus the named window and apply any sub-id.
  onUrlTarget: (target: DesktopRouterTarget) => void;
}

export interface DesktopRouterState {
  focusedAppId: AppId | null;
  projectsSelectedId: string;
  blogSelectedId: string | null;
}

const APP_PATH_PREFIX: Record<AppId, string> = {
  readme: "/",
  about: "/about",
  experience: "/experience",
  projects: "/projects",
  blog: "/blog",
  mystery: "/mystery",
  contact: "/contact",
  settings: "/settings",
  // Home (file manager) has no canonical path — it stays as / to keep
  // the URL clean if it happens to be focused.
  home: "/",
};

export function pathForState(state: DesktopRouterState): string {
  const { focusedAppId } = state;
  if (focusedAppId === null) return "/";
  if (focusedAppId === "projects") {
    const baseProjectsPath = "/projects";
    if (state.projectsSelectedId) {
      return baseProjectsPath + "/" + state.projectsSelectedId;
    }
    return baseProjectsPath;
  }
  if (focusedAppId === "blog") {
    if (state.blogSelectedId) return "/blog/" + state.blogSelectedId;
    return "/blog";
  }
  return APP_PATH_PREFIX[focusedAppId];
}

export function targetForPath(path: string): DesktopRouterTarget | null {
  if (matchRoute("/", path)) return { appId: "readme" };
  if (matchRoute("/about", path)) return { appId: "about" };
  if (matchRoute("/experience", path)) return { appId: "experience" };
  if (matchRoute("/projects", path)) return { appId: "projects" };
  const projectMatch = matchRoute("/projects/:id", path);
  if (projectMatch) {
    return { appId: "projects", projectsSubId: projectMatch.params.id };
  }
  if (matchRoute("/blog", path)) return { appId: "blog", blogSubId: null };
  const blogMatch = matchRoute("/blog/:id", path);
  if (blogMatch) {
    return { appId: "blog", blogSubId: blogMatch.params.id };
  }
  if (matchRoute("/mystery", path)) return { appId: "mystery" };
  if (matchRoute("/contact", path)) return { appId: "contact" };
  if (matchRoute("/settings", path)) return { appId: "settings" };
  return null;
}

// URL → state. Watches the router path and forwards each translated
// target to the Portfolio shell. We also call once on the initial
// path so deep-loads like /blog/foo land on the right window.
export function useUrlToDesktopState(callbacks: DesktopRouterCallbacks): void {
  const { path } = useRouter();
  const lastDispatchedPathRef = useRef<string | null>(null);
  const onUrlTargetRef = useRef(callbacks.onUrlTarget);
  onUrlTargetRef.current = callbacks.onUrlTarget;

  useEffect(() => {
    if (lastDispatchedPathRef.current === path) return;
    lastDispatchedPathRef.current = path;
    const target = targetForPath(path);
    if (target) {
      onUrlTargetRef.current(target);
    }
  }, [path]);
}

// State → URL. Whenever the desktop's focused window or selection
// state changes, write the path back via replaceState. The router's
// `replace` API normalizes through pushState semantics so the local
// <Router> path also stays in sync without firing popstate.
export function useDesktopStateToUrl(state: DesktopRouterState): void {
  const router = useRouter();
  const lastWrittenPathRef = useRef<string | null>(null);
  useEffect(() => {
    const nextPath = pathForState(state);
    if (lastWrittenPathRef.current === nextPath) return;
    if (router.path === nextPath) {
      lastWrittenPathRef.current = nextPath;
      return;
    }
    lastWrittenPathRef.current = nextPath;
    router.replace(nextPath);
  }, [router, state.focusedAppId, state.projectsSelectedId, state.blogSelectedId, state]);
}
