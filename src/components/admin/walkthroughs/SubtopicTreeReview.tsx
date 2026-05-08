// SLC-079 MT-3 — Block-grouped Subtopic-Tree mit zugeordneten walkthrough_step.
// Server Component — kein State.
//
// DEC-092: Subtopic-Schicht ist `blocks[].questions[].unterbereich`-String,
// gruppiert pro Block. Compact-Default: nur Subtopics mit ≥1 Mapping werden
// expanded gezeigt; leere Subtopics + Blocks komplett ausgeblendet.
//
// Pattern-Reuse FEAT-023 BridgeReviewTree (V4) in Reverse-Direction:
// statt Subtopic → Mitarbeiter-Aufgabe rendern wir Subtopic ← walkthrough_step.

import { StepCard, type StepCardData, type StepMappingMeta } from "./StepCard";
import type { SubtopicOption } from "./MoveStepDropdown";

interface TemplateBlockJson {
  key?: string;
  title?: Record<string, string> | string;
  questions?: Array<{ unterbereich?: string; sop_trigger?: boolean }>;
}

export interface SubtopicTreeStep extends StepCardData {
  mapping: StepMappingMeta | null;
}

interface Props {
  templateBlocks: unknown;
  steps: SubtopicTreeStep[];
  subtopicOptions: SubtopicOption[];
}

interface BlockRender {
  blockKey: string;
  blockTitle: string;
  subtopics: Array<{ subtopic_id: string; steps: SubtopicTreeStep[] }>;
}

function blockTitle(title: TemplateBlockJson["title"], fallback: string): string {
  if (typeof title === "string" && title.trim().length > 0) return title;
  if (title && typeof title === "object") {
    const de = (title as Record<string, string>).de;
    const en = (title as Record<string, string>).en;
    return de ?? en ?? fallback;
  }
  return fallback;
}

/**
 * Gruppiert Steps pro Block + unterbereich. Zeigt nur Subtopics mit ≥1
 * gemapptem Step (Compact-Default — Empfehlung 1, User-OK in /frontend SLC-079).
 */
function buildBlockTree(
  blocks: unknown,
  steps: SubtopicTreeStep[],
): BlockRender[] {
  if (!Array.isArray(blocks)) return [];

  // Index Steps nach mapping.subtopic_id
  const stepsBySubtopic = new Map<string, SubtopicTreeStep[]>();
  for (const step of steps) {
    const sid = step.mapping?.subtopic_id;
    if (!sid) continue; // unmapped Steps gehen in UnmappedBucket
    const arr = stepsBySubtopic.get(sid) ?? [];
    arr.push(step);
    stepsBySubtopic.set(sid, arr);
  }

  const result: BlockRender[] = [];
  for (const rawBlock of blocks) {
    const block = rawBlock as TemplateBlockJson | null;
    if (!block || typeof block !== "object") continue;
    const bKey = typeof block.key === "string" ? block.key : "?";
    const bTitle = blockTitle(block.title, bKey);
    const questions = Array.isArray(block.questions) ? block.questions : [];

    // Unique unterbereich-Werte mit ≥1 mapped Step
    const subtopicSet = new Set<string>();
    for (const q of questions) {
      const ub = q?.unterbereich;
      if (typeof ub === "string" && ub.trim().length > 0) {
        subtopicSet.add(ub.trim());
      }
    }

    const subtopics: BlockRender["subtopics"] = [];
    for (const sid of Array.from(subtopicSet).sort()) {
      const stepsHere = stepsBySubtopic.get(sid);
      if (!stepsHere || stepsHere.length === 0) continue;
      stepsHere.sort((a, b) => a.step_number - b.step_number);
      subtopics.push({ subtopic_id: sid, steps: stepsHere });
    }
    if (subtopics.length === 0) continue;

    result.push({ blockKey: bKey, blockTitle: bTitle, subtopics });
  }
  return result;
}

export function SubtopicTreeReview({
  templateBlocks,
  steps,
  subtopicOptions,
}: Props) {
  const tree = buildBlockTree(templateBlocks, steps);

  if (tree.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
        <p className="text-sm text-slate-600">
          Keine Schritte sind aktuell einem Subtopic zugeordnet.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Schritte unten im Unmapped-Bucket koennen via Verschieben einem Subtopic zugewiesen werden.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="subtopic-tree-review">
      {tree.map((block) => (
        <section key={block.blockKey} className="space-y-3">
          <h3 className="text-base font-semibold text-slate-900">
            <span className="mr-2 rounded bg-slate-200 px-1.5 py-0.5 font-mono text-xs text-slate-700">
              {block.blockKey}
            </span>
            {block.blockTitle}
          </h3>
          <div className="space-y-3 border-l-2 border-slate-200 pl-4">
            {block.subtopics.map((sub) => (
              <div key={sub.subtopic_id} className="space-y-2">
                <h4 className="text-sm font-medium text-slate-700">
                  {sub.subtopic_id}
                  <span className="ml-2 text-xs text-slate-400">
                    ({sub.steps.length} {sub.steps.length === 1 ? "Schritt" : "Schritte"})
                  </span>
                </h4>
                <div className="space-y-2">
                  {sub.steps.map((step) => (
                    <StepCard
                      key={step.id}
                      step={step}
                      mapping={step.mapping}
                      subtopicOptions={subtopicOptions}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
