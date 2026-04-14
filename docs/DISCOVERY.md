# Discovery — Strategaize Onboarding-Plattform

- Datum: 2026-04-14
- Status: abgeschlossen, Readiness für /requirements = ready
- Vorgaenger-Entscheidungen: siehe /docs/DECISIONS.md (DEC-001 bis DEC-003)

## 1. Grundprinzip (verbindlich)

**So wenig wie möglich menschliche Intervention beim Wissenssammeln und Wissensverdichten.** Die Plattform existiert, um Consultant-Zeit skalierbar zu machen, indem KI die Hauptarbeit übernimmt.

- **KI macht:** Wissen aus Menschen herauskitzeln, Muster erkennen, verdichten, strukturieren, Lücken detektieren, iterativ verbessern, Ergebnisse aufbereiten
- **Mensch macht NUR:** Richtung prüfen, vereinzelte Lücken ergänzen, Meeting-Vermenschlichung, finalen Stand festhalten
- **Mensch macht NIEMALS:** neben dem Kunden sitzen, KI-Rolle übernehmen, Durchführung der Wissenserhebung, Zeit-gegen-Geld-Beratung im Durchführungs-Modus

Dieses Prinzip ist nicht verhandelbar und ist die Grundlage jeder Scope-Entscheidung.

## 2. Hauptziel

End-to-End Knowledge Management als Produkt: Wissen erheben → strukturieren → verdichten → auswerten → ausgeben. Consultant-Zeit wird nur an Meeting-Review-Punkten pro Block investiert. Das System wird über Zeit durch bessere KI-Prompts / Skills / Loops besser — nicht durch mehr menschliche Stunden.

Erster Use-Case: Exit-Readiness (Blueprint-Inhalt). Später: interne Mitarbeiter-Onboardings in Kundenunternehmen, weitere Template-Cases.

## 3. Operativer Ablauf (Block-basiert)

1. Kunde arbeitet Block allein durch, KI-Chat als Hilfe (Questionnaire-Mode)
2. Kunde signalisiert "fertig" → Block-Submit + versionierter Checkpoint
3. Im Hintergrund (z.B. über Nacht): KI-Verdichtung
   - V1: Single-Pass-Verdichtung (lightweight)
   - V2: 3-Agenten-Loop (Analyst → Challenger → Orchestrator), iteriert bis Qualität ausreichend
4. Zwei mögliche Pfade:
   - Lücken zu groß → automatische Rückfragen ins Questionnaire zurückspielen
   - Daten gut genug → verdichteter Stand geht an Berater zum Meeting-Review
5. Meeting zwischen Berater und Kunde: verdichteten Stand durchgehen, vermenschlichen, vereinzelt ergänzen
6. Stand nach Meeting: versioniert festhalten, kann Teil des Kunden-Ergebnisses werden

## 4. Nebengedanken und Anhängsel (aus Discovery-Input)

Aus der Diskussion hervorgegangen, aber nicht Kernobjekt von V1:

- Interne Meeting-Aufzeichnung zwischen Mitarbeitern → Capture-Mode Dialogue, V3+
- Walkthrough-Technologie (Extension / Electron / Native) → Capture-Mode Walkthrough, V4, vorher Technologie-Spike
- Diary / Mobile / PWA → Capture-Mode Diary, V5
- SOP-Generation → V2 (Ebene 2 aus OS-Konzept)
- Kollaborative Annotation, Anomalie-Flagging, Process-Mining-Hook → V6+
- Finaler Produktname → nicht V1-blockierend

## 5. Realismus-Urteil

### Realistisch für V1
- Fundament-Datenmodell (Knowledge Unit, Capture Session, Validation Layer)
- Template-Objekt in DB vorbereitet, erstes Template "Exit-Readiness" aktiv
- Questionnaire-Mode mit Block-Submit-Pattern aus Blueprint direkt portierbar
- Exception-Mode als zusätzlicher Prompt-Layer (billig)
- OS-Verdichtungs-Layer portierbar: Datenmodell (blueprint_block_sessions, blueprint_debrief_items), Query-Layer, Worker, Import-Endpoint sind zu 80–100% wiederverwendbar
- Debrief-/Meeting-Interface für den Berater-Review

### Realistisch nur im kleinen Cut
- KI-Verdichtung ohne Agenten-Loop (Single-Pass). Reicht, weil Berater im Meeting die Qualitäts-Lücke schließt
- Template-System: ein aktives Template, Struktur für weitere ist da, aber kein Switcher-UI

### Zu breit für V1 (Ablehnung)
- Voller 3-Agenten-Loop → V2
- SOP-Generierung → V2
- Zweites Template → V2
- Evidence-Mode mit KI-Auto-Mapping → V2
- Dialogue / Walkthrough / Diary → V3+
- Meeting-Infrastruktur (Jitsi+Jibri+Whisper) → V3 (shared mit Business V4.1)

## 6. Scope

### In Scope für V1
- Fundament: Knowledge Unit, Capture Session, Validation Layer, Template-Objekt
- Template "Exit-Readiness" aktiv (Content-Basis aus Blueprint V3.4)
- Questionnaire-Mode inklusive Block-Submit / Checkpoint-Versionierung
- Exception-Mode als Prompt-Layer
- **Lightweight KI-Verdichtung (Single-Pass)**: Antworten je Block → verdichtete Knowledge Units mit Confidence-Indikatoren
- Portierte OS-Ebene-1 (blueprint_block_sessions + blueprint_debrief_items + Query-Layer + Worker + Import-Endpoint), umgebaut auf neue Onboarding-Plattform-Auth und neue Schema-Namen
- Debrief-/Meeting-Interface für strategaize_admin: verdichteten Block-Stand ansehen, im Meeting Stand festhalten, versionierter Snapshot
- Rollen aus Blueprint übernommen: strategaize_admin, tenant_admin, tenant_member
- Deployment-Flexibilität (ENV-only, RLS, Docker-Compose) aus DEC-002

### Out of Scope für V1
- 3-Agenten-Loop (Analyst + Challenger + Orchestrator)
- Automatische Rückfrage-Rückspielung ins Questionnaire (Lücken → neuer Kontext-Chunk)
- SOP-Generierung
- Zweites Template und Template-Switcher-UI
- Evidence-Mode KI-Auto-Mapping
- Dialogue-Mode, Walkthrough-Mode, Diary-Mode
- Mobile / PWA
- Process-Mining-Connector, Annotation, Anomalie-Flagging
- Neue "consultant"-Rolle (wird bei Bedarf in V2+ evaluiert)

## 7. Versions-Cut

| Version | Inhalt | Markt-Status |
|---|---|---|
| **V1** | Fundament + Exit-Readiness-Template + Questionnaire + Exception + Lightweight Single-Pass Verdichtung + Debrief-/Meeting-UI | **erstes verkaufbares Produkt** |
| **V2** | 3-Agenten-Loop (Analyst+Challenger+Orchestrator) + SOP-Generation + automatische Rückfrage-Schleife + Evidence-Mode aufgewertet + zweites Template | voll marktreif, skalierbares System |
| **V3** | Dialogue-Mode (nach Business-V4.1 Meeting-Pipeline steht) | Erweiterung |
| **V4** | Walkthrough-Mode (nach Technologie-Spike) | Erweiterung |
| **V5** | Diary-Mode (Mobile/PWA) | Erweiterung |
| **V6+** | Process-Mining-Hook, kollaborative Annotation, Anomalie-Flagging | parken |

## 8. Empfohlener V1-Fokus

**V1 = "Exit-Readiness als marktreifes Produkt auf template-fähigem Fundament mit portierter OS-Verdichtung (lightweight, Single-Pass)."**

Konkrete Bausteine für /requirements:
1. Fundament-Umbau: Knowledge Unit, Capture Session, Validation Layer, Template-Objekt
2. Questionnaire-Mode: auf neues Schema heben, Block-Submit-Pattern aus Blueprint übernehmen
3. Exception-Mode: dünner zusätzlicher Prompt-Layer
4. OS-Portierung: blueprint_block_sessions + blueprint_debrief_items + Worker + Import-Endpoint anpassen, Auth umstellen, Naming generalisieren
5. Lightweight KI-Verdichtung: Single-Pass via Bedrock/Claude (Grundprinzip: möglichst skalierbare KI-Nutzung) oder Ollama (Zero-Cost, Fallback)
6. Debrief-/Meeting-UI für strategaize_admin: Block-Status, Knowledge-Unit-Liste, Meeting-Stand-Snapshot
7. Rollen & RLS: Blueprint-Rollenmodell übernehmen, erweitern auf Knowledge-Unit-Scope

## 9. Geparkte Ideen (explizit, nicht vergessen)

- 3-Agenten-Loop mit Iterations-Break-Kriterien (V2)
- SOP-Erstellung (V2)
- Automatische Rückfrage-Rückspielung ins Questionnaire (V2)
- Zweites Template und Template-Switcher-UI (V2)
- Dialogue-Mode + Meeting-Pipeline (V3, shared mit Business V4.1)
- Walkthrough-Technologie-Entscheidung (Spike vor V4)
- Diary-Mode Mobile/PWA (V5)
- Kollaborative Annotation, Anomalie-Flagging, Process-Mining-Hook (V6+)
- Finaler Produktname (nach erstem Kunden-Test)
- Eigene "consultant"-Rolle für Multi-Berater-Szenarien (V2+, je nach Bedarf)

## 10. Offene kritische Fragen

Keine mehr. Die Discovery ist entscheidungsreif.

## 11. Bereitschaft für /requirements

**Ready.**

Begründung:
- V1-Scope klar umrissen und realitätsgeprüft
- Grundprinzip (KI-first) ist verbindlich verankert und verhindert Scope-Drift
- OS-Code-Audit hat realistische Portierungs-Basis gezeigt
- Blueprint-Code-Basis bereits als DEC-001 übernommen
- Deployment-Flexibilität als DEC-002 fixiert
- Template-ready als DEC-003 fixiert
- Versions-Cut (V1 bis V6+) priorisiert

## 12. Empfohlener nächster Schritt

`/requirements` in neuer Session. Basis: diese Discovery + DECISIONS.md + /docs/STATE.md.

## 13. OS-Code-Portierung (Ergebnis des Audits)

Wichtige Befunde für /requirements und /architecture:

### Direkt portierbar (80–100%)
- Migrationen 033, 049, 050 (blueprint_workspace, debrief_target_schema, skills_debrief_import)
- `blueprint-workspace-queries.ts`, `ai-blueprint-draft-queries.ts`, `skills-import-queries.ts`
- `POST /api/blueprint/sessions/[sessionId]/import-debrief` (100% portierbar, nur RPC-Namen)
- Worker `blueprint-block-draft-worker.ts` (85% portierbar)
- UI-Komponenten: `ai-draft-panel.tsx`, `debrief-item-dialog.tsx`

### Umbau nötig
- Tabellen-Schema: block_session → capture_session, debrief_item → knowledge_unit
- Foreign Keys und Naming (run_id, project_id → Onboarding-spezifisch)
- RPC-Namen: rpc_list_blueprint_block_sessions → rpc_list_capture_sessions
- Prompt-Templates müssen für KU-Struktur angepasst werden
- LLM-Provider-Entscheidung: heute Ollama, Option Bedrock/Claude einziehen

### Wegzuwerfen / Neubau
- OS-eigene Auth-Layer → Onboarding-Plattform-Auth
- Blueprint-Workspace-Navigation → Onboarding-Plattform-Navigation
- OS-Dashboard, Reports, Library, Execution-Seiten → nicht relevant für V1
- 3-Agenten-Loop → V2-Arbeit, existiert heute nirgends
- SOP-Generation → V2, `sop_library`-Tabelle da, aber keine Logik

### V1-Aufwand (grobe Schätzung aus Audit)
- DB-Schema-Umbau: ~2 Tage
- API-Adapter: ~3 Tage
- UI-Integration: ~3 Tage
- Worker-Adapter: ~2 Tage
- Integration + Test: ~5 Tage
- Summe: ~2–3 Wochen implementation-time für die OS-Portierungs-Schicht

## 14. Referenzen

- Grundprinzip: `/docs/DECISIONS.md` (weiterer DEC-Eintrag in /requirements)
- Blueprint-Pattern: Block-Submit-Checkpoint siehe Blueprint-Repo `sql/migrations/003_block_checkpoints.sql`, `src/app/api/tenant/runs/[runId]/submit/route.ts`
- OS-Audit vollständig: in Session-Bericht zu diesem Discovery-Lauf
- Memory: `project_onboarding_foundational_principle.md` (Grundprinzip persistent)
