// Type augmentation for Vite's `import.meta.env`. Only declares the
// keys this project reads; Vite exposes any var matching the
// `envPrefix` config in vite.config.ts.

interface ImportMetaEnv {
  readonly CELLS_PER_SIDE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
