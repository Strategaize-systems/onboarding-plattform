// V7.1 SLC-138 MT-6 — Per-Frage Helper-Edit-Page (FEAT-057).
//
// Server-Component. strategaize_admin editiert helper_text + examples_md
// pro Frage via EditableText. Speichert Override mit Scope global in
// text_override-Tabelle (SLC-136 Foundation). JSONB-Default (Migration 099a)
// bleibt als Fallback erhalten — Reset im EditableText loescht den Override.
//
// keyPath-Konvention identisch zu HelperTextModal (helper-text-modal-logic.ts):
//   template.partner_diagnostic.question.<questionKey>.helper_text
//   template.partner_diagnostic.question.<questionKey>.examples_md

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TextOverrideProvider } from "@/components/text-override/Provider";
import { EditableText } from "@/components/text-override/EditableText";
import { buildHelperKeyPaths } from "@/components/diagnose/helper-text-modal-logic";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";
import type { TemplateBlock } from "@/workers/condensation/light-pipeline";
import type { UserRole } from "@/types/db";

interface PageProps {
  params: Promise<{ questionKey: string }>;
}

export const metadata = {
  title: "Admin · Helper-Text bearbeiten | Strategaize",
};

export default async function AdminHelperEditPage(props: PageProps) {
  const { questionKey: rawKey } = await props.params;
  const questionKey = decodeURIComponent(rawKey);

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
  let blockTitle = "";
  let questionText = "";
  let helperDefault = "";
  let examplesDefault = "";
  let foundQuestion = false;
  let blockIndex = -1;
  let qIndex = -1;
  outer: for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    for (let qi = 0; qi < block.questions.length; qi++) {
      if (block.questions[qi].key === questionKey) {
        blockTitle = block.title;
        questionText = block.questions[qi].text;
        helperDefault = block.questions[qi].helper_text ?? "";
        examplesDefault = block.questions[qi].examples_md ?? "";
        blockIndex = bi;
        qIndex = qi;
        foundQuestion = true;
        break outer;
      }
    }
  }
  if (!foundQuestion) notFound();

  const { helperTextKey, examplesMdKey } = buildHelperKeyPaths(
    "partner_diagnostic",
    questionKey,
  );

  return (
    // partnerOrgId=null + locale="de" — strategaize_admin editiert global (DEC-140).
    <TextOverrideProvider partnerOrgId={null} locale="de">
      <div className="space-y-6">
        <div>
          <Link
            href="/admin/templates/partner-diagnostic"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Zurueck zur Uebersicht
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            Frage {blockIndex + 1}.{qIndex + 1} · Helper-Text bearbeiten
          </h1>
          <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
            Baustein: {blockTitle}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Frage-Text (read-only)</CardTitle>
            <CardDescription>
              Frage-Label wird in der Bauplan-Migration verwaltet. Hier nur Helper-
              und Beispiel-Texte editierbar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700">{questionText}</p>
            <p className="mt-2 text-xs font-mono text-slate-400">
              question_key: {questionKey}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Definition (helper_text)</CardTitle>
            <CardDescription>
              Plain-Text. Max 300 Zeichen (DB-Trigger validiert). Pencil-Icon
              oeffnet Modal-Editor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EditableText
              keyPath={helperTextKey}
              defaultText={helperDefault}
              scope="global"
              multiline
              as="p"
              className="whitespace-pre-line text-sm text-slate-700"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Beispiele (examples_md)</CardTitle>
            <CardDescription>
              Markdown-Subset (bold, italic, Listen, Links). Max 800 Zeichen.
              Pencil-Icon oeffnet Modal-Editor mit Markdown-Preview-Toggle.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EditableText
              keyPath={examplesMdKey}
              defaultText={examplesDefault}
              scope="global"
              multiline
              markdown
              as="div"
              className="text-sm text-slate-700"
            />
          </CardContent>
        </Card>
      </div>
    </TextOverrideProvider>
  );
}
