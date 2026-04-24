# SLC-036 — Bridge-Review-UI

## Goal
tenant_admin-UI fuer Bridge-Laeufe: Auslösen, Status beobachten, Proposals pro Lauf reviewen, editieren, approven oder rejecten. Approved Proposals spawnen automatisch eine Mitarbeiter-capture_session (RPC aus SLC-035). Stale-Hinweis sichtbar. Kein Diff-View zwischen Laeufen (V4.1). Stabile, nicht-überdekorierte Oberflaeche.

## Feature
FEAT-023

## In Scope
- Route `/admin/bridge/page.tsx` (oder `/dashboard/bridge`) — Server-Component:
  - Laedt aktuelle capture_session des Tenants (GF-Blueprint-Session).
  - Laedt juengsten bridge_run (falls vorhanden) + dessen bridge_proposals.
  - Laedt aktive Employees des Tenants (fuer Mitarbeiter-Auswahl im Edit-Dialog).
  - Zeigt Bridge-Button "Bridge ausfuehren" / "Bridge erneut ausfuehren" je nach State.
- Client-Component `BridgeRunList.tsx`:
  - Liste aller bridge_runs derselben capture_session mit Status-Badge (running/completed/failed/stale).
  - Toggle "Vorgaenger-Laeufe zeigen" (DEC-039).
  - Fuer juengsten completed/stale: verlinkte Proposal-Liste.
- Client-Component `BridgeProposalList.tsx`:
  - Karten pro bridge_proposal mit: Mode-Badge (Template/Free-Form), subtopic_key (falls Template), proposed_block_title, Kurzbeschreibung, proposed_employee (Name oder role_hint), Status-Badge.
  - Je Proposal Buttons: "Bearbeiten", "Approven", "Rejecten".
- Client-Component `BridgeProposalEditDialog.tsx`:
  - Form-Felder: title, description, questions (editable Array), employee-Auswahl (Dropdown mit Tenant-Mitarbeitern + "Noch nicht zuordnen").
  - Bei "Approven": Submit ruft `rpc_approve_bridge_proposal` mit edited_payload.
  - Bei "Rejecten": Reason-Textarea + Submit `rpc_reject_bridge_proposal`.
- Server-Action `triggerBridgeRun(captureSessionId)` in `src/actions/bridge/trigger.ts`:
  - tenant_admin-Check.
  - Ruft rpc_trigger_bridge_run.
  - Triggert Revalidate auf /admin/bridge.
- Server-Action `approveBridgeProposal(proposalId, editedPayload)` in `src/actions/bridge/approve.ts`:
  - Ruft rpc_approve_bridge_proposal.
  - Revalidate Bridge-Page + Dashboard.
  - Return spawned capture_session_id fuer Optional "Zur Aufgabe springen"-Link.
- Server-Action `rejectBridgeProposal(proposalId, reason)` in `src/actions/bridge/reject.ts`.
- Stale-Indikator-Component `StaleBanner.tsx`:
  - Orange Banner wenn juengster bridge_run.status='stale'.
  - Text: "Neue Bloecke wurden submitted seit dem letzten Bridge-Lauf. Bridge neu ausfuehren?"
  - Button "Jetzt neu ausfuehren".
- Bridge-Run-Status-Polling (leichtgewichtig):
  - Bei status='running' wird die Page per Server-Component-Refresh in Intervallen aktualisiert (`revalidatePath` nach 3s) oder client-seitiger Poll auf ein kleines Status-Endpoint `/api/bridge/run/[id]/status`.
  - Simpler Weg: nach Trigger zeigt UI "Wird verarbeitet, ggf. Seite neu laden"; nach 10s Auto-Reload via meta-refresh.
- Verknuepfung: Sidebar-Link "Bridge" fuer tenant_admin in bestehender DashboardSidebar.
- Cost-Display: bridge_run.cost_usd sichtbar (klein, unter Status) als Orientierung.
- `npm run build` gruen, TypeScript strict kompatibel.

## Out of Scope
- Diff-View zwischen Bridge-Laeufen (V4.1).
- Bridge-Prompt-Editor (spaeter).
- Bulk-Approve/Reject aller Proposals (spaeter falls Bedarf).
- Mitarbeiter-Sicht der Aufgabe (SLC-037).
- WebSocket/Realtime-Poll (einfaches polling reicht).
- Re-Assignment eines spawned Proposals auf anderen Employee (spaeter).

## Acceptance Criteria
- AC-1: tenant_admin mit ≥1 submitted Block kann Bridge-Run auslösen → bridge_run-Status sichtbar.
- AC-2: Nach Worker-Abschluss (manuell oder nach 10-30s warten) zeigt UI alle Proposals mit Mode-Badge und Status.
- AC-3: Edit-Dialog erlaubt Aenderung von Titel, Description, Questions und Employee-Zuordnung. Save → Proposal-Status=edited oder approved (bei Save+Approve).
- AC-4: Approve-Button erzeugt Mitarbeiter-capture_session. Proposal-Status=spawned. Optionale Link-Option "Zur Aufgabe springen" zeigt die gespawnte Session.
- AC-5: Reject-Button mit Reason setzt Status=rejected.
- AC-6: Wenn ein neuer Block nach Bridge-Run submitted wurde: Stale-Banner ist sichtbar.
- AC-7: Nicht-tenant_admin (employee, tenant_member) erreicht Route NICHT (Redirect oder 403).
- AC-8: Cross-Tenant-Isolation: tenant_admin sieht NUR bridge_runs seines Tenants.
- AC-9: Approve mit edited_payload (geaenderte Frage-Reihenfolge) resultiert in gespawnter capture_session mit den geaenderten Fragen im Template-Snapshot (Feld `proposed_questions` der bridge_proposal bleibt unver aendert als Audit — die capture_session nutzt die final approvierten Fragen).
- AC-10: Keine browser-seitigen console.errors oder fehlerhaften Network-Calls auf der Route.
- AC-11: Responsive: Karten-Layout bricht auf mobile Viewport (sm) sauber um (1 Spalte).

## Dependencies
- Vorbedingung: SLC-035 done (RPCs + Worker vorhanden).
- Vorbedingung: SLC-034 done (Employees existieren fuer Dropdown).
- Folge-Voraussetzung fuer: SLC-037 (Mitarbeiter bearbeitet gespawnte Session), SLC-040 (Cockpit zeigt Bridge-Status).

## Worktree
Empfohlen (SaaS, UI-Slice).

## Migrations-Zuordnung
Keine Migration in diesem Slice.

## Pflicht-QA-Vorgaben
- `/qa` muss folgende Punkte abdecken:
  - Browser-Smoke-Test manuell: Trigger → Wait → Proposals sichtbar → Edit → Approve → Mitarbeiter-Session exists → Reject anderes Proposal → Stale-Banner nach zweitem Submit.
  - Cross-Tenant-Isolation: 2 Tenants parallel testen.
  - Nicht-Tech-User-Pruefung: kann tenant_admin ohne Erklaerung die Proposals verstehen und einschaetzen? → Teil des Nicht-Tech-User-Smoke-Tests (auch hier relevant, nicht erst in SLC-040).
  - `npm run test` gruen (existierende Tests brechen nicht).
  - `npm run build` gruen.
  - Playwright-oder-manueller-E2E-Test fuer Happy-Path.
- IMP-112: Re-Read vor Write.

## Risks
- Worker-Latenz (Bedrock-Calls ~20-60s): UI darf nicht einfrieren. Mitigation: Status-Anzeige + Revalidate-Pattern.
- Prompt-Output-Qualitaet → schlechte Proposals. Nicht-UI-Problem, aber UI muss Edit leicht machen. Mitigation: Edit-Dialog mit allen Feldern, role_hint Fallback prominent.
- Edit-Audit-Trail: bridge_proposal-Original-Felder bleiben in DB; Edit ueberschreibt. Protokollierung in bridge_proposal.updated_at reicht fuer V4. Kein Versionierungs-Historie (V4.1).

### Micro-Tasks

#### MT-1: Server-Component /admin/bridge/page.tsx
- Goal: Laedt Daten und rendert Layout.
- Files: `src/app/admin/bridge/page.tsx`, `src/app/admin/bridge/layout.tsx` (falls noetig)
- Expected behavior: role-Check tenant_admin (oder strategaize_admin). Laedt aktuelle GF-capture_session, juengsten bridge_run (inkl. proposals), alle bridge_runs (fuer Toggle), Tenant-Employees. Rendert `BridgeRunList`, `StaleBanner`, `BridgeProposalList`, Trigger-Button.
- Verification: Browser-Check: Seite laedt ohne Server-Error. Status-Badges korrekt.
- Dependencies: SLC-035 done
- TDD-Note: Server-Component-Tests optional, manueller Browser-Test ausreichend.

#### MT-2: Client-Components BridgeRunList + StaleBanner
- Goal: Darstellung der Run-Liste und Stale-Hinweis.
- Files: `src/app/admin/bridge/BridgeRunList.tsx`, `src/app/admin/bridge/StaleBanner.tsx`
- Expected behavior: RunList zeigt Liste mit Status-Badge + created_at + proposal_count + cost_usd. Toggle "Vorgaenger-Laeufe zeigen". StaleBanner erscheint bei status='stale'.
- Verification: Storybook/visual check oder einfacher Manual-Test.
- Dependencies: MT-1
- TDD-Note: Unit-Tests optional.

#### MT-3: Client-Component BridgeProposalList + Card
- Goal: Proposal-Kachel-Darstellung.
- Files: `src/app/admin/bridge/BridgeProposalList.tsx`, `src/app/admin/bridge/BridgeProposalCard.tsx`
- Expected behavior: Karten mit allen Pflicht-Feldern. Action-Buttons rufen Server-Actions. Status-Badges farblich (proposed/edited grau, approved/spawned gruen, rejected rot).
- Verification: Visual-Test mit Fixture-Daten.
- Dependencies: MT-2
- TDD-Note: Unit-Tests optional.

#### MT-4: Client-Component BridgeProposalEditDialog
- Goal: Edit-Dialog mit Formular.
- Files: `src/app/admin/bridge/BridgeProposalEditDialog.tsx`
- Expected behavior: shadcn/ui Dialog + Form. Fragen als Array-Editor (Add/Remove/Reorder). Employee-Dropdown aus props. Save-Button + "Save & Approve"-Button.
- Verification: Browser-Test: Dialog oeffnet, Feldaenderungen bleiben, Save schliesst Dialog und triggert Revalidate.
- Dependencies: MT-3
- TDD-Note: UI-Tests optional, E2E wichtiger.

#### MT-5: Server-Actions trigger/approve/reject
- Goal: 3 Actions in `src/actions/bridge/`
- Files: `src/actions/bridge/trigger.ts`, `src/actions/bridge/approve.ts`, `src/actions/bridge/reject.ts` + Tests
- Expected behavior: Rollen-Check, RPC-Aufruf, revalidatePath. Return {ok, error} fuer Client-Feedback.
- Verification: Unit-Tests mit Mock-Supabase-Client. Integration-Test mit realer Coolify-DB.
- Dependencies: MT-1
- TDD-Note: TDD Pflicht.

#### MT-6: Sidebar-Link + Navigation
- Goal: Bridge-Link in DashboardSidebar (oder TenantAdminShell).
- Files: `src/components/navigation/DashboardSidebar.tsx` o.ae.
- Expected behavior: Link "Bridge" sichtbar fuer tenant_admin + strategaize_admin. Aktiv-Highlight bei /admin/bridge.
- Verification: Browser-Check.
- Dependencies: MT-1
- TDD-Note: None.

#### MT-7: E2E-Browser-Smoke + Record-Updates
- Goal: Manueller E2E-Happy-Path + Record-Updates.
- Files: `docs/STATE.md`, `slices/INDEX.md`, `planning/backlog.json`
- Expected behavior: E2E durchspielen (echter Browser). Dokumentieren im Completion-Report. SLC-036 done, BL-042 bleibt in_progress (Backend+UI gemeinsam abgedeckt, Bridge-Feature als Ganzes fertig).
- Verification: Re-Read vor Write (IMP-112).
- Dependencies: MT-1..MT-6
- TDD-Note: Doku + E2E-Check.

## Aufwand-Schaetzung
~6-8 Stunden netto. UI-Feinheiten (Edit-Dialog mit Array-Editor) koennen Zeit kosten. Puffer: +2h. Gesamt: ~8-10 Stunden.
