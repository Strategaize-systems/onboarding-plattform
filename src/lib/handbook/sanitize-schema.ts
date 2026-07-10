// SLC-194 MT-1 (V20, FEAT-111, BL-538, ISSUE-121) — Sanitize-Schema fuer den
// Handbook-Reader. Der Reader parst tenant-erzeugtes Markdown via rehype-raw,
// d.h. eingebettetes HTML (z.B. <a id="section-x">, <video>) wird zu echtem DOM.
// Ohne Sanitize koennte tenant-Content (Subtopic-Namen, KU-Body, Diagnose-Felder)
// aktives HTML einschleusen (<script>, <iframe srcdoc>, on*-Handler). Dieses Schema
// laeuft in HandbookReader.tsx NACH rehypeRaw und VOR rehypeSlug/autolink/highlight.
//
// Basis: hast-util-sanitize defaultSchema (GitHub-Sanitation). Gezielt erweitert um
// die zwei legitimen HTML-Konstrukte, die der Worker (sections.ts) emittiert:
//   1. <a id="..."> — In-App-Anchor-Targets (section-/subtopic-/block-/walkthrough-).
//      defaultSchema strippt `id` auf <a> und clobbered ausserdem alle id/name-Werte
//      mit dem Prefix `user-content-`. Beides wuerde die Anchor-Navigation brechen,
//      daher `id` auf <a> zulassen + clobber leeren (Content ist danach script-frei,
//      DOM-Clobbering-Restrisiko akzeptiert, DEC-282).
//   2. <video src controls ...> — Walkthrough-Embeds (sections.ts:234). defaultSchema
//      kennt <video> nicht → Tag + Attribute explizit ergaenzen. `style`/`preload`
//      werden bewusst NICHT zugelassen; VideoEmbed (HandbookReader) setzt className +
//      preload beim Render ohnehin neu.
//
// Geblockt (durch defaultSchema): <script>, <iframe>, srcdoc, on*-Event-Handler,
// javascript:-URLs, <style>, sowie beliebige nicht gelistete Tags/Attribute.

import { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";

export const handbookSanitizeSchema: SanitizeSchema = (() => {
  const schema = structuredClone(defaultSchema);

  const attributes = { ...(schema.attributes ?? {}) };
  attributes.a = [...(attributes.a ?? []), "id"];
  attributes.video = ["src", "controls", "width", "height", "poster"];
  schema.attributes = attributes;

  schema.tagNames = [...(schema.tagNames ?? []), "video"];

  // Anchor-IDs (section-/subtopic-/block-/walkthrough-) unveraendert durchlassen,
  // statt sie mit `user-content-` zu prefixen (bricht sonst getElementById-Scroll).
  schema.clobber = [];

  return schema;
})();
