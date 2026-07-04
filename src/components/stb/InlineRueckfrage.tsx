"use client";

// StB-Modul Inline-Rueckfrage (SLC-180, OP V10.1).
//
// Praesentationskomponente: rendert die Live-Rueckfrage (assessModulAnswer,
// SLC-179) direkt im Modul-Wizard unter der gespeicherten Antwort. Founder-Modus
// OPTIONAL-INLINE: der Nutzer kann die Rueckfrage beantworten (Antwort wird per
// `followup.<block>.<qid>` an die Eltern-Antwort gemergt) ODER verwerfen — der
// Block-Submit ist nie blockiert. State + Server-Calls liegen im Parent
// (questionnaire-form.tsx); diese Komponente ist rein darstellend.

import { useState } from "react";
import { Sparkles, Loader2, X } from "lucide-react";

interface Props {
  /** Die vom Live-Scoring formulierte Rueckfrage (nicht leer, wenn gerendert). */
  rueckfrage: string;
  /** true, waehrend die Nachantwort persistiert / erneut bewertet wird. */
  saving: boolean;
  /** Nachantwort absenden — Parent persistiert + heilt ggf. (F-E). */
  onSubmit: (text: string) => void;
  /** Rueckfrage verwerfen (kein Persist; Trigger-Hit bleibt fuer die Ampel). */
  onDismiss: () => void;
}

export function InlineRueckfrage({ rueckfrage, saving, onSubmit, onDismiss }: Props) {
  const [text, setText] = useState("");

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    onSubmit(trimmed);
    setText("");
  }

  return (
    <div className="relative bg-white rounded-2xl border-2 border-amber-300 shadow-lg overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-amber-500" />
      <div className="px-6 py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 shadow-md">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                KI-Rückfrage
              </span>
              <span className="text-[10px] text-slate-400">
                optional — schärft die Analyse
              </span>
            </div>
            <p className="mt-1 text-sm font-medium leading-snug text-slate-800">
              {rueckfrage}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            disabled={saving}
            title="Rückfrage verwerfen"
            className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 pl-11">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Ihre Ergänzung eingeben (oder verwerfen)…"
            rows={2}
            disabled={saving}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed transition-colors focus:border-amber-400 focus:outline-none disabled:opacity-60"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onDismiss}
              disabled={saving}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-700 disabled:opacity-50"
            >
              Verwerfen
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !text.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:shadow-md disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {saving ? "Speichert…" : "Antwort ergänzen"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
