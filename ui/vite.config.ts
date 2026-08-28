import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  root,
  resolve: {
    alias: {
      "@src": path.join(root, "../src"),
      "@": path.join(root, "src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [path.join(root, "..")] },
    proxy: { "/api": process.env.RESTAURANTE_API ?? "http://127.0.0.1:8080" },
  },
  build: {
    outDir: path.join(root, "dist"),
    emptyOutDir: true,
  },
});
