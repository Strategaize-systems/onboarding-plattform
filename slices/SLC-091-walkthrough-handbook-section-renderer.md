# SLC-091 — Walkthrough Handbuch-Section-Renderer + Storage-Proxy + RPC + MIG-033 (FEAT-038)

## Goal

Backend-Foundation fuer V5.1 Walkthrough-Handbuch-Integration. Erweitert den deterministischen Snapshot-Worker um einen neuen `SectionSourceType="walkthrough"`, fuegt einen Range-faehigen Storage-Proxy `/api/walkthrough/[sessionId]/embed` hinzu, legt RPC `rpc_get_walkthrough_video_path` an (DEC-099) und fuegt via Migration 089 idempotent eine Walkthroughs-Section in die produktiven Templates ein. **Kein neues Tabellen-DDL, keine neuen npm-Pakete, keine neuen Worker-Job-Typen, keine neuen Bedrock-Calls.**

## Feature

FEAT-038 (Walkthrough Handbuch-Integration). Pattern-Reuse: V4 FEAT-026 Snapshot-Worker (SLC-039) + V4.1 FEAT-028 Reader (SLC-040 Storage-Proxy-Pattern aus ISSUE-025-Resolution).

## In Scope

### A — Schema-Validator + Types erweitern

Pfade: `src/workers/handbook/types.ts` + `src/workers/handbook/validate-schema.ts`.

- `SectionSourceType` um `"walkthrough"` erweitern.
- `SectionSourceFilter` um optionalen `min_status?: string` und `subtopic_keys?: string[]` erweitern (subtopic_keys reserviert fuer V5.2+; in V5.1 nicht ausgewertet).
- Neuer Type `WalkthroughRow` in `types.ts`:
  ```typescript
  export interface WalkthroughStepRow {
    id: string;
    step_number: number;
    action: string;
    responsible: string | null;
    timeframe: string | null;
    success_criterion: string | null;
    dependencies: string | null;
    transcript_snippet: string | null;
  }
  export interface WalkthroughMappingRow {
    walkthrough_step_id: string;
    subtopic_id: string | null;
    confidence_band: 'green' | 'yellow' | 'red';
    reviewer_corrected: boolean;
  }
  export interface WalkthroughRow {
    id: string;
    tenant_id: string;
    recorded_by_user_id: string;
    recorder_display_name: string;
    created_at: string;
    duration_ms: number | null;
    steps: WalkthroughStepRow[];
    mappings: WalkthroughMappingRow[];
  }
  ```
- `validate-schema.ts` akzeptiert `type: 'walkthrough'` als valid `SectionSource`. Fail-fast bei unbekannten Source-Typen bleibt unveraendert (V4-Verhalten).

### B — Loader

Pfad: `src/workers/handbook/load-walkthroughs.ts` (NEU).

```typescript
export async function loadApprovedWalkthroughs(
  adminClient: SupabaseClient,
  tenantId: string,
): Promise<WalkthroughRow[]>;
```

Logik:
1. SELECT walkthrough_session WHERE tenant_id=$1 AND status='approved' ORDER BY created_at ASC
2. Pro Session: SELECT walkthrough_step WHERE walkthrough_session_id=$session AND deleted_at IS NULL ORDER BY step_number
3. Pro Session: SELECT walkthrough_review_mapping WHERE walkthrough_step_id IN (...steps)
4. JOIN profiles fuer recorder_display_name (LEFT JOIN, NULL → "Unbekannter Mitarbeiter")
5. Returns aggregierte WalkthroughRow[]

Bei Fehler: throw mit klarer Message, Worker-Pipeline stoppt diesen Snapshot-Job (existing Pattern aus `handle-snapshot-job.ts`).

### C — Renderer

Pfad: `src/workers/handbook/sections.ts` (existing).

- Neue Funktion `renderWalkthroughsSection(input: RenderSectionInput & { walkthroughs: WalkthroughRow[] }): RenderedSection`
- Wenn Section.sources enthaelt `type='walkthrough'` → dieser Renderer wird statt `renderSection`-Default-Pfad aufgerufen. Loader-Filter: `min_status='approved'` (in V5.1 hardcodiert; subtopic_keys NULL = alle).
- Markdown-Output-Schema (Pseudocode, finale Layout in MT-3-Implementation):
  ```markdown
  # Walkthroughs

  <a id="section-walkthroughs"></a>

  _In diesem Abschnitt finden Sie aufgezeichnete Walkthroughs der Mitarbeiter._

  ## {Recorder-Name} — {YYYY-MM-DD} ({mm:ss})

  <a id="walkthrough-{session_id_short}"></a>

  <video src="/api/walkthrough/{session_id}/embed" controls preload="metadata" style="max-width:100%;border-radius:0.5rem"></video>

  ### Subtopic A1 — Grundverstaendnis

  1. **{action}**
     _Verantwortlich:_ {responsible} | _Frist:_ {timeframe}
     _Erfolg:_ {success_criterion}

  ### Unzugeordnete Schritte

  ...

  ## {nächster Walkthrough}

  ...
  ```
- Subtopic-Gruppierung: alle steps wo `mapping.subtopic_id` matched, gruppiert mit H3 pro Subtopic. Schritte ohne Mapping (subtopic_id IS NULL) landen unter H3 "Unzugeordnete Schritte" am Ende des Walkthrough-Blocks.
- Reviewer-Corrected-Marker: pro Schritt optional `_(Berater-korrigiert)_` Footer wenn `mapping.reviewer_corrected=true` (nice-to-have, kann in MT-3 entfallen wenn Layout zu busy).
- Wenn keine approved Walkthroughs → Section-Body: `_Es wurden noch keine Walkthroughs freigegeben._` (analog existing Empty-State-Pattern aus sections.ts:97-99).

### D — Worker-Integration

Pfad: `src/workers/handbook/handle-snapshot-job.ts` (existing).

- Neuer Loader-Aufruf nach SOPs-Load (Zeile ~149-163):
  ```typescript
  // 7b. Lade approved Walkthroughs (V5.1 FEAT-038)
  const walkthroughs = await loadApprovedWalkthroughs(adminClient, snapshot.tenant_id as string);
  console.log(`[handbook-job] Loaded ${walkthroughs.length} approved walkthroughs`);
  ```
- `renderHandbook`-Aufruf erweitern um `walkthroughs` (Renderer-Input-Schema).
- `renderer.ts` (existing) muss den Pass-Through nach `renderSection` machen (Section-Type-Branch in MT-3).

### E — Storage-Proxy-Endpoint

Pfad: `src/app/api/walkthrough/[sessionId]/embed/route.ts` (NEU).

- Pattern-Reuse aus `src/app/api/handbook/[snapshotId]/download/route.ts`.
- Implementation:
  ```typescript
  export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
    const { sessionId } = await params;
    if (!sessionId) return 400-JSON;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 401-JSON;
    const { data, error } = await supabase.rpc('rpc_get_walkthrough_video_path', { p_walkthrough_session_id: sessionId });
    if (error) return 500;
    const result = data as { storage_path?: string; error?: string };
    if (result.error === 'unauthenticated') return 401;
    if (result.error === 'forbidden') return 403;
    if (result.error === 'not_found') return 404;
    if (result.error === 'not_approved') return 409;
    if (!result.storage_path) return 500;
    const adminClient = createAdminClient();
    const { data: blob, error: dlError } = await adminClient.storage.from('walkthroughs').download(result.storage_path);
    if (dlError || !blob) return 500;
    const arrayBuffer = await blob.arrayBuffer();
    const totalSize = arrayBuffer.byteLength;
    const range = req.headers.get('range');
    if (range) {
      const match = range.match(/bytes=(\d+)-(\d*)/);
      if (!match) return 416;
      const startByte = Number(match[1]);
      const endByte = match[2] ? Math.min(Number(match[2]), totalSize - 1) : totalSize - 1;
      if (startByte >= totalSize || endByte < startByte) return 416;
      const slice = arrayBuffer.slice(startByte, endByte + 1);
      return new NextResponse(slice, {
        status: 206,
        headers: {
          'Content-Type': 'video/webm',
          'Content-Range': `bytes ${startByte}-${endByte}/${totalSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(slice.byteLength),
          'Cache-Control': 'private, no-store',
        },
      });
    }
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/webm',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(totalSize),
        'Cache-Control': 'private, no-store',
      },
    });
  }
  ```
- KEINE Audit-Log-Schreibung im Endpoint (DEC-098: Audit kommt aus Reader-Page-Load via SLC-092 MT-3).

### F — Migration 089 (MIG-033)

Pfad: `sql/migrations/089_v51_walkthrough_handbook_integration.sql` (NEU).

- 1. RPC `rpc_get_walkthrough_video_path` SECURITY DEFINER (Format-Skizze in MIGRATIONS.md MIG-033)
- 2. DML idempotent: walkthroughs-Section in `template.handbook_schema` der 2 produktiven Templates einfuegen (Containment-Check, kein doppelter Insert)
- Apply-Pattern: `sql-migration-hetzner.md` (base64-Pipe + `psql -U postgres`)
- Pre-Apply-Backup-Pflicht fuer `template.handbook_schema` (mind. exit_readiness + mitarbeiter_wissenserhebung)

### G — Vitest

Pfade unter `src/workers/handbook/__tests__/` (existing) + `src/lib/db/__tests__/` (existing):

- `load-walkthroughs.test.ts` — Loader gegen Coolify-DB: Tenant-Isolation, deleted_at-Filter, approved-Status-Filter, JOIN-Ergebnisse (3-4 Faelle)
- `render-walkthroughs-section.test.ts` — Renderer: leere Liste, 1 Walkthrough, mehrere Walkthroughs mit gemischtem Subtopic-Mapping, Reviewer-Corrected-Marker (4-5 Faelle, deterministisch in-memory)
- `walkthrough-embed-route.test.ts` — Endpoint: Unauth → 401, RPC-Forbidden → 403, RPC-Not-Found → 404, RPC-Not-Approved → 409, ohne Range → 200 + Full Body, mit Range → 206 + Content-Range (5-6 Faelle, mit Mock-RPC + Mock-adminClient.download)
- `rpc-walkthrough-video-path.test.ts` — RPC gegen Coolify-DB: 4 Rollen × 3 Status × 2 Tenant-Konstellationen mit SAVEPOINT-Pattern (24 Faelle, oder Subset 12 Faelle wenn 24 zu lang)

Mind. **8 neue Vitest** (deterministisch + integration). Pflicht: alle gruen vor MT-7.

## Acceptance Criteria

1. `validate-schema.ts` akzeptiert Section mit `type: 'walkthrough'`; reject bei unbekannten Source-Typen bleibt erhalten.
2. `loadApprovedWalkthroughs(client, tenantId)` liefert nur approved Sessions des Tenants mit gefilterten Steps (deleted_at IS NULL) und JOIN-Mappings.
3. `renderWalkthroughsSection` produziert deterministisches Markdown: H1 Section-Title, H2 pro Walkthrough, H3 pro Subtopic (alphabetisch), Schritte numeriert.
4. Snapshot-Worker `handle-snapshot-job.ts` lae dt zusaetzlich Walkthroughs ohne bestehende Sections-Pipeline zu beeinflussen (V4-Snapshots ohne Walkthrough-Section weiter generierbar).
5. `<video>`-Tag im Markdown wird im ZIP korrekt persistiert (literal-Output, kein Markdown-Escape).
6. Migration 089 idempotent applied: Re-Run produziert keinen DML-Drift (Containment-Check + `CREATE OR REPLACE FUNCTION`).
7. RPC `rpc_get_walkthrough_video_path` liefert `{ storage_path, created_at }` fuer eigenen Tenant + Rolle in (`tenant_admin`, `strategaize_admin`) + Status='approved'; sonst `{ error: ... }`.
8. Storage-Proxy: Range-Header `bytes=0-1023` -> HTTP 206 + Content-Range `bytes 0-1023/{total}` + sliced body. Kein Range -> HTTP 200 + Full Body.
9. Storage-Proxy: 401 unauth, 403 cross-tenant tenant_admin, 404 unbekannte Session, 409 status!='approved'.
10. **`npm run lint` + `npm run build` + `npm run test` alle gruen.**
11. **`npm audit --omit=dev` keine neuen Vulns** (V5.1 fuegt keine npm-Deps hinzu).

## Micro-Tasks

| # | Task | Files | Verify |
|---|------|-------|--------|
| MT-1 | Types + Schema-Validator erweitern | `src/workers/handbook/types.ts`, `validate-schema.ts` | Vitest validate-schema akzeptiert `type='walkthrough'` |
| MT-2 | Loader `loadApprovedWalkthroughs` | `src/workers/handbook/load-walkthroughs.ts` (NEU) + Test | Vitest gegen Coolify-DB 3-4 Faelle PASS |
| MT-3 | Renderer `renderWalkthroughsSection` + Branch in `renderSection` | `src/workers/handbook/sections.ts` + `renderer.ts` + Test | Vitest deterministisch 4-5 Faelle PASS, Markdown-Output Snapshot-Compare |
| MT-4 | Migration 089 SQL-File anlegen | `sql/migrations/089_v51_walkthrough_handbook_integration.sql` (NEU) | `psql --syntax-check` lokal, RPC-Body in Format-Skizze konsistent |
| MT-5 | Storage-Proxy Endpoint mit Range-Support | `src/app/api/walkthrough/[sessionId]/embed/route.ts` (NEU) + Test | Vitest endpoint 5-6 Faelle PASS (mit Mocks) |
| MT-6 | Worker-Integration `handle-snapshot-job.ts` | `src/workers/handbook/handle-snapshot-job.ts` | `npm run build` PASS, manueller Snapshot-Run gegen Coolify-DB liefert ZIP mit Walkthroughs-Section |
| MT-7 | Migration 089 Live-Apply auf Hetzner | Coolify-Container `supabase-db-bwkg80w04wgccos48gcws8cs-*` | `\df rpc_get_walkthrough_video_path` zeigt Function. RPC-Smoke-Call mit existing approved session liefert `{ storage_path, created_at }`. `SELECT handbook_schema -> 'sections' FROM template` zeigt Walkthroughs-Section in beiden Templates. Pre-Apply-Backup `/opt/onboarding-plattform-backups/pre-mig-033_<timestamp>.csv` existiert. |

## Out of Scope (deferred)

- Reader-Frontend `<video>` CSS + allowedElements + Stale-Banner-Erweiterung → SLC-092
- Audit-Log `walkthrough_video_embed` einmalig pro Reader-Page-Load → SLC-092 MT-3
- 24-Faelle-RLS-Matrix Vitest fuer Endpoint → SLC-092 MT-4 (gegen Coolify-DB mit echten Sessions)
- Browser-Smoke User-Pflicht-Test (Reader oeffnen, Video abspielen, Seek testen) → SLC-092 MT-5
- Inline-Verteilung Walkthroughs pro Subtopic in andere Sections → V5.2+ (DEC-095)
- Stream/Pipe Range-Implementation (bandwidth-effizient) → V5.2+ (DEC-096)
- Auto-Re-Generation-Trigger pro approved Walkthrough → V5.2+ (DEC-097)
- Walkthrough-Search im Reader → V5.2+ (FEAT-038-Spec)

## Tests / Verifikation

- **Vitest-Mindestumfang:** 8+ neue Tests (Loader 3-4 + Renderer 4-5 + Endpoint 5-6 + RPC 12-24 = 24-39 Tests)
- **Live-DB-Tests:** Loader + RPC gegen Coolify-DB im node:20-Container (Pattern `coolify-test-setup.md`)
- **Build:** `npm run build` PASS, ZIP enthaelt `XX_walkthroughs.md` wenn approved Walkthroughs existieren
- **Live-Migration-Apply:** `\d rpc_get_walkthrough_video_path` zeigt SECURITY DEFINER, GRANT EXECUTE TO authenticated
- **RPC-Smoke**: Manueller Aufruf via `SELECT rpc_get_walkthrough_video_path('75098a5d-...'::uuid)` (existing approved session aus Demo-Tenant) als postgres-User mit `SET LOCAL request.jwt.claims = '{"sub":"...","role":"strategaize_admin"}'` liefert `{ storage_path: 'demo-tenant/75098a5d-....webm', created_at: ... }`

## Risks

- **R-091-1** `<video>` literal-Output durch `rehype-raw`: theoretisch funktioniert, aber nicht live verifiziert. **Mitigation:** in MT-6 manueller Snapshot-Build + ZIP-Inspektion, in SLC-092 MT-5 Browser-Smoke. Falls `react-markdown` `<video>` blockiert, in SLC-092 MT-1 `allowedElements` ergaenzen.
- **R-091-2** Range-Request-In-Memory-Slice bei 100MB+ Videos: App-Container-RAM-Belastung. **Mitigation:** Internal-Test-Mode-only (V5.1 nicht Pre-Production), Re-Eval V5.2+ falls Reader-Last steigt (DEC-096).
- **R-091-3** Migration 089 DML aendert produktive Templates: idempotent durch Containment-Check, aber bei Schema-Drift in `handbook_schema` (z.B. `sections` ist String statt Array) bricht UPDATE. **Mitigation:** Pre-Apply-Backup + Live-Verify dass beide produktiven Templates `handbook_schema -> 'sections'` als JSONB-Array haben (MT-7 Pflicht).
- **R-091-4** RPC SECURITY DEFINER + Schema-Search-Path: `SET search_path = public, auth` muss in der Function explizit gesetzt werden, sonst SQL-Injection-Risiko (Search-Path-Attack). **Mitigation:** in MT-4 als expliziter SET-Block.

## Cross-Refs

- DEC-095 (Walkthroughs als eigener Section-Source-Typ)
- DEC-096 (HTML5 video + Range-faehiger Storage-Proxy)
- DEC-099 (RPC-basierter RLS-Check)
- MIG-033 / Migration 089 (rpc + DML)
- FEAT-038 In-Scope-Block 2 + 3 (Handbuch-Renderer-Erweiterung + Section-Konfiguration)
- ARCHITECTURE.md V5.1-Sektion (Main Components + Data Flow + Range-Pattern)
- V4 SLC-039 + SLC-040 (Snapshot-Worker + Storage-Proxy-Pattern-Vorlage)
- V4.1 ISSUE-025-Resolution (Storage-Proxy statt Signed-URL)

## Dependencies

- **Pre-Conditions:** V5 Option 2 STABLE (Cron-Run-Verifikation 2026-05-09 03:00) + `/post-launch V5` PASS. Migration 089 DML benoetigt stabile V5-Foundation, weil sie produktive Templates aendert.
- **Blockt:** SLC-092 (Frontend-Reader-Integration) — SLC-091 muss MT-7 abschliessen, bevor SLC-092 MT-5 Browser-Smoke moeglich ist (echtes Video + echte RPC).
- **Wird nicht blockiert von:** /slice-planning V5.1 ist parallel zu V5-STABLE-Wartezeit moeglich.
