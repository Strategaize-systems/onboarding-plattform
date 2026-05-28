// V7.1 SLC-136 MT-4 — Strategaize-Admin-Liste aller Text-Overrides.
//
// Liste rendert pro Row scope/scope_id/text_key/locale/text_value/updated_at +
// Reset-Button + History-Link. RLS-konform: partner_admin sieht nur global +
// template + own-partner; strategaize_admin sieht alles.
//
// Filter via Search-Params: ?scope=<global|template|partner>&partner_org=<uuid>
// &key_prefix=<string>&locale=<de|en|...>.
//
// Auth-Gate Defense-in-Depth: admin/layout pruefen Routen-Rolle; hier
// zusaetzlich Inline-Pruefung damit auch direkter URL-Aufruf abgewiesen wird.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { captureException } from "@/lib/logger";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OverrideRow } from "./components/OverrideRow";
import type { TextOverrideScope } from "@/lib/text-override/resolver";
import type { UserRole } from "@/types/db";

type SearchParams = {
  scope?: string;
  partner_org?: string;
  key_prefix?: string;
  locale?: string;
};

interface OverrideListRow {
  id: string;
  scope: TextOverrideScope;
  scope_id: string | null;
  text_key: string;
  text_value: string;
  locale: string;
  updated_at: string;
  updated_by: string;
}

const VALID_SCOPES: ReadonlyArray<TextOverrideScope> = ["global", "template", "partner"];
const EDITOR_ROLES: ReadonlyArray<UserRole> = ["strategaize_admin", "partner_admin"];

export default async function AdminTextOverridesPage(props: {
  searchParams?: Promise<SearchParams>;
}) {
  const searchParams = (await props.searchParams) ?? {};

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
  // Filter aus Search-Params parsen
  // ============================================================
  const scopeFilter =
    typeof searchParams.scope === "string" && VALID_SCOPES.includes(searchParams.scope as TextOverrideScope)
      ? (searchParams.scope as TextOverrideScope)
      : null;
  const partnerOrgFilter =
    typeof searchParams.partner_org === "string" && searchParams.partner_org.length > 0
      ? searchParams.partner_org
      : null;
  const keyPrefixFilter =
    typeof searchParams.key_prefix === "string" && searchParams.key_prefix.length > 0
      ? searchParams.key_prefix
      : null;
  const localeFilter =
    typeof searchParams.locale === "string" && searchParams.locale.length > 0
      ? searchParams.locale
      : null;

  // ============================================================
  // Query — RLS filtert nach Rolle. Kein createAdminClient hier,
  // damit partner_admin nur eigene Sichtbarkeit hat.
  // ============================================================
  let rows: OverrideListRow[] = [];
  let loadError: string | null = null;
  try {
    let query = supabase
      .from("text_override")
      .select("id, scope, scope_id, text_key, text_value, locale, updated_at, updated_by")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (scopeFilter) query = query.eq("scope", scopeFilter);
    if (partnerOrgFilter) query = query.eq("scope_id", partnerOrgFilter);
    if (keyPrefixFilter) query = query.like("text_key", `${keyPrefixFilter}%`);
    if (localeFilter) query = query.eq("locale", localeFilter);

    const { data, error } = await query;
    if (error) throw error;
    rows = (data ?? []) as OverrideListRow[];
  } catch (err) {
    captureException(err, {
      source: "admin/text-overrides/listPage",
      userId: user.id,
    });
    loadError = "Override-Liste konnte nicht geladen werden.";
  }

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Text-Overrides</h1>
        <p className="mt-1 text-sm text-slate-500">
          {role === "strategaize_admin"
            ? "Cross-Tenant Sicht ueber alle Override-Texte. Reset stellt den Default-Text wieder her."
            : "Eigene Partner-Overrides + globale/template-Texte (read-only)."}
        </p>
      </div>

      {/* Filter-Form als native HTML-Form mit GET (Search-Params) */}
      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
          <CardDescription>Search-Params, server-seitig gefiltert.</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <label className="space-y-1 text-xs text-slate-600">
              <span>Scope</span>
              <select
                name="scope"
                defaultValue={scopeFilter ?? ""}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">Alle</option>
                <option value="global">global</option>
                <option value="template">template</option>
                <option value="partner">partner</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-600">
              <span>Partner-Org UUID</span>
              <input
                type="text"
                name="partner_org"
                defaultValue={partnerOrgFilter ?? ""}
                placeholder="optional"
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-mono"
              />
            </label>
            <label className="space-y-1 text-xs text-slate-600">
              <span>Key-Prefix</span>
              <input
                type="text"
                name="key_prefix"
                defaultValue={keyPrefixFilter ?? ""}
                placeholder="z.B. diagnose."
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-mono"
              />
            </label>
            <label className="space-y-1 text-xs text-slate-600">
              <span>Locale</span>
              <input
                type="text"
                name="locale"
                defaultValue={localeFilter ?? ""}
                placeholder="de"
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="rounded-md bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-primary/90"
              >
                Anwenden
              </button>
              <Link
                href="/admin/text-overrides"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Reset
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      {loadError && (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-red-600">{loadError}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Overrides</CardTitle>
          <CardDescription>
            {rows.length === 0
              ? "Keine Overrides gefunden (im aktuellen Filter)."
              : `${rows.length} Override${rows.length === 1 ? "" : "s"} sichtbar.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="space-y-3 text-sm text-slate-600">
              <p>
                <strong>Keine Overrides aktiv.</strong> Diese Liste zeigt
                ausschliesslich Texte, die bereits manuell geaendert wurden —
                ein leerer Stand bedeutet: alle Pages laufen mit Default-Text.
              </p>
              <p>
                <strong>So aenderst du einen Default-Text:</strong> die
                editierbaren Texte sind direkt auf den jeweiligen Mandanten-Pages
                mit einem Pencil-Icon markiert. Wenn du als <code>strategaize_admin</code> oder
                <code>partner_admin</code> eingeloggt bist, klick das Pencil-Icon → Inline-Editor
                oeffnet sich.
              </p>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="mb-1 font-semibold text-slate-700">Editierbare Pages mit Pencil-Icons</div>
                <ul className="space-y-1">
                  <li>
                    <Link href="/dashboard/diagnose/start" className="text-brand-primary underline hover:no-underline">
                      /dashboard/diagnose/start
                    </Link>{" "}
                    — Mandanten-Welcome (Hero, 3-Schritte, CTA)
                  </li>
                  <li>
                    <span className="font-mono text-slate-700">/dashboard/diagnose/run/&lt;capture_session_id&gt;</span>
                    {" "}— Fragenkatalog (24 Frage-Labels)
                  </li>
                  <li>
                    <span className="font-mono text-slate-700">/dashboard/diagnose/&lt;capture_session_id&gt;/bericht</span>
                    {" "}— Bericht-Page (Block-Titel, Pflicht-Aussage-Footer)
                  </li>
                </ul>
                <div className="mt-2 text-slate-500">
                  Hinweis: Mandanten-Pages brauchen einen aktiven Mandanten-Tenant. Als
                  strategaize_admin kannst du dafuer Inkognito + Mandanten-Login (z.B.
                  einen Test-Mandant im Tenant „Privat") nutzen.
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Helper-Texts pro Diagnose-Frage werden separat editiert via{" "}
                <Link href="/admin/templates/partner-diagnostic" className="text-brand-primary underline hover:no-underline">
                  Helper-Texts
                </Link>
                {" "}in der Sidebar.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Text-Key</TableHead>
                  <TableHead>Wert (gekuerzt)</TableHead>
                  <TableHead>Locale</TableHead>
                  <TableHead>Zuletzt</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <OverrideRow
                    key={r.id}
                    id={r.id}
                    scope={r.scope}
                    scopeId={r.scope_id}
                    textKey={r.text_key}
                    textValue={r.text_value}
                    locale={r.locale}
                    updatedAt={r.updated_at}
                    updatedBy={r.updated_by}
                    canReset={
                      role === "strategaize_admin" ||
                      (role === "partner_admin" && r.scope === "partner")
                    }
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
