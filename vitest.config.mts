import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Node >= 22 ships an experimental global `localStorage` that is unavailable
// unless the process ran with `--localstorage-file`. When present it shadows
// the jsdom implementation, so `window.localStorage` reads as `undefined` in
// tests. Disabling the Node global inside the worker processes lets jsdom
// provide the real Storage again. The flag does not exist on Node < 22, so it
// is only passed when the runtime supports it (CI on Node 20 stays green).
const nodeMajor = Number(process.versions.node.split(".")[0]);
const execArgv = nodeMajor >= 22 ? ["--no-experimental-webstorage"] : [];

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // See `execArgv` above: restores jsdom's localStorage under Node 22+.
    execArgv,
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
});
