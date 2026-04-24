# SLC-038 — Capture-Mode-Hooks Spike

## Goal
Architektur-Spike, der SC-V4-6 validiert: ein neuer Capture-Mode kann OHNE Schema-Aenderung eingefuehrt werden. Konkret: Pseudo-Mode `walkthrough_stub` bekommt einen Worker-Handler-Stub, eine UI-Komponente-Stub und einen Eintrag in CAPTURE_MODE_REGISTRY. Zusaetzlich: "How to add a new Capture-Mode" in ARCHITECTURE.md dokumentiert. Kein User-Facing-Feature — Spike dient als Beweis und Vorlage.

## Feature
FEAT-025

## In Scope
- Worker-Handler-Stub `src/workers/capture-modes/walkthrough-stub/handle.ts`:
  - Thin-Handler: empfaengt Job, loggt `[walkthrough_stub] received job <id>`, setzt ai_job auf completed, rueckt keinen KI-Call aus.
  - Registrierung in `src/workers/run.ts` Dispatcher (switch case 'walkthrough_stub_processing' → handler).
- UI-Komponente `src/components/capture-modes/walkthrough-stub/WalkthroughStubMode.tsx`:
  - Server-Component oder einfacher Client-Stub.
  - Rendert Platzhalter-Box: Ueberschrift "Walkthrough-Mode (V5)" + Text "Dieser Capture-Mode wird in einer spaeteren Version implementiert. Aktuell reserviert als Architektur-Spike.".
  - Kein User-Input, kein Submit-Button.
- Registry-Update `src/components/capture-modes/registry.ts`:
  - Konsolidierte Registry-Datei mit allen bekannten Modes:
    - `questionnaire` → QuestionnaireMode
    - `evidence` → EvidenceMode (falls existent)
    - `voice` → VoiceMode (falls existent)
    - `dialogue` → DialogueMode (falls existent)
    - `employee_questionnaire` → EmployeeQuestionnaireMode (aus SLC-037)
    - `walkthrough_stub` → WalkthroughStubMode
  - Default-Fallback: QuestionnaireMode (fuer NULL capture_mode aus V1-Bestandsdaten).
  - Type `CaptureModeKey = keyof typeof CAPTURE_MODE_REGISTRY`.
- Route-Delegation pruefen: `/capture/[sessionId]/page.tsx` nutzt die Registry statt hartcodiertem Mode-Switch (falls noch nicht der Fall — andernfalls refaktorieren).
- Architektur-Doku-Erweiterung `docs/ARCHITECTURE.md`:
  - Neuer Abschnitt **"Anhang A — How to add a new Capture-Mode"** am Ende der Datei.
  - Enthaelt: Schritt-fuer-Schritt-Anleitung (1. CHECK-Constraint erweitern, 2. Worker-Handler schreiben, 3. UI-Komponente unter src/components/capture-modes/{mode}/, 4. Registry-Eintrag, 5. optional Mode-spezifische Tabellen, 6. Tests).
  - Verweis auf walkthrough_stub als konkretes Template.
  - Was KEIN Hook ist (Routing, Permissions — siehe DEC-040).
- Unit-Tests `src/components/capture-modes/__tests__/registry.test.ts`:
  - Registry enthaelt alle erwarteten Keys.
  - Default-Fallback liefert QuestionnaireMode.
  - Type-Safety: ungeknoepfter Mode wirft Runtime-Warning (oder greift auf Fallback).

## Out of Scope
- Implementation von Walkthrough (V5) oder Diary (V6).
- Mobile-Layout-Vorbereitung fuer Diary.
- Tech-Spike fuer Walkthrough-Screen-Capture (V5-Planung).
- Migration fuer walkthrough (V5-Planung).
- Registry-UI-Tooling.
- Walkthrough_stub als produktiver Mode (wird nicht beworben, nicht im UI angezeigt ausser per direkter URL).

## Acceptance Criteria
- AC-1: Registry-Datei existiert mit allen Modes. Type-Export `CaptureModeKey` ist verfuegbar.
- AC-2: Worker startet auf und loggt `walkthrough_stub handler registered` beim Boot.
- AC-3: Manueller Test: INSERT capture_session mit capture_mode='walkthrough_stub' + INSERT ai_jobs mit type='walkthrough_stub_processing' → Worker setzt Job auf completed, Log-Ausgabe vorhanden.
- AC-4: Manueller Test: Aufruf `/capture/[sessionId]/page.tsx` mit einer walkthrough_stub-Session rendert WalkthroughStubMode-Placeholder.
- AC-5: Unit-Tests fuer Registry gruen.
- AC-6: ARCHITECTURE.md Anhang A existiert mit Schritt-fuer-Schritt-Anleitung.
- AC-7: SC-V4-6 ist damit abgenommen: Ein neuer Mode wurde ohne Migration hinzugefuegt (nur CHECK-Constraint-Erweiterung aus SLC-033 Migration 067 war noetig; WalkthroughStubMode selbst braucht keine Migration).
- AC-8: walkthrough_stub wird im Self-Service-Cockpit (SLC-040) NICHT beworben. Keine tenant_admin-UI loest diesen Mode bewusst aus.
- AC-9: `npm run build` und `npm run test` gruen.

## Dependencies
- Vorbedingung: SLC-033 done (capture_mode CHECK enthaelt 'walkthrough_stub').
- Vorbedingung: SLC-037 done (Registry ist an dem Punkt schon teil-etabliert mit employee_questionnaire).
- Folge-Voraussetzung fuer: V5 (Walkthrough) — nutzt die etablierte Registry-Konvention.

## Worktree
Empfohlen (SaaS, Low-Risk Spike).

## Migrations-Zuordnung
Keine Migration in diesem Slice (SC-V4-6 Beweis: neuer Mode braucht keine Schema-Aenderung mehr).

## Pflicht-QA-Vorgaben
- Pflicht-Validierung SC-V4-6: dokumentierter Beweis im Completion-Report (Step-by-Step, was wurde genau hinzugefuegt, keine Migration war dafuer noetig).
- Unit-Tests fuer Registry gruen.
- Manueller Worker-Boot-Test (Logs pruefen).
- `npm run build` + `npm run test` gruen.
- ARCHITECTURE.md Anhang A liest sich so, dass ein neuer Entwickler einen Mode in <1h hinzufuegen koennte.
- IMP-112: Re-Read vor Write.

## Risks
- Registry wird zu Boilerplate-Schicht ohne echten Nutzen: Mitigation: Registry-Eintrag ist trivial (~10 Zeilen), nicht ueber-engineert.
- walkthrough_stub wird versehentlich als "echter Mode" beworben und verwirrt User: Mitigation: klare Platzhalter-Box + kein Bewerbungs-UI in Cockpit.
- Doku-Drift: Anhang A veraltet, weil zukuenftige Modes andere Hooks brauchen. Mitigation: Doku sagt explizit "Stand V4, bei neuen Hook-Punkten in V5+ erweitern".

### Micro-Tasks

#### MT-1: Worker-Handler-Stub
- Goal: `src/workers/capture-modes/walkthrough-stub/handle.ts`.
- Files: Handler + Dispatcher-Erweiterung in `src/workers/run.ts`
- Expected behavior: Minimaler Handler: empfaengt ai_job, loggt, markiert completed. Keine Bedrock-Calls.
- Verification: Worker-Boot + manueller INSERT-Test.
- Dependencies: SLC-033 done
- TDD-Note: Simpler Test ausreichend.

#### MT-2: UI-Stub-Komponente
- Goal: WalkthroughStubMode-Komponente.
- Files: `src/components/capture-modes/walkthrough-stub/WalkthroughStubMode.tsx`
- Expected behavior: Zeigt Placeholder-Box.
- Verification: Visual-Check mit Fixture-Session.
- Dependencies: none
- TDD-Note: None.

#### MT-3: Registry-Konsolidierung
- Goal: `src/components/capture-modes/registry.ts` als zentrale Map.
- Files: Registry + Tests
- Expected behavior: Map mit allen Modes. Type-Export. Default-Fallback. Wird von `/capture/[sessionId]/page.tsx` genutzt.
- Verification: Unit-Tests + Browser-Test mit mehreren Modes.
- Dependencies: MT-2 + SLC-037 done (EmployeeQuestionnaireMode)
- TDD-Note: TDD empfohlen.

#### MT-4: Route-Delegation pruefen/refaktorieren
- Goal: Bestehende Capture-Route nutzt die Registry.
- Files: `src/app/capture/[sessionId]/page.tsx` oder analog
- Expected behavior: Keine hartcodierten if/switch je Mode; Registry-Lookup.
- Verification: Browser-Test mit questionnaire + evidence + employee_questionnaire + walkthrough_stub.
- Dependencies: MT-3
- TDD-Note: None.

#### MT-5: ARCHITECTURE.md Anhang A
- Goal: Schritt-fuer-Schritt-Anleitung.
- Files: `docs/ARCHITECTURE.md`
- Expected behavior: Neuer Abschnitt am Ende. Lesbarkeit: ein neuer Entwickler kann folgen.
- Verification: Re-Read, Peer-Check.
- Dependencies: MT-1..MT-4
- TDD-Note: None.

#### MT-6: Record-Updates
- Goal: STATE.md + INDEX.md + backlog.json + features/INDEX.md.
- Files: `docs/STATE.md`, `slices/INDEX.md`, `planning/backlog.json`, `features/INDEX.md`
- Expected behavior: SLC-038 done. BL-044 Status done. FEAT-025 Status done.
- Verification: Re-Read vor Write (IMP-112).
- Dependencies: MT-1..MT-5
- TDD-Note: Doku.

## Aufwand-Schaetzung
~3-4 Stunden. Niedrig-Komplex, aber Doku-Sauberkeit wichtig. Puffer: +1h. Gesamt: ~4-5 Stunden.
