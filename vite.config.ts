import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { main: "index.html", strip: "strip.html", reservoirHouse: "reservoir-house.html" },
    },
  },
  test: { include: ["src/tests/**/*.test.ts"] },
});
