import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BridgeProposalList } from "./BridgeProposalList";
import { BridgeRunList } from "./BridgeRunList";
import { StaleBanner } from "./StaleBanner";
import { TriggerBridgeButton } from "./TriggerBridgeButton";
import type {
  BridgeProposalRow,
  BridgeRunRow,
  EmployeeRow,
} from "./types";

/**
 * SLC-036 — Bridge-Review-UI fuer tenant_admin / strategaize_admin.
 *
 * Datenfluss:
 *   1. Auth + Role-Check (defense-in-depth, Layout prueft bereits).
 *   2. Lade juengste GF-capture_session (owner_user_id=user.id, capture_mode != 'employee_questionnaire').
 *   3. Lade alle bridge_runs der Session (order by created_at desc).
 *   4. Lade Proposals des juengsten Run inkl. Employee-Lookup.
 *   5. Lade aktive Employees des Tenants fuer Edit-Dialog Dropdown.
 *
 * Empty-States:
 *   - Keine GF-Session -> Hinweis + Link auf /capture/new.
 *   - GF-Session ohne Run -> Trigger-Button + Erklaerungstext.
 *   - Run ohne Proposals -> Empty-Card.
 *   - Run laeuft -> Hinweis + Auto-Refresh-Note.
 */

export default async function AdminBridgePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !["tenant_admin", "strategaize_admin"].includes(profile.role) ||
    !profile.tenant_id
  ) {
    redirect("/dashboard");
  }

  // Juengste GF-capture_session des aktuellen Admins.
  // capture_mode kann NULL sein (Legacy-Sessions vor V4) — `!= 'employee_questionnaire'`
  // alleine wuerde NULL-Rows herausfiltern (Postgres NULL-Vergleich ist UNKNOWN).
  // Daher .or() mit explizitem IS NULL als Inklusion.
  const { data: sessionData } = await supabase
    .from("capture_session")
    .select("id, capture_mode, status, started_at")
    .eq("tenant_id", profile.tenant_id)
    .eq("owner_user_id", user.id)
    .or("capture_mode.is.null,capture_mode.neq.employee_questionnaire")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sessionData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Bridge</h1>
          <p className="mt-1 text-sm text-slate-500">
            Verteile Folge-Aufgaben aus deiner GF-Erhebung an dein Team.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Noch keine GF-Erhebung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">
              Bridge schlaegt Folge-Aufgaben fuer dein Team vor, sobald du Bloecke einer Erhebung
              abgeschlossen hast. Starte zuerst eine eigene Erhebung.
            </p>
            <Link
              href="/capture/new"
              className="inline-flex h-9 items-center rounded-md bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-dark"
            >
              Neue Erhebung starten
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const captureSessionId = sessionData.id as string;

  // Alle bridge_runs der Session
  const { data: runsData } = await supabase
    .from("bridge_run")
    .select(
      "id, capture_session_id, status, proposal_count, cost_usd, error_message, generated_by_model, created_at, completed_at"
    )
    .eq("capture_session_id", captureSessionId)
    .order("created_at", { ascending: false });

  const runs = (runsData ?? []) as BridgeRunRow[];
  const latestRun = runs[0] ?? null;

  // Proposals des juengsten Runs
  let proposals: BridgeProposalRow[] = [];
  if (latestRun) {
    const { data: proposalsData } = await supabase
      .from("bridge_proposal")
      .select(
        "id, bridge_run_id, proposal_mode, source_subtopic_key, proposed_block_title, proposed_block_description, proposed_questions, proposed_employee_user_id, proposed_employee_role_hint, status, approved_capture_session_id, reject_reason, created_at, updated_at"
      )
      .eq("bridge_run_id", latestRun.id)
      .order("created_at", { ascending: true });

    proposals = (proposalsData ?? []) as BridgeProposalRow[];
  }

  // Aktive Employees des Tenants (fuer Edit-Dialog Dropdown)
  const { data: employeesData } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("tenant_id", profile.tenant_id)
    .eq("role", "employee")
    .order("created_at", { ascending: false });

  const employees = (employeesData ?? []) as EmployeeRow[];

  const isStale = latestRun?.status === "stale";
  const isRunning = latestRun?.status === "running";
  const hasPreviousRun = !!latestRun;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Bridge</h1>
          <p className="mt-1 text-sm text-slate-500">
            Folge-Aufgaben aus deiner GF-Erhebung an dein Team verteilen.
          </p>
        </div>
        <TriggerBridgeButton
          captureSessionId={captureSessionId}
          hasPreviousRun={hasPreviousRun}
          disabled={isRunning}
        />
      </div>

      {isStale && <StaleBanner captureSessionId={captureSessionId} />}

      {isRunning && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Bridge-Lauf wird im Hintergrund verarbeitet (typischerweise 30-60s). Lade die Seite in Kuerze neu.
        </div>
      )}

      <BridgeRunList runs={runs} />

      {latestRun && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              Vorschlaege aus dem juengsten Lauf
            </h2>
            <span className="text-xs text-slate-500">
              {proposals.length} {proposals.length === 1 ? "Vorschlag" : "Vorschlaege"}
            </span>
          </div>
          <BridgeProposalList proposals={proposals} employees={employees} />
        </div>
      )}

      {!latestRun && (
        <Card>
          <CardHeader>
            <CardTitle>Noch kein Bridge-Lauf</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">
              Sobald du eigene Bloecke abgeschlossen hast, kannst du den ersten Bridge-Lauf starten.
              Bridge analysiert deine Antworten und schlaegt Folge-Aufgaben fuer dein Team vor.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
