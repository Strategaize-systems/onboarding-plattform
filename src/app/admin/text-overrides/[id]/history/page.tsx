// V7.1 SLC-136 MT-4 — History-Sub-Page pro Override-Row.
//
// Zeigt Audit-Trail (text_override_history) fuer EINE Override-Row. RLS-konform:
// partner_admin sieht nur own-partner-Audit; strategaize_admin sieht alles.

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { captureException } from "@/lib/logger";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TextOverrideScope } from "@/lib/text-override/resolver";
import type { UserRole } from "@/types/db";

interface HistoryRow {
  id: string;
  text_override_id: string | null;
  scope: TextOverrideScope;
  scope_id: string | null;
  text_key: string;
  locale: string;
  old_value: string | null;
  new_value: string | null;
  editor_id: string;
  editor_role: string;
  action: "create" | "update" | "delete";
  created_at: string;
}

const ACTION_VARIANTS: Record<HistoryRow["action"], "default" | "secondary" | "outline"> = {
  create: "default",
  update: "secondary",
  delete: "outline",
};

const ACTION_LABELS: Record<HistoryRow["action"], string> = {
  create: "angelegt",
  update: "geaendert",
  delete: "geloescht",
};

const EDITOR_ROLES: ReadonlyArray<UserRole> = ["strategaize_admin", "partner_admin"];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default async function AdminTextOverrideHistoryPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role as UserRole | undefined;
  if (!role || !EDITOR_ROLES.includes(role)) {
    redirect("/admin/tenants");
  }

  // ============================================================
  // Aktuelle Override-Row laden (Header-Kontext fuer History).
  // ============================================================
  const { data: currentOverride, error: ovrErr } = await supabase
    .from("text_override")
    .select("scope, scope_id, text_key, text_value, locale")
    .eq("id", id)
    .maybeSingle();

  if (ovrErr) {
    captureException(ovrErr, {
      source: "admin/text-overrides/[id]/history",
      userId: user.id,
      metadata: { override_id: id },
    });
  }

  // Falls Override geloescht ist, koennen wir die History trotzdem rendern
  // (history.text_override_id wird NULL bei action='delete', aber die alten
  // Update/Create-Rows haben die ID noch). Wir suchen daher auch ohne
  // currentOverride-Treffer weiter.
  let rows: HistoryRow[] = [];
  let loadError: string | null = null;
  try {
    // Wir filtern History bevorzugt ueber text_override_id. Falls die Row
    // geloescht wurde, kann man stattdessen ueber (text_key, scope, locale)
    // suchen — aber das ueberschreitet V7.1-Scope. Im V7.1 zeigen wir nur
    // History-Eintraege mit dieser konkreten override-id.
    const { data, error } = await supabase
      .from("text_override_history")
      .select(
        "id, text_override_id, scope, scope_id, text_key, locale, old_value, new_value, editor_id, editor_role, action, created_at",
      )
      .eq("text_override_id", id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    rows = (data ?? []) as HistoryRow[];
  } catch (err) {
    captureException(err, {
      source: "admin/text-overrides/[id]/history",
      userId: user.id,
      metadata: { override_id: id },
    });
    loadError = "Verlauf konnte nicht geladen werden.";
  }

  if (!currentOverride && rows.length === 0 && !loadError) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/text-overrides"
          className="text-sm text-slate-500 hover:underline"
        >
          ← Zurueck zur Liste
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          Verlauf
        </h1>
        {currentOverride ? (
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-mono">{currentOverride.text_key}</span> — Scope{" "}
            <Badge variant="secondary">{currentOverride.scope}</Badge> — Locale{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              {currentOverride.locale}
            </code>
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">
            Override-Row nicht mehr vorhanden (vermutlich geloescht). Verlauf-
            Eintraege werden ggf. nicht mehr verknuepft angezeigt.
          </p>
        )}
      </div>

      {loadError && (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-red-600">{loadError}</p>
          </CardContent>
        </Card>
      )}

      {currentOverride && (
        <Card>
          <CardHeader>
            <CardTitle>Aktueller Wert</CardTitle>
            <CardDescription>So wird der Text aktuell ausgespielt.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-800">
              {currentOverride.text_value}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Audit-Trail</CardTitle>
          <CardDescription>
            {rows.length === 0
              ? "Keine History-Eintraege gefunden."
              : `${rows.length} Eintrag${rows.length === 1 ? "" : "(e)"}, neueste zuerst.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">
              Eintraege erscheinen hier nach jeder Save/Reset-Aktion.
            </p>
          ) : (
            <ul className="space-y-4">
              {rows.map((h) => (
                <li
                  key={h.id}
                  className="border-l-2 border-slate-200 pl-4"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={ACTION_VARIANTS[h.action]}>
                      {ACTION_LABELS[h.action]}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {formatDateTime(h.created_at)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Editor: <code>{h.editor_id.slice(0, 8)}…</code> ({h.editor_role})
                  </div>
                  {h.old_value !== null && (
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-slate-600">
                        Alter Wert
                      </summary>
                      <pre className="mt-1 whitespace-pre-wrap rounded-md bg-rose-50 p-2 text-xs text-slate-800">
                        {h.old_value}
                      </pre>
                    </details>
                  )}
                  {h.new_value !== null && (
                    <details className="mt-1 text-sm" open={h.action !== "delete"}>
                      <summary className="cursor-pointer text-slate-600">
                        Neuer Wert
                      </summary>
                      <pre className="mt-1 whitespace-pre-wrap rounded-md bg-emerald-50 p-2 text-xs text-slate-800">
                        {h.new_value}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
