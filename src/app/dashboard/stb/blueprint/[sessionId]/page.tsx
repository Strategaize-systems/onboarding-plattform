import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCaptureSession } from "@/lib/db/capture-session-queries";
import { getTemplateById } from "@/lib/db/template-queries";
import { BlockList } from "@/app/capture/[sessionId]/block-list";
import type { BlockCheckpointInput } from "@/lib/capture/derive-block-status";
import { splitBlocksByStufe, modulBasePath } from "@/lib/stb-vertikale/modul-capture";
import {
  BLUEPRINT_BASE_PATH,
  ADAPTIVE_AMPEL_META_KEY,
  deriveVertiefungCouplings,
  coupledKernFrageIds,
  surfacedVertiefungFrageIds,
  filterAdaptiveBlocks,
  type Ampel,
} from "@/lib/stb-vertikale/blueprint";
import {
  parseRoutingMeta,
  deriveSubtopicAmpel,
  computeModuleRouting,
} from "@/lib/stb-vertikale/blueprint-routing";
import { SubtopicDiagnosisCard } from "@/components/stb/SubtopicDiagnosisCard";
import type { DiagnosisContent } from "@/workers/diagnosis/types";
import { BlueprintRevealButton } from "./reveal-button";

// Port-Vorbild: src/app/dashboard/stb/modul/[modulKey]/[sessionId]/page.tsx
// (SLC-173). Blueprint-Capture-Overview (SLC-172 MT-1). Adaptive Vertiefung
// (Choice A / DEC-249): die Stufe-2-Vertiefungsfragen erscheinen erst, wenn die
// gekoppelte Kern-Antwort gelb/rot bewertet wurde (R-172-2: Reveal auf
// Block-Ebene, die geteilte QuestionnaireWorkspace bleibt unangetastet).
// Env-gated via dashboard/stb/layout.

// Routing-Card: ein empfohlenes Modul. Verlinkt nur, wenn das Fachmodul-Template
// in dieser Version geseedet ist (sonst "geplant"-Badge statt 404-Link).
function ModuleChip({
  modulKey,
  role,
  available,
}: {
  modulKey: string;
  role: "primär" | "ergänzend";
  available: boolean;
}) {
  const label = modulKey.toUpperCase();
  const roleClass =
    role === "primär"
      ? "bg-brand-primary/10 text-brand-primary border-brand-primary/30"
      : "bg-slate-100 text-slate-600 border-slate-300";
  const inner = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${roleClass}`}
    >
      Modul {label}
      <span className="font-normal text-[10px] uppercase tracking-wide opacity-70">
        {role}
      </span>
      {!available && (
        <span className="font-normal text-[10px] text-slate-400">· geplant</span>
      )}
    </span>
  );
  return available ? (
    <Link href={modulBasePath(modulKey)} className="hover:opacity-80 transition-opacity">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export default async function StbBlueprintOverviewPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile) {
    redirect("/login");
  }

  const session = await getCaptureSession(supabase, sessionId);
  if (!session) {
    notFound();
  }
  // RLS schuetzt cross-tenant; expliziter Check = Defense-in-Depth.
  if (session.tenant_id !== profile.tenant_id) {
    notFound();
  }

  const template = await getTemplateById(supabase, session.template_id);
  if (!template) {
    notFound();
  }

  const { data: checkpoints } = await supabase
    .from("block_checkpoint")
    .select("block_key, checkpoint_type, created_at")
    .eq("capture_session_id", sessionId)
    .order("created_at", { ascending: false });

  const { data: kuCounts } = await supabase
    .from("knowledge_unit")
    .select("block_key")
    .eq("capture_session_id", sessionId);

  // Adaptive Ampeln aus dem JSONB-Stash lesen (Writer: assessAnswerAmpel /
  // assessBlueprintKernAnswers). getCaptureSession liefert metadata nicht.
  const { data: metaRow } = await supabase
    .from("capture_session")
    .select("metadata")
    .eq("id", sessionId)
    .maybeSingle();
  const kernAmpel =
    (((metaRow?.metadata ?? {}) as Record<string, unknown>)[
      ADAPTIVE_AMPEL_META_KEY
    ] as Record<string, Ampel> | undefined) ?? {};

  // --- Diagnose-Reader (MT-3): finale block_diagnosis-Rows je A–G ---
  const { data: diagnosisRows } = await supabase
    .from("block_diagnosis")
    .select("block_key, content")
    .eq("capture_session_id", sessionId)
    .order("block_key", { ascending: true });

  // Pro Block die neueste Diagnose (Query liefert nach block_key sortiert; bei
  // Mehrfach-Laeufen gewinnt der erste Treffer pro block_key — Re-Trigger loescht
  // alte pending Jobs, hier reicht der erste Eintrag je Block).
  const diagnosisByBlock = new Map<string, DiagnosisContent>();
  for (const row of diagnosisRows ?? []) {
    if (!diagnosisByBlock.has(row.block_key)) {
      diagnosisByBlock.set(row.block_key, row.content as DiagnosisContent);
    }
  }
  const diagnoses = [...diagnosisByBlock.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, content]) => content);
  const hasDiagnosis = diagnoses.length > 0;

  // Routing-Map (template.metadata.routing[], MIG-126) direkt lesen — getTemplateById
  // liefert metadata nicht garantiert (Zod-Strip). parseRoutingMeta ist Drift-tolerant.
  const { data: tmplMetaRow } = await supabase
    .from("template")
    .select("metadata")
    .eq("id", session.template_id)
    .maybeSingle();
  const routing = parseRoutingMeta(tmplMetaRow?.metadata);
  const subtopicAmpel = deriveSubtopicAmpel(diagnoses);
  const moduleRecs = computeModuleRouting(routing, subtopicAmpel);

  // Welche Fachmodul-Templates sind in V10 ueberhaupt geseedet? (Out-of-Scope:
  // nur M-04/05/06.) Nicht-geseedete Module werden ohne Link als "geplant" gezeigt,
  // statt auf eine 404-Modul-Seite zu verlinken.
  const { data: modulTemplates } = await supabase
    .from("template")
    .select("slug")
    .like("slug", "stb_modul_%");
  const availableModulKeys = new Set(
    (modulTemplates ?? [])
      .map((t) => t.slug.replace(/^stb_modul_/, ""))
      .filter((k) => /^m\d{2}$/.test(k))
  );

  const checkpointsByBlock = new Map<string, BlockCheckpointInput[]>();
  for (const cp of checkpoints ?? []) {
    if (!checkpointsByBlock.has(cp.block_key)) {
      checkpointsByBlock.set(cp.block_key, []);
    }
    checkpointsByBlock.get(cp.block_key)!.push({
      checkpoint_type:
        cp.checkpoint_type as BlockCheckpointInput["checkpoint_type"],
      created_at: cp.created_at,
    });
  }
  const kuBlockKeys = [...new Set((kuCounts ?? []).map((ku) => ku.block_key))];
  const checkpointsRecord = Object.fromEntries(checkpointsByBlock);

  // Adaptive Sichtbarkeit: Vertiefungsfragen nur, wenn ihre Kern-Frage gelb/rot
  // ist. Kern bleibt immer voll; leere (noch nicht freigeschaltete) Bloecke
  // fallen weg.
  const couplings = deriveVertiefungCouplings(template.blocks);
  const surfaced = surfacedVertiefungFrageIds(couplings, kernAmpel);
  const visibleBlocks = filterAdaptiveBlocks(template.blocks, surfaced);
  const { stufe1, stufe2 } = splitBlocksByStufe(visibleBlocks);

  // Reveal-Button ist sinnvoll, sobald eine gekoppelte Kern-Frage beantwortet
  // ist (sonst gibt es nichts zu bewerten).
  const coupledKern = new Set(coupledKernFrageIds(couplings));
  const answeredCoupledKern = template.blocks.some((b) =>
    b.questions.some(
      (q) =>
        coupledKern.has(q.frage_id) &&
        (session.answers[`${b.key}.${q.id}`] ?? "").trim().length > 0
    )
  );

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <Link
        href={BLUEPRINT_BASE_PATH}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        ← Blueprint-Übersicht
      </Link>

      <h1 className="text-2xl font-bold text-slate-900">{template.name}</h1>
      <p className="text-muted-foreground mt-1">
        Version {session.template_version} · Standortbestimmung für die eigene
        Kanzlei
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">
          Stufe 1 – Kern (der Gratis-Test)
        </h2>
        <BlockList
          blocks={stufe1}
          checkpointsByBlock={checkpointsRecord}
          kuBlockKeys={kuBlockKeys}
          sessionId={sessionId}
          basePath={BLUEPRINT_BASE_PATH}
        />
        {stufe1.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Keine Kern-Blöcke definiert.
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">
          Stufe 2 – Vertiefung (adaptiv)
        </h2>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-muted-foreground">
            Die Vertiefungsfragen gehören nicht zum automatischen Pfad. Die KI
            bohrt gezielt nur dort nach, wo eine Kern-Antwort gelb oder rot
            ergibt. Werten Sie Ihre Kern-Antworten aus, um relevante
            Vertiefungsfragen freizuschalten.
          </p>
          <div className="mt-4">
            <BlueprintRevealButton
              sessionId={sessionId}
              disabled={!answeredCoupledKern}
            />
          </div>
        </div>

        {stufe2.length > 0 ? (
          <div className="mt-4">
            <BlockList
              blocks={stufe2}
              checkpointsByBlock={checkpointsRecord}
              kuBlockKeys={kuBlockKeys}
              sessionId={sessionId}
              basePath={BLUEPRINT_BASE_PATH}
            />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {surfaced.length === 0 && answeredCoupledKern
              ? "Aktuell sind keine Vertiefungsfragen nötig – Ihre Kern-Antworten zeigen keinen Handlungsbedarf."
              : "Noch keine Vertiefungsfragen freigeschaltet."}
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">
          Standortbestimmung &amp; relevante Module
        </h2>

        {!hasDiagnosis ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-muted-foreground">
              Die Diagnose wird erstellt, sobald der Blueprint ausgewertet wurde.
              Sie zeigt je Unterthema Ampel, Reifegrad und Empfehlung – und leitet
              daraus die relevanten Fachmodule ab.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {diagnoses.map((d, idx) => (
                <SubtopicDiagnosisCard
                  key={d.block_key}
                  blockKey={d.block_key}
                  blockIndex={idx}
                  blockTitle={d.block_title}
                  subtopics={d.subtopics ?? []}
                />
              ))}
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-base font-semibold text-slate-900">
                Relevante Module
              </h3>
              {moduleRecs.length > 0 ? (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Aus den gelb/rot bewerteten Unterthemen abgeleitet – Ihr
                    konkreter Ansatzpunkt für die nächsten Schritte.
                  </p>
                  <ul className="mt-4 space-y-3">
                    {moduleRecs.map((rec) => (
                      <li
                        key={`${rec.block}-${rec.subtopic}`}
                        className="flex flex-col gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="text-sm text-slate-700">
                          {rec.subtopicName}
                        </span>
                        <span className="flex flex-wrap items-center gap-2">
                          <ModuleChip
                            modulKey={rec.primaryModulKey}
                            role="primär"
                            available={availableModulKeys.has(
                              rec.primaryModulKey
                            )}
                          />
                          {rec.secondaryModulKey && (
                            <ModuleChip
                              modulKey={rec.secondaryModulKey}
                              role="ergänzend"
                              available={availableModulKeys.has(
                                rec.secondaryModulKey
                              )}
                            />
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Kein akuter Modul-Bedarf – alle bewerteten Unterthemen sind grün.
                </p>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
