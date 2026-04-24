// SLC-035 MT-3 — Parser fuer Bridge-LLM-Outputs (Template-Refine + Free-Form)
//
// Claude Sonnet liefert normalerweise sauberes JSON wenn explizit gefordert.
// Dennoch Fallback fuer Code-Fences + defensive Validierung.

import type {
  BridgeQuestion,
  FreeFormOutput,
  FreeFormProposal,
  TemplateRefineOutput,
} from "./types";

function stripJsonFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```json")) s = s.slice(7);
  else if (s.startsWith("```")) s = s.slice(3);
  if (s.endsWith("```")) s = s.slice(0, -3);
  return s.trim();
}

function isUuidOrNull(v: unknown): v is string | null {
  if (v === null || v === undefined) return true;
  return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
}

function asOptionalString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function asQuestions(v: unknown): BridgeQuestion[] | null {
  if (!Array.isArray(v)) return null;
  const out: BridgeQuestion[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const q = item as Record<string, unknown>;
    const id = asOptionalString(q.id);
    const text = asOptionalString(q.text);
    if (!id || !text) continue;
    out.push({
      id,
      text,
      required: q.required === true ? true : q.required === false ? false : undefined,
    });
  }
  return out.length > 0 ? out : null;
}

export function parseTemplateRefineOutput(raw: string): TemplateRefineOutput {
  const cleaned = stripJsonFences(raw);
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  const employeeUserId = parsed.proposed_employee_user_id;
  if (!isUuidOrNull(employeeUserId)) {
    throw new Error("proposed_employee_user_id must be uuid or null");
  }

  return {
    proposed_employee_user_id: (employeeUserId as string | null) ?? null,
    proposed_employee_role_hint: asOptionalString(parsed.proposed_employee_role_hint),
    adjusted_title: asOptionalString(parsed.adjusted_title),
    adjusted_description: asOptionalString(parsed.adjusted_description),
    adjusted_questions: asQuestions(parsed.adjusted_questions),
  };
}

export function parseFreeFormOutput(raw: string): FreeFormOutput {
  const cleaned = stripJsonFences(raw);
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  const proposalsRaw = parsed.proposals;
  if (!Array.isArray(proposalsRaw)) {
    throw new Error("proposals must be array");
  }

  const proposals: FreeFormProposal[] = [];
  for (const item of proposalsRaw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;

    const title = asOptionalString(p.block_title);
    const questions = asQuestions(p.questions);
    if (!title || !questions || questions.length < 2) continue;

    const employeeUserId = p.proposed_employee_user_id;
    if (!isUuidOrNull(employeeUserId)) {
      // Fehlerhafte uuid ignorieren, Proposal beibehalten ohne user
      proposals.push({
        block_title: title,
        description: asOptionalString(p.description) ?? undefined,
        questions,
        proposed_employee_user_id: null,
        proposed_employee_role_hint: asOptionalString(p.proposed_employee_role_hint),
      });
      continue;
    }

    proposals.push({
      block_title: title,
      description: asOptionalString(p.description) ?? undefined,
      questions,
      proposed_employee_user_id: (employeeUserId as string | null) ?? null,
      proposed_employee_role_hint: asOptionalString(p.proposed_employee_role_hint),
    });
  }

  return { proposals };
}
