// Type augmentation for Vite's `import.meta.env`. Only declares the
// keys this project reads; Vite exposes any var matching the
// `envPrefix` config in vite.config.ts.

interface ImportMetaEnv {
  readonly CELLS_PER_SIDE: string;
  readonly STEAM_CROP_MIN_X: string;
  readonly STEAM_CROP_MAX_X: string;
  readonly STEAM_CROP_MIN_Y: string;
  readonly STEAM_CROP_MAX_Y: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.md?raw" {
  const content: string;
  export default content;
}
