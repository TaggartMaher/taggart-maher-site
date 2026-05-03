import "./theme.css";
import "./lite.css";
import { Layout } from "./Layout";
import { Routes } from "./Routes";

// Single-column reading interface used by both LIGHTWEIGHT_MODE
// (mounted inside the compositor's screen) and FALLBACK_MODE (mounted
// alone, no compositor). The Routes component reads the path from the
// surrounding <Router> and renders the right page.
export function LiteInterface() {
  return (
    <Layout>
      <Routes />
    </Layout>
  );
}
