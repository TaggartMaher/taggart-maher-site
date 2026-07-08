import { getContext, setContext } from "svelte";
import { PROJECTS } from "../content/projects";

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

const WINDOW_OPENER_CONTEXT_KEY = Symbol("window-opener");

// Must be called during component initialization (Svelte context rule).
// The Portfolio shell provides this; render-only contexts (tests, the
// texture-rasterization snapshot) don't, and links become no-ops there.
export function setWindowOpener(opener: WindowOpener): void {
  setContext(WINDOW_OPENER_CONTEXT_KEY, opener);
}

export function getOpenApp(): (appId: AppId) => void {
  const opener = getContext<WindowOpener | undefined>(WINDOW_OPENER_CONTEXT_KEY);
  return opener
    ? opener.openApp
    : () => {
        // No provider — links become no-ops.
      };
}

// Selection state for the projects and blog windows is owned by the
// Portfolio shell so the URL router can drive it directly. The two
// app components read it through this context. When no provider is
// mounted (tests, screenshots), the context falls back to a fixed
// default and selection-change calls are no-ops. The provider object
// exposes the live values through getters, so reads stay reactive.
export interface SelectionState {
  readonly projectsSelectedId: string;
  setProjectsSelectedId: (id: string) => void;
  readonly blogSelectedId: string | null;
  setBlogSelectedId: (id: string | null) => void;
}

const SELECTION_CONTEXT_KEY = Symbol("selection");

export function setSelectionState(state: SelectionState): void {
  setContext(SELECTION_CONTEXT_KEY, state);
}

export function getProjectsSelection(): {
  readonly selectedId: string;
  setSelectedId: (id: string) => void;
} {
  const context = getContext<SelectionState | undefined>(SELECTION_CONTEXT_KEY);
  if (context) {
    return {
      get selectedId() {
        return context.projectsSelectedId;
      },
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

export function getBlogSelection(): {
  readonly selectedId: string | null;
  setSelectedId: (id: string | null) => void;
} {
  const context = getContext<SelectionState | undefined>(SELECTION_CONTEXT_KEY);
  if (context) {
    return {
      get selectedId() {
        return context.blogSelectedId;
      },
      setSelectedId: context.setBlogSelectedId,
    };
  }
  return {
    selectedId: null,
    setSelectedId: () => {
      // No provider — same reasoning as getProjectsSelection.
    },
  };
}
