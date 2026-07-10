// SLC-194 (V20) — CSP-Funktional-Smoke. Strategaize-Standard-Probe, portiert aus
// immoscheckheft V3.3 (P-089 / security-headers-live-smoke.md). Prueft NICHT nur die
// Header-Anwesenheit (curl -I reicht NICHT), sondern dass React unter der CSP
// hydratisiert und 0 CSP/Permissions-Console-Errors auftreten.
//
// Nutzung (gegen den DEPLOYTEN Container ODER lokal `next start`):
//   node tests/_probe/csp-check.mjs https://<host>/login
//
// Done-Gate: exit 0 == 0 CSP-Console-Errors + hasReactProps + hasReactFiber +
// onSubmitAttached. Bei Report-Only meldet der Browser Violations als Console-
// Errors, blockt aber nicht — so werden Eigen-Asset-Verletzungen VOR dem
// enforce-Flip sichtbar.

import { chromium } from "playwright";

const URL = process.argv[2];
if (!URL) {
  console.error("Usage: node csp-check.mjs <URL>");
  process.exit(1);
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
  if (
    msg.type() === "error" &&
    (msg.text().includes("CSP") ||
      msg.text().includes("Content Security Policy") ||
      msg.text().includes("Permissions-Policy"))
  ) {
    consoleErrors.push(msg.text());
  }
});

await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });

const result = await page.evaluate(() => {
  const body = document.body;
  const propsKey = Object.keys(body).find((k) => k.startsWith("__reactProps"));
  const fiberKey = Object.keys(body).find((k) => k.startsWith("__reactFiber"));
  const forms = Array.from(document.querySelectorAll("form"));
  // React-19-Server-Action-Forms (Strategaize native_html_form_pattern) haben KEIN
  // onSubmit — der hydratisierte action-Handler ist der aequivalente Hydration-Beweis.
  const onSubmitAttached =
    forms.length === 0 ||
    forms.some((f) => {
      const propKey = Object.keys(f).find((k) => k.startsWith("__reactProps"));
      if (!propKey) return false;
      const p = f[propKey];
      return typeof p.onSubmit === "function" || typeof p.action === "function";
    });
  return {
    hasReactProps: !!propsKey,
    hasReactFiber: !!fiberKey,
    onSubmitAttached,
  };
});

await browser.close();

console.log(JSON.stringify({ ...result, cspErrors: consoleErrors }, null, 2));
process.exit(
  consoleErrors.length === 0 &&
    result.hasReactProps &&
    result.hasReactFiber &&
    result.onSubmitAttached
    ? 0
    : 1,
);
