"use client";

// V7.1 SLC-137 MT-1 — EditableText React-Komponente (FEAT-056).
//
// Universeller Wrapper fuer User-sichtbare Strings im Diagnose-Funnel.
// Rendert resolvierten Text aus React-Context (TextOverrideProvider in MT-2),
// faellt auf defaultText zurueck wenn kein Override gesetzt ist.
//
// Bei Rolle strategaize_admin oder partner_admin: Pencil-Icon visible neben
// dem Text (opacity 0.4 hover 1.0). Klick oeffnet Hybrid-Editor:
//   - Inline-Textarea wenn defaultText.length <= 80 && !multiline
//   - Modal-Textarea sonst (DEC-143)
//
// Save: ruft saveTextOverride-Server-Action (FEAT-055 / SLC-136 MT-3),
//       revalidatePath triggert Server-Component-Re-Load.
// Reset: ruft resetTextOverride-Server-Action.
//
// Pure-Logik in editable-text-logic.ts (Vitest-getestet).
// Markdown-Rendering via react-markdown (bestehende Dep) wenn markdown=true.

import React, { useCallback, useState, useTransition } from "react";
import { Pencil, RotateCcw, Loader2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  saveTextOverride,
  resetTextOverride,
} from "@/lib/text-override/actions";
import type { TextOverrideScope } from "@/lib/text-override/resolver";
import {
  canEditText,
  pickEditorMode,
  selectEffectiveText,
  defaultScopeForKey,
} from "./editable-text-logic";
import { useTextOverride } from "./use-text-override";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface EditableTextProps {
  keyPath: string;
  defaultText: string;
  scope?: TextOverrideScope;
  scopeId?: string | null;
  multiline?: boolean;
  markdown?: boolean;
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
}

export function EditableText({
  keyPath,
  defaultText,
  scope,
  scopeId,
  multiline = false,
  markdown = false,
  as: As = "span",
  className,
}: EditableTextProps) {
  const ctx = useTextOverride();
  const { text, isOverride } = selectEffectiveText(
    ctx.map,
    keyPath,
    defaultText,
  );
  const editable = canEditText(ctx.role);
  const mode = pickEditorMode(defaultText, multiline);

  const [isEditorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<string>(text);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // V7.1: Inline-Edit-Default scope='global' (siehe defaultScopeForKey).
  // Caller kann explicit scope='partner' setzen, dann nutzen wir ctx.partnerOrgId
  // als scope_id (falls scopeId-Prop nicht ueberreicht wird).
  const effectiveScope: TextOverrideScope = scope ?? defaultScopeForKey(keyPath);
  const effectiveScopeId: string | null =
    scopeId !== undefined
      ? scopeId
      : effectiveScope === "partner"
      ? ctx.partnerOrgId
      : null;

  // Auto-Sync: wenn Resolver-Reload (revalidatePath) neue Werte liefert,
  // springt der lokale Draft in den naechsten Open-Cycle wieder auf den
  // aktuellen Wert. Im Editor ist der Draft autoritativ.
  function openEditor() {
    setDraft(text);
    setSaveError(null);
    setEditorOpen(true);
  }

  const onSave = useCallback(() => {
    setSaveError(null);
    startTransition(async () => {
      const result = await saveTextOverride({
        scope: effectiveScope,
        scopeId: effectiveScopeId,
        textKey: keyPath,
        newValue: draft,
      });
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setEditorOpen(false);
    });
  }, [draft, effectiveScope, effectiveScopeId, keyPath]);

  const onReset = useCallback(() => {
    setSaveError(null);
    startTransition(async () => {
      const result = await resetTextOverride({
        scope: effectiveScope,
        scopeId: effectiveScopeId,
        textKey: keyPath,
      });
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setEditorOpen(false);
    });
  }, [effectiveScope, effectiveScopeId, keyPath]);

  const renderedContent = markdown ? (
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
  ) : (
    text
  );

  return (
    <As className={className} data-editable-text={keyPath}>
      {renderedContent}
      {editable ? (
        <>
          {isOverride ? (
            <span
              className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
              title="Dieser Text wurde ueberschrieben"
              data-editable-text-badge="override"
            >
              Override
            </span>
          ) : null}
          <button
            type="button"
            onClick={openEditor}
            aria-label={`Text bearbeiten: ${keyPath}`}
            className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded text-slate-500 opacity-40 transition-opacity hover:bg-slate-100 hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            data-editable-text-trigger={keyPath}
          >
            <Pencil className="h-3 w-3" aria-hidden="true" />
          </button>

          {isEditorOpen && mode === "inline" ? (
            <span
              className="ml-2 inline-flex items-center gap-1 rounded border border-slate-300 bg-white p-1 align-middle shadow-sm"
              data-editable-text-editor="inline"
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={pending}
                className="min-w-[12rem] rounded border-0 px-1 py-0.5 text-sm focus:outline-none"
                aria-label="Neuer Text"
              />
              <Button
                type="button"
                size="sm"
                onClick={onSave}
                disabled={pending}
              >
                {pending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Speichern"
                )}
              </Button>
              {isOverride ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onReset}
                  disabled={pending}
                  title="Auf Standard zuruecksetzen"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditorOpen(false)}
                disabled={pending}
                aria-label="Abbrechen"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </Button>
              {saveError ? (
                <span className="ml-1 text-xs text-red-600">{saveError}</span>
              ) : null}
            </span>
          ) : null}

          {isEditorOpen && mode === "modal" ? (
            <Dialog
              open={isEditorOpen}
              onOpenChange={(o) => {
                if (!o) setEditorOpen(false);
              }}
            >
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Text bearbeiten</DialogTitle>
                  <p className="mt-1 text-xs font-mono text-slate-400">{keyPath}</p>
                </DialogHeader>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={pending}
                  rows={Math.max(6, Math.min(20, Math.ceil(draft.length / 60)))}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  aria-label="Neuer Text"
                />
                {saveError ? (
                  <p className="text-xs text-red-600">{saveError}</p>
                ) : null}
                <DialogFooter>
                  {isOverride ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onReset}
                      disabled={pending}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" aria-hidden="true" />
                      Auf Standard zuruecksetzen
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setEditorOpen(false)}
                    disabled={pending}
                  >
                    Abbrechen
                  </Button>
                  <Button type="button" onClick={onSave} disabled={pending}>
                    {pending ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Speichern...
                      </>
                    ) : (
                      "Speichern"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
        </>
      ) : null}
    </As>
  );
}
