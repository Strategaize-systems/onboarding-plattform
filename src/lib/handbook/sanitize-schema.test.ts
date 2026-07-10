// SLC-194 MT-1 — Pure-Mock-Test fuer das Handbook-Sanitize-Schema.
// Faehrt tenant-Markdown durch die exakte Render-Kette des HandbookReaders
// (remark-parse -> remark-rehype{allowDangerousHtml} -> rehype-raw ->
// rehype-sanitize{schema}) und serialisiert das Ergebnis zu HTML.
// AC-194-1: script/iframe/srcdoc/on* werden gestript, <a id>+<video> bleiben.

import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { toHtml } from "hast-util-to-html";
import { handbookSanitizeSchema } from "./sanitize-schema";

async function render(md: string): Promise<string> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, handbookSanitizeSchema);
  const tree = await processor.run(processor.parse(md));
  return toHtml(tree);
}

describe("handbookSanitizeSchema", () => {
  it("strips <script> tags", async () => {
    const html = await render(`Intro\n\n<script>alert('xss')</script>\n\nEnde`);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert('xss')");
  });

  it("strips on* event handlers but may keep the safe element", async () => {
    const html = await render(`<img src="x" onerror="alert(1)">`);
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("alert(1)");
  });

  it("strips <iframe> and srcdoc payloads", async () => {
    const html = await render(
      `<iframe srcdoc="<script>alert(1)</script>"></iframe>`,
    );
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("srcdoc");
  });

  it("strips javascript: URLs on links", async () => {
    const html = await render(`[klick](javascript:alert(1))`);
    expect(html).not.toContain("javascript:");
  });

  it("strips <style> tags", async () => {
    const html = await render(`<style>body{display:none}</style>`);
    expect(html).not.toContain("<style");
  });

  it("preserves <a id> anchor targets un-clobbered", async () => {
    const html = await render(`<a id="section-strategie"></a>`);
    // id bleibt exakt erhalten (kein user-content-Prefix), sonst bricht der
    // In-App-Anchor-Scroll (getElementById).
    expect(html).toContain('id="section-strategie"');
    expect(html).not.toContain("user-content-");
  });

  it("preserves <video> walkthrough embeds with src+controls", async () => {
    const html = await render(
      `<video src="/api/walkthrough/abc/embed" controls></video>`,
    );
    expect(html).toContain("<video");
    expect(html).toContain('src="/api/walkthrough/abc/embed"');
    expect(html).toContain("controls");
  });

  it("keeps legitimate markdown (heading, bold, link)", async () => {
    const html = await render(`## Titel\n\n**fett** und [link](https://example.com)`);
    expect(html).toContain("<h2");
    expect(html).toContain("<strong>fett</strong>");
    expect(html).toContain('href="https://example.com"');
  });
});
