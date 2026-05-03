import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { RouterContext, type RouterContextValue } from "./routerContextValue";

function readCurrentPath(): string {
  if (typeof window === "undefined") return "/";
  const pathname = window.location.pathname || "/";
  return pathname === "" ? "/" : pathname;
}

export function Router({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string>(() => readCurrentPath());

  useEffect(() => {
    function handlePopState(): void {
      setPath(readCurrentPath());
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((nextPath: string) => {
    if (typeof window === "undefined") return;
    if (window.location.pathname === nextPath) return;
    window.history.pushState({}, "", nextPath);
    setPath(readCurrentPath());
  }, []);

  const replace = useCallback((nextPath: string) => {
    if (typeof window === "undefined") return;
    if (window.location.pathname === nextPath) {
      // Even if the path matches, sync local state in case caller is
      // reconciling after an out-of-band history change.
      setPath(readCurrentPath());
      return;
    }
    window.history.replaceState({}, "", nextPath);
    setPath(readCurrentPath());
  }, []);

  const value = useMemo<RouterContextValue>(
    () => ({ path, navigate, replace }),
    [path, navigate, replace],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}
