// SLC-141 MT-2 (FEAT-060) — PDF-Generator Diagnose-Bericht.
//
// Eintritts-Punkt fuer Server-Action `sendDiagnoseReportByEmail` (MT-4):
//   `renderDiagnoseReportPdf(data)` -> Promise<Buffer>.
//
// PDF-Layout:
//   - Header: Strategaize-Marke (links) + Partner-Display-Name (rechts).
//   - Title + Subtitle (Mandant + Bericht-Datum).
//   - Score-Visual: 6 Block-Bars (Reuse ScoreVisualPdf).
//   - 6 Block-Sektionen: Title + Intro + KI-Verdichtung.
//   - Closing-Statement: brand-primary-Linke-Border-Block (Pflicht-Aussage).
//   - Footer: "Strategaize Diagnose-Bericht" | "{partner} | {datum}".
//
// PDF-Sprache: Deutsch (V7.2).
// A4 (595x842 pt) + 20mm Margins (56pt) — via styles.page.padding.
// KEIN Tailwind, KEIN Tenant-Branding (out-of-scope V7.2+).

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import { styles } from "./styles";
import { ScoreVisualPdf, type ScoreVisualPdfRow } from "./components/ScoreVisualPdf";
import { BlockSectionPdf, type BlockSectionData } from "./components/BlockSectionPdf";

export interface DiagnoseReportPdfData {
  mandantName: string;
  partnerDisplayName: string | null;
  finalizedAt: string;
  blocks: Array<{
    key: string;
    title: string;
    intro?: string;
    score: number;
    comment: string;
  }>;
  closingStatement: string;
}

function formatGermanDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
}

interface DiagnoseReportDocumentProps {
  data: DiagnoseReportPdfData;
}

export function DiagnoseReportDocument({ data }: DiagnoseReportDocumentProps) {
  const scoreRows: ScoreVisualPdfRow[] = data.blocks.map((b) => ({
    key: b.key,
    title: b.title,
    score: b.score,
  }));

  const sectionBlocks: BlockSectionData[] = data.blocks.map((b) => ({
    key: b.key,
    title: b.title,
    intro: b.intro,
    comment: b.comment,
  }));

  const partnerLabel = data.partnerDisplayName ?? "StrategAIze";
  const datumLabel = formatGermanDate(data.finalizedAt);

  return (
    <Document
      title={`Diagnose-Bericht — ${data.mandantName}`}
      author="StrategAIze"
      creator="StrategAIze Onboarding-Plattform"
      producer="@react-pdf/renderer"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow} fixed>
          <View style={styles.headerLogoBlock}>
            <Text style={styles.brandLabel}>StrategAIze</Text>
            <Text style={styles.brandSubtitle}>Diagnose-Werkzeug</Text>
          </View>
          <View style={styles.headerPartnerBlock}>
            <Text style={styles.partnerDisplayName}>
              {data.partnerDisplayName ?? ""}
            </Text>
          </View>
        </View>

        <Text style={styles.title}>Diagnose-Bericht</Text>
        <Text style={styles.subtitle}>
          Mandant: {data.mandantName} · Erstellt: {datumLabel}
        </Text>

        <Text style={styles.sectionHeader}>Score-Uebersicht</Text>
        <ScoreVisualPdf rows={scoreRows} />

        <Text style={styles.sectionHeader}>Verdichtung pro Baustein</Text>
        {sectionBlocks.map((block) => (
          <BlockSectionPdf key={block.key} block={block} />
        ))}

        {data.closingStatement ? (
          <View style={styles.closingStatement} wrap={false}>
            <Text>{data.closingStatement}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>StrategAIze Diagnose-Bericht</Text>
          <Text>
            {partnerLabel} · {datumLabel}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderDiagnoseReportPdf(
  data: DiagnoseReportPdfData,
): Promise<Buffer> {
  // renderToBuffer erwartet ein <Document>-Element direkt. Wir koennen
  // unsere Wrapper-Component nicht 1:1 ueber createElement reichen
  // (die Type-Signatur erwartet DocumentProps). Workaround: Wrapper
  // inline aufrufen — gibt uns das <Document>-Element zurueck.
  const element = DiagnoseReportDocument({ data });
  return renderToBuffer(element);
}
