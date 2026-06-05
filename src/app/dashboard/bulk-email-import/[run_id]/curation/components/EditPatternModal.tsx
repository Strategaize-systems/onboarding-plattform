"use client";

// V9 SLC-167 MT-6 — Edit-Pattern-Modal (Curation-UI).
//
// Spec L188: Titel + Description editierbar, evidence_snippets read-only;
// Save → UPDATE email_pattern.title + description, curation_status='edited'.
//
// Pattern-Reuse-Anker: ../../filter-review/FilterReviewClient.tsx
// (AlertDialog-Pattern aus shadcn). Wir nutzen Dialog statt AlertDialog,
// weil Edit-Modal Form-Inputs braucht und nicht primaer eine Confirmation
// abfragt.

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  SECTION_OTHER_SENTINEL,
  type SectionOption,
} from "@/lib/bulk-email/sections";
import {
  MAX_EDIT_DESCRIPTION_LENGTH,
  MAX_EDIT_TITLE_LENGTH,
  MAX_FREE_TEXT_SECTION_LENGTH,
  type CurationPattern,
} from "../helpers";
import { updatePatternCuration } from "../actions";

interface EditPatternModalProps {
  /**
   * Pattern, das editiert wird. Niemals null — der Parent rendert das Modal
   * nur, wenn ein Pattern aktiv ist (key={pattern.id} fuer Reset bei Wechsel).
   */
  pattern: CurationPattern;
  sections: SectionOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditPatternModal({
  pattern,
  sections,
  open,
  onOpenChange,
}: EditPatternModalProps) {
  // Initialwerte direkt aus pattern — der Parent gibt key={pattern.id} mit,
  // sodass bei Pattern-Wechsel das Component frisch gemountet wird. Damit
  // brauchen wir keinen useEffect-Reset (verstoesst gegen
  // react-hooks/set-state-in-effect).
  const [title, setTitle] = useState(pattern.title);
  const [description, setDescription] = useState(pattern.description);
  const [selectedSection, setSelectedSection] = useState(
    pattern.curated_section ?? pattern.suggested_section ?? "",
  );
  const [freeTextSection, setFreeTextSection] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isOtherSelected = selectedSection === SECTION_OTHER_SENTINEL;
  const effectiveSection = isOtherSelected
    ? freeTextSection.trim()
    : selectedSection;

  function handleSave() {
    setErrorMessage(null);

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (trimmedTitle.length === 0) {
      setErrorMessage("Titel darf nicht leer sein.");
      return;
    }
    if (trimmedTitle.length > MAX_EDIT_TITLE_LENGTH) {
      setErrorMessage(`Titel zu lang (max ${MAX_EDIT_TITLE_LENGTH} Zeichen).`);
      return;
    }
    if (trimmedDescription.length === 0) {
      setErrorMessage("Beschreibung darf nicht leer sein.");
      return;
    }
    if (trimmedDescription.length > MAX_EDIT_DESCRIPTION_LENGTH) {
      setErrorMessage(
        `Beschreibung zu lang (max ${MAX_EDIT_DESCRIPTION_LENGTH} Zeichen).`,
      );
      return;
    }
    if (!effectiveSection) {
      setErrorMessage("Section ist Pflicht.");
      return;
    }

    startTransition(async () => {
      const result = await updatePatternCuration(pattern.id, {
        status: "edited",
        curated_section: effectiveSection,
        edited_title: trimmedTitle,
        edited_description: trimmedDescription,
      });
      if (!result.ok) {
        setErrorMessage(result.error);
      } else {
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pattern editieren</DialogTitle>
          <DialogDescription>
            Titel und Beschreibung anpassen. Evidenz-Snippets bleiben unveraendert,
            weil sie aus dem Quell-Thread stammen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Titel</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={MAX_EDIT_TITLE_LENGTH}
              disabled={isPending}
            />
            <p className="text-xs text-slate-400">
              {title.length} / {MAX_EDIT_TITLE_LENGTH}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Beschreibung</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={MAX_EDIT_DESCRIPTION_LENGTH}
              rows={6}
              disabled={isPending}
            />
            <p className="text-xs text-slate-400">
              {description.length} / {MAX_EDIT_DESCRIPTION_LENGTH}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-section">Section</Label>
            <Select
              value={selectedSection || undefined}
              onValueChange={(v) => setSelectedSection(v)}
              disabled={isPending}
            >
              <SelectTrigger id="edit-section">
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
                placeholder="Eigene Section-Bezeichnung…"
                value={freeTextSection}
                onChange={(e) => setFreeTextSection(e.target.value)}
                maxLength={MAX_FREE_TEXT_SECTION_LENGTH}
                disabled={isPending}
              />
            )}
          </div>

          {pattern.evidence_snippets &&
            Array.isArray(pattern.evidence_snippets) &&
            pattern.evidence_snippets.length > 0 && (
              <div className="space-y-2 rounded-md border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Evidenz (read-only, pseudonymisiert)
                </p>
                <ul className="space-y-1 text-sm text-slate-600">
                  {(pattern.evidence_snippets as unknown[])
                    .filter(
                      (s): s is string =>
                        typeof s === "string" && s.trim().length > 0,
                    )
                    .slice(0, 3)
                    .map((snippet, idx) => (
                      <li key={idx} className="italic">
                        &ldquo;{snippet}&rdquo;
                      </li>
                    ))}
                </ul>
              </div>
            )}

          {errorMessage && (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {errorMessage}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Speichere…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
