import { useMemo } from "react";
import { matchRoute } from "./matchRoute";
import { useRouter } from "./useRouter";

export interface ResolvedRoute {
  path: string;
  params: Record<string, string>;
}

// Try a list of patterns against the current path. Returns the first
// pattern that matches plus its captured params. When nothing matches,
// returns the bare path with empty params so callers can fall through
// to a 404 view.
export function useRoute(patterns: readonly string[]): ResolvedRoute {
  const { path } = useRouter();
  return useMemo(() => {
    for (const pattern of patterns) {
      const match = matchRoute(pattern, path);
      if (match) {
        return { path, params: match.params };
      }
    }
    return { path, params: {} };
  }, [path, patterns]);
}

// Lower-level helper: match a single pattern against the live path.
// Returns null if no match. Used by Routes.tsx-style switch components.
export function useMatch(pattern: string): { params: Record<string, string> } | null {
  const { path } = useRouter();
  return useMemo(() => matchRoute(pattern, path), [path, pattern]);
}
