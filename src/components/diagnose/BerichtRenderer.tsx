"use client";

// V6.3 SLC-105 MT-8 — Diagnose-Bericht-Renderer (Client-Component fuer Print-Button).
//
// Layout:
//   1. Header: Partner-Logo + Display-Name + Mandant-Name + Datum.
//   2. ScoreVisual: 6 Tailwind-Bars (DEC-128).
//   3. Pro Block: BlockSection mit Titel + Intro + Score-Bar + Bedrock-Kommentar.
//   4. Pflicht-Output-Aussage (Markdown) via react-markdown (DEC-117 Reuse).
//   5. Sub-Karte "Ich will mehr von Strategaize" als Stub (Hook auf SLC-106).
//   6. Print-Button: window.print() mit print-friendly CSS.

import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Printer, Sparkles } from "lucide-react";
import { ScoreVisual } from "./ScoreVisual";
import { BlockSection } from "./BlockSection";

interface BerichtBlock {
  key: string;
  title: string;
  intro: string;
  score: number;
  comment: string;
}

export interface BerichtRendererProps {
  mandantName: string;
  partnerDisplayName: string | null;
  partnerLogoUrl: string | null;
  finalizedAt: string; // ISO-Datum
  blocks: BerichtBlock[];
  closingStatement: string;
  /** SLC-106-Lead-Push-Card: capture_session_id wenn Lead-Push noch nicht gesendet, sonst null. */
  ichWillMehrCaptureSessionId?: string | null;
}

export function BerichtRenderer({
  mandantName,
  partnerDisplayName,
  partnerLogoUrl,
  finalizedAt,
  blocks,
  closingStatement,
  ichWillMehrCaptureSessionId,
}: BerichtRendererProps) {
  const dateFmt = new Intl.DateTimeFormat("de-DE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(finalizedAt));

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 print:py-4 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Strategaize-Diagnose
          </p>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            {mandantName}
          </h1>
          <p className="text-sm text-slate-500">Erstellt am {dateFmt}</p>
        </div>
        {(partnerLogoUrl || partnerDisplayName) && (
          <div className="flex items-center gap-3">
            {partnerLogoUrl ? (
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                <Image
                  src={partnerLogoUrl}
                  alt={
                    partnerDisplayName
                      ? `${partnerDisplayName} Logo`
                      : "Partner-Logo"
                  }
                  width={48}
                  height={48}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              </div>
            ) : null}
            {partnerDisplayName ? (
              <span className="text-right text-sm text-slate-500">
                Im Auftrag von
                <br />
                <span className="font-medium text-slate-700">
                  {partnerDisplayName}
                </span>
              </span>
            ) : null}
          </div>
        )}
      </header>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-5 print:break-inside-avoid">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Reife-Profil
        </h2>
        <ScoreVisual blocks={blocks} />
      </section>

      <section className="space-y-4">
        {blocks.map((block) => (
          <BlockSection
            key={block.key}
            blockKey={block.key}
            title={block.title}
            intro={block.intro}
            score={block.score}
            comment={block.comment}
          />
        ))}
      </section>

      <section className="prose prose-slate max-w-none rounded-lg border-l-4 border-brand-primary bg-brand-primary/5 p-5 print:break-inside-avoid prose-p:text-slate-700">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {closingStatement}
        </ReactMarkdown>
      </section>

      {ichWillMehrCaptureSessionId ? (
        <section className="rounded-lg border border-brand-primary/40 bg-white p-5 print:hidden">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-brand-primary/10 p-2">
              <Sparkles className="h-5 w-5 text-brand-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-slate-900">
                Ich will mehr von Strategaize
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Strategaize meldet sich mit konkreten Vorschlaegen, wie Sie die
                Diagnose-Erkenntnisse in den naechsten 90 Tagen nutzen koennen.
                Sie entscheiden im Anschluss, ob Sie weitermachen.
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Verfuegbar ueber den Dashboard-Block. Sie geben dort einmalig
                eine Einwilligung — wir senden die Anfrage dann automatisch
                an Strategaize.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3 print:hidden">
        <Button
          variant="outline"
          onClick={() => {
            if (typeof window !== "undefined") window.print();
          }}
        >
          <Printer className="mr-2 h-4 w-4" />
          Bericht drucken
        </Button>
      </div>
    </main>
  );
}
