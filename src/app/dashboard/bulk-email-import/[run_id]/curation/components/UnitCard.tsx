"use client";

// V9 SLC-167 MT-6 — Pattern-Card (Curation-UI), V9.5 SLC-V9.5-D MT-4 —
// Unit-Card: rendert konsolidierte email_synthesized_unit-Rows (DEC-214).
// Neu: Evidenz-Count-Badge (Belegdichte, AC-D-5) statt Thread-Bezug;
// Confidence-Pill auf aggregated_confidence; Snippets sind
// { text, source_pattern_id }-Objekte (extractSnippetTexts).
//
// Spec L186: Titel + Description + Evidence-Snippets-Akkordeon (read-only) +
// Confidence-Pill (gruen/gelb/rot) + Section-Dropdown (Pflicht) +
// Aktions-Buttons.
//
// Pattern-Reuse-Anker: ../../filter-review/FilterReviewClient.tsx (Card-Layout,
// Select, Button, useTransition).

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Edit3, XCircle, Sparkles, ChevronRight, Layers } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import {
  SECTION_OTHER_SENTINEL,
  type SectionOption,
} from "@/lib/bulk-email/sections";
import {
  confidenceTier,
  extractSnippetTexts,
  MAX_FREE_TEXT_SECTION_LENGTH,
  type ConfidenceTier,
  type CurationUnit,
} from "../helpers";
import { updateUnitCuration } from "../actions";

interface UnitCardProps {
  unit: CurationUnit;
  sections: SectionOption[];
  /** false wenn der Bulk-Run nicht mehr editierbar ist (Status > curating). */
  editable: boolean;
  /** Open-Modal-Callback (Edit). */
  onEdit: (unit: CurationUnit) => void;
}

const TIER_BADGE_STYLES: Record<ConfidenceTier, string> = {
  green: "bg-green-100 text-green-800 border-green-200",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
  red: "bg-red-100 text-red-800 border-red-200",
};

const STATUS_BADGE_STYLES: Record<CurationUnit["curation_status"], string> = {
  pending_curation: "bg-slate-100 text-slate-700 border-slate-200",
  accepted: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  edited: "bg-blue-100 text-blue-800 border-blue-200",
};

const STATUS_LABELS: Record<CurationUnit["curation_status"], string> = {
  pending_curation: "Offen",
  accepted: "Akzeptiert",
  rejected: "Abgelehnt",
  edited: "Editiert",
};

function ConfidencePill({ confidence }: { confidence: number }) {
  const tier = confidenceTier(confidence);
  const percent = Math.round(confidence * 100);
  return (
    <Badge variant="outline" className={TIER_BADGE_STYLES[tier]}>
      Konfidenz {percent}%
    </Badge>
  );
}

/** Belegdichte-Badge (AC-D-5): Anzahl distinkter belegender Quell-Patterns. */
function EvidenceCountBadge({ count }: { count: number }) {
  return (
    <Badge
      variant="outline"
      className="gap-1 border-indigo-200 bg-indigo-50 text-indigo-800"
    >
      <Layers className="h-3 w-3" />
      {count} {count === 1 ? "Beleg" : "Belege"}
    </Badge>
  );
}

function StatusBadge({ status }: { status: CurationUnit["curation_status"] }) {
  return (
    <Badge variant="outline" className={STATUS_BADGE_STYLES[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function UnitCard({
  unit,
  sections,
  editable,
  onEdit,
}: UnitCardProps) {
  const [selectedSection, setSelectedSection] = useState<string>(
    unit.curated_section ?? unit.suggested_section ?? "",
  );
  const [freeTextSection, setFreeTextSection] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isOtherSelected = selectedSection === SECTION_OTHER_SENTINEL;
  const effectiveSection = isOtherSelected
    ? freeTextSection.trim()
    : selectedSection;

  const evidenceSnippets = useMemo(
    () => extractSnippetTexts(unit.evidence_snippets),
    [unit.evidence_snippets],
  );

  function runAction(action: "accepted" | "rejected") {
    setErrorMessage(null);

    if (action === "accepted") {
      if (!effectiveSection) {
        setErrorMessage(
          "Bitte zuerst eine Section auswaehlen (Pflicht beim Akzeptieren).",
        );
        return;
      }
    }

    startTransition(async () => {
      const result = await updateUnitCuration(unit.id, {
        status: action,
        curated_section: action === "accepted" ? effectiveSection : undefined,
      });
      if (!result.ok) {
        setErrorMessage(result.error);
      }
    });
  }

  return (
    <Card data-unit-id={unit.id}>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-slate-900">
              {unit.title}
            </h3>
            {unit.themes && unit.themes.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {unit.themes.map((theme) => (
                  <Badge
                    key={theme}
                    variant="secondary"
                    className="text-xs font-normal"
                  >
                    {theme}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={unit.curation_status} />
            <ConfidencePill confidence={unit.aggregated_confidence} />
            <EvidenceCountBadge count={unit.evidence_count} />
          </div>
        </div>

        <p className="text-sm text-slate-700 whitespace-pre-line">
          {unit.description}
        </p>

        {evidenceSnippets.length > 0 && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="evidence" className="border-slate-200">
              <AccordionTrigger className="text-xs uppercase tracking-wide text-slate-500 hover:no-underline">
                Evidenz ({evidenceSnippets.length} {evidenceSnippets.length === 1 ? "Snippet" : "Snippets"})
              </AccordionTrigger>
              <AccordionContent>
                <p className="mb-2 text-xs italic text-slate-500">
                  Repraesentative Belege aus {unit.evidence_count}{" "}
                  {unit.evidence_count === 1 ? "Quell-Pattern" : "Quell-Patterns"} —
                  Klarnamen wurden bereits in der Synthese entfernt.
                </p>
                <ul className="space-y-2">
                  {evidenceSnippets.map((snippet, idx) => (
                    <li
                      key={idx}
                      className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                    >
                      {snippet}
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        <div className="space-y-2 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-slate-400" />
            <label className="text-xs uppercase tracking-wide text-slate-500">
              Section
            </label>
            {unit.suggested_section && (
              <span className="text-xs text-slate-400">
                Vorschlag: <code>{unit.suggested_section}</code>
                <ChevronRight className="inline h-3 w-3" />
              </span>
            )}
          </div>
          <Select
            value={selectedSection || undefined}
            onValueChange={(v) => {
              setSelectedSection(v);
              setErrorMessage(null);
            }}
            disabled={!editable || isPending}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Section auswaehlen…" />
            </SelectTrigger>
            <SelectContent>
              {sections.map((opt) => (
                <SelectItem key={opt.key} value={opt.key}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isOtherSelected && (
            <Input
              type="text"
              placeholder="Eigene Section-Bezeichnung…"
              value={freeTextSection}
              onChange={(e) => {
                setFreeTextSection(e.target.value);
                setErrorMessage(null);
              }}
              maxLength={MAX_FREE_TEXT_SECTION_LENGTH}
              disabled={!editable || isPending}
              className="text-sm"
            />
          )}
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {errorMessage}
          </div>
        )}

        {editable && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <Button
              size="sm"
              variant="default"
              onClick={() => runAction("accepted")}
              disabled={isPending}
              className="gap-1"
            >
              <CheckCircle2 className="h-4 w-4" />
              Akzeptieren
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(unit)}
              disabled={isPending}
              className="gap-1"
            >
              <Edit3 className="h-4 w-4" />
              Editieren
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => runAction("rejected")}
              disabled={isPending}
              className="gap-1 text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              <XCircle className="h-4 w-4" />
              Ablehnen
            </Button>
          </div>
        )}

        {unit.curated_at && (
          <p className="text-xs text-slate-400">
            Kuriert: {new Date(unit.curated_at).toLocaleString("de-DE")}
            {unit.curated_section && (
              <>
                {" · "}Section: <code>{unit.curated_section}</code>
              </>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
