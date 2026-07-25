import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: path.resolve("mac-web"),
  publicDir: path.resolve("public"),
  plugins: [react()],
  build: {
    outDir: path.resolve("mac-dist"),
    emptyOutDir: true,
    target: "safari16",
  },
});
