"use client";

// V9 SLC-167 MT-6 — Edit-Pattern-Modal, V9.5 SLC-V9.5-D MT-4 — Edit-Unit-
// Modal: editiert konsolidierte email_synthesized_unit-Rows (DEC-214).
//
// Spec L188: Titel + Description editierbar, evidence_snippets read-only;
// Save → UPDATE email_synthesized_unit.title + description,
// curation_status='edited'.
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
  extractSnippetTexts,
  MAX_EDIT_DESCRIPTION_LENGTH,
  MAX_EDIT_TITLE_LENGTH,
  MAX_FREE_TEXT_SECTION_LENGTH,
  type CurationUnit,
} from "../helpers";
import { updateUnitCuration } from "../actions";

interface EditUnitModalProps {
  /**
   * Unit, die editiert wird. Niemals null — der Parent rendert das Modal
   * nur, wenn eine Unit aktiv ist (key={unit.id} fuer Reset bei Wechsel).
   */
  unit: CurationUnit;
  sections: SectionOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditUnitModal({
  unit,
  sections,
  open,
  onOpenChange,
}: EditUnitModalProps) {
  // Initialwerte direkt aus unit — der Parent gibt key={unit.id} mit,
  // sodass bei Unit-Wechsel das Component frisch gemountet wird. Damit
  // brauchen wir keinen useEffect-Reset (verstoesst gegen
  // react-hooks/set-state-in-effect).
  const [title, setTitle] = useState(unit.title);
  const [description, setDescription] = useState(unit.description);
  const [selectedSection, setSelectedSection] = useState(
    unit.curated_section ?? unit.suggested_section ?? "",
  );
  const [freeTextSection, setFreeTextSection] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isOtherSelected = selectedSection === SECTION_OTHER_SENTINEL;
  const effectiveSection = isOtherSelected
    ? freeTextSection.trim()
    : selectedSection;

  const snippetTexts = extractSnippetTexts(unit.evidence_snippets).slice(0, 3);

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
      const result = await updateUnitCuration(unit.id, {
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
          <DialogTitle>Wissens-Baustein editieren</DialogTitle>
          <DialogDescription>
            Titel und Beschreibung anpassen. Evidenz-Snippets bleiben
            unveraendert, weil sie aus den Quell-Patterns stammen.
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

          {snippetTexts.length > 0 && (
            <div className="space-y-2 rounded-md border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Evidenz (read-only, Klarnamen bereits entfernt)
              </p>
              <ul className="space-y-1 text-sm text-slate-600">
                {snippetTexts.map((snippet, idx) => (
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
