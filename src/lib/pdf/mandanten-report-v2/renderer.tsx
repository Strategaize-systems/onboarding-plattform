// V8 SLC-150 MT-2 + SLC-151 MT-2..MT-6 + SLC-162 MT-5 — Renderer-Eintrittspunkt
// fuer Mandanten-Report V2.
//
// Aggregiert die Phase-A-Pages (Cover, SUI-Hero, Modul-Profil) + die
// Phase-B-Pages (9 Modul-Pages, Hausaufgaben-Page, Hebel-Page,
// Reflexion-Page) + V8.1-Outro (Pages 16-17, ersetzt V8.0-CtaPage per DEC-170)
// zu einem vollstaendigen @react-pdf Document und exposes
// `renderMandantenReportV2Pdf(input, augmentConfig?)` als alleinigen
// Buffer-Producer.
//
// Phase A (SLC-150): Pages 1-3 (Cover + SUI-Hero + Modul-Profil).
// Phase B (SLC-151 MT-2..MT-6): Pages 4-15 (Modul-Pages, Hausaufgaben,
//   Hebel, Reflexion).
// V8.1 (SLC-162 MT-5): Pages 16-17 ersetzen V8.0-CtaPage durch OutroPage
//   (Lead-Conversion-Outro). LLM-Augmentation der 3 Empfehlungs-Cards
//   per DEC-174 sync im Render-Pfad — optional via `augmentConfig`.

import React from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Document, renderToBuffer } from "@react-pdf/renderer";

import "./fonts"; // Side-Effect: registriert Fraunces + JetBrains Mono fuer @react-pdf
import { CoverPage } from "./pages/cover";
import { SuiHeroPage } from "./pages/sui-hero";
import { ModulProfilPage } from "./pages/modul-profil";
import { ModulPage } from "./components/modul-page";
import { getAllModulPagesProps } from "./components/modul-page-resolvers";
import { HausaufgabenPage } from "./pages/hausaufgaben";
import { HebelPage } from "./pages/hebel";
import { ReflexionPage } from "./pages/reflexion";
import { OutroPage } from "./pages/outro";
import { validateRendererInput, type RendererInput } from "./types";
import {
  augmentEmpfehlungsText,
  type AugmentInput,
  type AugmentOutput,
  type AugmentRunOptions,
} from "@/lib/llm/v8-1-augmentation";
import { generateCtaMagicLinkToken } from "@/lib/cta/token";
import type { ModulKey, HebelItem } from "@/lib/diagnose/types";

const MODUL_KEYS: ModulKey[] = [
  "m1",
  "m2",
  "m3",
  "m4",
  "m5",
  "m6",
  "m7",
  "m8",
  "m9",
];

/**
 * Optionale Augmentation-Konfiguration fuer V8.1-Outro-LLM-Pfad (DEC-174 sync).
 *
 * Wenn gesetzt: `augmentEmpfehlungsText` wird im Render-Pfad aufgerufen — Cache-Hit
 * ist instant, Cache-Miss verursacht ~24s Latency (3 sequentielle Bedrock-Calls).
 *
 * Wenn nicht gesetzt: deterministischer V8.0-Fallback (snapshot.hebel.empfehlung
 * 1:1 als Card-Text). Genutzt fuer Smoke-Tests, Spike-Skripte und V8.0-Co-Existenz-
 * Verifizierung. Kein DB-Read, kein Bedrock-Call.
 */
export interface RendererAugmentConfig {
  supabaseAdmin: SupabaseClient;
  captureSessionId: string;
  tenantId: string;
  options?: AugmentRunOptions;
}

/**
 * Optionale Magic-Link-Config fuer V8.1-Outro-CTA (SLC-163 MT-8).
 *
 * Wenn gesetzt: generateCtaMagicLinkToken(...) wird aufgerufen und die
 * resultierende URL als `magicLinkUrl`-Prop an OutroPage uebergeben.
 *
 * Wenn nicht gesetzt: OutroPage nutzt CTA_PLACEHOLDER_URL — sinnvoll fuer
 * Smoke-Tests + Code-Side-Renderer-Verifikation ohne CTA_TOKEN_SECRET.
 */
export interface RendererMagicLinkConfig {
  captureSessionId: string;
  partnerOrganizationId: string;
  mandantEmail: string;
  /** Override-able App-URL fuer Token-URL-Konstruktion. Default NEXT_PUBLIC_APP_URL. */
  appBaseUrl?: string;
}

interface DocumentProps {
  input: RendererInput;
  augmentedHebel: AugmentOutput[];
  magicLinkUrl?: string;
}

export function MandantenReportV2Document({
  input,
  augmentedHebel,
  magicLinkUrl,
}: DocumentProps) {
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
      <HebelPage input={input} pageNumber={14} />
      <ReflexionPage input={input} pageNumber={15} />
      <OutroPage
        input={input}
        augmentedHebel={augmentedHebel}
        magicLinkUrl={magicLinkUrl}
        pageNumberHero={16}
        pageNumberFooter={17}
      />
    </Document>
  );
}

/**
 * Wandelt einen Snapshot-HebelItem in AugmentInput (Schnittstelle fuer
 * SLC-161 augmentEmpfehlungsText oder deterministischen Fallback).
 */
function hebelItemToAugmentInput(item: HebelItem): AugmentInput {
  const modulNumber = MODUL_KEYS.indexOf(item.modul_id) + 1;
  return {
    modulName: item.modul_name,
    modulId: modulNumber,
    aktuelleStufe: item.stufe,
    deterministischerStufenText: item.empfehlung,
  };
}

/**
 * Erzeugt 3 deterministische AugmentOutputs ohne LLM-Call. Genutzt wenn
 * kein augmentConfig uebergeben wird (Smoke-Tests, V8.0-Co-Existenz).
 * Text = snapshot.hebel[i].empfehlung 1:1.
 */
function buildDeterministicFallback(
  augmentInputs: AugmentInput[],
): AugmentOutput[] {
  return augmentInputs.map((ai) => ({
    modulName: ai.modulName,
    modulId: ai.modulId,
    aktuelleStufe: ai.aktuelleStufe,
    text: ai.deterministischerStufenText,
    isLlmAugmented: false,
  }));
}

/**
 * Renders das V8 Mandanten-Report PDF zu einem Buffer (17 Pages: 1-15 V8.0
 * + 16-17 V8.1-Outro).
 *
 * @param input  Snapshot + Mandant + Template + Modul-Namen.
 * @param augmentConfig  Optional. Wenn gesetzt: LLM-Augmentation der
 *   Empfehlungs-Cards via SLC-161 augmentEmpfehlungsText (DEC-174 sync).
 *   Wenn nicht gesetzt: deterministischer V8.0-Fallback.
 *
 * Aufrufer: SLC-152 Email-Versand-Branch + Bericht-Pending-Page-Snapshot-
 *   Reader + Smoke-Skripte.
 * Throwing: validateRendererInput wirft bei fehlenden Pflicht-Feldern.
 *   @react-pdf renderToBuffer kann eigene Render-Errors werfen.
 *   augmentEmpfehlungsText kann bei DB-/Bedrock-Errors werfen (nur wenn
 *   augmentConfig gesetzt).
 */
export async function renderMandantenReportV2Pdf(
  input: RendererInput,
  augmentConfig?: RendererAugmentConfig,
  magicLinkConfig?: RendererMagicLinkConfig,
): Promise<Buffer> {
  validateRendererInput(input);

  const snapshotHebel = input.snapshot.hebel;
  if (snapshotHebel.length !== 3) {
    throw new Error(
      `RendererInput: snapshot.hebel must contain exactly 3 entries for V8.1-Outro, got ${snapshotHebel.length}`,
    );
  }

  const augmentInputs = snapshotHebel.map(hebelItemToAugmentInput);

  const augmentedHebel: AugmentOutput[] = augmentConfig
    ? await augmentEmpfehlungsText({
        supabaseAdmin: augmentConfig.supabaseAdmin,
        captureSessionId: augmentConfig.captureSessionId,
        tenantId: augmentConfig.tenantId,
        hebel: augmentInputs,
        options: augmentConfig.options,
      })
    : buildDeterministicFallback(augmentInputs);

  let magicLinkUrl: string | undefined;
  if (magicLinkConfig) {
    const token = generateCtaMagicLinkToken({
      capture_session_id: magicLinkConfig.captureSessionId,
      partner_organization_id: magicLinkConfig.partnerOrganizationId,
      mandant_email: magicLinkConfig.mandantEmail,
    });
    const baseUrl =
      magicLinkConfig.appBaseUrl ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "https://onboarding.strategaizetransition.com";
    magicLinkUrl = `${baseUrl}/strategaize-anfrage?token=${encodeURIComponent(token)}`;
  }

  return renderToBuffer(
    <MandantenReportV2Document
      input={input}
      augmentedHebel={augmentedHebel}
      magicLinkUrl={magicLinkUrl}
    />,
  );
}
