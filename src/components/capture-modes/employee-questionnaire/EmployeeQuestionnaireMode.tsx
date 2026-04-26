import { QuestionnaireWorkspace } from "@/app/capture/[sessionId]/block/[blockKey]/questionnaire-form";
import type { TemplateBlock, OwnerField } from "@/lib/db/template-queries";

interface CheckpointInfo {
  id: string;
  checkpoint_type: string;
  content_hash: string;
  created_at: string;
}

interface Props {
  sessionId: string;
  activeBlockKey: string;
  templateName: string;
  blocks: TemplateBlock[];
  ownerFields?: OwnerField[];
  savedAnswers: Record<string, string>;
  locale: string;
  existingCheckpoints: CheckpointInfo[];
}

/**
 * SLC-037 MT-1 — Employee-Questionnaire-Mode (Wrapper).
 *
 * Wrapped die bestehende `QuestionnaireWorkspace`-Komponente fuer den
 * Mitarbeiter-Flow. Aktuell duenne Schicht: setzt nur den `basePath` auf
 * '/employee/capture', sodass alle internen Links (Sidebar Block-Switch,
 * "Zurueck zur Uebersicht", Submit-Redirect) im Mitarbeiter-Bereich bleiben.
 *
 * Owner-Check (owner_user_id = auth.uid()) erfolgt in der Page-Component,
 * NICHT hier — defensive Trennung Auth/UI.
 *
 * SLC-038 koennte hier Mode-spezifisches UI ergaenzen (z.B. einen
 * Mitarbeiter-Header mit Aufgaben-Titel aus bridge_proposal). Fuer V4 reicht
 * die Pass-Through-Variante, da der QuestionnaireWorkspace-Header bereits
 * keine GF-spezifischen Elemente enthaelt.
 */
export function EmployeeQuestionnaireMode(props: Props) {
  return <QuestionnaireWorkspace {...props} basePath="/employee/capture" />;
}
