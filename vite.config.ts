import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  envPrefix: ["VITE_", "CELLS_", "STEAM_"],
  server: {
    host: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
  resolve: process.env.VITEST
    ? {
        // Vitest resolves packages with Node's default conditions, which
        // would pick Svelte's server build; the tests mount components
        // into jsdom, so force the browser build.
        conditions: ["browser"],
      }
    : undefined,
});
