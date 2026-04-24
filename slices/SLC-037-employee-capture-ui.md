# SLC-037 — Employee Capture-UI + Sicht-Perimeter

## Goal
Vollstaendiger Mitarbeiter-Capture-Flow auf `/employee`: Dashboard mit Aufgaben-Liste, Aufgabe oeffnen, QuestionnaireMode ausfuehren, Block-Submit trigger Standard-Verdichtungs-Pipeline. **Pflicht-Gate: Die komplette 4×8 RLS-Test-Matrix wird in diesem Slice abgeschlossen und MUSS vollstaendig gruen sein bevor Slice als done gilt.** Keine Dialogue/Evidence/Voice-Mode fuer Mitarbeiter in V4.

## Feature
FEAT-024 (primaer), FEAT-022 (RLS-Perimeter-Abschluss)

## In Scope
- Route `/employee/page.tsx` erweitert (SLC-034 lieferte Skelett):
  - Laedt capture_sessions WHERE owner_user_id=auth.uid() AND capture_mode='employee_questionnaire' mit Status.
  - Zeigt Aufgaben-Liste: Titel (aus template/Bridge-Proposal-Snapshot), Status-Badge (open/in_progress/submitted), Ablauf-Hinweis falls vorhanden, Button "Starten"/"Fortsetzen"/"Angesehen".
  - Leerer State wenn keine Aufgaben.
- Route `/employee/capture/[sessionId]/page.tsx`:
  - Server-Component prueft owner_user_id=auth.uid().
  - Delegiert an `EmployeeQuestionnaireMode` (neue Komponente unter `src/components/capture-modes/employee-questionnaire/`).
  - EmployeeQuestionnaireMode wrapped die bestehende QuestionnaireMode-Komponente mit Mitarbeiter-spezifischer Header (zeigt Auftraggeber-Kontext nicht, zeigt aber Tenant-Name + Aufgaben-Titel) und restringiertem Navigations-Menu.
- Registry-Eintrag in `src/components/capture-modes/registry.ts`: 'employee_questionnaire' → EmployeeQuestionnaireMode (die Registry wird in SLC-038 final konsolidiert, hier nur Eintrag fuer employee_questionnaire).
- Worker-Job-Handler `src/workers/capture-modes/employee-questionnaire/handle.ts` als **Thin-Wrapper**: Registriert Job-Type `employee_questionnaire_processing`, delegiert 1:1 an bestehenden `knowledge_unit_condensation`-Pfad (wie in ARCHITECTURE.md Zeile 2355 beschrieben). KI-Pipeline (Analyst+Challenger Loop) ist unveraendert — Mode setzt nur Source='employee_questionnaire' auf entstehenden KUs.
- Block-Submit-Server-Action fuer employee-Flow:
  - Verwendet die bestehende Block-Submit-Action. Setzt allerdings source='employee_questionnaire' im rpc_create_block_checkpoint-Payload (ergaenzt den existierenden RPC um optionalen source-Parameter) oder ueber knowledge_unit.source nach Verdichtung.
  - Alternative (einfacher): Worker-Handler liest capture_session.capture_mode und setzt die knowledge_unit.source entsprechend.
- RLS-Matrix-Vervollstaendigung:
  - Alle 32 Pflicht-Faelle aus SLC-033 werden implementiert und **muessen gruen sein**.
  - Zusaetzlich: mindestens 8 Faelle fuer employee-Sichtperimeter beim aktiven Verwenden (employee-SELECT auf eigene vs. fremde capture_session; employee-UPDATE eigene vs. fremde; employee-SELECT auf block_diagnosis/sop/handbook_snapshot/bridge_run/bridge_proposal/employee_invitation liefert 0 rows).
- Navigation: Mitarbeiter-Header / Sidebar mit Tenant-Name, User-Name, Logout. Keine Links zu /admin, /dashboard, /admin/bridge, /admin/team fuer employee (auch nicht versteckt — gar nicht gerendert).
- Q27-Entscheidung (Diagnose fuer Mitarbeiter-Bloecke): **Standard-Pipeline laeuft fuer alle Bloecke (auch employee)**; das Debrief-UI fuer tenant_admin und strategaize_admin zeigt KUs und Diagnose mit Source-Badge "Mitarbeiter". Employee sieht die resultierende Diagnose NICHT (RLS).
- UI-Badge im Debrief/KU-Listen zeigt employee_questionnaire-Source klar erkennbar (bestehende Debrief-UI erweitern).
- `npm run build` gruen.

## Out of Scope
- Voice-Mode fuer Mitarbeiter (V4.2+).
- Evidence-Mode fuer Mitarbeiter (V4.2+).
- Dialogue-Mode fuer Mitarbeiter (ausgeschlossen).
- Mitarbeiter-zu-Mitarbeiter Kommentare.
- Mitarbeiter-Wahl eines eigenen Templates (Template kommt aus Bridge-Spawn).
- Reminder-E-Mails an Mitarbeiter (V4.2).
- Mitarbeiter-Profile-Editor.
- Diff-View zwischen Mitarbeiter- und GF-Antworten.

## Acceptance Criteria
- AC-1: Eingeloggter Mitarbeiter sieht unter `/employee` nur Aufgaben (capture_sessions), deren owner_user_id auf seiner user_id matched.
- AC-2: Mitarbeiter kann Aufgabe oeffnen und in QuestionnaireMode-Layout Fragen beantworten.
- AC-3: Block-Submit funktioniert: `block_checkpoint` entsteht, `ai_jobs` mit type='employee_questionnaire_processing' (oder 'knowledge_unit_condensation' mit capture_mode='employee_questionnaire') wird enqueued.
- AC-4: Worker verarbeitet Job, erzeugt knowledge_unit-Rows mit source='employee_questionnaire'.
- AC-5: Nach Verdichtung sieht tenant_admin im Debrief-UI die neuen KUs mit Badge "Mitarbeiter".
- AC-6: **Vollstaendige RLS-Test-Matrix (32 Pflicht-Faelle) gruen**. Kein `.todo()` mehr.
- AC-7: employee erreicht `/admin/*`, `/dashboard/*` NICHT (Redirect oder 403).
- AC-8: employee kann andere Mitarbeiter-Aufgaben (andere user_ids) nicht laden (Server-Component 404 oder Redirect).
- AC-9: Cross-Tenant-Isolation: employee-User von Tenant A sieht weder Tenant B-Aufgaben noch Tenant B-Mitarbeiter.
- AC-10: UI-Badge "Mitarbeiter" sichtbar in Debrief-KU-Liste und KU-Editor.
- AC-11: Browser-Smoke-Test Happy-Path: tenant_admin approved Bridge-Proposal → Mitarbeiter loggt sich ein → sieht Aufgabe → beantwortet → submittet → KUs erscheinen beim tenant_admin mit Badge.

## Dependencies
- Vorbedingung: SLC-033 + SLC-034 done (Schema + Auth).
- Vorbedingung: SLC-036 done (Bridge-Proposal kann approvet werden und spawned Session).
- Vorbedingung: Bestehender QuestionnaireMode (SLC-005/006) funktioniert unveraendert.
- Folge-Voraussetzung fuer: SLC-039 (Handbuch braucht employee-KUs), SLC-040 (Cockpit zeigt Mitarbeiter-Metriken).

## Worktree
Mandatory (SaaS, RLS-kritisch).

## Migrations-Zuordnung
Keine neuen Migrationen. Ggf. Mini-Migration falls Block-Submit-RPC einen optionalen `source`-Parameter bekommt.

## Pflicht-QA-Vorgaben
- **Pflicht-Gate: 4×8 RLS-Test-Matrix vollstaendig gruen (32 Pflicht-Faelle + ~8 zusaetzliche Aktiv-Faelle).** Dies ist die R16-Mitigation und SC-V4-3-Abnahme.
- Browser-Smoke-Test Happy-Path wie in AC-11.
- Browser-Smoke-Test Cross-Tenant: 2 Employees je in Tenant A und B testen, Zugriff auf fremde Ressourcen ueberprueft.
- Worker-Logs: employee-KU hat korrekt source='employee_questionnaire' gesetzt.
- Debrief-UI zeigt Badge korrekt.
- `npm run test` gruen.
- `npm run build` gruen.
- Data-Residency: Bedrock-Calls fuer Mitarbeiter-Verdichtung auch in eu-central-1 (bestehender Client).
- IMP-112: Re-Read vor Write.

## Risks
- R16 (Mitarbeiter-Sicht-Perimeter): Kritisch. Jede vergessene Policy ist ein Datenleck. Mitigation: Test-Matrix-Vervollstaendigung + manuelle Review der Migration 075 vor Abnahme.
- R17 (Mitarbeiter-UX): Nicht-Tech-User koennen UI nicht verstehen. Mitigation: Simple Layout, klare Headline pro Aufgabe, kein ueberlaufendes Feature-Set.
- Q27-Entscheidung: Mitarbeiter-Diagnose entsteht automatisch — das bedeutet Bedrock-Kosten pro Mitarbeiter-Block-Submit. Akzeptiert, weil Pipeline einheitlich bleibt.

### Micro-Tasks

#### MT-1: EmployeeQuestionnaireMode-Komponente
- Goal: Wrapper um bestehende QuestionnaireMode, mit Mitarbeiter-spezifischem Header.
- Files: `src/components/capture-modes/employee-questionnaire/EmployeeQuestionnaireMode.tsx` + Unit-Tests falls relevant
- Expected behavior: Wrapped QuestionnaireMode. Eigener Header (ohne GF-spezifische UI-Elemente). Navigation zurueck zu /employee statt zu /dashboard. Keine "Debrief-Vorschau"-Buttons.
- Verification: Visual-Check im Browser.
- Dependencies: bestehende QuestionnaireMode
- TDD-Note: UI-Tests optional.

#### MT-2: Registry-Eintrag + Capture-Route-Delegation
- Goal: `/capture/[sessionId]/page.tsx` delegiert per Registry auf EmployeeQuestionnaireMode.
- Files: `src/components/capture-modes/registry.ts`, evtl. `/src/app/capture/[sessionId]/page.tsx` oder eigene `/src/app/employee/capture/[sessionId]/page.tsx`
- Expected behavior: CAPTURE_MODE_REGISTRY["employee_questionnaire"] = EmployeeQuestionnaireMode. Bestehende Route prueft capture_mode und waehlt Komponente.
- Verification: Aufruf mit Mitarbeiter-Session rendert EmployeeQuestionnaireMode.
- Dependencies: MT-1
- TDD-Note: None.

#### MT-3: /employee Route — Aufgaben-Liste
- Goal: Dashboard mit Aufgaben-Liste.
- Files: `src/app/employee/page.tsx`, `src/app/employee/EmployeeTaskList.tsx`
- Expected behavior: Server-Component laedt eigene capture_sessions (RLS-gefiltert). Rendert Liste mit Status-Badges + Start-Button.
- Verification: Browser-Check: Mitarbeiter sieht seine Aufgaben, keine fremden.
- Dependencies: SLC-034 done
- TDD-Note: None.

#### MT-4: Worker-Handler employee_questionnaire_processing (Thin-Wrapper)
- Goal: Handler registriert Job-Type, delegiert an bestehenden Condensation-Pfad.
- Files: `src/workers/capture-modes/employee-questionnaire/handle.ts` + Tests
- Expected behavior: Handler empfaengt Job, ruft die bestehende handle-condensation-job-Funktion oder macht selbst den Call mit passendem Source-Tag.
- Verification: Integration-Test: Mitarbeiter-Block-Submit → Worker erzeugt KU mit source='employee_questionnaire'.
- Dependencies: MT-3
- TDD-Note: TDD empfohlen fuer Source-Tag-Verifikation.

#### MT-5: Block-Submit-Action anpassen
- Goal: Block-Submit fuer capture_mode='employee_questionnaire' setzt korrekt Source.
- Files: bestehende Block-Submit-Action erweitern ODER Worker-Handler aus MT-4 liest capture_mode und setzt Source.
- Expected behavior: KUs aus employee-Blocks haben source='employee_questionnaire' (CHECK-Constraint aus SLC-033 schon vorhanden).
- Verification: Integration-Test + DB-Check.
- Dependencies: MT-4
- TDD-Note: Einfachster Weg: Worker liest capture_session.capture_mode vor INSERT.

#### MT-6: UI-Badge fuer Mitarbeiter-KU in Debrief
- Goal: Debrief-UI (bestehend) zeigt Badge "Mitarbeiter" bei KUs mit source='employee_questionnaire'.
- Files: `src/components/debrief/KnowledgeUnitCard.tsx` o.ae.
- Expected behavior: Wenn source='employee_questionnaire': Badge mit Farbe (z.B. lila oder teal) + Tooltip.
- Verification: Browser-Check mit Fixture-KU.
- Dependencies: MT-4
- TDD-Note: None.

#### MT-7: RLS-Matrix-Vervollstaendigung + Aktiv-Tests
- Goal: Alle 32 Pflicht-Faelle + 8 zusaetzliche Aktiv-Faelle gruen.
- Files: `src/__tests__/rls/v4-perimeter-matrix.test.ts` (aus SLC-033)
- Expected behavior: Alle `.todo()` implementiert. Neue Aktiv-Faelle: employee UPDATE eigene vs. fremde capture_session (eigenes gruen, fremdes PE); employee INSERT knowledge_unit fuer eigene vs. fremde Session; employee SELECT validation_layer eigene vs. fremde KU.
- Verification: `npm run test -- v4-perimeter-matrix` komplett gruen, keine skipped/todo.
- Dependencies: MT-3
- TDD-Note: Pflicht-Gate.

#### MT-8: Employee-Routing-Sicherheit in Middleware
- Goal: Middleware blockiert employee auf /admin, /dashboard.
- Files: `src/lib/supabase/middleware.ts` (bereits in SLC-034 angepasst, hier Vervollstaendigung)
- Expected behavior: role='employee' Request auf /admin/*, /dashboard/*, /admin/bridge/*, /admin/team/*, /admin/tenants/* → Redirect zu /employee.
- Verification: Browser-Test: direkter URL-Aufruf als employee → Redirect.
- Dependencies: SLC-034
- TDD-Note: Middleware-Test.

#### MT-9: Browser-Smoke-Test E2E + Record-Updates
- Goal: Happy-Path + Cross-Tenant durchspielen + Record-Updates.
- Files: `docs/STATE.md`, `slices/INDEX.md`, `planning/backlog.json`
- Expected behavior: E2E dokumentiert im Completion-Report. SLC-037 done, BL-041 + BL-043 (soweit Capture-Workflow abgedeckt) in_progress→done falls Feature komplett. FEAT-022 + FEAT-024 Status-Update in features/INDEX.md.
- Verification: Re-Read vor Write (IMP-112).
- Dependencies: MT-1..MT-8
- TDD-Note: Doku + manueller E2E.

## Aufwand-Schaetzung
~8-10 Stunden. RLS-Matrix-Vervollstaendigung kann aufwendig sein (+2-3h). Gesamt: ~10-13 Stunden.
