# FEAT-085 — Tier-Gating (Stufen-Flag + server-side Capture/Job/Render-Gate)

> **Status:** planned (Skeleton — Detail-Spec entsteht mit /architecture V9.75)
> **Version:** V9.75 · **Backlog:** BL-506 · **Created:** 2026-06-17 (RPT-480)

## Zweck
Macht die 3-Stufen-Leiter durchsetzbar: ein **server-side erzwungenes** Stufen-Flag pro `capture_session` steuert, welche Capture-Modi, Worker-Jobs und Render-Outputs freigeschaltet sind. Schliesst als Nebenergebnis das offene **ISSUE-097** (Entitlement-Loch: Diagnose-Mandant = Voll-Kunde-Rolle, Voll-Funktionen nur per Menue-Hiding „versteckt").

## In Scope
- Neue Spalte `capture_session.tier` (`free`/`blueprint`/`handbook`) + Migration mit Default-Backfill (`handbook` fuer Bestands-Sessions, Backward-Compat).
- Gemeinsamer **server-side Guard-Helper**, gewired an alle Dispatch-Eintrittspunkte (Schema-Grounding RPT-480):
  - `rpc_create_block_checkpoint` (032) → `knowledge_unit_condensation`/`diagnosis_generation`
  - `rpc_enqueue_recondense_job` (047) → `recondense_with_gaps`
  - `src/app/admin/debrief/[sessionId]/[blockKey]/sop-actions.ts` → `sop_generation`
  - Dialogue-/Walkthrough-Trigger, Bulk-Email-Trigger, Handbook-Snapshot-Trigger
- **Defense-in-Depth im Worker**: verweigert gated `job_type` bei zu niedriger Session-Stufe (Backstop).
- Gating-Matrix nach Operativem Mapping §3 (capture_mode + job_type → Stufe).

## Out of Scope
- Billing / Self-Serve-Tier-Upgrade durch den Kunden (Tier-Wechsel = Berater/Admin-Aktion).
- Tier-Namen-Marketing-Finalisierung.

## Akzeptanz (vorlaeufig, → /architecture verfeinert)
- SC-V9.75-1/2/3 (PRD): tier-Spalte + server-side Ablehnung gated Jobs (Dispatch + Worker) + ISSUE-097 geschlossen, nachgewiesen per Bypass-Test pro Pfad (direkter RPC-/Action-Aufruf).
- Tenant-RLS auf tier-Spalte; Bestands-Sessions ohne Funktionsverlust.

## Offene /architecture-Fragen
Q-V9.75-A (Spalte/Werte/Default/wer-setzt), Q-V9.75-B (Gating-Matrix + Free-vs-V8-Teaser + recondense-Zuordnung), Q-V9.75-C (Enforcement-Layer: Guard-Helper an Dispatch + Worker-Defense).

## Reuse / Constraints
`assertRole`-Stil-Guard, Synthetic-ai_jobs-Worker-Pre-Check-Pattern ([[backend]]). Server-side BLOCKING (kein Nav-Hiding, vgl. BS V8.14 / security-audit-fable5-standard). SaaS-Mode TDD.
