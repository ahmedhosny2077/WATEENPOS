import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// Username folder contains "&", which Vite treats as a URL query if realpath
// canonicalizes B: back to C:\Users\Wateen&Taleen\...
const origRealpathSync = fs.realpathSync.bind(fs);
const origNative = (fs.realpathSync as typeof fs.realpathSync & { native?: typeof fs.realpathSync }).native;
function keepSubst(p: fs.PathLike): string | null {
  const s = String(p);
  if (s.includes("Wateen&Taleen") || s.includes("Wateen%26Taleen")) {
    const mapped = s.replace(/.*?Desktop[\\/]beautyshop/i, "B:");
    return path.resolve(mapped);
  }
  if (/^[A-Za-z]:/.test(s) && !s.includes("&")) {
    return path.resolve(s);
  }
  return null;
}
function patchedRealpathSync(p: fs.PathLike, options?: fs.EncodingOption) {
  const kept = keepSubst(p);
  if (kept) {
    if (options && typeof options === "object" && options.encoding === "buffer") {
      return Buffer.from(kept);
    }
    return kept;
  }
  return origRealpathSync(p, options as never);
}
(fs as unknown as { realpathSync: typeof fs.realpathSync }).realpathSync =
  patchedRealpathSync as typeof fs.realpathSync;
if (origNative) {
  (fs.realpathSync as typeof fs.realpathSync & { native: typeof fs.realpathSync }).native =
    patchedRealpathSync as typeof fs.realpathSync;
}

const host = process.env.TAURI_DEV_HOST;
const root = path.resolve(__dirname);

export default defineConfig({
  root,
  cacheDir: "C:/Temp/vite-cosmetics-pos",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.join(root, "src"),
    },
    preserveSymlinks: true,
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    fs: { allow: [root] },
    watch: {
      ignored: [
        "**/src-tauri/**",
        "**/node_modules/**",
        "**/vite.config.ts",
        "**/tsconfig.json",
        "**/tsconfig.node.json",
      ],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: ["es2021", "chrome105", "safari13"],
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
