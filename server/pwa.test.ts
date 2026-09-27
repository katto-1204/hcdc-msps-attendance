import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
describe("production offline bundle", () => {
  it("precaches the shell and every compiled chunk, including the lazy spreadsheet parser", async () => {
    const root = resolve("dist/public");
    const script = readFileSync(resolve(root, "service-worker.js"), "utf8");
    const listeners: Record<string, (event: any) => void> = {};
    const cached = new Map<string, unknown>();
    const cache = { addAll: async (files: string[]) => { for (const file of files) {
      expect(existsSync(resolve(root, file === "/" ? "index.html" : file.slice(1)))).toBe(true);
      cached.set(file, { url: file });
    } }, match: async (request: string | { url: string }) => cached.get(typeof request === "string" ? request : new URL(request.url).pathname) };
    const deleted: string[] = [];
    runInNewContext(script, { URL, self: { location: { origin: "http://localhost:3000" }, clients: { claim: async () => {} }, addEventListener: (key: string, fn: any) => { listeners[key] = fn; } }, caches: { open: async () => cache, keys: async () => ["hcdc-msps-attendance-v1", "other-app-cache"], delete: async (key: string) => deleted.push(key) }, fetch: () => { throw new Error("Offline"); } });
    let pending: Promise<unknown> = Promise.resolve();
    listeners.install({ waitUntil: (p: Promise<unknown>) => { pending = p; } }); await pending;
    expect([...cached.keys()].some(key => key.includes("xlsx-") && key.endsWith(".js"))).toBe(true);
    expect([...cached.keys()].some(key => key.endsWith(".css"))).toBe(true);
    listeners.activate({ waitUntil: (p: Promise<unknown>) => { pending = p; } }); await pending;
    expect(deleted).toEqual(["hcdc-msps-attendance-v1"]);
    listeners.fetch({ request: { method: "GET", mode: "navigate", url: "http://localhost:3000/" }, respondWith: (p: Promise<unknown>) => { pending = p; } });
    expect(await pending).toEqual({ url: "/" });
    for (const path of cached.keys()) {
      listeners.fetch({ request: { method: "GET", mode: "cors", url: `http://localhost:3000${path}` }, respondWith: (p: Promise<unknown>) => { pending = p; } });
      expect(await pending).toEqual({ url: path });
    }
  });
});
