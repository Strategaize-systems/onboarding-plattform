"use client";

// V7.1 SLC-138 MT-4 — HelperTextModal React-Komponente (FEAT-057).
//
// Modal-Dialog, der pro Frage helper_text (Definition als Plain-Text) und
// examples_md (Markdown-Liste mit Branchen-Beispielen) zeigt. Mandanten-View
// ist read-only — Edit erfolgt im Admin-Bereich (MT-6, eigene Page).
//
// Reiner Anzeige-Pfad. Pure-Logik in helper-text-modal-logic.ts (Vitest).
// Markdown-Rendering via react-markdown + remark-gfm (bestehendes Pattern,
// siehe EditableText.tsx).
//
// Telemetry: ruft trackHelperTextOpen einmalig pro Open-Cycle (Stub-Wiring
// fuer SLC-139 FEAT-058 diagnose_event-Tabelle, siehe lib/diagnose/telemetry.ts).
//
// Ref: docs/ARCHITECTURE.md V7.1 FEAT-057, slice SLC-138 MT-4.

import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trackHelperTextOpen } from "@/lib/diagnose/telemetry";
import {
  normalizeHelperContent,
  buildHelperKeyPaths,
} from "./helper-text-modal-logic";
import { useTextOverride } from "@/components/text-override/use-text-override";
import { selectEffectiveText } from "@/components/text-override/editable-text-logic";

export interface HelperTextModalProps {
  open: boolean;
  onClose: () => void;
  /** Template-Slug, z.B. `partner_diagnostic`. Bildet Override-Key-Prefix. */
  templateSlug: string;
  questionKey: string;
  questionLabel: string;
  /** JSONB-Default fuer helper_text (Migration 099a). Override aus text_override gewinnt. */
  helperTextDefault?: string | null;
  /** JSONB-Default fuer examples_md (Migration 099a). Override aus text_override gewinnt. */
  examplesMdDefault?: string | null;
  captureSessionId?: string;
}

export function HelperTextModal({
  open,
  onClose,
  templateSlug,
  questionKey,
  questionLabel,
  helperTextDefault,
  examplesMdDefault,
  captureSessionId,
}: HelperTextModalProps) {
  const { helperTextKey, examplesMdKey } = buildHelperKeyPaths(
    templateSlug,
    questionKey,
  );
  const ctx = useTextOverride();
  // EditableText-Cascade: text_override (partner > template > global) > JSONB-Default.
  const effectiveHelper = selectEffectiveText(
    ctx.map,
    helperTextKey,
    helperTextDefault ?? "",
  ).text;
  const effectiveExamples = selectEffectiveText(
    ctx.map,
    examplesMdKey,
    examplesMdDefault ?? "",
  ).text;
  const { helperText: ht, examplesMd: ex } = normalizeHelperContent({
    helperText: effectiveHelper,
    examplesMd: effectiveExamples,
  });

  // Einmalig pro Open-Cycle das Telemetrie-Event feuern.
  useEffect(() => {
    if (open) {
      trackHelperTextOpen({
        question_key: questionKey,
        capture_session_id: captureSessionId,
      });
    }
  }, [open, questionKey, captureSessionId]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-left text-base leading-snug sm:text-lg">
            {questionLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 text-sm text-slate-700">
          {ht ? (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Begriff
              </h3>
              <p className="whitespace-pre-line leading-relaxed">{ht}</p>
            </section>
          ) : null}

          {ex ? (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Beispiele
              </h3>
              <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ ...props }) => (
                      <a
                        {...props}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-primary underline"
                      />
                    ),
                  }}
                >
                  {ex}
                </ReactMarkdown>
              </div>
            </section>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Schliessen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
