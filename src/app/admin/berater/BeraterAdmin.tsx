"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createBerater, assignBerater, unassignBerater } from "./actions";

/**
 * V10.4 SLC-189 MT-3 — Berater-Verwaltung (strategaize_admin).
 *
 * Native HTML Form + useTransition + Server Action (feedback_native_html_form_pattern).
 * Zuweisungen als native Checkboxen mit optimistischem Toggle; bei Server-Fehler
 * wird der lokale Zustand zurueckgesetzt.
 */

interface BeraterRow {
  id: string;
  email: string;
  createdAt: string | null;
}
interface TenantRow {
  id: string;
  name: string;
  kindLabel: string;
}
interface AssignmentRow {
  beraterUserId: string;
  tenantId: string;
}

const CREATE_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "Keine Berechtigung.",
  invalid_email: "Bitte eine gueltige E-Mail-Adresse angeben.",
  email_exists: "Diese E-Mail ist bereits registriert und bestaetigt.",
  link_failed: "Einladungs-Link konnte nicht erzeugt werden. Bitte erneut versuchen.",
  unknown_error: "Unbekannter Fehler. Bitte erneut versuchen.",
};

function assignKey(beraterId: string, tenantId: string): string {
  return `${beraterId}|${tenantId}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("de-DE");
}

export function BeraterAdmin({
  berater,
  tenants,
  assignments,
  loadError,
}: {
  berater: BeraterRow[];
  tenants: TenantRow[];
  assignments: AssignmentRow[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [isCreating, startCreate] = useTransition();
  const [, startAssign] = useTransition();
  const [createError, setCreateError] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState<string | null>(null);

  // Optimistischer Zuweisungs-Zustand als Set von "beraterId|tenantId".
  const [assignedSet, setAssignedSet] = useState<Set<string>>(
    () => new Set(assignments.map((a) => assignKey(a.beraterUserId, a.tenantId))),
  );
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  function onCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setCreateNotice(null);
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") ?? "");

    startCreate(async () => {
      const result = await createBerater(email);
      if (!result.ok) {
        setCreateError(result.error);
        return;
      }
      form.reset();
      setCreateNotice(
        result.emailFailed
          ? "Berater angelegt, aber die Einladungs-E-Mail konnte nicht versendet werden."
          : "Einladung verschickt.",
      );
      router.refresh();
    });
  }

  function onToggle(beraterId: string, tenantId: string, nextChecked: boolean) {
    const key = assignKey(beraterId, tenantId);
    setPendingKey(key);
    // Optimistisch setzen
    setAssignedSet((prev) => {
      const next = new Set(prev);
      if (nextChecked) next.add(key);
      else next.delete(key);
      return next;
    });

    startAssign(async () => {
      const result = nextChecked
        ? await assignBerater(beraterId, tenantId)
        : await unassignBerater(beraterId, tenantId);
      if (!result.ok) {
        // Rollback bei Fehler
        setAssignedSet((prev) => {
          const next = new Set(prev);
          if (nextChecked) next.delete(key);
          else next.add(key);
          return next;
        });
      }
      setPendingKey(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Berater</h1>
        <p className="mt-1 text-sm text-slate-500">
          StrategAIze-Berater anlegen und Kanzleien bzw. Direkt-Kunden zuweisen.
          Mandanten einer Kanzlei folgen der Zuweisung automatisch.
        </p>
      </div>

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {/* Berater anlegen */}
      <Card>
        <CardHeader>
          <CardTitle>Neuen Berater anlegen</CardTitle>
          <CardDescription>
            Der Berater erhaelt eine Einladungs-E-Mail und setzt sein Passwort
            selbst. Der Account wird ohne feste Kanzlei-Zuordnung angelegt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <label
                htmlFor="berater_email"
                className="block text-sm font-medium text-slate-900"
              >
                E-Mail
                <span className="ml-1 text-red-600" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                id="berater_email"
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="off"
                placeholder="berater@strategaize.de"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isCreating}
              />
            </div>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? "Wird verschickt..." : "Einladung verschicken"}
            </Button>
          </form>

          {createError && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>
                {CREATE_ERROR_MESSAGES[createError] ?? CREATE_ERROR_MESSAGES.unknown_error}
              </AlertDescription>
            </Alert>
          )}
          {createNotice && (
            <Alert className="mt-4">
              <AlertDescription>{createNotice}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Berater-Liste + Zuweisungen */}
      <Card>
        <CardHeader>
          <CardTitle>Berater &amp; Zuweisungen</CardTitle>
          <CardDescription>
            {berater.length === 0
              ? "Noch keine Berater angelegt."
              : `${berater.length} Berater.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {berater.length === 0 ? (
            <p className="text-sm text-slate-500">
              Lege oben einen neuen Berater an.
            </p>
          ) : (
            berater.map((b) => (
              <div
                key={b.id}
                className="rounded-lg border border-slate-200 p-4"
              >
                <div className="mb-3">
                  <div className="font-medium text-slate-900">{b.email}</div>
                  <div className="text-xs text-slate-500">
                    Angelegt {formatDate(b.createdAt)}
                  </div>
                </div>

                {tenants.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Keine zuweisbaren Kanzleien oder Direkt-Kunden vorhanden.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {tenants.map((t) => {
                      const key = assignKey(b.id, t.id);
                      const checked = assignedSet.has(key);
                      return (
                        <label
                          key={t.id}
                          className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={pendingKey === key}
                            onChange={(e) => onToggle(b.id, t.id, e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-brand-primary focus:ring-brand-primary"
                          />
                          <span className="text-slate-900">{t.name}</span>
                          <span className="ml-auto text-xs text-slate-400">
                            {t.kindLabel}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
