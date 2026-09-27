import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { defineConfig, type Plugin } from "vite";
function offlineBundle(): Plugin {
  return {
    name: "offline-bundle", apply: "build", enforce: "post",
    generateBundle(_options, bundle) {
      const files = ["/", "/manifest.webmanifest", "/hcdc-msps-logo.png", "/pwa-192.png", "/pwa-512.png", ...Object.keys(bundle).map(file => `/${file}`)];
      const hash = createHash("sha256").update(JSON.stringify(bundle));
      for (const file of ["manifest.webmanifest", "hcdc-msps-logo.png", "pwa-192.png", "pwa-512.png"]) hash.update(readFileSync(new URL(`./client/public/${file}`, import.meta.url)));
      const version = hash.digest("hex").slice(0, 16);
      const worker = readFileSync(new URL("./client/service-worker.js", import.meta.url), "utf8");
      this.emitFile({ type: "asset", fileName: "service-worker.js", source: worker.replace("__VERSION__", version).replace("__PRECACHE__", JSON.stringify(files)) });
    },
  };
}
export default defineConfig({
  plugins: [react(), tailwindcss(), offlineBundle()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "client/src"), "@shared": path.resolve(import.meta.dirname, "shared"), "@assets": path.resolve(import.meta.dirname, "attached_assets") } },
  root: path.resolve(import.meta.dirname, "client"),
  build: { outDir: path.resolve(import.meta.dirname, "dist/public"), emptyOutDir: true },
  server: { host: true, port: 3000, strictPort: true },
  preview: { host: true, port: 3000, strictPort: true },
});
