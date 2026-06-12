# FEAT-081 — Bounded Critic / Quality-Gate

- Status: planned
- Version: V9.5
- Created: 2026-06-12

## Purpose
Ein **bounded** Critic-Pass (genau 1 Durchlauf, DEC-216) ueber die von FEAT-080 erzeugten konsolidierten Units. Er prueft jede Unit gegen Belegdichte, Trivialitaet, Halluzination und Redundanz und verwirft Low-Quality-Units **bevor** sie in die GF-Curation gehen. Analyst↔Challenger-**Prinzip**, kein Konvergenz-Loop.

## Why it matters
Synthese kann ueber-mergen oder schwach belegte Aussagen erzeugen (R3). Ohne Gate verlagert sich diese Qualitaetspruefung komplett auf die manuelle GF-Curation. Der Critic ist die automatische erste Verteidigung, die den GF nur noch hochwertige Karten sehen laesst — bei harter, vorhersehbarer Pass-Obergrenze (kein Runaway-Cost).

## How it works
- Zweite LLM-Phase im selben `email_bulk_synthesis`-Worker (nach der Synthese-Phase, vor dem Persist).
- Critic-Pure-Function `bedrock-sonnet/email-critic.ts` + frischer Prompt (ARCHITECTURE §V9.5.7): **ein** Sonnet-Call ueber alle Draft-Units → Verdict `KEEP`/`REJECT` + Begruendung je Unit.
- Worker-Filter: Unit ueberlebt nur bei `verdict=KEEP` UND `evidence_count >= 2`; Rest verworfen + geloggt (Reduktions-Statistik).
- Cost: zaehlt in `synthesis_cost_eur` + Live-Cap (DEC-217); `ai_cost_ledger` role `email_bulk_critic`.

## In Scope
- Critic-Pure-Function + Prompt + Verdict-/Reject-Filter im Worker.
- /qa-Vorher/Nachher-Fixture (raw Patterns → konsolidierte Units → nach Critic) mit erwarteter Reduktions-Quote (R1).

## Out of Scope
- Mehrfach-Pass / Konvergenz (PRD §V9.5 Out of Scope — Per-Thread-Multi-Pass geparkt).
- Auto-Curation / High-Confidence-Auto-Import (GF-Curation bleibt Pflicht).

## Acceptance
- SC-V9.5-3 (bounded Critic flaggt/verwirft Low-Quality, harte Pass-Obergrenze), SC-V9.5-4 (EU + Audit + unter Hard-Cap). Siehe PRD §"Success Criteria (V9.5 Gesamt)".

## Refs
- ARCHITECTURE.md §"V9.5 Architecture Addendum" — DEC-216, Critic-Prompt §7.
- Abhaengig von FEAT-080 (Synthese-Output). SLC-V9.5-C nach SLC-V9.5-B.
