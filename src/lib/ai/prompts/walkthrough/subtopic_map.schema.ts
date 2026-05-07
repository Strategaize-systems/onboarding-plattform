// Zod-Schema fuer V5 Option 2 Stufe 3 Subtopic-Mapping (SLC-078 MT-2).
//
// Validiert den Bedrock-JSON-Output des subtopic_map-Prompts. Strukturelle Drift wird
// hier abgefangen, BEVOR der Worker in walkthrough_review_mapping persistiert.
//
// subtopic_id ist String-Referenz auf einen unterbereich-Wert des Templates
// (DEC-085-Korrektur in /backend SLC-078). null = Unmapped-Bucket.

import { z } from "zod";

export const SubtopicMapItemSchema = z.object({
  step_id: z.string().min(1),
  subtopic_id: z.string().min(1).nullable(),
  confidence_score: z.number().min(0).max(1),
  reasoning: z.string().min(1),
});

export const SubtopicMapArraySchema = z.array(SubtopicMapItemSchema);

export type SubtopicMapItem = z.infer<typeof SubtopicMapItemSchema>;
export type SubtopicMapArray = z.infer<typeof SubtopicMapArraySchema>;
