// Zod-Schema fuer V5 Option 2 Stufe 2 Schritt-Extraktion (SLC-077 MT-2).
//
// Validiert den Bedrock-JSON-Output des step_extract-Prompts. Strukturelle Drift wird
// hier abgefangen, BEVOR Worker-Code in walkthrough_step persistiert.
//
// transcript_offset_start/_end werden NICHT vom LLM erwartet — sie sind unzuverlaessig
// per LLM zu ermitteln. Der Worker berechnet sie deterministisch via
// `originalText.indexOf(snippet)` aus dem redacted-Body.

import { z } from "zod";

export const StepExtractItemSchema = z.object({
  step_number: z.number().int().min(1),
  action: z.string().min(1),
  responsible: z.string().min(1).optional().nullable(),
  timeframe: z.string().min(1).optional().nullable(),
  success_criterion: z.string().min(1).optional().nullable(),
  dependencies: z.string().min(1).optional().nullable(),
  transcript_snippet: z.string().min(1),
});

export const StepExtractArraySchema = z.array(StepExtractItemSchema);

export type StepExtractItem = z.infer<typeof StepExtractItemSchema>;
export type StepExtractArray = z.infer<typeof StepExtractArraySchema>;
