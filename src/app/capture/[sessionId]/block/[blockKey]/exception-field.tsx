"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { saveAnswer } from "./actions";

/**
 * Exception-Freitext-Feld pro Block.
 *
 * Storage-Konvention: Der Text wird in capture_session.answers unter dem Key
 * `__exception__.<blockKey>` gespeichert — gleicher JSONB-Merge wie regulaere
 * Antworten (DEC-013). Autosave mit 500ms Debounce.
 *
 * Der Text fliesst beim Block-Submit in content.exception ein (submit-action.ts)
 * und wird in SLC-008 als separater Input-Block an die KI-Verdichtung uebergeben.
 */

interface ExceptionFieldProps {
  sessionId: string;
  blockKey: string;
  initialValue: string;
}

export function ExceptionField({
  sessionId,
  blockKey,
  initialValue,
}: ExceptionFieldProps) {
  const [text, setText] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const doSave = useCallback(
    async (value: string) => {
      setSaving(true);
      setSaved(false);
      setError(null);
      try {
        // saveAnswer(sessionId, blockKey="__exception__", questionId=blockKey, value)
        // => key in JSONB: "__exception__.<blockKey>"
        const result = await saveAnswer(sessionId, "__exception__", blockKey, value);
        if (result?.error) {
          setError(result.error);
        } else {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        }
      } catch {
        setError("Speichern fehlgeschlagen");
      } finally {
        setSaving(false);
      }
    },
    [sessionId, blockKey]
  );

  function handleChange(value: string) {
    setText(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      doSave(value);
    }, 500);
  }

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  return (
    <div className="bg-white rounded-2xl border-2 border-amber-200 shadow-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-amber-200 bg-amber-50/50">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-md">
            <AlertTriangle className="h-4 w-4 text-white" />
          </div>
          Ausnahmen & Ergänzungen
          <span className="ml-auto flex items-center gap-2">
            {saving && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Speichert...
              </span>
            )}
            {saved && (
              <span className="flex items-center gap-1 text-xs text-green-500">
                <Check className="h-3 w-3" />
                Gespeichert
              </span>
            )}
          </span>
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Notieren Sie hier Beobachtungen, Besonderheiten oder Ausnahmen, die nicht in die Fragen passen.
          Diese Informationen fließen in die KI-Verdichtung ein.
        </p>
      </div>
      <div className="p-5">
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Zusätzliche Beobachtungen, die nicht in die Fragen passen..."
          rows={4}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm leading-relaxed focus:border-amber-400 focus:ring-2 focus:ring-amber-100 focus:outline-none transition-all resize-y min-h-[100px]"
        />
        {error && (
          <p className="mt-2 text-xs text-red-500">{error}</p>
        )}
        {text.trim().length > 0 && (
          <p className="mt-2 text-xs text-slate-400 tabular-nums">
            {text.length} Zeichen
          </p>
        )}
      </div>
    </div>
  );
}
