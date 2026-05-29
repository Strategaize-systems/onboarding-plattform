// V8 SLC-150 MT-2 — Renderer-Eintrittspunkt fuer Mandanten-Report V2.
//
// Aggregiert die 3 Phase-A-Pages (Cover, SUI-Hero, Modul-Profil) zu einem
// vollstaendigen @react-pdf Document und exposes
// `renderMandantenReportV2Pdf(input)` als alleinigen Buffer-Producer.
//
// Phase A (SLC-150): Pages 1-3 (Cover + SUI-Hero + Modul-Profil).
// Phase B (SLC-151): Pages 4-17 werden hier als Children ergaenzt.
//
// Custom-Fonts (Fraunces + JetBrains Mono) kommen in MT-3 als Side-Effect-
// Import. MT-2 nutzt @react-pdf Default-Helvetica.

import React from "react";
import { Document, renderToBuffer } from "@react-pdf/renderer";

import "./fonts"; // Side-Effect: registriert Fraunces + JetBrains Mono fuer @react-pdf
import { CoverPage } from "./pages/cover";
import { SuiHeroPage } from "./pages/sui-hero";
import { ModulProfilPage } from "./pages/modul-profil";
import { validateRendererInput, type RendererInput } from "./types";

interface DocumentProps {
  input: RendererInput;
}

export function MandantenReportV2Document({ input }: DocumentProps) {
  return (
    <Document
      title={`Mandanten-Report — ${input.mandant.name}`}
      author="StrategAIze"
      creator="StrategAIze Onboarding-Plattform"
      producer="@react-pdf/renderer"
    >
      <CoverPage input={input} />
      <SuiHeroPage input={input} />
      <ModulProfilPage input={input} />
    </Document>
  );
}

/**
 * Renders the V8 Mandanten-Report-Phase-A PDF (3 pages) to a Buffer.
 *
 * Aufrufer: SLC-152 Email-Versand-Branch + Bericht-Pending-Page-Snapshot-Reader.
 * Throwing: validateRendererInput wirft konkrete Error-Messages bei fehlenden
 * Feldern. @react-pdf renderToBuffer kann eigene Render-Errors werfen.
 */
export async function renderMandantenReportV2Pdf(
  input: RendererInput
): Promise<Buffer> {
  validateRendererInput(input);
  return renderToBuffer(<MandantenReportV2Document input={input} />);
}
