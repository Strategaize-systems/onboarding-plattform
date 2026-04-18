// Build script for the condensation worker.
// Bundles src/workers/condensation/run.ts into dist/worker.js
// using esbuild. npm packages are left external (resolved from node_modules).

import { build } from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

await build({
  entryPoints: [resolve(root, "src/workers/condensation/run.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: resolve(root, "dist/worker.js"),
  packages: "external",
  tsconfig: resolve(root, "tsconfig.worker.json"),
  // Resolve @/* paths
  alias: {
    "@": resolve(root, "src"),
  },
  banner: {
    // ESM compat: provide __dirname for CJS modules
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
  logLevel: "info",
});

console.log("[build-worker] Worker built successfully → dist/worker.js");
