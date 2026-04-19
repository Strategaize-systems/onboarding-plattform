# SLC-018 — Evidence-Schema + Storage

## Zuordnung
- Feature: FEAT-013 (Evidence-Mode Infrastruktur)
- Version: V2
- Priority: High
- Depends on: V1.1 stable (keine Feature-Abhaengigkeit, kann parallel zu SLC-013..017 laufen)

## Ziel
DB-Schema und Supabase Storage Bucket fuer Evidence-Mode. Upload-API fuer Dateien. Keine Extraktion oder KI-Mapping in diesem Slice — nur Infrastruktur.

## Scope
- Migration 043: evidence_file + evidence_chunk Tabellen + RLS + Indexes
- Migration 044: Supabase Storage Bucket 'evidence' mit Policies
- Upload-API-Route (POST /api/capture/[sessionId]/evidence/upload)
- Validierung: MIME-Type, Dateigroesse, Tenant-Zugehoerigkeit

## Nicht in Scope
- Text-Extraktion aus Dateien (SLC-019)
- KI-Mapping (SLC-019)
- Evidence-UI (SLC-020)

## Acceptance Criteria
1. evidence_file + evidence_chunk Tabellen existieren mit RLS
2. Supabase Storage Bucket 'evidence' existiert (nicht public, 20MB Limit)
3. Upload-API akzeptiert PDF, DOCX, TXT, CSV, ZIP
4. Upload-API lehnt andere MIME-Types ab (400)
5. Upload-API lehnt Dateien > 20MB ab (413)
6. Datei wird in Supabase Storage unter {tenant_id}/{session_id}/{filename} gespeichert
7. evidence_file-Row wird erstellt (extraction_status=pending)
8. RLS: Nur eigener Tenant kann seine Dateien sehen
9. npm run build + npm run test erfolgreich

### Micro-Tasks

#### MT-1: Migration 043_evidence_tables.sql
- Goal: evidence_file + evidence_chunk Tabellen
- Files: `sql/migrations/043_evidence_tables.sql`
- Expected behavior: Beide Tabellen wie in ARCHITECTURE.md. RLS: tenant_admin/member Write+Read eigener Tenant, strategaize_admin Cross-Tenant Read. Indexes auf (tenant_id), (capture_session_id), (evidence_file_id). GRANTs fuer authenticated + service_role. updated_at-Trigger fuer evidence_file.
- Verification: SQL-Syntax korrekt
- Dependencies: none

#### MT-2: Migration 044_evidence_storage_bucket.sql
- Goal: Supabase Storage Bucket mit RLS-Policies
- Files: `sql/migrations/044_evidence_storage_bucket.sql`
- Expected behavior: INSERT storage.buckets 'evidence' (not public, 20MB limit, allowed MIME-Types). Storage-Policies: INSERT fuer authenticated mit tenant-check, SELECT fuer authenticated mit tenant-check, strategaize_admin full.
- Verification: SQL-Syntax korrekt
- Dependencies: none

#### MT-3: Migrationen auf Hetzner ausfuehren
- Goal: Tabellen + Bucket auf Produktions-DB
- Files: keine Code-Aenderung
- Expected behavior: `\d evidence_file`, `\d evidence_chunk` vorhanden. Bucket via Studio sichtbar.
- Verification: docker exec psql + Coolify Studio
- Dependencies: MT-1, MT-2

#### MT-4: Upload-API-Route
- Goal: POST-Endpoint fuer Evidence-Datei-Upload
- Files: `src/app/api/capture/[sessionId]/evidence/upload/route.ts`
- Expected behavior: (1) Auth-Check (session_owner oder strategaize_admin). (2) Validierung MIME-Type + Dateigroesse. (3) Upload zu Supabase Storage (supabaseAdmin.storage.from('evidence').upload(path, buffer)). (4) INSERT evidence_file (storage_path, original_filename, mime_type, file_size_bytes, extraction_status='pending'). (5) Return 201 {id, filename, status}.
- Verification: npm run build
- Dependencies: MT-3

#### MT-5: Test — Upload-Validierung
- Goal: Unit-Test fuer MIME-Type und Groessen-Validierung
- Files: `src/app/api/capture/[sessionId]/evidence/__tests__/upload-validation.test.ts`
- Expected behavior: Testet: erlaubte MIME-Types akzeptiert, verbotene abgelehnt (400), Uebergrosse Datei abgelehnt (413)
- Verification: npm run test -- upload-validation
- Dependencies: MT-4
