import js from "@eslint/js";
import globals from "globals";
import svelte from "eslint-plugin-svelte";
import tseslint from "typescript-eslint";
import svelteConfig from "./svelte.config.js";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage", "public/composite"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,svelte,svelte.ts}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
  ...svelte.configs["flat/recommended"],
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: [".svelte"],
        svelteConfig,
      },
    },
    rules: {
      // The core rule doesn't understand runes: `let { x } = $props()`
      // must stay `let` for reactivity. The svelte/ variant is
      // runes-aware and enforces const everywhere else.
      "prefer-const": "off",
      "svelte/prefer-const": "error",
    },
  },
);
