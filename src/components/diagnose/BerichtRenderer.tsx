"use client";

// V6.3 SLC-105 MT-8 — Diagnose-Bericht-Renderer (Client-Component fuer Print-Button).
// V7.2 SLC-141 MT-5 — Interim "Bericht per E-Mail senden"-Button + Modal-Open
//   (Option b, kein QuickActionRing-Wait auf SLC-140).
// V7.3 SLC-140 MT-4 — Konsolidierung: Interim-Buttons + Ich-will-mehr-Hinweis-Box
//   → QuickActionRing (Email/Print/Mehr). BlockSection → BlockSectionCard mit
//   Block-Akzent-Farben (block-colors.ts Helper). Email-Wiring 1:1 zu
//   SendReportByEmailModal aus SLC-141 (setEmailModalOpen-Pattern unveraendert).
//
// Layout:
//   1. Header: Partner-Logo + Display-Name + Mandant-Name + Datum.
//   2. ScoreVisual: 6 Tailwind-Bars (DEC-128, score-range-Farben).
//   3. Pro Block: BlockSectionCard mit Top-Strip + Akzent-Badge + Score-Mini-Bar
//      + Markdown-Kommentar (Block-Color-Reihenfolge via blockIndex).
//   4. Pflicht-Output-Aussage (Markdown) via EditableText.
//   5. QuickActionRing: Email / Print / "Ich will mehr" (letzteres nur wenn
//      ichWillMehrCaptureSessionId noch ungenutzt).

import { useState } from "react";
import Image from "next/image";
import { ScoreVisual } from "./ScoreVisual";
import { BlockSectionCard } from "@/app/dashboard/diagnose/[capture_session_id]/bericht/components/BlockSectionCard";
import { QuickActionRing } from "@/app/dashboard/diagnose/[capture_session_id]/bericht/components/QuickActionRing";
import { SendReportByEmailModal } from "./SendReportByEmailModal";
import { IchWillMehrModal } from "./IchWillMehrModal";
import { EditableText } from "@/components/text-override/EditableText";

interface BerichtBlock {
  key: string;
  title: string;
  intro: string;
  score: number;
  comment: string;
}

export interface BerichtRendererProps {
  /** Pflicht ab SLC-141 MT-5: wird an SendReportByEmailModal weitergereicht. */
  captureSessionId: string;
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
  captureSessionId,
  mandantName,
  partnerDisplayName,
  partnerLogoUrl,
  finalizedAt,
  blocks,
  closingStatement,
  ichWillMehrCaptureSessionId,
}: BerichtRendererProps) {
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [ichWillMehrOpen, setIchWillMehrOpen] = useState(false);
  const dateFmt = new Intl.DateTimeFormat("de-DE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(finalizedAt));

  function handlePrintClick() {
    if (typeof window !== "undefined") window.print();
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 print:py-4 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            <EditableText
              keyPath="diagnose.bericht.kicker"
              defaultText="Strategaize-Diagnose"
            />
          </p>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            {mandantName}
          </h1>
          <p className="text-sm text-slate-500">
            <EditableText
              keyPath="diagnose.bericht.created_at_prefix"
              defaultText="Erstellt am"
            />{" "}
            {dateFmt}
          </p>
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
                <EditableText
                  keyPath="diagnose.bericht.im_auftrag_von"
                  defaultText="Im Auftrag von"
                />
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
          <EditableText
            keyPath="diagnose.bericht.reife_profil_heading"
            defaultText="Reife-Profil"
          />
        </h2>
        <ScoreVisual blocks={blocks} />
      </section>

      <section className="space-y-4">
        {blocks.map((block, blockIndex) => (
          <BlockSectionCard
            key={block.key}
            blockKey={block.key}
            blockIndex={blockIndex}
            title={block.title}
            intro={block.intro}
            score={block.score}
            comment={block.comment}
          />
        ))}
      </section>

      <section className="prose prose-slate max-w-none rounded-lg border-l-4 border-brand-primary bg-brand-primary/5 p-5 print:break-inside-avoid prose-p:text-slate-700">
        <EditableText
          as="div"
          keyPath="template.partner_diagnostic.closing"
          defaultText={closingStatement}
          markdown
          multiline
        />
      </section>

      <QuickActionRing
        onEmailClick={() => setEmailModalOpen(true)}
        onPrintClick={handlePrintClick}
        onIchWillMehrClick={
          ichWillMehrCaptureSessionId
            ? () => setIchWillMehrOpen(true)
            : undefined
        }
      />

      <SendReportByEmailModal
        captureSessionId={captureSessionId}
        open={emailModalOpen}
        onOpenChange={setEmailModalOpen}
      />
      {ichWillMehrCaptureSessionId ? (
        <IchWillMehrModal
          captureSessionId={ichWillMehrCaptureSessionId}
          open={ichWillMehrOpen}
          onOpenChange={setIchWillMehrOpen}
        />
      ) : null}
    </main>
  );
}
