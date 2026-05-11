# FEAT-045 — Diagnose-Werkzeug Template + Light-Condensation-Pipeline + Bericht-Renderer

**Version:** V6
**Status:** planned (Stop-Gate: Inhalts-Workshop)
**Created:** 2026-05-11

## Zweck

Das **Strategaize-Diagnose-Werkzeug** als Mandanten-Self-Service-Erlebnis: Mandant durchlaeuft 15-25 Fragen (Inhalts-Workshop liefert), bekommt am Ende einen ehrlichen Bericht mit deterministischem Score + KI-verdichtetem Kommentar, **ohne menschlichen Berater-Loop**. Setzt die Kern-USP des Multiplikator-Modells um (MULTIPLIER_MODEL Achse 4 + Inhaltliche Skizze Diagnose-Werkzeug).

## Hintergrund

Heute haben **alle** produktiven Verdichtungs-Pipelines der Plattform eine Pflicht-Berater-Review (KU geht durch `proposed → accepted` via `validation_layer`). Das ist fuer den tiefen Onboarding-Use-Case richtig — fuer das Multiplikator-Diagnose-Werkzeug aber falsch: das skaliert nicht mit Solo-Founder-Kapazitaet bei 5-10 Diagnosen/Woche und brennt cold-start-Vertrauen ab, wenn der Mandant 5 Tage auf einen Bericht wartet.

Discovery RPT-208 Sektion 4.4 hat drei Optionen abgewogen: **Option DGN-A Auto-Finalize** ist empfohlen, mit deterministischer Score-Logik aus dem Template (nicht KI) und KI nur fuer den Verdichtungs-Kommentar. Wird in /architecture V6 als DEC formell entschieden.

**Stop-Gate vor /backend SLC-105**: Inhalts-Workshop Diagnose-Werkzeug muss 15-25 konkrete Fragen + Score-Logik + Pflicht-Output-Aussage geliefert haben. Andere V6-Slices unabhaengig.

## In Scope

- **Neues Template `partner_diagnostic`** in der bestehenden `template`-Tabelle:
  - `slug='partner_diagnostic'`
  - `version='v1'` (semver, V6 erste Version)
  - `name='Strategaize-Diagnose-Werkzeug'`
  - `blocks JSONB` mit 6 inhaltlichen Bausteinen aus MULTIPLIER_MODEL.md (Strukturelle KI-Reife, Entscheidungs-Qualitaet, Schriftlich festgehaltene Entscheidungen, SOPs, Unternehmerhandbuch, Workaround-Dunkelziffer)
  - **Pro Block: Score-Logik-Definition** (deterministische Mapping-Regel von Antwort-Werten auf Score 0-100). Inhalts-Workshop liefert
  - **Pflicht-Output-Aussage** als Markdown-Footer-Snippet im Template-Schema („Wir sind noch nicht bereit, KI strukturiert einzusetzen ... aber wenn wir die Zeit dafuer nehmen ...")
  - `template.metadata.usage_kind='self_service_partner_diagnostic'` (neuer Flag, der die Light-Pipeline triggert)
- **Light-Condensation-Pipeline (Auto-Finalize, DGN-A)**:
  - Neuer Worker-Job-Typ `partner_diagnostic_condensation` ODER Variante des bestehenden `knowledge_unit_condensation` mit Mode-Flag — Entscheidung in /architecture V6
  - **Score-Berechnung deterministisch** vor LLM-Call (aus Antworten-JSON via Score-Logik aus Template)
  - LLM-Call kommentiert die Antworten (nicht den Score): „Was faellt auf? Was sind die groessten Strukturluecken? Was waere realistische naechste Verbesserung?"
  - LLM-Output wird direkt als `knowledge_unit` mit `status='accepted'` geschrieben (nicht `proposed`)
  - `validation_layer`-Eintrag mit `reviewer_role='system_auto'`, `action='accept'`, `note='Auto-Finalize per FEAT-045 DGN-A'`
  - `block_checkpoint` wird automatisch mit `checkpoint_type='auto_final'` (neuer Wert) erstellt — analog `meeting_final` aber ohne menschlichen Trigger
- **Diagnose-Bericht-Renderer** als neue Server-Component-Familie `/dashboard/diagnose/[capture_session_id]`:
  - Bericht-Header mit Score-Visual (z.B. 6 Balken oder Radar-Chart, einfach gehalten — shadcn-Chart o.ae.)
  - Pro Block: Score + 2-3 Saetze KI-Kommentar
  - Footer mit Pflicht-Output-Aussage (aus Template)
  - „Bericht herunterladen"-Button (PDF oder druckbare HTML, Phase-2-Detail in /architecture)
  - Sub-Karte „Ich will mehr von Strategaize" (Eingang fuer FEAT-046)
- **Mandanten-Run-Flow** `/dashboard/diagnose/start`:
  - Begruessungs-Block mit Partner-Branding (FEAT-044)
  - Sequenzieller Frage-Flow (analog Questionnaire-Mode, aber linearer — keine Block-Submit-Granularitaet, Run-Submit am Ende)
  - Optional Save-Draft-Funktion (bestehendes Pattern aus FEAT-003)
  - Bei Submit: Light-Condensation-Pipeline triggered, Mandant sieht Lade-Screen mit Progress („Verdichtung laeuft, dauert ~30 Sekunden"), nach Completion Redirect auf Bericht
- **Erweiterte CHECK-Constraints** auf `capture_session.status` und `block_checkpoint.checkpoint_type` fuer neue Werte (`auto_final`)

## Out of Scope

- Mehrere Diagnose-Template-Varianten parallel (V6: nur `partner_diagnostic_v1`, NL-Variante kommt in V6.1)
- Berater-Override des Auto-Finalize-Berichts (falls Strategaize-Admin im V6 die Diagnose post-hoc anpassen will — V7+, falls je)
- Re-Diagnose-Trigger (Mandant macht Diagnose 6 Monate spaeter erneut) — V7+
- Vergleichs-View „Diagnose-Score vor 6 Monaten vs. heute" — V7+
- Aggregierte Markt-Intelligence-View ueber alle Diagnosen (Strategaize-Admin sieht anonymisierte Verteilungen) — V7+
- Inhalts-Workshop selbst (Score-Logik + Fragen) — separates Backlog-Item BL-V6-PREP-INHALT, kein V6-Code
- DGN-B (Strategaize-Quick-Review-Pool) oder DGN-C (Hybrid) als V6-Default — verworfen per /architecture-DEC

## Akzeptanzkriterien

- Mandant kann via `/dashboard/diagnose/start` die Diagnose end-to-end ohne menschlichen Eingriff durchlaufen (SC-V6-5)
- Submit triggert Light-Condensation-Pipeline, Bericht wird in < 60 Sekunden generiert (typischer Bedrock-Latency)
- Bericht enthaelt **deterministisch berechneten Score** aus Template-Logik (kein KI-Output) (SC-V6-6)
- Bericht enthaelt KI-Verdichtungs-Kommentar pro Block (LLM-Output, kommentierend)
- Bericht enthaelt Pflicht-Output-Aussage am Ende (aus Template-Markdown)
- `knowledge_unit`-Eintrage haben `status='accepted'` direkt nach Worker-Lauf (kein `proposed`-Zwischenstand)
- `validation_layer`-Eintrag mit `reviewer_role='system_auto'` pro KU
- Bericht-Renderer respektiert Partner-Branding (FEAT-044)
- Tenant-Isolation: Mandant von Partner A sieht NICHT Bericht von Mandant von Partner B (RLS-Test)
- Partner-Admin sieht Diagnose-Bericht seiner eigenen Mandanten (read-only)
- Strategaize-Admin sieht alle Diagnose-Berichte (Cross-Tenant)
- Bedrock-Kosten pro Diagnose-Run werden in `ai_cost_ledger` korrekt protokolliert (Cost-Audit fuer V6-Erfolgsmessung)
- ESLint 0/0, Build PASS, Vitest fuer Score-Logik-Berechnung (deterministisch testbar)

## Abhaengigkeiten

- FEAT-041 (Foundation + RLS) — Pflicht
- FEAT-043 (Partner-Client-Mapping) — Pflicht, damit Mandanten-Tenant existiert
- FEAT-044 (Branding) — Soft-Dependency: Bericht-Renderer respektiert Branding, kann aber zur Not auch ohne (Default-Strategaize-Look) implementiert werden
- **Stop-Gate Inhalts-Workshop** (Backlog `BL-V6-PREP-INHALT`) — ohne Score-Logik + Fragen kann SLC-105 nicht starten
- Reuse: bestehende Condensation-Worker-Architektur ([src/workers/condensation/](../src/workers/condensation/))
- Reuse: Handbuch-Reader Render-Pattern (FEAT-028) fuer Bericht-Layout
- Reuse: AWS Bedrock Claude Sonnet eu-central-1 LLM-Client

## Verweise

- RPT-209 V6 Requirements (SC-V6-5, SC-V6-6, R-V6-1 Diagnose-Werkzeug-Quality-Risk)
- RPT-208 V6 Discovery — Sektion 4.4 Auto-Finalize-Optionen + Empfehlung DGN-A
- MULTIPLIER_MODEL.md Achse 4 Modell-Erweiterung + Inhaltliche Skizze Diagnose-Werkzeug
- MULTIPLIER_MODEL.md Achse 8 — Diagnose-Werkzeug-Quality-Risk
- STRATEGY_NOTES_2026-05.md Abschnitt 7 Slice-Skizze SLC-081 (neuer Capture-Mode → Discovery-Korrektur: Template-Variante)
- Pattern-Reuse: `src/workers/condensation/run.ts`, `src/lib/llm.ts` (LLMLocale-faehig), `src/app/dashboard/handbook/` (Reader-Pattern)
