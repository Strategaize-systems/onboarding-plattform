# FEAT-087 — Stufe-1-Mitarbeiter-Register + Bruecke zu Einladung

> **Status:** planned (Skeleton — Detail-Spec entsteht mit /architecture V9.75)
> **Version:** V9.75 · **Backlog:** BL-508 · **Created:** 2026-06-17 (RPT-480)

## Zweck
Das **eine neue leichte Teil**: in Stufe 1 (im Meeting, Block-fuer-Block) haelt der Chef Personen mit **Name + Funktion** fest — **ohne E-Mail** (heute entstehen Mitarbeiter nur ueber die volle `employee_invitation`, E-Mail Pflicht). Verkaufspsychologisch: der Chef merkt, wen er fuer Stufe 2 braucht (leichtgewichtiges Organigramm). Spaeter ergaenzt er die E-Mail → bestehende Einladung.

## In Scope
- Neue **leichte Tabelle** (z.B. `employee_roster_draft`): `name`, Funktion (`role_hint`), optional Block-/Bereichs-Tag, session-/tenant-scoped, `created_by`. **Keine E-Mail.**
- **Erfassungs-UI** im Debrief-/Meeting-View (Name+Funktion hinzufuegen/bearbeiten/loeschen).
- **Bruecke**: Register-Eintrag → Chef ergaenzt E-Mail → bestehendes `rpc_create_employee_invitation(p_email, p_display_name=Name, p_role_hint=Funktion)` (Schema-Grounding RPT-480: Signatur bestaetigt, RETURNS jsonb, tenant_admin-validiert, 14d-Token).
- Idempotenz: respektiert `employee_invitation` UNIQUE pending-email-Constraint (kein Duplikat bei E-Mail-Nachtrag).

## Out of Scope
- Mitarbeiter-Enablement-Material (Videos/Unterlagen) — geparkt.
- Aenderungen an `employee_invitation`/Onboarding/Capture/`bridge_proposal` (reuse unveraendert).

## Akzeptanz (vorlaeufig)
- SC-V9.75-6/8 (PRD): Register erfasst Name+Funktion ohne E-Mail; Eintrag + nachgetragene E-Mail erzeugt via RPC genau eine Einladung (Idempotenz); Tenant-RLS auf Register-Tabelle (Pen-Test /qa).

## Offene /architecture-Fragen
Q-V9.75-F (Tabellen-Form: Spalten, session- vs tenant-scoped, Dedup-Regel, UI-Einbettung Debrief vs Meeting vs Diagnose-Dashboard).

## Reuse / Constraints
`rpc_create_employee_invitation` + `employee_invitation` + `bridge_proposal` (`proposed_employee_user_id`/`proposed_employee_role_hint`) unveraendert. SaaS-Mode TDD (Idempotenz + RLS).

## /architecture-Aufloesung (RPT-481, 2026-06-17)
Q-F→DEC-224: `employee_roster_draft (id, tenant_id, capture_session_id, name, role_hint, block_key NULL, promoted_invitation_id NULL, created_by, created_at, updated_at)` — **session-scoped, ohne E-Mail**, weiche Dedup via UNIQUE(capture_session_id, lower(name), lower(coalesce(role_hint,''))) ON CONFLICT DO NOTHING + Tenant-RLS. UI im Debrief-/Meeting-View, `block_key` aus aktuellem Block vor-getaggt. Bruecke `promoteRosterEntryToInvitation(rosterId, email)` → unveraenderte `rpc_create_employee_invitation`; pending-email-UNIQUE (`idx_employee_invitation_pending_email`, mig 066) liefert bei Duplikat `duplicate_pending_invitation` → „bereits eingeladen", Erfolg setzt `promoted_invitation_id` (Re-Promote-Schutz). Register-UI ab blueprint+. Migration 122 (Skizze), parallel zu SLC-B nach SLC-A. Detail: ARCHITECTURE.md §5/§7.
