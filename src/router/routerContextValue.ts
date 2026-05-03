import { createContext } from "react";

export interface RouterContextValue {
  // Path portion of the URL (no query string, no hash). Always starts
  // with "/".
  path: string;
  // Push a new entry onto the history stack.
  navigate: (nextPath: string) => void;
  // Replace the current entry in the history stack.
  replace: (nextPath: string) => void;
}

export const RouterContext = createContext<RouterContextValue | null>(null);
