# SLC-026 — Meeting Guide Backend

## Goal
meeting_guide-Tabelle mit RLS, RPCs und KI-Suggest-API-Route. Backend-Basis fuer den Meeting-Guide-Editor (SLC-027).

## Feature
FEAT-018

## In Scope
- Migration 058: meeting_guide-Tabelle + RLS + Indexes + GRANTs + updated_at-Trigger
- Server Actions: createMeetingGuide, updateMeetingGuide, fetchMeetingGuide
- API-Route: POST /api/meeting-guide/suggest (KI-Vorschlaege aus Template-Kontext)
- TypeScript Interfaces (MeetingGuide, MeetingGuideTopic)
- Tests (RLS + Server Actions)

## Out of Scope
- Meeting Guide Editor UI (SLC-027)
- Dialogue Session (SLC-028)

## Acceptance Criteria
- AC-1: meeting_guide-Tabelle existiert mit RLS (tenant-isoliert)
- AC-2: Server Action erstellt/aktualisiert Meeting Guide
- AC-3: KI-Suggest-Route liefert thematische Vorschlaege basierend auf Template
- AC-4: RLS-Test: tenant_admin sieht nur eigene Guides
- AC-5: Topics-JSONB enthaelt block_key fuer Template-Block-Zuordnung

## Dependencies
- SLC-025 (Jitsi muss nicht laufen, aber V3-Kontext muss klar sein)

## Worktree
Empfohlen (SaaS, DB-Schema-Aenderung)

### Micro-Tasks

#### MT-1: Migration 058 — meeting_guide Tabelle
- Goal: meeting_guide-Tabelle mit allen Spalten, RLS-Policies, Indexes, GRANTs erstellen
- Files: `sql/migrations/058_meeting_guide.sql`
- Expected behavior: Tabelle mit id, tenant_id, capture_session_id, goal, context_notes, topics JSONB, ai_suggestions_used, created_by, timestamps. UNIQUE(capture_session_id). RLS: tenant_admin R+W eigener Tenant, strategaize_admin Full.
- Verification: `\d meeting_guide` auf Hetzner-DB zeigt alle Spalten + Constraints
- Dependencies: none

#### MT-2: TypeScript Types + Supabase Types
- Goal: MeetingGuide, MeetingGuideTopic Interfaces definieren
- Files: `src/types/meeting-guide.ts`
- Expected behavior: Typen exportiert, konsistent mit DB-Schema
- Verification: `tsc --noEmit` ohne Fehler
- Dependencies: MT-1

#### MT-3: Server Actions — CRUD
- Goal: createMeetingGuide, updateMeetingGuide, fetchMeetingGuide Server Actions
- Files: `src/app/actions/meeting-guide-actions.ts`
- Expected behavior: Create erstellt Guide mit Topics. Update merged Topics. Fetch laedt Guide fuer Session. Auth-Check: nur owner oder strategaize_admin.
- Verification: Manueller Test via Server Action Aufruf
- Dependencies: MT-1, MT-2

#### MT-4: KI-Suggest API-Route
- Goal: POST /api/meeting-guide/suggest — Bedrock generiert Themenvorschlaege aus Template-Kontext
- Files: `src/app/api/meeting-guide/suggest/route.ts`
- Expected behavior: Input: capture_session_id + template_id. Output: Topics mit title, description, questions, block_key. Bedrock-Call mit Template-Bloecken + Fragen als Kontext.
- Verification: curl-Test gegen API-Route liefert JSON mit Topics
- Dependencies: MT-1, MT-2

#### MT-5: Tests
- Goal: RLS-Isolation + Server Action Tests
- Files: `src/lib/db/__tests__/meeting-guide-rls.test.ts`
- Expected behavior: tenant_admin sieht nur eigene Guides. Cross-Tenant-Read blocked. strategaize_admin sieht alle.
- Verification: `npm run test` — alle Tests gruen
- Dependencies: MT-1, MT-3
