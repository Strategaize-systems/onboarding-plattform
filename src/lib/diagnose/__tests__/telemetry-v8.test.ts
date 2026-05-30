// V8 SLC-152 MT-2 — Vitest fuer V8-Telemetry-Adapter Pure-Logic-Helpers.
//
// DB-Insert-Roundtrip wird NICHT hier getestet — das passiert in der
// SLC-148-Test-Suite gegen Coolify-DB. Hier nur Format-Korrektheit der
// JSONB-Property-Struktur fuer das diagnose_event-Row.

import { describe, it, expect } from "vitest";
import {
  formatV8ReportGeneratedPayload,
  formatV8EmailSentPayload,
  formatV8PdfRenderFailedPayload,
} from "../telemetry-v8-format";

describe("formatV8ReportGeneratedPayload", () => {
  it("liefert timestamp im ISO-Format", () => {
    const payload = formatV8ReportGeneratedPayload();
    expect(typeof payload.timestamp).toBe("string");
    expect(payload.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });

  it("enthaelt keine weiteren Properties", () => {
    const payload = formatV8ReportGeneratedPayload();
    expect(Object.keys(payload).sort()).toEqual(["timestamp"]);
  });
});

describe("formatV8EmailSentPayload", () => {
  it("liefert pdf_size_bytes + timestamp", () => {
    const payload = formatV8EmailSentPayload(123456);
    expect(payload.pdf_size_bytes).toBe(123456);
    expect(typeof payload.timestamp).toBe("string");
  });

  it("akzeptiert auch 0-Size (Edge-Case Empty-PDF)", () => {
    const payload = formatV8EmailSentPayload(0);
    expect(payload.pdf_size_bytes).toBe(0);
  });
});

describe("formatV8PdfRenderFailedPayload", () => {
  it("extrahiert error_class + message_snippet aus Error-Instanz", () => {
    const err = new Error("Render-Foo-Failed");
    const payload = formatV8PdfRenderFailedPayload(err);
    expect(payload.error_class).toBe("Error");
    expect(payload.error_message_snippet).toBe("Render-Foo-Failed");
    expect(typeof payload.timestamp).toBe("string");
  });

  it("erkennt benutzerdefinierte Error-Klassen", () => {
    class CustomRenderError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = "CustomRenderError";
      }
    }
    const err = new CustomRenderError("foo");
    const payload = formatV8PdfRenderFailedPayload(err);
    expect(payload.error_class).toBe("CustomRenderError");
  });

  it("truncated lange Error-Message auf 200 chars", () => {
    const longMsg = "x".repeat(500);
    const payload = formatV8PdfRenderFailedPayload(new Error(longMsg));
    expect((payload.error_message_snippet as string).length).toBe(200);
  });

  it("akzeptiert non-Error-Wert (z.B. String-Throw)", () => {
    const payload = formatV8PdfRenderFailedPayload("plain string");
    expect(payload.error_message_snippet).toBe("plain string");
  });

  it("akzeptiert null/undefined (defensiv)", () => {
    const payload = formatV8PdfRenderFailedPayload(null);
    expect(payload.error_message_snippet).toBe("unknown error");
  });
});
