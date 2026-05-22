// SLC-141 MT-1 (FEAT-060) — @react-pdf/renderer Setup-Smoke.
//
// Validiert dass die Dependency korrekt installiert ist und ein minimales
// PDF-Buffer ausgegeben wird. Smoke schaltet sich vor MT-2 (Diagnose-Report-
// Generator), damit ein gebrochener Install den ganzen Slice frueh blockiert.

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToBuffer, Document, Page, Text, View } from "@react-pdf/renderer";

describe("@react-pdf/renderer setup smoke", () => {
  it("renders a minimal Document to a Buffer with PDF-magic + EOF marker", async () => {
    const element = React.createElement(
      Document,
      {},
      React.createElement(
        Page,
        { size: "A4" },
        React.createElement(View, {}, React.createElement(Text, {}, "SLC-141 smoke")),
      ),
    );
    const buf = await renderToBuffer(element);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const tail = buf.subarray(buf.length - 10).toString("latin1");
    expect(tail).toContain("%%EOF");
  }, 15_000);
});
