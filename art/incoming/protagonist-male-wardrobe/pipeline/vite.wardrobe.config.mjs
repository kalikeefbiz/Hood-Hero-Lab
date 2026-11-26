// Builds the playable outfit preview: the real Reservoir strip with the protagonist in the benchmark outfit.
// npx vite build --config art/incoming/protagonist-male-wardrobe/pipeline/vite.wardrobe.config.mjs
import { defineConfig } from "vite";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../../..");
export default defineConfig({ root, base: "./", build: { outDir: resolve(root, "dist-wardrobe"), emptyOutDir: true,
  rollupOptions: { input: { wardrobe: resolve(root, "art/incoming/protagonist-male-wardrobe/pipeline/wardrobe.html") } } } });
