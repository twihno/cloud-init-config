import { resolve } from "node:path";
import { defineConfig } from "vite-plus";

const root = resolve(import.meta.dirname, "src");

export default defineConfig({
  root,
  publicDir: resolve(import.meta.dirname, "public"),
  resolve: {
    alias: {
      "@": root,
    },
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        editor: resolve(root, "editor/index.html"),
        new: resolve(root, "new/index.html"),
      },
    },
  },
});
