"use client";

// V9 SLC-167 MT-6 — Curation-UI Client-Komponente.
//
// Verantwortung:
//   - Filter-Tabs nach curation_status (Alle / Pending / Akzeptiert / Editiert /
//     Abgelehnt) — Client-State, keine URL-Round-Trips.
//   - Theme-Gruppierung (Spec L185: gruppiert nach Theme).
//   - Bulk-Aktionen (Accept ≥ Threshold, Reject all pending) mit AlertDialog-
//     Confirmation.
//   - Finish-Curation-Button → finishCurationAndStartHandbookImport mit
//     Bestaetigungs-Modal.
//   - EditPatternModal-Management.
//
// State-Strategie:
//   - Initial data kommt vom Server (Server-Component-Render).
//   - Mutations laufen ueber Server-Actions + revalidatePath. Wir reloaden bei
//     Bulk-Aktionen ueber router.refresh() statt optimistischen State, weil
//     mehrere Pattern-Cards betroffen sind.
//
// Pattern-Reuse: ../filter-review/FilterReviewClient.tsx (Filter-Tabs, Bulk-
// AlertDialog, Error-Banner-Pattern).

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  PlayCircle,
  Sparkles,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { SectionOption } from "@/lib/bulk-email/sections";
import {
  BULK_ACCEPT_DEFAULT_THRESHOLD,
  type CurationData,
  type CurationPattern,
  type CurationStatus,
} from "./helpers";
import {
  bulkAcceptPatterns,
  bulkRejectAll,
  finishCurationAndStartHandbookImport,
  importToHandbook,
} from "./actions";
import { PatternCard } from "./components/PatternCard";
import { EditPatternModal } from "./components/EditPatternModal";

interface CurationClientProps {
  bulkRunId: string;
  patterns: CurationPattern[];
  sections: SectionOption[];
  progress: CurationData["progress"];
  editable: boolean;
  /** true wenn der Run schon im 'importing' / 'completed' / 'failed' Status ist. */
  finished: boolean;
}

type FilterValue = "all" | CurationStatus;

const FILTER_TABS: Array<{ value: FilterValue; label: string }> = [
  { value: "all", label: "Alle" },
  { value: "pending_curation", label: "Offen" },
  { value: "accepted", label: "Akzeptiert" },
  { value: "edited", label: "Editiert" },
  { value: "rejected", label: "Abgelehnt" },
];

export function CurationClient({
  bulkRunId,
  patterns,
  sections,
  progress,
  editable,
  finished,
}: CurationClientProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterValue>("all");
  const [bulkThreshold, setBulkThreshold] = useState(
    BULK_ACCEPT_DEFAULT_THRESHOLD,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingPattern, setEditingPattern] = useState<CurationPattern | null>(
    null,
  );
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const filteredPatterns = useMemo(() => {
    if (filter === "all") return patterns;
    return patterns.filter((p) => p.curation_status === filter);
  }, [filter, patterns]);

  const groupedByTheme = useMemo(() => {
    const groups = new Map<string, CurationPattern[]>();
    for (const p of filteredPatterns) {
      const themes =
        Array.isArray(p.themes) && p.themes.length > 0
          ? p.themes
          : ["(ohne Theme)"];
      const primaryTheme = themes[0];
      const list = groups.get(primaryTheme) ?? [];
      list.push(p);
      groups.set(primaryTheme, list);
    }
    return Array.from(groups.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
  }, [filteredPatterns]);

  const progressPercent = useMemo(() => {
    if (progress.total === 0) return 0;
    return Math.round((progress.curated / progress.total) * 100);
  }, [progress]);

  function clearMessages() {
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function handleBulkAccept() {
    clearMessages();
    startTransition(async () => {
      const result = await bulkAcceptPatterns(bulkRunId, {
        confidenceThreshold: bulkThreshold,
      });
      if (!result.ok) {
        setErrorMessage(result.error);
      } else {
        setSuccessMessage(`${result.acceptedCount} Pattern akzeptiert.`);
        router.refresh();
      }
    });
  }

  function handleBulkReject() {
    clearMessages();
    startTransition(async () => {
      const result = await bulkRejectAll(bulkRunId);
      if (!result.ok) {
        setErrorMessage(result.error);
      } else {
        setSuccessMessage(`${result.rejectedCount} Pattern abgelehnt.`);
        router.refresh();
      }
    });
  }

  function handleFinish() {
    clearMessages();
    startTransition(async () => {
      // SLC-167 → SLC-168 Chain:
      //   1. finishCurationAndStartHandbookImport: Status auf 'importing' flippen
      //      + Pre-Conditions validieren (min 1 accepted Pattern).
      //   2. importToHandbook: knowledge_unit-Inserts + handbook_snapshot-Trigger.
      // Bei Fehler in Schritt 2 setzt importToHandbook status='failed' mit
      // failure_reason — Re-Try-Pfad via Button bleibt offen.
      const finishResult = await finishCurationAndStartHandbookImport(bulkRunId);
      if (!finishResult.ok) {
        setErrorMessage(finishResult.error);
        return;
      }

      const importResult = await importToHandbook(bulkRunId);
      if (!importResult.ok) {
        setErrorMessage(
          `Status auf 'importing' gesetzt, aber Handbook-Import fehlgeschlagen: ${importResult.error}`,
        );
        router.refresh();
        return;
      }

      if (importResult.patternsImported === 0) {
        setSuccessMessage(
          "Keine neuen Patterns zu importieren — Status auf 'completed' gesetzt.",
        );
      } else {
        setSuccessMessage(
          `Handbook-Import gestartet: ${importResult.knowledgeUnitsCreated} Wissens-Einheiten angelegt, Snapshot ${importResult.handbookSnapshotId.slice(0, 8)}... laeuft.`,
        );
      }
      router.refresh();
    });
  }

  function handleEdit(pattern: CurationPattern) {
    setEditingPattern(pattern);
    setEditModalOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Progress-Card */}
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">
              Curation-Fortschritt
            </h2>
            <span className="text-sm tabular-nums text-slate-600">
              {progress.curated} / {progress.total}
            </span>
          </div>
          <Progress value={progressPercent} />
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="border-green-200 bg-green-50">
              Akzeptiert: {progress.accepted}
            </Badge>
            <Badge variant="outline" className="border-blue-200 bg-blue-50">
              Editiert: {progress.edited}
            </Badge>
            <Badge variant="outline" className="border-red-200 bg-red-50">
              Abgelehnt: {progress.rejected}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-slate-50">
              Offen: {progress.pending}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Filter-Tabs + Bulk-Aktionen */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {FILTER_TABS.map((tab) => (
            <Button
              key={tab.value}
              variant={filter === tab.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(tab.value)}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {editable && progress.pending > 0 && (
          <div className="flex flex-wrap gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="default" disabled={isPending} className="gap-1">
                  <Sparkles className="h-4 w-4" />
                  Auto-Akzept ab Konfidenz
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Bulk-Akzeptanz</AlertDialogTitle>
                  <AlertDialogDescription>
                    Alle Patterns mit Konfidenz ≥ Schwellenwert und vorhandenem
                    Section-Vorschlag werden automatisch akzeptiert.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="bulk-threshold">Schwellenwert (0…1)</Label>
                  <Input
                    id="bulk-threshold"
                    type="number"
                    step="0.05"
                    min={0}
                    max={1}
                    value={bulkThreshold}
                    onChange={(e) =>
                      setBulkThreshold(Number(e.target.value) || 0)
                    }
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBulkAccept}>
                    Akzeptieren
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  className="gap-1 text-red-700 hover:text-red-800"
                >
                  <XCircle className="h-4 w-4" />
                  Alle Offenen ablehnen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Alle offenen ablehnen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {progress.pending} offene Patterns werden als
                    &laquo;rejected&raquo; markiert. Das ist nicht rueckgaengig
                    zu machen.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBulkReject}>
                    Alle ablehnen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {/* Feedback-Banner */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
          <p className="flex-1 text-sm text-red-800">{errorMessage}</p>
        </div>
      )}
      {successMessage && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4"
        >
          <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-500" />
          <p className="flex-1 text-sm text-green-800">{successMessage}</p>
        </div>
      )}

      {/* Pattern-Liste, gruppiert nach Theme */}
      {filteredPatterns.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-slate-500">
            Keine Patterns in dieser Ansicht.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedByTheme.map(([theme, items]) => (
            <section key={theme} className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {theme}
                <span className="text-xs font-normal normal-case text-slate-400">
                  ({items.length})
                </span>
              </h2>
              <div className="grid gap-3">
                {items.map((pattern) => (
                  <PatternCard
                    key={pattern.id}
                    pattern={pattern}
                    sections={sections}
                    editable={editable}
                    onEdit={handleEdit}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Abschluss-Button */}
      {editable && progress.accepted + progress.edited > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
            <div>
              <p className="text-sm font-medium text-slate-700">
                Curation abschliessen?
              </p>
              <p className="text-xs text-slate-500">
                {progress.accepted + progress.edited} Patterns werden ins
                Handbuch uebernommen (SLC-168, noch nicht implementiert).
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={isPending} className="gap-1">
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlayCircle className="h-4 w-4" />
                  )}
                  Curation abschliessen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Curation abschliessen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Der Bulk-Run wird auf Status &laquo;importing&raquo; gesetzt.
                    SLC-168 Handbook-Import-Worker uebernimmt die akzeptierten /
                    editierten Patterns ins Handbuch (Worker ist noch nicht
                    implementiert — die Daten warten in der DB).
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={handleFinish}>
                    Abschliessen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}

      {finished && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
        >
          <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-slate-500" />
          <p className="flex-1 text-sm text-slate-700">
            Curation ist abgeschlossen. Patterns sind read-only.
          </p>
        </div>
      )}

      {editingPattern && (
        <EditPatternModal
          key={editingPattern.id}
          pattern={editingPattern}
          sections={sections}
          open={editModalOpen}
          onOpenChange={(o) => {
            setEditModalOpen(o);
            if (!o) setEditingPattern(null);
          }}
        />
      )}
    </div>
  );
}
