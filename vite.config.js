import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base` matches the GitHub Pages project path:
// https://<user>.github.io/PABC/. Override with --base=/ for non-Pages
// targets (e.g. local dev still works because Vite ignores base on dev server).
export default defineConfig({
  plugins: [react()],
  base: "/PABC/",
  server: {
    port: 5173,
    host: true,
  },
});
