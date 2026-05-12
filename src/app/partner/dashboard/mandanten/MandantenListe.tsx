"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { revokeMandantInvitation } from "./actions";

/**
 * V6 SLC-103 MT-4 — Mandanten-Liste-Tabelle mit Status-Badges + Revoke-Action.
 *
 * Native-HTML-Approach (feedback_native_html_form_pattern): kein react-hook-form,
 * Revoke laeuft via Server Action + useTransition. Bestaetigungs-Dialog via
 * window.confirm — bewusst minimalistisch fuer V6, ein modal-basierter Dialog
 * ist V6.1-Polish.
 */

export type InvitationStatus = "invited" | "accepted" | "revoked";

export interface MandantRow {
  mappingId: string;
  mandantTenantId: string;
  companyName: string;
  invitationEmail: string;
  invitationStatus: InvitationStatus;
  invitedAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

const STATUS_LABELS: Record<InvitationStatus, string> = {
  invited: "Einladung offen",
  accepted: "Mandant aktiv",
  revoked: "Widerrufen",
};

const STATUS_CLASSES: Record<InvitationStatus, string> = {
  invited:
    "bg-yellow-100 text-yellow-800 ring-1 ring-inset ring-yellow-300/60",
  accepted:
    "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-300/60",
  revoked: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300/60",
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_mapping_id: "Ungueltige Mandanten-Referenz.",
  unauthenticated: "Session abgelaufen. Bitte erneut einloggen.",
  forbidden: "Keine Berechtigung fuer dieses Mandanten-Mapping.",
  no_tenant: "Dein Profil ist keiner Partner-Organisation zugeordnet.",
  load_failed: "Mandanten-Mapping konnte nicht geladen werden.",
  mapping_not_found: "Mandanten-Mapping nicht gefunden.",
  already_accepted:
    "Der Mandant hat die Einladung bereits angenommen — kein Widerruf moeglich.",
  already_revoked: "Die Einladung wurde bereits widerrufen.",
  invalid_status: "Aktueller Status erlaubt keinen Widerruf.",
  update_mapping_failed:
    "Widerruf fehlgeschlagen. Bitte erneut versuchen.",
  unknown_error: "Unbekannter Fehler. Bitte erneut versuchen.",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("de-DE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return value;
  }
}

export function MandantenListe({ rows }: { rows: MandantRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [pendingMappingId, setPendingMappingId] = useState<string | null>(null);

  function onRevoke(mappingId: string, companyName: string) {
    if (
      !window.confirm(
        `Sind Sie sicher, dass Sie die Einladung an ${companyName} widerrufen wollen?\n\nDer Mandant kann den Magic-Link dann nicht mehr nutzen.`,
      )
    ) {
      return;
    }

    setErrorKey(null);
    setPendingMappingId(mappingId);
    const formData = new FormData();
    formData.append("mapping_id", mappingId);

    startTransition(async () => {
      const res = await revokeMandantInvitation(formData);
      setPendingMappingId(null);
      if (!res.ok) {
        setErrorKey(res.error);
        return;
      }
      router.push("/partner/dashboard/mandanten?revoked=1");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {errorKey && (
        <Alert variant="destructive">
          <AlertDescription>
            {ERROR_MESSAGES[errorKey] ?? ERROR_MESSAGES.unknown_error}
          </AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Firmenname
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                E-Mail
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Eingeladen
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Angenommen
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Aktion
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row) => (
              <tr key={row.mappingId} className="text-sm">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {row.companyName}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {row.invitationEmail}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[row.invitationStatus]}`}
                  >
                    {STATUS_LABELS[row.invitationStatus]}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {formatDate(row.invitedAt)}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {formatDate(row.acceptedAt)}
                </td>
                <td className="px-4 py-3">
                  {row.invitationStatus === "invited" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending && pendingMappingId === row.mappingId}
                      onClick={() => onRevoke(row.mappingId, row.companyName)}
                    >
                      {isPending && pendingMappingId === row.mappingId
                        ? "Widerrufen..."
                        : "Einladung widerrufen"}
                    </Button>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Mandanten-Berichte sind sichtbar, sobald der Mandant die Diagnose
        abgeschlossen hat (verfuegbar mit dem naechsten Update).
      </p>
    </div>
  );
}
