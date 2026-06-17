# SLC-V9.75-C — Stufe-1-Mitarbeiter-Register + Bruecke

> **Status:** planned · **Feature:** FEAT-087 / BL-508 · **Version:** V9.75 · **Created:** 2026-06-17 (RPT-482)
> **Worktree:** `v9-75-exit-readiness` (nach SLC-A; logisch parallel zu SLC-B) · **MIG reserviert:** 122 · **Delivery Mode:** SaaS (TDD)
> **Basis:** ARCHITECTURE.md §5/§7 · DEC-224 · /architecture RPT-481

## Ziel
Leichtes Name+Funktion-Register (ohne E-Mail) im Stufe-1-Meeting + Bruecke zur bestehenden, unveraenderten `rpc_create_employee_invitation`. Verkaufspsychologisches Organigramm.

## In Scope
- Tabelle `employee_roster_draft` (session-scoped, ohne E-Mail) + RLS + weiche Dedup.
- Roster-CRUD-Actions (Name/Funktion/Block-Tag, tenant-scoped, `blueprint`+).
- Bruecke `promoteRosterEntryToInvitation(rosterId, email)` → `rpc_create_employee_invitation` (Idempotenz respektiert, `promoted_invitation_id` Re-Promote-Schutz).
- Erfassungs-UI im Debrief-/Meeting-View.

## Out of Scope
- Aenderungen an `employee_invitation`/`rpc_create_employee_invitation`/`bridge_proposal`/Onboarding (reuse unveraendert). Enablement-Material.

## Akzeptanzkriterien
- **AC-C-1** (SC-V9.75-6): `employee_roster_draft` erfasst Name+Funktion (`role_hint`) ohne E-Mail, session-/tenant-scoped, optional `block_key`-Tag.
- **AC-C-2** (SC-V9.75-6): `promoteRosterEntryToInvitation(rosterId, email)` → genau eine `employee_invitation` via RPC; bei bestehendem pending (gleiche tenant_id+lower(email)) liefert die RPC `duplicate_pending_invitation` → UI „bereits eingeladen", **kein** Duplikat (Idempotenz `idx_employee_invitation_pending_email` respektiert); Erfolg setzt `promoted_invitation_id`.
- **AC-C-3** (SC-V9.75-8): Tenant-RLS — kein Cross-Tenant-Read/Write auf `employee_roster_draft` (node:20-Sidecar SAVEPOINT-Pen-Test).
- **AC-C-4**: weiche Dedup — UNIQUE(capture_session_id, lower(name), lower(coalesce(role_hint,''))) ON CONFLICT DO NOTHING (kein Hard-Fail bei Wiederholung).
- **AC-C-5**: Register-UI/Actions ab `blueprint`+ (free abgelehnt); add/edit/delete + promote funktional.
- **AC-C-6**: TSC/ESLint EXIT=0, Vitest GREEN (Migration-RLS + Idempotenz + Actions), `next build` PASS.

## Risiken
- **R-C-1** (PRD R5): Idempotenz bei E-Mail-Nachtrag — `rpc_create_employee_invitation` UNIQUE pending-email ist die harte Grenze; Bruecke faengt `duplicate_pending_invitation` ab statt zu werfen. Test: zweimaliges Promote gleicher E-Mail → 1 Invitation.
- **R-C-2**: UI-Einbettung Debrief-View darf bestehende Block-Debrief-Logik nicht stoeren (additive Panel-Komponente).
- **R-C-3**: Register-Gate (blueprint+) ist nicht security-kritisch (keine teure Ressource) → leichtes Action-Gate, nicht die volle Job-Gate-Maschinerie.

## Micro-Tasks

#### MT-1: Migration 122 — employee_roster_draft (TDD-RED)
- Goal: Tabelle + RLS + weiche Dedup + promoted_invitation_id.
- Files: `sql/migrations/122_v975_employee_roster_draft.sql`, `src/__tests__/migrations/122-v975-roster.test.ts`
- Expected behavior: `CREATE TABLE employee_roster_draft (id, tenant_id, capture_session_id, name NOT NULL, role_hint NULL, block_key NULL, promoted_invitation_id NULL, created_by, created_at, updated_at)`; UNIQUE-Index (capture_session_id, lower(name), lower(coalesce(role_hint,''))); RLS tenant_id = auth.user_tenant_id() (read/write within tenant), strategaize_admin full.
- Verification: Sidecar — Insert/Read tenant-scoped ok, Cross-Tenant denied (SAVEPOINT), Dedup-Index greift (ON CONFLICT DO NOTHING).
- Dependencies: SLC-A (tier-Spalte / Gate-Kontext gemerged), MT-0 (Worktree)

#### MT-2: Roster-CRUD-Actions (TDD)
- Goal: add/edit/delete server actions, tenant-scoped, blueprint+.
- Files: `src/app/admin/.../roster-actions.ts`, `roster-actions.test.ts`
- Expected behavior: `addRosterEntry`/`updateRosterEntry`/`deleteRosterEntry` mit Auth + Tenant-Scope + blueprint+-Gate; ON CONFLICT DO NOTHING bei add.
- Verification: Unit-Tests (auth/tenant/gate + Dedup-Verhalten).
- Dependencies: MT-1

#### MT-3: Bruecke promoteRosterEntryToInvitation (TDD)
- Goal: Register-Eintrag → bestehende Einladungs-RPC, idempotent.
- Files: `src/app/admin/.../roster-actions.ts` (erweitert), `+ test`
- Expected behavior: liest Roster-Eintrag → `rpc_create_employee_invitation(p_email=email, p_display_name=name, p_role_hint=role_hint)`; bei `duplicate_pending_invitation` → strukturiertes „bereits eingeladen"; Erfolg → `promoted_invitation_id` gesetzt (Re-Promote-Block).
- Verification: Test — Promote→1 Invitation; zweites Promote gleiche E-Mail→kein Duplikat; promoted_invitation_id gesetzt.
- Dependencies: MT-1, MT-2

#### MT-4: Roster-UI im Debrief/Meeting-View (Frontend)
- Goal: Erfassungs-Panel Name+Funktion + Promote.
- Files: `src/app/admin/debrief/[sessionId]/[blockKey]/RosterPanel.tsx` (+ Einbindung in `page.tsx`)
- Expected behavior: Liste + add/edit/delete (Name, Funktion, optional Block-Tag = aktueller Block vorbelegt) + E-Mail-Nachtrag → Promote-Button; sichtbar ab blueprint+.
- Verification: Build PASS; Wiring stoert Block-Debrief nicht (additive Komponente); Render-/Interaktions-Check in /qa.
- Dependencies: MT-2, MT-3

## Pre-Conditions
SLC-C startet nach SLC-A-Merge-Punkt (tier-Spalte + Gate-Kontext im Branch vorhanden); logisch unabhaengig von SLC-B (disjunkte Files). Live-Apply Migration 122 im /deploy.
