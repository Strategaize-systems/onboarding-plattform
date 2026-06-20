# FEAT-094 — KI-Output-Generierung pro Modul (Entscheidung/Standard/Implementierungsschritt)

- Version: V10
- Status: planned
- Backlog: BL-513
- Created: 2026-06-20

## Was
Die KI draftet pro bearbeitetem Modul den standardisierten Output: **Entscheidung** (was gilt ab jetzt?) / **Standard** (Template/Checkliste/Regel) / **Implementierungsschritt** (wer macht was bis wann?) — aus den Modul-Antworten (FEAT-093). **~70-80% KI-getrieben** (Founder-Imperativ), der StB macht die ~20% Vertiefung.

## Warum
Das ist der Kern der Produkt-These: KI-Lieferung als Skalierungs-BEDINGUNG (sonst Bodyshop). Ohne echte KI-Output-Generierung ist V10 nur ein Fragebogen.

## In Scope (V10)
- Pro Modul KI-Draft von Entscheidung/Standard/Implementierungsschritt (Bedrock Claude eu-central-1, ai_jobs-Worker).
- Output-Granularitaet je Modul-Spec (z.B. M-04: KPI-Set+Ampellogik, Monatsabschluss-Taktung, Standard-Monatsreport).
- Cost-Tracking pro Generierung (`ai_cost_ledger` + synthetic `ai_jobs` falls synchron — `backend.md`-Pattern).
- Scope-Guard: Output liefert „sichtbar + KI-Hebel", nicht Vollberatung/Change-Management (Grenze im Output sichtbar).

## Out of Scope (V10)
- Mandanten-Output.
- Vollautomatische Umsetzung (Change-Management bleibt beim Unternehmer).
- Embedding-Normalisierung jenseits des bestehenden RAG.

## Reuse
Bedrock-Adapter (EU-Region, `data-residency.md`), ai_jobs-Worker-Queue, Condensation-/Synthese-Pattern (`src/workers/condensation/*`), Cost-Tracking-Pattern (`backend.md` synthetic ai_jobs).

## Success / Acceptance
- Pro Modul werden Entscheidung/Standard/Implementierungsschritt KI-gedraftet (~70-80% Abdeckung), in einem editierbaren/kuratorischen Zustand.
- Alle LLM-Calls EU-Region; Cost geloggt.
- Bei LLM-Fail: deterministischer Fallback / sauberer Fehlerzustand (kein Silent-Fail).

> Detail + Constraints: PRD `## V10 — StB-Vertikale Phase 1`. Forks → /architecture V10.
