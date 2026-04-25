// Builds scripts/qa-bridge-smoke.mjs into a bundled dist/qa-bridge-smoke.mjs
// that resolves @/* paths and inlines TS sources, leaving npm packages external.
// Mirrors scripts/build-worker.mjs.

import { build } from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

await build({
  entryPoints: [resolve(root, "scripts/qa-bridge-smoke.mjs")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: resolve(root, "dist/qa-bridge-smoke.mjs"),
  packages: "external",
  tsconfig: resolve(root, "tsconfig.worker.json"),
  alias: {
    "@": resolve(root, "src"),
  },
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
  logLevel: "info",
});

console.log("[build-qa-smoke] Built → dist/qa-bridge-smoke.mjs");
