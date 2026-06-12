// V9 SLC-165 MT-5 — Worker job-type constants for the bulk-email pipeline.
//
// Pre-Declaration of ALL four V9 job types so SLC-166 + SLC-167 don't have to
// touch this file later. Only the parse-handler is wired in SLC-165; the other
// three constants exist for grep-ability and to keep the SLC-166/167 patch
// minimal.
//
// The string literals also appear in:
//   - src/app/dashboard/bulk-email-import/helpers.ts (re-exported as
//     JOB_TYPE_EMAIL_BULK_PARSE for the server-action enqueue path)
//   - src/workers/condensation/claim-loop.ts (JOB_TYPES round-robin list)
// Keep these three places in sync if a value ever changes.

export const JOB_TYPE_EMAIL_BULK_PARSE = "email_bulk_parse" as const;
export const JOB_TYPE_EMAIL_BULK_PRE_FILTER = "email_bulk_pre_filter" as const;
export const JOB_TYPE_EMAIL_BULK_THREAD_REDACT = "email_bulk_thread_redact" as const;
export const JOB_TYPE_EMAIL_BULK_PATTERN_EXTRACT = "email_bulk_pattern_extract" as const;
// V9.5 SLC-V9.5-B (FEAT-080): Cross-Thread-Synthese-Stage. 3-Stellen-Sync mit
// claim-loop.ts JOB_TYPES-Array + run.ts-Registrierung (siehe R-B-5).
export const JOB_TYPE_EMAIL_BULK_SYNTHESIS = "email_bulk_synthesis" as const;

export type BulkEmailJobType =
  | typeof JOB_TYPE_EMAIL_BULK_PARSE
  | typeof JOB_TYPE_EMAIL_BULK_PRE_FILTER
  | typeof JOB_TYPE_EMAIL_BULK_THREAD_REDACT
  | typeof JOB_TYPE_EMAIL_BULK_PATTERN_EXTRACT
  | typeof JOB_TYPE_EMAIL_BULK_SYNTHESIS;
