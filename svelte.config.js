import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  // vitePreprocess lets <script lang="ts"> use full TypeScript syntax
  // (the Svelte compiler alone only strips type annotations).
  preprocess: vitePreprocess(),
};
