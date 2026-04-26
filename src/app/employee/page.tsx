import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * SLC-037 MT-3 — Mitarbeiter-Dashboard mit Aufgaben-Liste.
 *
 * Laedt alle eigenen capture_sessions (RLS filtert auf owner_user_id=auth.uid()
 * + role='employee') mit capture_mode='employee_questionnaire'. Status-Badges
 * leiten sich aus block_checkpoint-Counts ab (open/in_progress/submitted).
 *
 * Empty-State zeigt "Noch keine Aufgaben". Layout-Chrome (Header + Logout)
 * kommt aus /employee/layout.tsx.
 */

interface SessionWithProgress {
  id: string;
  status: string;
  template_name: string;
  created_at: string;
  total_blocks: number;
  submitted_blocks: number;
  task_state: "open" | "in_progress" | "submitted";
}

const TASK_STATE_CONFIG: Record<
  SessionWithProgress["task_state"],
  { label: string; color: string; bg: string; cta: string }
> = {
  open: {
    label: "Offen",
    color: "text-slate-600",
    bg: "bg-slate-100",
    cta: "Starten",
  },
  in_progress: {
    label: "In Arbeit",
    color: "text-amber-700",
    bg: "bg-amber-100",
    cta: "Fortsetzen",
  },
  submitted: {
    label: "Eingereicht",
    color: "text-emerald-700",
    bg: "bg-emerald-100",
    cta: "Ansehen",
  },
};

export default async function EmployeePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Layout stellt sicher dass user existiert und role='employee'
  const email = user?.email ?? "";
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single()
    : { data: null };

  const { data: tenant } = profile?.tenant_id
    ? await supabase
        .from("tenants")
        .select("name")
        .eq("id", profile.tenant_id)
        .single()
    : { data: null };

  const tenantName = tenant?.name ?? "deinem Unternehmen";

  // Aufgaben laden — RLS filtert auf owner_user_id=auth.uid()
  // (capture_session_employee_own Policy aus Migration 075).
  const tasks: SessionWithProgress[] = [];
  if (user) {
    const { data: sessions } = await supabase
      .from("capture_session")
      .select("id, status, template_id, created_at")
      .eq("capture_mode", "employee_questionnaire")
      .order("created_at", { ascending: false });

    for (const s of sessions ?? []) {
      const { data: tmpl } = await supabase
        .from("template")
        .select("name, blocks")
        .eq("id", s.template_id)
        .single();

      const totalBlocks = Array.isArray(tmpl?.blocks)
        ? (tmpl!.blocks as unknown[]).length
        : 0;

      const { data: cps } = await supabase
        .from("block_checkpoint")
        .select("block_key")
        .eq("capture_session_id", s.id);

      const submittedBlocks = new Set(
        (cps ?? []).map((c) => c.block_key)
      ).size;

      let taskState: SessionWithProgress["task_state"] = "open";
      if (submittedBlocks > 0 && submittedBlocks < totalBlocks) {
        taskState = "in_progress";
      } else if (submittedBlocks > 0 && submittedBlocks >= totalBlocks) {
        taskState = "submitted";
      }

      tasks.push({
        id: s.id,
        status: s.status,
        template_name: tmpl?.name ?? "Aufgabe",
        created_at: s.created_at,
        total_blocks: totalBlocks,
        submitted_blocks: submittedBlocks,
        task_state: taskState,
      });
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Willkommen bei {tenantName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{email}</p>
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Noch keine Aufgaben</CardTitle>
            <CardDescription>
              Sobald dein Administrator dir Aufgaben zuweist, siehst du sie hier.
              Du wirst per E-Mail benachrichtigt, wenn etwas fuer dich bereitsteht.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">
              Bis dahin musst du nichts weiter tun.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Deine Aufgaben ({tasks.length})
          </h2>
          {tasks.map((t) => {
            const cfg = TASK_STATE_CONFIG[t.task_state];
            return (
              <Link
                key={t.id}
                href={`/employee/capture/${t.id}`}
                className="block"
              >
                <Card className="hover:border-primary/30 hover:shadow-md transition-all cursor-pointer">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-4">
                      <CardTitle className="text-base truncate">
                        {t.template_name}
                      </CardTitle>
                      <span
                        className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color} flex-shrink-0`}
                      >
                        {cfg.label}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {t.submitted_blocks}/{t.total_blocks} Bl
                      {t.total_blocks === 1 ? "ock" : "öcke"} eingereicht
                    </p>
                    <span className="text-sm font-medium text-primary">
                      {cfg.cta} →
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
