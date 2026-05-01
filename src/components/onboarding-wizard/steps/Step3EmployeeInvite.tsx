"use client";

// SLC-047 MT-3 — Step 3: 0..N Mitarbeiter-Einladungen.
//
// Verhalten:
//  - Add-Row Button fuegt eine leere Eingabezeile hinzu.
//  - "Einladen + Weiter" filtert leere Rows raus, validiert E-Mails Submit-Time
//    und ruft inviteEmployee aus SLC-034 pro gueltiger Row.
//  - 0 valide Rows nach Filter → Sprung direkt zu Step 4 (Solo-GF-Pfad).
//  - Bei mind. einem Erfolg: Toast + Sprung zu Step 4.
//  - Bei nur Fehlern: Step bleibt, Inline-Errors pro Row.
//  - "Später einladen" springt direkt zu Step 4 ohne INSERT.

import { useState } from "react";
import { Trash2, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { inviteEmployee } from "@/app/admin/team/actions";
import {
  emptyEmployeeRow,
  prepareEmployeeRows,
  type EmployeeInviteRow,
} from "../wizard-helpers";

type Step3Props = {
  rows: EmployeeInviteRow[];
  onRowsChange: (rows: EmployeeInviteRow[]) => void;
  onSubmittedAndAdvance: () => void;
  onSkipStep: () => void;
  disabled: boolean;
};

const ERROR_LABEL: Record<string, string> = {
  invalid_email: "Bitte gültige E-Mail-Adresse eintragen.",
  duplicate_pending_invitation: "Es gibt bereits eine offene Einladung für diese E-Mail.",
  forbidden: "Sie haben keine Berechtigung, Mitarbeiter einzuladen.",
  unauthenticated: "Sitzung abgelaufen. Bitte neu einloggen.",
  rpc_failed: "Datenbankfehler. Bitte erneut versuchen.",
  unknown_error: "Unbekannter Fehler. Bitte erneut versuchen.",
};

export function Step3EmployeeInvite({
  rows,
  onRowsChange,
  onSubmittedAndAdvance,
  onSkipStep,
  disabled,
}: Step3Props) {
  const [submitting, setSubmitting] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  function updateRow(index: number, field: keyof EmployeeInviteRow, value: string) {
    const next = rows.map((row, i) => (i === index ? { ...row, [field]: value } : row));
    onRowsChange(next);
    if (rowErrors[index]) {
      const cleared = { ...rowErrors };
      delete cleared[index];
      setRowErrors(cleared);
    }
  }

  function addRow() {
    onRowsChange([...rows, emptyEmployeeRow()]);
  }

  function removeRow(index: number) {
    if (rows.length === 1) {
      onRowsChange([emptyEmployeeRow()]);
    } else {
      onRowsChange(rows.filter((_, i) => i !== index));
    }
    const cleared = { ...rowErrors };
    delete cleared[index];
    setRowErrors(cleared);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setGlobalError(null);
    setRowErrors({});

    const prepared = prepareEmployeeRows(rows);

    if (prepared.errors.length > 0) {
      const errorMap: Record<number, string> = {};
      for (const err of prepared.errors) {
        errorMap[err.index] = ERROR_LABEL[err.reason] ?? ERROR_LABEL.unknown_error;
      }
      setRowErrors(errorMap);
      setSubmitting(false);
      return;
    }

    if (prepared.isEmpty) {
      // Solo-GF-Pfad: kein INSERT, direkt zu Step 4.
      setSubmitting(false);
      onSubmittedAndAdvance();
      return;
    }

    let successCount = 0;
    let smtpFailureCount = 0;
    const serverErrors: Array<{ email: string; error: string }> = [];

    for (const validRow of prepared.validRows) {
      const formData = new FormData();
      formData.set("email", validRow.email);
      if (validRow.displayName) formData.set("displayName", validRow.displayName);
      if (validRow.roleHint) formData.set("roleHint", validRow.roleHint);

      const result = await inviteEmployee(formData);
      if (result.ok) {
        successCount += 1;
        if (result.emailFailed) smtpFailureCount += 1;
      } else {
        serverErrors.push({ email: validRow.email, error: result.error });
      }
    }

    setSubmitting(false);

    if (successCount === 0 && serverErrors.length > 0) {
      const first = serverErrors[0];
      setGlobalError(
        `Einladung für ${first.email} fehlgeschlagen: ${ERROR_LABEL[first.error] ?? ERROR_LABEL.unknown_error}`
      );
      return;
    }

    if (smtpFailureCount > 0) {
      toast.warning(
        `${successCount} Mitarbeiter angelegt, ${smtpFailureCount} ohne E-Mail-Zustellung. Im Admin-Bereich erneut senden.`
      );
    } else {
      toast.success(`${successCount} Mitarbeiter eingeladen.`);
    }

    if (serverErrors.length > 0) {
      const first = serverErrors[0];
      toast.error(
        `Einladung für ${first.email} schlug fehl: ${ERROR_LABEL[first.error] ?? ERROR_LABEL.unknown_error}`
      );
    }

    onSubmittedAndAdvance();
  }

  const busy = submitting || disabled;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Optional — Sie können das auch später unter <strong>Mitarbeiter</strong> machen.
      </p>

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div
            key={index}
            className="rounded-md border border-slate-200 bg-white p-3 space-y-2"
          >
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-3">
                <Label htmlFor={`emp-email-${index}`} className="text-xs">
                  E-Mail
                </Label>
                <Input
                  id={`emp-email-${index}`}
                  type="email"
                  value={row.email}
                  onChange={(e) => updateRow(index, "email", e.target.value)}
                  placeholder="max@beispiel.de"
                  disabled={busy}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor={`emp-name-${index}`} className="text-xs">
                  Name <span className="text-slate-400">(optional)</span>
                </Label>
                <Input
                  id={`emp-name-${index}`}
                  type="text"
                  value={row.displayName}
                  onChange={(e) => updateRow(index, "displayName", e.target.value)}
                  placeholder="Max Mustermann"
                  disabled={busy}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`emp-role-${index}`} className="text-xs">
                  Position <span className="text-slate-400">(optional)</span>
                </Label>
                <Input
                  id={`emp-role-${index}`}
                  type="text"
                  value={row.roleHint}
                  onChange={(e) => updateRow(index, "roleHint", e.target.value)}
                  placeholder="z.B. Operations"
                  disabled={busy}
                  autoComplete="off"
                />
              </div>
            </div>
            {rowErrors[index] && (
              <p className="text-xs text-red-600">{rowErrors[index]}</p>
            )}
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeRow(index)}
                disabled={busy}
                className="text-slate-500"
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Entfernen
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        disabled={busy}
      >
        <Plus className="mr-1 h-4 w-4" />
        Weitere Person hinzufügen
      </Button>

      {globalError && (
        <Alert variant="destructive">
          <AlertDescription>{globalError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                onClick={onSkipStep}
                disabled={busy}
              >
                Später einladen
              </Button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-xs text-xs leading-snug"
            >
              Du kannst den Wizard jederzeit abschliessen
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button type="button" onClick={() => void handleSubmit()} disabled={busy}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Wird eingeladen
            </>
          ) : (
            "Einladen + Weiter"
          )}
        </Button>
      </div>
    </div>
  );
}
