# SLC-029 — Dialogue Session UI

## Goal
Jitsi-Embed in der Plattform, DSGVO-Consent-Flow, Meeting-Guide-Seitenpanel, Recording-Status-Anzeige. Nutzer koennen aus der Plattform heraus ein Video-Meeting fuehren.

## Feature
FEAT-019

## In Scope
- Dialogue Session Page (Auftraggeber-Sicht: erstellen, verwalten)
- Jitsi IFrame API Embed (Meeting im Browser)
- DSGVO Consent-Flow vor Meeting-Beitritt
- Meeting-Guide Seitenpanel waehrend des Meetings
- Recording-Status-Anzeige
- Meeting-Ende-Handling (Status-Update, Trigger fuer Pipeline)
- Fallback: Direkter Jitsi-Link wenn IFrame blockiert
- i18n Keys

## Out of Scope
- Recording-Verarbeitung (SLC-030)
- Meeting-Summary-Ansicht (SLC-032)

## Acceptance Criteria
- AC-1: Auftraggeber kann Dialogue-Session mit 2 Teilnehmern erstellen
- AC-2: Consent-Screen vor Meeting-Beitritt (beide Teilnehmer)
- AC-3: Jitsi-Meeting laeuft im Browser (IFrame oder Link)
- AC-4: Meeting-Guide sichtbar waehrend des Meetings
- AC-5: Recording-Status sichtbar (aktiv/inaktiv)
- AC-6: Nach Meeting-Ende: Status wechselt, Pipeline wird getriggert

## Dependencies
- SLC-025 (Jitsi laeuft)
- SLC-027 (Meeting Guide UI existiert)
- SLC-028 (Dialogue Session Backend)

## Worktree
Empfohlen (SaaS)

### Micro-Tasks

#### MT-1: Dialogue Session Erstellungs-UI
- Goal: Auftraggeber kann Dialogue-Session erstellen, Teilnehmer zuweisen
- Files: `src/app/admin/session/[sessionId]/dialogue/new/page.tsx`, `src/components/dialogue/create-dialogue-form.tsx`
- Expected behavior: Formular: Participant A (Dropdown tenant_members), Participant B (Dropdown). Meeting Guide verknuepfen (aus SLC-027). Submit erstellt dialogue_session.
- Verification: Session erstellen → dialogue_session-Row in DB
- Dependencies: none

#### MT-2: DSGVO Consent-Flow
- Goal: Consent-Screen vor Meeting-Beitritt
- Files: `src/components/dialogue/consent-screen.tsx`
- Expected behavior: Vollbild-Overlay: "Dieses Meeting wird aufgezeichnet und transkribiert." Checkbox + "Zustimmen"-Button. Erst nach Consent wird Jitsi geladen. consent_a/b in DB gesetzt.
- Verification: Ohne Consent: kein Meeting. Mit Consent: Meeting startet.
- Dependencies: MT-1

#### MT-3: Jitsi IFrame Embed + Meeting Page
- Goal: Jitsi-Meeting als IFrame in der Plattform
- Files: `src/app/admin/session/[sessionId]/dialogue/[dialogueId]/page.tsx`, `src/components/dialogue/jitsi-meeting.tsx`
- Expected behavior: JitsiMeetExternalAPI laedt Meeting in Container-Div. JWT wird pro User generiert. Bei IFrame-Blockierung: Fallback-Link anzeigen. Meeting-Events (joined, left) werden gehandelt.
- Verification: Browser oeffnet Meeting innerhalb der Plattform. Audio/Video funktioniert.
- Dependencies: MT-2

#### MT-4: Meeting Guide Seitenpanel
- Goal: Guide-Themen als Referenz neben dem Video-Call
- Files: `src/components/dialogue/meeting-guide-sidebar.tsx`
- Expected behavior: Rechtes Panel zeigt Topics + Leitfragen aus meeting_guide. Collapsible pro Topic. Optional: Checkbox "besprochen" (UI-only, kein Backend-Tracking in V3).
- Verification: Guide sichtbar neben Video-Feed
- Dependencies: MT-3

#### MT-5: Recording-Status + Meeting-Ende
- Goal: Recording-Status anzeigen, Meeting-Ende sauber handlen
- Files: `src/components/dialogue/recording-indicator.tsx`, `src/components/dialogue/meeting-end-handler.tsx`
- Expected behavior: Badge zeigt "Aufnahme aktiv" waehrend Recording. Bei videoConferenceLeft-Event: Status-Update → 'completed'. Redirect zu Session-Uebersicht. Info: "Meeting wird verarbeitet..."
- Verification: Meeting verlassen → Status wechselt → Info-Message
- Dependencies: MT-3

#### MT-6: i18n Keys
- Goal: Dialogue-UI Uebersetzungen
- Files: `src/messages/de.json`, `src/messages/en.json`, `src/messages/nl.json`
- Expected behavior: Alle Dialogue-Strings uebersetzt (Consent, Meeting-UI, Status, Fehlermeldungen)
- Verification: Sprachwechsel zeigt korrekte Texte
- Dependencies: MT-1..5
