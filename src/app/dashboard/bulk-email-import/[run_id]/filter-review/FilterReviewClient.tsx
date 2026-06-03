"use client";

// V9 SLC-166 MT-3 — Filter-Review Client-Komponente (Interaktive UI).
//
// Verantwortung:
//   - Filter-Dropdown nach Label (Client-State, keine URL-Round-Trips —
//     bei 1000+ Emails ist sofortiger Filter-Wechsel besser als Reload).
//   - Pro-Email Korrektur-Dropdown (sofortige Server-Action bei Aenderung).
//   - Bulk-Reclassify: Checkbox-Multi-Select + Target-Label + Apply-Button.
//   - Approval-Button mit AlertDialog-Bestaetigung (V9-Gate-1, DEC-178).
//
// State-Strategie:
//   - Initial data kommt vom Server (server-rendered, kein Loading-State).
//   - Optimistic local state fuer Label-Changes: useTransition + sofortige
//     Listen-Aktualisierung waehrend Server-Action laeuft.
//   - Bei Server-Fehler: revert via reload-Hint (toast-State + window.reload-
//     Empfehlung, keine eigene Toast-Lib).
//
// Anti-Pattern vermieden:
//   - Kein Polling/AutoRefresh hier — die Detail-View polled. Diese Page
//     ist eine "Stable-State-Edit-View", nicht "Live-Progress-View".

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import {
  approvePreFilterAndStartThreadRedact,
  updateEmailClassifications,
} from "./actions";
import {
  PRE_FILTER_LABELS,
  PRE_FILTER_LABEL_DESCRIPTIONS,
  buildBodyExcerpt,
  type EmailReviewItem,
  type PreFilterLabel,
} from "./helpers";

interface FilterReviewClientProps {
  bulkRunId: string;
  items: EmailReviewItem[];
  editable: boolean;
}

const FILTER_ALL = "__all__" as const;

function formatConfidence(confidence: number | null): string {
  if (confidence == null) return "—";
  return `${Math.round(confidence * 100)}%`;
}

function LabelBadge({ label }: { label: PreFilterLabel }) {
  return (
    <Badge variant="secondary" className="font-mono">
      {label}
    </Badge>
  );
}

export function FilterReviewClient({
  bulkRunId,
  items,
  editable,
}: FilterReviewClientProps) {
  const router = useRouter();
  const [filterLabel, setFilterLabel] = useState<typeof FILTER_ALL | PreFilterLabel>(
    FILTER_ALL,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState<PreFilterLabel>("content");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredItems = useMemo(() => {
    if (filterLabel === FILTER_ALL) return items;
    return items.filter((item) => item.pre_filter_label === filterLabel);
  }, [items, filterLabel]);

  const selectedInFilter = useMemo(
    () => filteredItems.filter((item) => selectedIds.has(item.id)),
    [filteredItems, selectedIds],
  );

  function toggleSelect(messageId: string, next: boolean) {
    setSelectedIds((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(messageId);
      else updated.delete(messageId);
      return updated;
    });
  }

  function selectAllFiltered() {
    setSelectedIds(new Set(filteredItems.map((item) => item.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleSingleChange(messageId: string, newLabel: PreFilterLabel) {
    setErrorMessage(null);
    setSuccessMessage(null);
    startTransition(async () => {
      const result = await updateEmailClassifications(bulkRunId, [
        { message_id: messageId, new_label: newLabel },
      ]);
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      setSuccessMessage("Klassifikation aktualisiert.");
      router.refresh();
    });
  }

  function handleBulkReclassify() {
    if (selectedInFilter.length === 0) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    const updates = selectedInFilter.map((item) => ({
      message_id: item.id,
      new_label: bulkTarget,
    }));
    startTransition(async () => {
      const result = await updateEmailClassifications(bulkRunId, updates);
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      setSuccessMessage(
        `${result.updatedCount} Email${result.updatedCount === 1 ? "" : "s"} auf '${bulkTarget}' gesetzt.`,
      );
      clearSelection();
      router.refresh();
    });
  }

  function handleApprove() {
    setErrorMessage(null);
    setSuccessMessage(null);
    startTransition(async () => {
      const result = await approvePreFilterAndStartThreadRedact(bulkRunId);
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      setSuccessMessage(
        "Pre-Filter freigegeben. Thread-Aggregation wird gestartet.",
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {errorMessage ? (
        <div
          role="alert"
          data-testid="filter-review-error"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {errorMessage}
        </div>
      ) : null}
      {successMessage ? (
        <div
          role="status"
          data-testid="filter-review-success"
          className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
        >
          {successMessage}
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex-1 max-w-sm">
              <label
                htmlFor="filter-label-select"
                className="text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                Label-Filter
              </label>
              <Select
                value={filterLabel}
                onValueChange={(v) =>
                  setFilterLabel(v as typeof FILTER_ALL | PreFilterLabel)
                }
              >
                <SelectTrigger id="filter-label-select" className="mt-1">
                  <SelectValue placeholder="Alle Labels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>
                    Alle Labels ({items.length})
                  </SelectItem>
                  {PRE_FILTER_LABELS.map((label) => {
                    const count = items.filter(
                      (i) => i.pre_filter_label === label,
                    ).length;
                    return (
                      <SelectItem key={label} value={label}>
                        {label} ({count})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-slate-500">
              {filteredItems.length} angezeigt
              {selectedIds.size > 0
                ? ` · ${selectedIds.size} ausgewaehlt`
                : null}
            </div>
          </div>

          {editable && filteredItems.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={selectAllFiltered}
                disabled={isPending}
              >
                Alle in Filter waehlen
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearSelection}
                disabled={isPending || selectedIds.size === 0}
              >
                Auswahl loeschen
              </Button>
              {selectedInFilter.length > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wide text-slate-500">
                    Aendern zu
                  </span>
                  <Select
                    value={bulkTarget}
                    onValueChange={(v) => setBulkTarget(v as PreFilterLabel)}
                  >
                    <SelectTrigger className="h-9 w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRE_FILTER_LABELS.map((label) => (
                        <SelectItem key={label} value={label}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleBulkReclassify}
                    disabled={isPending}
                    data-testid="bulk-reclassify-button"
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {selectedInFilter.length} reklassifizieren
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ul className="space-y-2" data-testid="email-review-list">
        {filteredItems.length === 0 ? (
          <li className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Keine Emails mit diesem Label.
          </li>
        ) : null}
        {filteredItems.map((item) => {
          const checked = selectedIds.has(item.id);
          return (
            <li
              key={item.id}
              data-testid="email-review-item"
              data-message-id={item.id}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="flex items-start gap-3">
                {editable ? (
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) =>
                      toggleSelect(item.id, Boolean(v))
                    }
                    aria-label={`Email ${item.id} auswaehlen`}
                    className="mt-1"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <LabelBadge label={item.pre_filter_label} />
                    {item.pre_filter_corrected ? (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        manuell
                      </Badge>
                    ) : null}
                    <span className="text-xs text-slate-500">
                      Konfidenz {formatConfidence(item.pre_filter_confidence)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium text-slate-900">
                    {item.subject ?? "(kein Subject)"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Von: {item.from_address ?? "(unbekannt)"}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-xs text-slate-600">
                    {buildBodyExcerpt(item.body_text)}
                  </p>
                </div>
                {editable ? (
                  <div className="w-[150px] flex-shrink-0">
                    <Select
                      value={item.pre_filter_label}
                      onValueChange={(v) =>
                        handleSingleChange(item.id, v as PreFilterLabel)
                      }
                      disabled={isPending}
                    >
                      <SelectTrigger
                        className="h-9"
                        data-testid="email-label-select"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRE_FILTER_LABELS.map((label) => (
                          <SelectItem
                            key={label}
                            value={label}
                            title={PRE_FILTER_LABEL_DESCRIPTIONS[label]}
                          >
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {editable ? (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">
                Pre-Filter freigeben
              </p>
              <p className="text-xs text-slate-500">
                Naechster Schritt: Thread-Aggregation + PII-Redaction. Nach
                Freigabe sind Klassifikationen read-only.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  disabled={isPending}
                  data-testid="approve-pre-filter-button"
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Pre-Filter freigeben
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Pre-Filter wirklich freigeben?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Die Klassifikationen werden eingefroren und der naechste
                    Pipeline-Schritt (Thread-Aggregation + PII-Redaction)
                    gestartet. Du kannst danach nicht mehr korrigieren.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isPending}>
                    Abbrechen
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleApprove}
                    disabled={isPending}
                    data-testid="approve-pre-filter-confirm"
                  >
                    Ja, freigeben
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
