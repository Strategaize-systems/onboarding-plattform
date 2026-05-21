// V7.1 SLC-138 MT-6 — Admin-Uebersicht partner_diagnostic Helper-Texts (FEAT-057).
//
// Server-Component. strategaize_admin sieht eine Liste aller 24 Fragen mit
// kurzem Helper-Text-Preview + Link zur per-Frage-Edit-Page (helper/page.tsx).
// Reine Navigations-Hilfe — EditableText steht in der Per-Frage-Page.

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChevronRight } from "lucide-react";
import type { TemplateBlock } from "@/workers/condensation/light-pipeline";
import type { UserRole } from "@/types/db";

export const metadata = {
  title: "Admin · partner_diagnostic Helper-Texts | Strategaize",
};

export default async function AdminPartnerDiagnosticHelpersPage() {
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
  if (role !== "strategaize_admin") {
    redirect("/admin/tenants");
  }

  const admin = createAdminClient();
  const { data: template } = await admin
    .from("template")
    .select("blocks")
    .eq("slug", "partner_diagnostic")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!template) notFound();

  const blocks = template.blocks as TemplateBlock[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Helper-Texts — partner_diagnostic
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Pro Frage Definition (max 300 Zeichen) und Beispiele (Markdown, max 800
          Zeichen). Initial-Inhalt aus Migration 099a; Overrides speichern in
          text_override (Scope global). Mandanten-Modal zeigt Override vor Default.
        </p>
      </div>

      {blocks.map((block, blockIndex) => (
        <Card key={block.key}>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">
              Baustein {blockIndex + 1}: {block.title}
            </CardTitle>
            <CardDescription>
              {block.questions.length} Fragen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-slate-100">
              {block.questions.map((q, qIndex) => {
                const helper = q.helper_text ?? "";
                const preview =
                  helper.length > 140 ? `${helper.slice(0, 140)}…` : helper;
                return (
                  <li key={q.key}>
                    <Link
                      href={`/admin/templates/partner-diagnostic/questions/${encodeURIComponent(
                        q.key,
                      )}/helper`}
                      className="flex items-start gap-3 py-3 hover:bg-slate-50"
                    >
                      <span className="mt-0.5 inline-flex h-6 w-12 flex-none items-center justify-center rounded bg-slate-100 text-xs font-mono text-slate-600">
                        {blockIndex + 1}.{qIndex + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {q.text}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                          {preview || "— kein Helper-Text gesetzt —"}
                        </p>
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 flex-none text-slate-400" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
