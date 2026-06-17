# FEAT-086 — Stufe-1-Fahrplan-Report-Renderer (Standortbestimmung)

> **Status:** planned (Skeleton — Detail-Spec entsteht mit /architecture V9.75)
> **Version:** V9.75 · **Backlog:** BL-507 · **Created:** 2026-06-17 (RPT-480)

## Zweck
Der **einzige echt fehlende Renderer**: macht aus der bereits erzeugten Stufe-1-Diagnose ein **kundenseitiges, verkaufs-gerahmtes Deliverable**. Heute fliesst `block_diagnosis` nur ins Handbuch und `gap_questions` liegen nur in der DB. FEAT-086 gibt dem Chef (Stufe 1, allein) die priorisierte Standortbestimmung — die Landkarte, die den Upsell auf Stufe 2 traegt.

## Quelldaten (Schema-Grounding RPT-480)
- `block_diagnosis.content` (jsonb): `ampel` (green/yellow/red), `reifegrad` 0-10, `risiko` 0-10, `hebel` 0-10, `relevanz_90d` (high/medium/low); `status='confirmed'`.
- `block_checkpoint.quality_report` (jsonb, `OrchestratorOutput`): `coverage` (covered/missing_subtopics, ratio), `evidence_quality`, `gap_questions[]`, `recommendation` (sufficient/needs_backspelling/critical_gaps).

## In Scope (voll inkl. Verkaufs-Framing — Founder-Discovery)
- Reifegrad-Profil je Block/Subtopic (Ampel/Reifegrad/Risiko/Hebel).
- **Priorisierte Luecken-/To-Do-Liste** (pro Luecke: Aufwand S/M/L, Owner, naechster Schritt) aus `gap_questions` + `coverage`.
- Gedruckter **Scope-Satz** („Landkarte, nicht Handbuch").
- Pro Luecke die **Exit-Wert/Risiko-Kopplung** (warum „reicht mir" nicht stimmt).
- 1 **Muster-Handbuch-Sektion** (Substanz-Beweis) + **Scope-Schaetzung** fuers Voll-Engagement.
- Render-Stack: React-PDF-Reuse aus `src/lib/pdf/mandanten-report-v2/`.
- Tier-Gate: nur `blueprint` (und hoeher), nicht `free` (FEAT-085).

## Out of Scope
- Stufe-2-Upsell-Bruecke-Vorbefuellung (gap_questions → Stufe-2-Scope automatisch) — Folge-Feature.
- Neue Diagnose-/Orchestrator-Logik (reines Rendern vorhandener Daten).

## Akzeptanz (vorlaeufig)
- SC-V9.75-4/5 (PRD): Report rendert alle genannten Bloecke aus block_diagnosis + quality_report; verfuegbar ab `blueprint`, gated auf `free`.

## Offene /architecture-Fragen
Q-V9.75-D (Verkaufs-Framing-Felder Aufwand/Owner/naechster-Schritt + Exit-Kopplung: LLM-augmentiert vs getemplatet vs vereinfacht — R2, da nicht in den Daten), Q-V9.75-E (Ausgabeformat PDF vs Web vs beides).

## Reuse / Constraints
React-PDF (`mandanten-report-v2`), keine neue Diagnose-Logik. Falls LLM-Augmentation: Bedrock eu-central-1 ([[data-residency]]). SaaS-Mode.
