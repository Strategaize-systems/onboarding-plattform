# SLC-039 — Handbuch-Snapshot Backend

## Goal
Deterministisches Handbuch-Snapshot-Backend (DEC-038). Worker-Job-Type `handbook_snapshot_generation` rendert pro tenant_admin-Trigger ein ZIP-Archiv aus KUs + Diagnosen + SOPs nach `template.handbook_schema`. Upload in Storage-Bucket `handbook`. Migration 074 mit 2 RPCs (Trigger + Download-URL). Kein Bedrock-Call, kein LLM-Polish (explizit V4.1+ deferred). Markdown-Output in Standard-Viewer lesbar.

## Feature
FEAT-026

## In Scope
- Migration 074 `074_rpc_handbook.sql`:
  - `rpc_trigger_handbook_snapshot(capture_session_id)` — tenant_admin-only. INSERT handbook_snapshot mit status='generating'. INSERT ai_jobs mit job_type='handbook_snapshot_generation' + payload {handbook_snapshot_id}. Return snapshot_id.
  - `rpc_get_handbook_download_url(snapshot_id)` — tenant_admin-only. Liest handbook_snapshot.storage_path. Generiert signed URL per Supabase Storage API (via SECURITY DEFINER mit service_role-Kontext oder separater Server-Action). 5 Min Gueltigkeit. Return signed URL string. (Hinweis: Signed-URL-Generation ist ueblicherweise Client-API. RPC kann Storage-Path zurueckgeben, die Server-Action generiert die Signed URL. Alternative: Server-Action-Only ohne RPC. Konkrete Implementierung im MT-1 zu entscheiden.)
- Worker-Handler `src/workers/handbook/handle-snapshot-job.ts`:
  - Laedt handbook_snapshot + Tenant + Template (mit handbook_schema).
  - Iteriert sections (sortiert nach order):
    - Pro source in section.sources: Query KUs / Diagnosen / SOPs mit dem angegebenen Filter (block_keys, source_in, min_status).
    - Render Markdown (section header, intro_template, subsections nach render.subsections_by, Listen/Tabellen).
    - Cross-Links einfuegen via section.cross_links + Anchors.
  - Render INDEX.md (Inhaltsverzeichnis).
  - ZIP-Build mit Node-native library (`jszip` oder ein bereits verfuegbares; falls keines da, als neue Dependency hinzufuegen).
  - Upload in Storage-Bucket `handbook` unter `{tenant_id}/{snapshot_id}.zip` (per Service-Role).
  - UPDATE handbook_snapshot SET status='ready', storage_path, storage_size_bytes, section_count, knowledge_unit_count, diagnosis_count, sop_count, completed_at.
  - Bei Fehler: status='failed', error_message.
- Markdown-Renderer-Module:
  - `src/workers/handbook/renderer.ts` — orchestriert.
  - `src/workers/handbook/sections.ts` — pro Section-Typ-Renderer (KU-Liste, Diagnose-Tabelle, SOP-Schritte).
  - `src/workers/handbook/index-builder.ts` — INDEX.md.
  - `src/workers/handbook/zip-builder.ts` — ZIP-Packaging.
- Handbuch-Schema-Validator:
  - `src/workers/handbook/validate-schema.ts` — prueft `template.handbook_schema` Struktur beim Job-Start. Failt fruehzeitig mit klarer Fehlermeldung wenn Schema nicht valide.
- Unit-Tests `src/workers/handbook/__tests__/`:
  - `renderer.test.ts` — Fixture-KUs + Fixture-Schema → erwartetes Markdown-Output.
  - `zip-builder.test.ts` — ZIP-Struktur + enthaltene Files.
  - `validate-schema.test.ts` — valide vs. invalide Schemas.
  - `handle-snapshot-job.test.ts` — End-to-End mit Mock-Storage-Upload.
- Cost-Logging: KEIN Bedrock-Call in V4, aber optional ein Log-Eintrag in ai_cost_ledger mit feature='handbook_snapshot', cost_usd=0 fuer Audit-Konsistenz (optional, nicht mandatorisch).
- Worker-Dispatcher-Registrierung in `src/workers/run.ts`.
- Template-Validierung: bei UPDATE exit_readiness (aus SLC-033 MT-5) wurde `handbook_schema` bereits eingespielt. In diesem Slice: Test gegen exit_readiness-Fixture, dass das gelieferte Schema valide ist und mind. eine Section `operatives_tagesgeschaeft` existiert.

## Out of Scope
- UI-Seiten (SLC-040).
- KI-Polish fuer Section-Intros (V4.1+).
- In-App-Webview, Volltext-Suche, Live-Editor (V4.1).
- PDF-Export (spaeter).
- Snapshot-Versionierung / Diff (V4.1).
- External-Sharing-Links (spaeter).
- Multi-Language-Handbuecher (deferred Q26; Tenant-Language gilt).

## Acceptance Criteria
- AC-1: `rpc_trigger_handbook_snapshot(capture_session_id)` erzeugt handbook_snapshot (status=generating) + ai_jobs-Row.
- AC-2: Worker verarbeitet Job, erzeugt ZIP im Storage-Bucket, UPDATE handbook_snapshot auf ready.
- AC-3: ZIP enthaelt `INDEX.md` + pro Section ein `<order>_<section_key>.md` Markdown-File.
- AC-4: Markdown syntaktisch valide (Headings, Listen, Links) — keine `#` ohne Leerzeichen, keine orphan-Anchors.
- AC-5: Cross-Links funktionieren: `operatives_tagesgeschaeft` verweist auf `geschaeftsmodell_und_markt` via Subtopic-Anchor.
- AC-6: Bei einer Session mit 0 KUs erzeugt das Schnappschuss-File weiterhin valide Markdown mit Platzhalter-Texten. Kein Absturz.
- AC-7: `rpc_get_handbook_download_url(snapshot_id)` liefert einen nutzbaren signierten Link (per curl pruefbar). Zugriff ohne Signatur schlaegt fehl.
- AC-8: Storage-Policy aus SLC-033 blockt: employee-User mit signierter URL eines Tenant A kann im Tenant-B-Folder NICHT lesen (Cross-Tenant-Schutz). (Signierte URLs sind bucket-scoped, aber Pfad-Prefix-Isolation gilt.)
- AC-9: `rpc_trigger_handbook_snapshot` von nicht-tenant_admin verweigert.
- AC-10: handbook_snapshot.knowledge_unit_count + diagnosis_count + sop_count + section_count matchen dem tatsaechlichen Inhalt.
- AC-11: Snapshot-Generierung fuer realistische Session (~100 KUs + 9 Diagnosen + 9 SOPs) in <5 Sekunden.
- AC-12: ZIP-Size bleibt unter 10 MB bei normalem Datenvolumen.

## Dependencies
- Vorbedingung: SLC-033 done (handbook_snapshot-Tabelle + Storage-Bucket + handbook_schema in exit_readiness).
- Vorbedingung: SLC-037 done (employee_questionnaire-KUs existieren fuer `operatives_tagesgeschaeft`-Section).
- Folge-Voraussetzung fuer: SLC-040 (UI).

## Worktree
Mandatory (SaaS, Datei-Generierung auf Production-Storage).

## Migrations-Zuordnung
074 (aus MIG-023).

## Pflicht-QA-Vorgaben
- `/qa` muss folgende Punkte abdecken:
  - Unit-Tests mit Fixture-KUs/Diagnosen/SOPs + Fixture-Schema → deterministisches Markdown.
  - Integration-Test gegen Coolify-DB + Coolify-Storage: Trigger → Worker → ZIP im Bucket.
  - Download-URL-Test: signed URL laedt ZIP herunter. Ohne Signatur 403.
  - Cross-Tenant-Storage-Policy-Test.
  - Markdown-Linter oder zumindest Sichtpruefung von generiertem Output (Spot-Check: 3 Sections).
  - Performance-Test: Fixture-Session mit 100 KUs rendert in <5s.
  - `npm run test` + `npm run build` gruen.
  - SQL-Migration nach Hetzner-Pattern.
- IMP-112: Re-Read vor Write.

## Risks
- ZIP-Builder-Dependency (jszip) ist neue Package-Abhaengigkeit: Mitigation: Node-native `node:zlib` oder bereits vorhandenes Package nutzen; falls neu, in Completion-Report erwaehnen.
- Storage-Upload-Fehler: Mitigation: Retry-Logic im Worker (1x).
- Schema-Drift: handbook_schema in exit_readiness ist statisch. Falls Template-Developer neue Section-Typen einfuehren: Renderer sollte klar fehlschlagen statt halb-rendern. Mitigation: validate-schema.ts prueft Section-Typ vor Render.
- Performance bei sehr grossen Sessions: Mitigation: Pagination im KU-Query wenn Anzahl >1000 (vermutlich nicht in V4 relevant).
- Data-Residency: Storage-Bucket ist Teil des Supabase-Stacks im EU-Hetzner-Server — compliant. Bedrock wird in V4 NICHT genutzt.

### Micro-Tasks

#### MT-1: Migration 074 — 2 Handbuch-RPCs
- Goal: rpc_trigger_handbook_snapshot + rpc_get_handbook_download_url (falls als RPC umsetzbar — sonst nur trigger-RPC und Server-Action fuer Download).
- Files: `sql/migrations/074_rpc_handbook.sql`, `sql/schema.sql`
- Expected behavior: Tenant_admin-Check. Trigger-RPC atomar INSERT handbook_snapshot + ai_jobs. Download-RPC: Entweder Supabase-Storage-Signing via plpgsql (wenn moeglich) ODER RPC liefert nur storage_path, Server-Action erzeugt signed URL.
- Verification: Integration-Tests fuer beide RPCs. Rolle-Check. Cross-Tenant-Block.
- Dependencies: SLC-033 done
- TDD-Note: TDD strikt.

#### MT-2: Handbook-Schema-Validator
- Goal: Struktur-Pruefung von template.handbook_schema.
- Files: `src/workers/handbook/validate-schema.ts` + `src/workers/handbook/__tests__/validate-schema.test.ts`
- Expected behavior: Prueft sections-Array, pro Section: key (string), title, order (number), sources (Array mit type in {knowledge_unit, diagnosis, sop} + filter-Objekt), render (mit subsections_by enum). Fehler mit klarer Message.
- Verification: Valide Schema → ok. Invalide Schemas (fehlende Felder, unbekannte Typen) → Error.
- Dependencies: none
- TDD-Note: TDD-Pflicht.

#### MT-3: Renderer-Kern
- Goal: Markdown-Render-Orchestrator.
- Files: `src/workers/handbook/renderer.ts`, `src/workers/handbook/sections.ts` + Tests
- Expected behavior: Pro Section: Header, intro_template, Subsections-Rendering nach render.subsections_by, Listen/Tabellen je Source-Typ. Cross-Links einfuegen. Output: Record<filename, markdownString>.
- Verification: Unit-Tests mit Fixture-Schema + Fixture-Daten liefern erwartete Markdown-Strings (Snapshot-Tests).
- Dependencies: MT-2
- TDD-Note: TDD, mind. 5 Fixtures.

#### MT-4: INDEX-Builder
- Goal: Inhaltsverzeichnis-Erzeugung.
- Files: `src/workers/handbook/index-builder.ts` + Tests
- Expected behavior: Liste aller Sections in Order, Link zu den jeweiligen Markdown-Files, Tenant-Name als Header, Generierungs-Datum.
- Verification: Unit-Test.
- Dependencies: MT-3
- TDD-Note: TDD.

#### MT-5: ZIP-Builder + Storage-Upload
- Goal: ZIP-Packing + Supabase-Storage-Upload via Service-Role.
- Files: `src/workers/handbook/zip-builder.ts` + Tests
- Expected behavior: ZIP mit INDEX.md + Section-Files. Upload in `{tenant_id}/{snapshot_id}.zip`. Return size_bytes.
- Verification: Unit-Test baut ZIP in Memory und entpackt zur Verifikation. Integration-Test gegen Coolify-Storage.
- Dependencies: MT-3, MT-4
- TDD-Note: TDD.

#### MT-6: Worker-Handler handbook_snapshot_generation
- Goal: End-to-End-Handler.
- Files: `src/workers/handbook/handle-snapshot-job.ts` + Tests
- Expected behavior: Laedt snapshot + Template. Validiert Schema. Rendert Markdown. Baut ZIP. Upload. UPDATE handbook_snapshot.
- Verification: Integration-Test gegen Coolify-DB+Storage.
- Dependencies: MT-1, MT-2, MT-3, MT-4, MT-5
- TDD-Note: TDD.

#### MT-7: Worker-Dispatcher-Registrierung
- Goal: Job-Type registriert.
- Files: `src/workers/run.ts`
- Expected behavior: Switch-Case 'handbook_snapshot_generation' → handle-snapshot-job.
- Verification: Worker-Boot-Log + Integration-Test.
- Dependencies: MT-6
- TDD-Note: None.

#### MT-8: Record-Updates
- Goal: STATE.md + INDEX.md + backlog.json + MIGRATIONS.md.
- Files: `docs/STATE.md`, `slices/INDEX.md`, `planning/backlog.json`, `docs/MIGRATIONS.md`
- Expected behavior: SLC-039 done, BL-045 in_progress, MIG-023 074 landed.
- Verification: Re-Read vor Write (IMP-112).
- Dependencies: MT-1..MT-7
- TDD-Note: Doku.

## Aufwand-Schaetzung
~8-10 Stunden (Renderer + ZIP + Integration). Markdown-Feinheiten koennen Zeit kosten (+2h). Gesamt: ~10-12 Stunden.
