# SLC-169 — V8.0.2 OP Storage-Schema GRANTs Cross-Repo-Mirror (BS-V8.13-Symmetrie)

- Feature: FEAT-075 (V8.0.2 OP Storage-GRANTs-Hotfix-Mirror)
- Backlog: BL-152
- Status: planned
- Priority: High (PRE-CUSTOMER-LIVE PFLICHT — Storage-Upload-Pfade broken aehnlich wie BS V8.13)
- Created: 2026-06-03
- Estimated effort: ~60-90 Min (Migration + Vitest + LIVE-Apply + Live-Smoke + Records)
- Audit-Quelle: Pre-Check via SSH OP 159.69.207.29 2026-06-03 + BS V8.13 SLC-894 RPT-574 + `c:/strategaize/strategaize-business-system/docs/CROSS_REPO_V813_STORAGE_GRANTS.md`

## Goal

Schliesst den Cross-Repo-symmetrischen Bug zu BS ISSUE-088. OP hat die gleiche fehlende Default-GRANT-Setzung auf `storage.*`-Tabellen wie BS hatte vor MIG-043, ist sogar schlimmer betroffen: BS hatte vor MIG-043 wenigstens `SELECT` auf allen 5 storage-Tables; OP hat 0 GRANTs auf den kritischen Tables (`buckets`, `migrations`, `objects`), nur SELECT auf 2 unwichtige s3_-Tables.

Cross-Repo-Pre-Check 2026-06-03:
- OP `authenticated` + `anon`: nur `SELECT` auf `s3_multipart_uploads` + `s3_multipart_uploads_parts` (= 4 Rows). **0 Zugriff auf `buckets`, `migrations`, `objects`.**
- OP `auth.users.aud`: 5 Rows mit `<empty>`, 0 mit `'authenticated'` → **KEIN MIG-044-Mirror noetig**. Fresh-Signup-Default in v2.160 produziert `aud=''`, OP hat keine SQL-Direct-Seeded-User mit `aud='authenticated'`.

Fix: Standard-Supabase-Default-GRANTs idempotent setzen. 1:1 Pattern aus BS MIG-043 (V8.13 SLC-894).

## Scope (In)

- MIG-109 `109_v802_storage_schema_grants.sql`: `GRANT SELECT, INSERT, UPDATE, DELETE` auf alle `storage.*`-Tables fuer `authenticated`+`anon` + Sequences-GRANTs + 4 ALTER DEFAULT PRIVILEGES + NOTIFY pgrst
- Vitest `__tests__/migrations/109-v802-storage-schema-grants.test.ts`: 5 Schema-Verification-Tests 1:1 Pattern aus BS `043-v813-storage-schema-grants.test.ts`
- Coolify-Apply via SSH+base64+psql als `postgres`-Superuser (Pattern: `.claude/rules/sql-migration-hetzner.md`)
- Live-Verify via Storage-INSERT mit self-signed-HS256-JWT (umgeht potenzielle Auth-Bugs)
- Records-Sync (slices/INDEX + features/INDEX + backlog + roadmap + KNOWN_ISSUES + MIGRATIONS + STATE)

## Scope (Out)

- **MIG-044-Mirror (auth.users.aud Normalisierung)**: NICHT noetig — Pre-Check zeigt 0 Rows mit `aud='authenticated'` in OP
- Container-Upgrade GoTrue/Storage v2.160/v1.11.13 → v2.186/v1.44.2: V8.14 Cross-Repo-Sprint (BS+OP gemeinsam)
- V8.0.1 SLC-160 Security-Quick-Wins (search_path-Hardening + timing-safe + SVG-Block): separater Slice, `planned` Status, kein Konflikt mit SLC-169
- OP-spezifische Storage-Buckets-Erweiterung (`partner-branding`, capture-Buckets, etc.): unangetastet — die GRANTs sind table-level (storage.objects), Bucket-RLS bleibt bestehender RLS-Layer

## Acceptance Criteria

- **AC-OP802-1**: MIG-109 erstellt unter `sql/migrations/109_v802_storage_schema_grants.sql` mit:
  - `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA storage TO authenticated, anon;`
  - `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA storage TO authenticated, anon;`
  - `ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ...` fuer postgres + supabase_storage_admin × TABLES+SEQUENCES (4 Eintraege)
  - `NOTIFY pgrst, 'reload schema';`
  - Idempotent additiv (kein REVOKE)
- **AC-OP802-2**: MIG-109 applied auf OP Coolify-Postgres via SSH+base64+psql, Post-Apply Verify zeigt authenticated+anon mit allen 4 CRUD-Privileges auf `storage.objects` (8 Rows wo vorher 0)
- **AC-OP802-3**: Live-Smoke: Storage-INSERT mit self-signed-HS256-JWT (sub=<existing-user-uuid>) auf existierenden Bucket → HTTP 200 (statt vorher 400 "permission denied" oder vergleichbar)
- **AC-OP802-4**: Bestehende OP-Storage-RLS-Policies bleiben aktiv und greifen weiterhin (Cross-Tenant-Access weiter blocked — falls OP-spezifische Policies existieren)
- **AC-OP802-5**: ISSUE-OP-001 (oder gleichwertiges) in `docs/KNOWN_ISSUES.md` (falls existent) → `Status: resolved` mit Resolution-Block. Falls noch nicht eroeffnet: ISSUE-Eintrag retroaktiv anlegen.
- **AC-OP802-6**: Records-Sync vollstaendig (slices/INDEX SLC-169 done → deployed, features/INDEX FEAT-075 deployed, backlog BL-152 done, roadmap V8.0.2 released, MIGRATIONS MIG-109 entry, STATE.md Current Focus)

## Risks

- **R-1 LOW** — OP-Storage-RLS-Policies koennen anders strukturiert sein als BS (BS hat `documents_user_*` Policies aus MIG-041 V8.10). Pre-Apply-Audit muss bestehende RLS-Policies enumerieren, Vitest-Test entsprechend anpassen.
- **R-2 LOW** — OP-Auth-Container koennte gleichen ISSUE-089-Bug haben falls Manual-User-Seeds mit `aud='authenticated'` existieren. **Pre-Check zeigt 0 Drift** → R-2 mitigated.
- **R-3 LOW** — Coolify-Storage-Container-Recreate (z.B. bei naechstem Coolify-Update) koennte GRANTs erneut verwerfen wenn Init-Script REVOKE macht. Mitigation: Pattern-Library-Entry `12-storage-grants-init-sql.md` post-V8.13-STABLE (Dev-System-Pflege).
- **R-4 LOW** — V9-Worktree hat Migration-Nummern 106-108 reserviert. SLC-169 nutzt 109 → kein Konflikt bei spaeterem V9-Master-Merge.

## Micro-Tasks

### MT-1: Pre-Apply RLS-Policy-Audit auf OP
- Goal: Bestehende RLS-Policies in `storage.objects` enumerieren als Diff-Basis fuer Vitest
- Files: keine (nur SSH-Query-Output dokumentiert in Slice-Notes oder als Inline-Comment im MT-2-Vitest)
- Steps:
  ```bash
  ssh root@159.69.207.29 'docker exec supabase-db-bwkg80w04wgccos48gcws8cs-084548596447 psql -U postgres -d postgres -c "SELECT policyname FROM pg_policies WHERE schemaname='\''storage'\'' AND tablename='\''objects'\'' ORDER BY 1;"'
  ```
- Verification: psql-Output zeigt aktive Policies — Vitest passt Assertions an
- Dependencies: keine

### MT-2: MIG-109 SQL-File + Vitest-Test schreiben
- Goal: SQL-File + Vitest-Schema-Test 1:1 Pattern aus BS MIG-043
- Files:
  - `sql/migrations/109_v802_storage_schema_grants.sql` (neu, ~120 Z., 1:1 aus BS `043_v813_storage_schema_grants.sql` mit OP-Header)
  - `__tests__/migrations/109-v802-storage-schema-grants.test.ts` (neu, ~170 Z., 1:1 aus BS `043-v813-storage-schema-grants.test.ts`, RLS-Assertion-Liste angepasst nach MT-1-Audit)
- Expected behavior: SQL idempotent additiv, Vitest pruefen GRANTs (20+20 Rows) + ALTER DEFAULT PRIVILEGES (4 Eintraege) + RLS-Policies (Anzahl nach MT-1-Audit) + service_role-unchanged (20 Rows)
- Verification: Vitest gegen Coolify-DB-Sidecar (node:20 in `bwkg80w04wgccos48gcws8cs_strategaize-net` per `.claude/rules/coolify-test-setup.md`)
- Dependencies: MT-1

### MT-3: LIVE-Apply auf OP Coolify-Postgres + Post-Apply-Verify
- Goal: MIG-109 auf OP Production-DB applied
- Files: keine (Server-Side)
- Steps:
  - base64-Transfer SQL-File → `/tmp/MIG-109.sql` auf 159.69.207.29
  - `docker exec -i supabase-db-... psql -U postgres -d postgres < /tmp/MIG-109.sql`
  - Post-apply Inline-Verify: `SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema='storage' AND grantee IN ('authenticated','anon') AND privilege_type IN ('INSERT','UPDATE','DELETE') ORDER BY table_name, grantee;` → erwartet 30 Rows (5 Tables × 2 Roles × 3 Privileges)
  - Vitest-Test-File transfer + Vitest-Run via node:20 Sidecar → erwartet 5/5 PASS
- Verification: Post-Apply 30 Rows + Vitest 5/5 GREEN
- Dependencies: MT-2

### MT-4: Live-Smoke Storage-INSERT mit self-signed-JWT
- Goal: Beweis dass Storage-INSERT nach Fix funktioniert
- Files: keine (Live-Test)
- Steps:
  - GOTRUE_JWT_SECRET aus OP-Container-ENV holen: `docker exec supabase-auth-... printenv GOTRUE_JWT_SECRET`
  - Existierenden User-UUID aus auth.users abrufen (z.B. richard@bellaerts.de oder qa-User)
  - python3+hmac+sha256 self-signed HS256-JWT erzeugen mit `sub=<user-uuid>` + `role=authenticated` + `aud=authenticated`
  - curl im `bwkg80w04wgccos48gcws8cs_strategaize-net` mit `apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY` + `Authorization: Bearer <JWT>` POST `/storage/v1/object/<existing-bucket>/<user-uuid>/test-smoke-slc169.txt` mit Body
  - Erwartet: HTTP 200 + `{"Key":"<bucket>/<user-uuid>/test-smoke-slc169.txt",...}`
  - Cleanup: DELETE des Test-Files
- Verification: HTTP 200 Response
- Dependencies: MT-3

### MT-5: Records-Sync + Workflow-Closure
- Goal: Alle Records aktualisiert + Workflow-Closure (kein separater /qa noetig, da Pattern-Reuse 1:1 + Live-Smoke 2/2 PASS = effektiv Code-Side-QA)
- Files:
  - `docs/MIGRATIONS.md` — MIG-109 entry am Top
  - `slices/INDEX.md` — SLC-169 planned → done (deployed nach /go-live)
  - `features/INDEX.md` — FEAT-075 in_progress → done (deployed nach /go-live)
  - `planning/backlog.json` — BL-152 status: done
  - `planning/roadmap.json` — V8.0.2 entry mit status: released
  - `docs/KNOWN_ISSUES.md` — ISSUE-OP-XXX retroaktiv-Eintrag falls noch nicht existent + Status: resolved
  - `docs/STATE.md` — Current Focus update
  - `docs/RELEASES.md` — REL-OP-XXX entry (V8.0.2 Cross-Repo-Mirror)
- Verification: Cockpit zeigt SLC-169 deployed + V8.0.2 released
- Dependencies: MT-1..MT-4

## Pattern-Reuse-Audit

| Source | Reuse |
|---|---|
| BS MIG-043 (`sql/migrations/043_v813_storage_schema_grants.sql`) | 1:1 SQL mit OP-Header-Comment |
| BS Vitest 043 (`cockpit/__tests__/migrations/043-v813-storage-schema-grants.test.ts`) | 1:1 Pattern, RLS-Assertion angepasst nach MT-1 |
| `.claude/rules/sql-migration-hetzner.md` | base64+SSH+psql als postgres-Superuser |
| `.claude/rules/coolify-test-setup.md` | node:20 + business-net + TEST_DATABASE_URL + SAVEPOINT |
| BS Live-Smoke MT-4 (RPT-574) | self-signed-HS256-JWT via python3+hmac+sha256 |
| BS V8.13 Workflow-Sequenz (RPT-573..579) | /slice-planning → /backend → /qa → /final-check → /go-live → /post-launch |
| `docs/CROSS_REPO_V813_STORAGE_GRANTS.md` (BS-Repo) | Komplette Apply-Vorlage mit OP-Anpassungs-Hinweisen |

**0 neue Pattern noetig — pure Cross-Repo-Reuse.**

## Direct-Main-vs-Worktree Entscheidung

Per OP-SaaS-Mode-Default-Konvention: Worktree-Isolation. ABER:
- V8.0.2 ist Pure-SQL-Migration + Vitest-Schema-Test + Records — **0 cockpit/src-Code-Change**
- BS V8.13 (identisches Pattern) wurde direkt auf master ge-pusht ohne Worktree (4 atomare Commits)
- Mathematisch 0 Production-Code-Regression-Risiko (Vitest jsdom-Suite mathematisch unangetastet)

**Entscheidung**: Direkt auf main, atomare Commits per MT analog BS V8.13. Worktree-Overhead nicht gerechtfertigt fuer 60-90 Min Pure-SQL-Slice mit identischem Cross-Repo-Pattern. Wenn der V8.0.1 SLC-160 (paralleler Security-Slice) seinen Worktree behaelt, kann das parallel laufen ohne Konflikt — SLC-169 touches nur `sql/migrations/` + `__tests__/migrations/` + Doc-Files.

## Cross-Repo-Implications

- BS hat ISSUE-088 mit MIG-043 closed → BS-Pattern jetzt 1:1 in OP angewandt → OP wird BS-Parity erreichen.
- V8.14 Container-Upgrade (BS+OP gemeinsam, separater Sprint) bringt Storage v1.44.2 + GoTrue v2.186. Damit:
  - Misleading-Error-Cast (RLS-Body fuer GRANT-Errors) verschwindet
  - Default-GRANTs werden Init-Script-seitig gesetzt → MIG-109 bleibt nuetzlich als Defense, ist aber nicht mehr loadbearing
- ISSUE-089-Mirror (MIG-044-Pendant) NICHT noetig in OP per Pre-Check 2026-06-03

## Workflow-Closure-Sequenz (kompakt)

Da Pattern 1:1 zu BS V8.13 + Pre-Check vorhanden + 0 cockpit-src-Change:
- `/slice-planning` (this doc)
- `/backend` SLC-169 MT-1..MT-5 (in einer Session, ~60-90 min)
- `/qa` SLC-169 (kompakt, Pattern-Reuse-Verify gegen BS V8.13 + AC-Matrix-Walk + Quality-Gates)
- `/final-check` V8.0.2 (kompakt, Audit gegen BS V8.13 RPT-577)
- `/go-live` V8.0.2 (kompakt, REL-OP-XXX + Records-Update)
- `/post-launch V8.0.2 T+3h` (Light-Check) + T+24h (Full-Check)

**Kein Coolify-Redeploy noetig** (0 cockpit-src-Change), Image-Tag bleibt unveraendert.

## Quellen-Referenzen

- BS V8.13 SLC-894 Slice-Spec: `c:/strategaize/strategaize-business-system/slices/SLC-894-bs-storage-grants-hotfix.md`
- BS V8.13 SLC-894 RPT: `c:/strategaize/strategaize-business-system/reports/RPT-574.md`
- BS V8.13 Gesamt-/qa: `c:/strategaize/strategaize-business-system/reports/RPT-576.md`
- BS V8.13 /final-check: `c:/strategaize/strategaize-business-system/reports/RPT-577.md`
- BS V8.13 /go-live + REL-045: `c:/strategaize/strategaize-business-system/reports/RPT-578.md`
- BS V8.13 /post-launch T+3h: `c:/strategaize/strategaize-business-system/reports/RPT-579.md`
- Cross-Repo-Doc-Vorlage: `c:/strategaize/strategaize-business-system/docs/CROSS_REPO_V813_STORAGE_GRANTS.md`
- Pre-Check Befund (this session 2026-06-03): authenticated+anon haben SELECT auf 2 s3_-Tables; auth.users.aud Verteilung clean
