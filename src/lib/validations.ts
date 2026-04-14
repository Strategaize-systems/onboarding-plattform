import { z } from "zod";

// === Admin: Tenants ===

export const createTenantSchema = z.object({
  name: z
    .string()
    .min(2, "Name muss mindestens 2 Zeichen lang sein")
    .max(100, "Name darf maximal 100 Zeichen lang sein"),
  language: z.enum(["de", "en", "nl"]).default("de"),
});

export const inviteTenantUserSchema = z.object({
  email: z.string().email("Ungültige E-Mail-Adresse"),
  role: z.enum(["tenant_admin", "tenant_member", "mirror_respondent"]).optional().default("tenant_member"),
  allowedBlocks: z.array(z.enum(["A", "B", "C", "D", "E", "F", "G", "H", "I"])).optional(),
  respondentLayer: z.enum(["owner", "leadership_1", "leadership_2", "key_staff"]).optional(),
  surveyType: z.enum(["management", "mirror"]).optional().default("management"),
});

// === Tenant: Mirror Nominations ===

export const createNominationSchema = z.object({
  name: z.string().min(2, "Name muss mindestens 2 Zeichen lang sein").max(100),
  email: z.string().email("Ungültige E-Mail-Adresse"),
  respondent_layer: z.enum(["leadership_1", "leadership_2", "key_staff"]),
  department: z.string().min(1, "Abteilung darf nicht leer sein").max(100),
});

export const updateNominationSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  respondent_layer: z.enum(["leadership_1", "leadership_2", "key_staff"]).optional(),
  department: z.string().min(1).max(100).optional(),
});

// === Admin: Runs ===

export const createRunSchema = z.object({
  tenant_id: z.string().uuid("Ungültige Tenant-ID"),
  catalog_snapshot_id: z.string().uuid("Ungültige Katalog-Snapshot-ID"),
  survey_type: z.enum(["management", "mirror"]).optional().default("management"),
  title: z
    .string()
    .min(1, "Titel darf nicht leer sein")
    .max(200, "Titel darf maximal 200 Zeichen lang sein"),
  description: z.string().max(2000).optional().nullable(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format YYYY-MM-DD").optional().nullable(),
});

// === Admin: Catalog Import ===

const questionImportItem = z.object({
  frage_id: z.string().min(1, "frage_id darf nicht leer sein"),
  block: z.enum(["A", "B", "C", "D", "E", "F", "G", "H", "I"]),
  ebene: z.enum(["Kern", "Workspace"]),
  unterbereich: z.string().min(1),
  fragetext: z.string().min(1),
  owner_dependency: z.boolean().default(false),
  deal_blocker: z.boolean().default(false),
  sop_trigger: z.boolean().default(false),
  ko_hart: z.boolean().default(false),
  ko_soft: z.boolean().default(false),
  block_weight: z.number().min(0).max(9.9),
  position: z.number().int().min(1),
});

export type QuestionImportItem = z.infer<typeof questionImportItem>;

export const importCatalogSchema = z.object({
  version: z.string().min(1, "Version darf nicht leer sein"),
  blueprint_version: z.string().min(1, "Blueprint-Version darf nicht leer sein"),
  language: z.enum(["de", "en", "nl"]).default("de"),
  survey_type: z.enum(["management", "mirror"]).optional().default("management"),
  questions: z
    .array(questionImportItem)
    .min(1, "Mindestens eine Frage erforderlich"),
});

// === Tenant: Question Events ===

const answerSubmittedPayload = z.object({
  text: z.string().min(1).max(10000, "Antwort darf maximal 10.000 Zeichen lang sein"),
});

const noteAddedPayload = z.object({
  text: z.string().min(1).max(10000, "Notiz darf maximal 10.000 Zeichen lang sein"),
});

const evidenceAttachedPayload = z.object({
  evidence_item_id: z.string().uuid(),
});

const statusChangedPayload = z.object({
  from: z.string(),
  to: z.string(),
});

export const createEventSchema = z
  .object({
    client_event_id: z.string().uuid("client_event_id muss eine gültige UUID sein"),
    event_type: z.enum([
      "answer_submitted",
      "note_added",
      "evidence_attached",
      "status_changed",
    ]),
    payload: z.record(z.string(), z.unknown()),
  })
  .superRefine((data, ctx) => {
    const { event_type, payload } = data;

    let result;
    switch (event_type) {
      case "answer_submitted":
        result = answerSubmittedPayload.safeParse(payload);
        break;
      case "note_added":
        result = noteAddedPayload.safeParse(payload);
        break;
      case "evidence_attached":
        result = evidenceAttachedPayload.safeParse(payload);
        break;
      case "status_changed":
        result = statusChangedPayload.safeParse(payload);
        break;
    }

    if (result && !result.success) {
      result.error.issues.forEach((issue) => {
        ctx.addIssue({
          ...issue,
          path: ["payload", ...issue.path],
        });
      });
    }
  });

// === Tenant: Evidence ===

export const EVIDENCE_LABELS = [
  "policy", "process", "template", "contract", "financial",
  "legal", "system", "org", "kpi", "other",
] as const;

export const EVIDENCE_RELATIONS = [
  "proof", "supports", "example", "supersedes",
] as const;

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "image/png",
  "image/jpeg",
] as const;

export const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB

export const createEvidenceNoteSchema = z.object({
  item_type: z.literal("note"),
  note_text: z
    .string()
    .min(1, "Notiz darf nicht leer sein")
    .max(10000, "Notiz darf maximal 10.000 Zeichen lang sein"),
  label: z.enum(EVIDENCE_LABELS),
  question_id: z.string().uuid().optional().nullable(),
  relation: z.enum(EVIDENCE_RELATIONS).optional().nullable(),
});

export const createEvidenceLinkSchema = z.object({
  link_type: z.enum(["question", "run"]),
  link_id: z.string().uuid(),
  relation: z.enum(EVIDENCE_RELATIONS),
});

// === Tenant: Run Submit ===

export const runSubmitSchema = z.object({
  block: z.string().min(1).max(10),
  note: z.string().max(2000).optional().nullable(),
});

// === Auth: Login ===

export const loginSchema = z.object({
  email: z.string().email("Ungültige E-Mail-Adresse"),
  password: z.string().min(1, "Passwort darf nicht leer sein"),
});

export const setPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Passwort muss mindestens 8 Zeichen lang sein")
    .max(128),
});

// === Free-Form Chat (V3.2) ===

export const freeformChatSchema = z.object({
  message: z.string().min(1, "Nachricht darf nicht leer sein").max(10000),
  conversationId: z.string().uuid().optional(),
});

export const freeformMappingSchema = z.object({
  conversationId: z.string().uuid("conversationId muss eine gültige UUID sein"),
});

export const freeformAcceptDraftsSchema = z.object({
  conversationId: z.string().uuid("conversationId muss eine gültige UUID sein"),
  acceptedDrafts: z
    .array(
      z.object({
        questionId: z.string().min(1, "questionId darf nicht leer sein"),
        text: z.string().min(1, "Antworttext darf nicht leer sein").max(50000),
      })
    )
    .min(1, "Mindestens ein Draft muss ausgewählt sein"),
});
