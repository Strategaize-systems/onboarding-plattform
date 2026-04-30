# SLC-047 — Wizard-Modal Frontend (4 Steps + Skip + Auto-Trigger im Layout)

## Goal
Frontend-Implementation des Tenant-Onboarding-Wizards. 4-Schritte-Modal (shadcn `Dialog`) mit Step-Persistenz auf `tenants.onboarding_wizard_step` (aus SLC-046), Skip-Mechanismen pro Schritt, Multi-Admin-Lock-handling im Auto-Trigger des `/dashboard/layout.tsx`, und Was-nun-Cards mit Quick-Actions zu Capture/Bridge/Handbuch. Wiederverwendung der bestehenden `inviteEmployees`-Server-Action aus SLC-034 fuer Schritt 3.

## Feature
FEAT-031 (Tenant-Onboarding-Wizard) — Frontend-Anteil

## In Scope

### A — Wizard-Modal-Container

Pfad: `src/components/onboarding-wizard/Wizard.tsx` (neu)

Verhalten:
- Nutzt shadcn `Dialog` mit `open` Prop (vom Layout-Parent gesteuert) + `onOpenChange` (verhindert Close per Outside-Click waehrend laufendem Wizard).
- `initialStep` Prop (1..4) aus `tenants.onboarding_wizard_step` (SLC-046 MT-3).
- Lokaler React-State fuer aktuellen Step + Form-Daten (selectedTemplateId, employeeInputs).
- Render conditional einen der 4 Step-Komponenten basierend auf currentStep.
- Footer-Bereich mit "Spaeter"-Button (links, ruft `setWizardSkipped` SLC-046 MT-2) und "Weiter"-Button (rechts, validiert + ruft `setWizardStep(step+1)`).
- Auf Schritt 4: Footer-Buttons sind "Schliessen + nicht mehr zeigen" (ruft `setWizardSkipped`) und "Erledigt" (ruft `setWizardCompleted`).
- Error-Boundary umrahmt den ganzen Wizard: bei Crash → ruft `setWizardSkipped` + zeigt minimale Fallback-UI mit Link zum Cockpit (Constraint aus PRD: Wizard darf User nicht aussperren).

### B — 4 Step-Komponenten

Pfad: `src/components/onboarding-wizard/steps/` (neu, 4 Files)

**Step1Welcome.tsx:**
- Titel: "Willkommen bei Strategaize"
- Body: 2-3 Saetze die Tool-Zweck erklaeren ("Hier erheben wir strukturiert Wissen aus Ihrem Unternehmen — KI hilft beim Verdichten, Berater unterstuetzt im Review.")
- Tenant-Name aus Context oder Props.
- Nur "Weiter"-Button aktiv.

**Step2TemplatePick.tsx:**
- Titel: "Welche Wissenserhebung moechten Sie starten?"
- Liste der aktiven Templates aus `template`-Tabelle (V4.2 hat mind. Exit-Readiness als Default).
- Radio-Buttons-Pattern (shadcn `RadioGroup`).
- Default-Selektion: erstes Template (Exit-Readiness).
- Validation: mindestens ein Template ausgewaehlt fuer "Weiter".

**Step3EmployeeInvite.tsx:**
- Titel: "Wen aus Ihrem Team moechten Sie einladen?"
- Body-Hinweis: "Optional — Sie koennen das auch spaeter unter Mitarbeiter machen."
- Inline-Form mit Add-Row-Button: 0..N Inputs (E-Mail + Anzeigename + optional Position).
- Validation: per E-Mail-Input nur Submit-Time-Validierung (Empfehlung Architektur Q-V4.2-H), kein Inline-Live-Check.
- Submit-Button "Mitarbeiter einladen + Weiter":
  - Wenn 0 Eintraege: direkt setWizardStep(4) (User darf 0 Mitarbeiter einladen — Solo-GF-Fall).
  - Wenn >=1 Eintraege: ruft `inviteEmployees`-Server-Action (existiert seit SLC-034). Bei Erfolg: zeigt "X Mitarbeiter eingeladen" Bestaetigungs-Toast + setWizardStep(4). Bei Fehler: Inline-Error-Display, Step bleibt.
- Skip-Button: "Spaeter einladen" (nicht setWizardSkipped — User darf nur diesen Schritt skippen!) → setWizardStep(4) ohne Mitarbeiter-INSERT.

**Step4WhatNow.tsx:**
- Titel: "Was moechten Sie als naechstes tun?"
- 3 Quick-Action-Cards (shadcn `Card` mit `Link`):
  - Card 1: "Wissenserhebung starten" → `/capture/[sessionId]` (sessionId aus dem im Schritt 2 gewaehlten Template — neue Capture-Session erstellen via bestehende Server-Action, oder Verlinkung auf Template-Auswahl-Page falls Session noch nicht existiert)
  - Card 2: "Bridge-Engine nutzen" → `/admin/bridge` (sichtbar fuer tenant_admin)
  - Card 3: "Handbuch generieren" → `/admin/handbook` (sichtbar fuer tenant_admin)
- Footer: "Schliessen + nicht mehr zeigen" und "Erledigt"-Buttons.

### C — Auto-Trigger im Layout

Pfad: `src/app/dashboard/layout.tsx` (geaendert)

Verhalten:
- Server-Component ruft `getWizardStateForCurrentUser()` (SLC-046 MT-3).
- Wenn `shouldShow=true`: rendere `<WizardModal initialStep={state.step} />` als Sibling zum Cockpit-Inhalt.
- Wenn `state='pending'`: Initial-Render des Wizards triggert via Client-side Effect den `setWizardStarted()`-Call. Wenn `alreadyStarted=true` zurueck: Modal schliesst sofort (anderer Admin war schneller), Cockpit erscheint normal.
- Wenn `state='started'`: User kommt mit Wizard-Resume-Funktionalitaet zurueck — initialStep aus state.step.

### D — Tests

- `src/components/onboarding-wizard/__tests__/Wizard.test.tsx` (neu): Step-Render-Tests + Skip-Pfade + Multi-Admin-Lock-handling (mock setWizardStarted returns alreadyStarted=true → Modal closes).
- `src/components/onboarding-wizard/steps/__tests__/Step3EmployeeInvite.test.tsx`: Form-Validation + 0-Eintraege-Pfad + inviteEmployees-Mock-Call.
- `src/app/dashboard/__tests__/layout.test.tsx` (oder existing erweitern): Wizard-Auto-Trigger nur fuer tenant_admin mit shouldShow=true.

## Out of Scope

- Wizard-Repeat-Trigger nach 30 Tagen Inaktivitaet (V5+)
- Branchen-/Firmen-Groesse-Erfassung (DEC-052: nicht in V4.2)
- KI-Vorschlaege fuer Mitarbeiter (V5+)
- Onboarding-Tour-Overlay (DEC-058: explizit nicht V4.2)
- Wizard fuer tenant_member oder employee (DEC-051)

## Acceptance Criteria

- AC-1: Wizard-Modal oeffnet automatisch beim ersten Login eines tenant_admin mit `tenants.onboarding_wizard_state='pending'` und `0 capture_sessions` (verifiziert via Browser-Smoke).
- AC-2: Wizard-Modal oeffnet NICHT fuer strategaize_admin (verifiziert via Browser-Smoke mit Berater-Account).
- AC-3: Schritt 1 zeigt Tenant-Name + Begruessungs-Text, "Weiter"-Button setzt step=2.
- AC-4: Schritt 2 zeigt aktive Templates als Radio-Buttons, Default-Selektion = erstes Template, "Weiter" setzt step=3.
- AC-5: Schritt 3 erlaubt 0..N Mitarbeiter-Inputs. 0 Eintraege + "Mitarbeiter einladen + Weiter" springt zu Schritt 4 ohne INSERT. >=1 Eintraege ruft inviteEmployees + Toast + Schritt 4.
- AC-6: Schritt 3 hat "Spaeter einladen"-Button der NUR diesen Schritt skipt (Step=4, kein setWizardSkipped).
- AC-7: Schritt 4 zeigt 3 Quick-Action-Cards, alle drei sind klickbar und navigieren zu Capture/Bridge/Handbuch.
- AC-8: Schritt 4 "Schliessen + nicht mehr zeigen" → setWizardSkipped → state='skipped'. "Erledigt" → setWizardCompleted → state='completed'.
- AC-9: Browser-Reload waehrend Wizard (z.B. auf Schritt 3) → User landet auf Schritt 3 (initialStep aus state.step).
- AC-10: "Spaeter"-Button auf Schritt 1 oder 2 → setWizardSkipped → state='skipped' → Modal schliesst → naechster Login zeigt Wizard NICHT.
- AC-11: Multi-Admin-Race: zwei parallele Logins → erster sieht Wizard, zweiter sieht direkt Cockpit (alreadyStarted=true Pfad). Test via Mock setWizardStarted-Response.
- AC-12: Error-Boundary: Bei JS-Exception im Wizard → setWizardSkipped + Fallback-UI + Cockpit erreichbar (User nicht ausgesperrt).
- AC-13: `npm run build` + `npm run test` gruen.
- AC-14: TypeScript strict — kein `any`, keine `@ts-ignore`.

## Dependencies

- Vorbedingung: SLC-046 done (Schema + Server-Actions + getWizardStateForCurrentUser).
- Vorbedingung: V4 SLC-034 `inviteEmployees`-Server-Action existiert.
- Nachgelagert: Wizard nutzt Cockpit-Layout (existing). Keine V4.2-Slice abhaengig von SLC-047.

## Worktree

Mandatory (SaaS).

## Migrations-Zuordnung

Keine — Schema-Aenderungen alle in MIG-029 (SLC-046).

## Pflicht-QA-Vorgaben

- **Pflicht-Gate: Browser-Smoke-Test** mit Nicht-Tech-User-Persona — siehe SC-V4.2-9. Nicht-Tech-User schafft Wizard-Durchlauf ohne Berater-Hilfe + ohne Frust.
- Step-Persistenz-Test: Browser-Reload zwischen Schritten landet User auf letztem persistiertem Step.
- Multi-Admin-Race-Test (Mock).
- Skip-Pfade aus jedem Schritt funktionieren.
- Cross-Role-Test: strategaize_admin sieht Wizard NIE.
- `npm run test` + `npm run build` gruen.
- Cockpit-Records-Update nach Slice-Ende: slices/INDEX.md SLC-047 status `done`.

## Risks

- **R1 — Wizard-State-Drift wenn Network-Fehler bei setWizardStep:** Mitigation = Server-Action wirft Error, Client zeigt Inline-Error-Toast, User kann Retry. Step-State bleibt persistiert auf letztem erfolgreichen Step.
- **R2 — inviteEmployees-Server-Action-Konflikt mit Schritt 3:** Mitigation = bestehende Server-Action wird ohne Aenderung wiederverwendet. Falls Anpassung noetig (Q-V4.2-H Form-Validierung): kleine Modifikation in SLC-047, nicht V4.2-Architektur-Bruch.
- **R3 — Wizard-Modal blockiert Cockpit fuer alle anderen User-Aktionen:** Mitigation = Modal ist nicht-blockierend implementiert (User kann Esc oder "Spaeter" jederzeit klicken). DSGVO + UX akzeptabel.
- **R4 — Step-3 Form-Validation zu permissiv:** E-Mail-Validation passiert Submit-Time. Falls invalid: Inline-Error-Display am betroffenen Input. Mitigation = Validation-Pattern aus existing employee-invitation Form (SLC-034).

### Micro-Tasks

#### MT-1: WizardModal-Container + State-Management
- Goal: Wizard-Modal-Container in `src/components/onboarding-wizard/Wizard.tsx` mit shadcn `Dialog`, lokalem State, Footer-Buttons, und Error-Boundary.
- Files: `src/components/onboarding-wizard/Wizard.tsx` (neu), `src/components/onboarding-wizard/__tests__/Wizard.test.tsx` (neu)
- Expected behavior: Modal rendert basierend auf currentStep einen der 4 Step-Komponenten. Footer-Buttons rufen Server-Actions aus SLC-046. Error-Boundary faellt auf setWizardSkipped + Fallback-UI.
- Verification: Vitest-Tests fuer Step-Switching + Skip-Pfade + Multi-Admin-Lock-Mock.
- Dependencies: SLC-046 done

#### MT-2: Step1Welcome + Step2TemplatePick
- Goal: Erste zwei Step-Komponenten implementieren.
- Files: `src/components/onboarding-wizard/steps/Step1Welcome.tsx` (neu), `src/components/onboarding-wizard/steps/Step2TemplatePick.tsx` (neu)
- Expected behavior: Step1 zeigt Begruessung mit Tenant-Name; Step2 listet aktive Templates als shadcn `RadioGroup`, Default = erstes Template.
- Verification: Render-Tests + "Weiter"-Click triggert step+1.
- Dependencies: MT-1

#### MT-3: Step3EmployeeInvite mit Form + inviteEmployees-Integration
- Goal: Inline-Form fuer 0..N Mitarbeiter-Inputs + Submit-Time-Validation + Aufruf bestehender inviteEmployees-Action.
- Files: `src/components/onboarding-wizard/steps/Step3EmployeeInvite.tsx` (neu), `src/components/onboarding-wizard/steps/__tests__/Step3EmployeeInvite.test.tsx` (neu)
- Expected behavior: 0 Eintraege → Sprung zu Schritt 4. >=1 Eintraege → inviteEmployees-Call + Toast + Schritt 4. "Spaeter einladen"-Button springt zu Schritt 4 ohne INSERT.
- Verification: Form-Validation-Tests, 0-Eintraege-Pfad, Mock inviteEmployees-Call, "Spaeter"-Pfad.
- Dependencies: MT-1, V4 SLC-034 inviteEmployees existiert.

#### MT-4: Step4WhatNow mit 3 Quick-Action-Cards
- Goal: Was-nun-Step mit 3 klickbaren Cards die zu Capture/Bridge/Handbuch verlinken.
- Files: `src/components/onboarding-wizard/steps/Step4WhatNow.tsx` (neu)
- Expected behavior: 3 shadcn `Card` mit `Link`-Komponenten. "Erledigt"-Button → setWizardCompleted. "Schliessen + nicht mehr zeigen" → setWizardSkipped.
- Verification: Render-Test + Click-Test fuer alle 3 Cards + Footer-Buttons.
- Dependencies: MT-1

#### MT-5: Layout-Integration (Auto-Trigger im /dashboard/layout)
- Goal: `/dashboard/layout.tsx` mit getWizardStateForCurrentUser-Aufruf erweitern + Conditional-Render des WizardModal.
- Files: `src/app/dashboard/layout.tsx` (geaendert)
- Expected behavior: Server-Component ruft Helper, rendert `<WizardModal>` nur wenn shouldShow=true. setWizardStarted-Call passiert client-side beim Initial-Render des Modals (useEffect).
- Verification: Browser-Smoke + Mock-Test (tenant_admin sieht Modal, strategaize_admin nicht).
- Dependencies: MT-1, MT-2, MT-3, MT-4 (alle Step-Komponenten muessen renderbar sein)

#### MT-6: Step-Persistenz-Browser-Reload-Test
- Goal: Verifikation dass Browser-Reload waehrend Wizard zum letzten persistierten Schritt fuehrt.
- Files: `src/components/onboarding-wizard/__tests__/persistence.test.tsx` (neu) — Integration-Test mit DB-Mock
- Expected behavior: Mock setWizardStep(2), Reload → initialStep=2 vom Server geladen → Wizard rendert Schritt 2.
- Verification: Vitest-Integration-Test gruen.
- Dependencies: MT-5

#### MT-7: Browser-Smoke-Test mit Nicht-Tech-User
- Goal: SC-V4.2-9 Pflicht-Gate. Realer User (Person die Tool nicht kennt) durchlaeuft den ganzen Wizard ohne Berater-Hilfe + ohne Mausschubsen.
- Files: keine (Test-Dokumentation in Slice-Report)
- Expected behavior: Person schafft (a) Wizard durchlaufen, (b) Mitarbeiter einladen, (c) erste Capture-Session starten, (d) Help-Sheet noch nicht erforderlich (kommt SLC-050).
- Verification: User-Bestaetigung + Screenshot-Sequenz im Slice-Report.
- Dependencies: alle MTs done + SLC-046 deployed.
- Pflicht-Gate: dieser MT ist der R17/SC-V4.2-9-Beweis.
