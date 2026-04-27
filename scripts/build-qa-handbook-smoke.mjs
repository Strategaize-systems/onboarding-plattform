// Builds scripts/qa-handbook-smoke.mjs into dist/qa-handbook-smoke.mjs.
// Mirrors build-qa-smoke.mjs (bridge-smoke).

import { build } from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

await build({
  entryPoints: [resolve(root, "scripts/qa-handbook-smoke.mjs")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: resolve(root, "dist/qa-handbook-smoke.mjs"),
  packages: "external",
  external: ["nodemailer"],
  tsconfig: resolve(root, "tsconfig.worker.json"),
  alias: {
    "@/lib/email": resolve(root, "scripts/qa-stubs/email-stub.mjs"),
    "@": resolve(root, "src"),
  },
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
  logLevel: "info",
});

console.log("[build-qa-handbook-smoke] Built -> dist/qa-handbook-smoke.mjs");
