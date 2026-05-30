// V8 SLC-150 MT-2 + SLC-151 MT-2/MT-3 — Renderer-Eintrittspunkt fuer
// Mandanten-Report V2.
//
// Aggregiert die Phase-A-Pages (Cover, SUI-Hero, Modul-Profil) + die
// Phase-B-Pages (9 Modul-Pages, Hausaufgaben-Page) zu einem
// vollstaendigen @react-pdf Document und exposes
// `renderMandantenReportV2Pdf(input)` als alleinigen Buffer-Producer.
//
// Phase A (SLC-150): Pages 1-3 (Cover + SUI-Hero + Modul-Profil).
// Phase B (SLC-151 MT-2..MT-6): Pages 4-17 (Modul-Pages, Hausaufgaben,
// Hebel, Reflexion, CTA). MT-2 + MT-3 liefern Pages 4-13.

import React from "react";
import { Document, renderToBuffer } from "@react-pdf/renderer";

import "./fonts"; // Side-Effect: registriert Fraunces + JetBrains Mono fuer @react-pdf
import { CoverPage } from "./pages/cover";
import { SuiHeroPage } from "./pages/sui-hero";
import { ModulProfilPage } from "./pages/modul-profil";
import { ModulPage } from "./components/modul-page";
import { getAllModulPagesProps } from "./components/modul-page-resolvers";
import { HausaufgabenPage } from "./pages/hausaufgaben";
import { validateRendererInput, type RendererInput } from "./types";

interface DocumentProps {
  input: RendererInput;
}

export function MandantenReportV2Document({ input }: DocumentProps) {
  const modulPagesProps = getAllModulPagesProps(
    input.snapshot,
    input.template,
    input.mandant.name,
    4,
  );

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
      {modulPagesProps.map((props) => (
        <ModulPage key={props.modulKey} {...props} />
      ))}
      <HausaufgabenPage input={input} pageNumber={13} />
    </Document>
  );
}

/**
 * Renders das V8 Mandanten-Report PDF zu einem Buffer.
 *
 * Aktueller Stand: Phase-A (Pages 1-3) + SLC-151 MT-2+MT-3 (Pages 4-13).
 * Pages 14-17 (Hebel, Reflexion, CTA) kommen in MT-4..MT-6.
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
