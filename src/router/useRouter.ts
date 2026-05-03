import { useContext } from "react";
import { RouterContext, type RouterContextValue } from "./routerContextValue";

export function useRouter(): RouterContextValue {
  const value = useContext(RouterContext);
  if (!value) {
    throw new Error("[router] useRouter must be used inside <Router>");
  }
  return value;
}
