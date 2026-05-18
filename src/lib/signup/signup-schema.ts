/**
 * Zod-Schema fuer den V7 Public-Signup-Endpoint Body.
 *
 * SLC-132 MT-6 — `POST /api/public/signup`. Wird von der Intelligence-
 * Plattform-Server-Side aufgerufen (nicht Browser direkt — Service-Key
 * lebt nur server-side per Architektur).
 *
 * Felder gemaess Architecture-Block "V7 Signup-Flow" Schritt 5:
 *   partner_slug, email, first_name, last_name, company_name?,
 *   dsgvo_consent_accepted: true, dsgvo_consent_text_version
 */

import { z } from "zod";

export const signupBodySchema = z.object({
  partner_slug: z
    .string()
    .min(1, "partner_slug must be non-empty")
    .max(60, "partner_slug must be <=60 chars (Migration 097 max-length)"),
  email: z
    .string()
    .email("invalid_email")
    .max(254, "email exceeds RFC 5321 limit"),
  first_name: z
    .string()
    .trim()
    .min(1, "first_name required")
    .max(100, "first_name exceeds 100 chars"),
  last_name: z
    .string()
    .trim()
    .min(1, "last_name required")
    .max(100, "last_name exceeds 100 chars"),
  company_name: z
    .string()
    .trim()
    .min(1)
    .max(200, "company_name exceeds 200 chars")
    .optional()
    .nullable(),
  dsgvo_consent_accepted: z.literal(true),
  dsgvo_consent_text_version: z
    .string()
    .min(1, "dsgvo_consent_text_version required")
    .max(40, "dsgvo_consent_text_version exceeds 40 chars"),
});

export type SignupBody = z.infer<typeof signupBodySchema>;
