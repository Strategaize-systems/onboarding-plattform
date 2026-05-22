// SLC-141 MT-2 (FEAT-060) — Vitest fuer Diagnose-Report PDF-Generator.
//
// Bytes-Inspection statt Layout-Snapshot: react-pdf produziert deterministisches
// PDF, aber Snapshots brechen bei Font-Metrics-Updates. Pruefen daher:
//   - PDF-Magic-Header `%PDF-` am Start
//   - EOF-Marker `%%EOF` am Ende
//   - Mandanten-Name + Closing-Statement + Block-Titel im PDF-Text-Stream

import { describe, it, expect } from "vitest";
// pdf-parse's index.js liest beim Modul-Load eine demo-PDF — bricht den Test
// mit ENOENT. Workaround: lib-file direkt importieren.
import pdfParseDefault from "pdf-parse/lib/pdf-parse.js";
import { renderDiagnoseReportPdf, type DiagnoseReportPdfData } from "../diagnose-report";

const pdfParse = pdfParseDefault as unknown as (buf: Buffer) => Promise<{ text: string }>;

const SAMPLE: DiagnoseReportPdfData = {
  mandantName: "Acme Beispiel GmbH",
  partnerDisplayName: "Steuerberater Test",
  finalizedAt: "2026-05-22T09:00:00.000Z",
  blocks: [
    { key: "ki_reife", title: "KI-Reife", intro: "Wie weit ist Ihre KI-Praxis?", score: 72, comment: "KI-Reife: solide Basis." },
    { key: "entscheidungs_qualitaet", title: "Entscheidungs-Qualitaet", intro: "Wie systematisch entscheiden Sie?", score: 58, comment: "Entscheidungs-Qualitaet: ausbaufaehig." },
    { key: "schriftliche_entscheidungen", title: "Schriftliche Entscheidungen", intro: "Wie dokumentieren Sie?", score: 34, comment: "Schriftliche Entscheidungen: Luecke." },
    { key: "sops", title: "SOPs", intro: "Wie standardisiert sind Ablaeufe?", score: 81, comment: "SOPs: gut etabliert." },
    { key: "unternehmerhandbuch", title: "Unternehmerhandbuch", intro: "Wie sichtbar ist das Wissen?", score: 47, comment: "Unternehmerhandbuch: in Aufbau." },
    { key: "workaround_dunkelziffer", title: "Workaround-Dunkelziffer", intro: "Wie viel laeuft an Doku vorbei?", score: 25, comment: "Workaround-Dunkelziffer: kritisch." },
  ],
  closingStatement: "Diese Pflicht-Aussage signalisiert formales Ende des Berichts.",
};

describe("renderDiagnoseReportPdf", () => {
  it("renders to a Buffer with PDF-magic header + EOF marker", async () => {
    const buf = await renderDiagnoseReportPdf(SAMPLE);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(2000);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const tail = buf.subarray(buf.length - 16).toString("latin1");
    expect(tail).toContain("%%EOF");
  }, 30_000);

  it("contains all 6 block titles in the extracted PDF text", async () => {
    const buf = await renderDiagnoseReportPdf(SAMPLE);
    const { text } = await pdfParse(buf);
    for (const block of SAMPLE.blocks) {
      expect(text).toContain(block.title);
    }
  }, 30_000);

  it("contains the closing statement in the extracted PDF text", async () => {
    const buf = await renderDiagnoseReportPdf(SAMPLE);
    const { text } = await pdfParse(buf);
    expect(text).toContain("Pflicht-Aussage");
  }, 30_000);

  it("contains mandant name + finalized-date in the extracted PDF text", async () => {
    const buf = await renderDiagnoseReportPdf(SAMPLE);
    const { text } = await pdfParse(buf);
    expect(text).toContain(SAMPLE.mandantName);
    expect(text).toContain("22.05.2026");
  }, 30_000);

  it("renders without partnerDisplayName (null) without throwing", async () => {
    const data: DiagnoseReportPdfData = { ...SAMPLE, partnerDisplayName: null };
    const buf = await renderDiagnoseReportPdf(data);
    expect(buf.length).toBeGreaterThan(2000);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);

  it("renders with empty closingStatement without crashing", async () => {
    const data: DiagnoseReportPdfData = { ...SAMPLE, closingStatement: "" };
    const buf = await renderDiagnoseReportPdf(data);
    expect(buf.length).toBeGreaterThan(2000);
  }, 30_000);
});
