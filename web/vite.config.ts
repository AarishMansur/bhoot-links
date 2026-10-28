import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

// The report is one self-contained HTML file (bundleStrategy "inline"), so
// fonts are inlined as data URIs. Relative font URLs would break inside it.
export default defineConfig({
  plugins: [sveltekit()],
  build: { assetsInlineLimit: 120_000 },
});
