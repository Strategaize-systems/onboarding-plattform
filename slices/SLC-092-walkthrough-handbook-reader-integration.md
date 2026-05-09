# SLC-092 — Walkthrough Handbuch-Reader-Integration + Stale-Marker + Audit + RLS-Matrix (FEAT-038)

## Goal

Frontend-Integration der V5.1 Walkthrough-Section in den existing Handbuch-Reader. Verifiziert dass `<video>`-Tags mit Range-Requests durch `react-markdown` + `rehype-raw` korrekt gerendert werden, ergaenzt Stale-Banner-Logic um approved-Walkthrough-Trigger, schreibt einmaligen Audit-Eintrag pro Reader-Page-Load (DEC-098), und etabliert die 24-Faelle-RLS-Matrix gegen den Storage-Proxy aus SLC-091. Schliesst V5.1 mit User-Pflicht-Browser-Smoke ab.

## Feature

FEAT-038 (Walkthrough Handbuch-Integration) — Frontend-Anteil. Pattern-Reuse: V4.1 FEAT-028 Reader (HandbookReader.tsx + ReaderShell + StaleMarker) + V4.1 SLC-042 getReviewSummary-Pattern.

## In Scope

### A — Reader Render-Path fuer `<video>`

Pfad: `src/components/handbook/HandbookReader.tsx` (existing).

- Pruefen ob `react-markdown` mit `rehypeRaw` `<video>` durchlaesst. Erwartung: ja (HTML-Tag analog `<a id="...">`). Falls `react-markdown` per Default `disallowedElements` setzt, explizit `allowedElements`-Override entfernen oder `video` + `source` zur Allowlist hinzufuegen.
- CSS via Tailwind in der Markdown-Render-Section: `<video>` automatisch mit `max-w-full`, `rounded-lg`, `shadow-md`, `mt-4 mb-6`. Implementation via `components`-Prop von `react-markdown`:
  ```tsx
  <ReactMarkdown
    components={{
      video: ({ node, ...props }) => (
        <video
          {...props}
          className="max-w-full rounded-lg shadow-md my-6 bg-black"
          controls
          preload="metadata"
        />
      ),
    }}
    remarkPlugins={[remarkGfm]}
    rehypePlugins={[rehypeRaw, rehypeSlug, [rehypeAutolinkHeadings, AUTOLINK_OPTIONS]]}
  >
  ```
- Kein neuer Plugin-Stack — existing `rehype-raw` reicht.

### B — Stale-Banner-Logic erweitern

Pfad: `src/lib/handbook/load-snapshot-content.ts` (existing) oder `src/app/dashboard/handbook/[snapshotId]/page.tsx` (existing).

Existing Pattern (V4.1 SLC-042):
```typescript
const isStale = await checkSnapshotStale(snapshot, tenant_id);
// → block_checkpoint.created_at > snapshot.created_at
```

V5.1-Erweiterung:
```typescript
async function checkSnapshotStale(snapshot, tenant_id): Promise<boolean> {
  // existing block_checkpoint-Check
  const blockStale = await ...

  // NEU: approved-walkthrough-Check
  const { data: latestApprovedWalkthrough } = await adminClient
    .from('walkthrough_session')
    .select('approved_at')
    .eq('tenant_id', tenant_id)
    .eq('status', 'approved')
    .gt('approved_at', snapshot.created_at)
    .order('approved_at', { ascending: false })
    .limit(1);

  return blockStale || (latestApprovedWalkthrough?.length ?? 0) > 0;
}
```

Banner-Text bleibt einheitlich (existing): "Es gibt neuere Daten — neuen Snapshot generieren".

### C — Audit-Log einmalig pro Reader-Page-Load (DEC-098)

Pfad: `src/lib/handbook/load-snapshot-content.ts` (existing) oder Reader-Page server-side.

```typescript
// Nach Snapshot-Load + nachdem festgestellt wird, dass eine walkthroughs-Section existiert:
const hasWalkthroughsSection = sectionFiles.some(
  (sf) => sf.filename.endsWith('_walkthroughs.md') || sf.markdown.includes('<video src="/api/walkthrough/'),
);
if (hasWalkthroughsSection) {
  const walkthroughIds = extractWalkthroughIds(sectionFiles);
  await captureInfo({
    source: 'handbook/reader',
    metadata: {
      category: 'walkthrough_video_embed',
      snapshot_id: snapshot.id,
      tenant_id: snapshot.tenant_id,
      reader_user_id: user.id,
      walkthrough_session_ids: walkthroughIds,
    },
  });
}
```

- Audit-Category `walkthrough_video_embed` (analog DEC-088 V5-Pattern wie `walkthrough_raw_transcript_view`)
- **Einmal pro Reader-Page-Load**, nicht pro Range-Request
- Bei Cross-Tenant-403 wird KEIN Audit geschrieben (Forbidden = nicht-eingesehen)
- Helper `extractWalkthroughIds(sectionFiles)`: Regex-Match auf `/api/walkthrough/([a-f0-9-]+)/embed` im Markdown-Body

### D — Cockpit-Card-Erweiterung "Snapshot empfehlbar"

Pfad: `src/components/cockpit/PendingWalkthroughsCard.tsx` (existing aus V5 Hotfix `39631f5`).

Sub-Hint optional ergaenzen:
```tsx
{approvedAfterLastSnapshot > 0 && (
  <p className="text-xs text-amber-600 mt-2">
    {approvedAfterLastSnapshot} freigegebene Walkthroughs seit letztem Snapshot — neuer Snapshot empfehlbar.
  </p>
)}
```

Datenquelle via existing `getReviewSummary`-Pattern erweitern um `approvedAfterLastSnapshot`-Counter.

**Optional in V5.1**: dieser Cockpit-Card-Sub-Hint ist nice-to-have. Falls Layout-Frictions in MT-3 entstehen, in V5.2+ verschieben. Pflicht ist nur Stale-Banner im Reader.

### E — RLS-Matrix Vitest

Pfad: `src/lib/db/__tests__/walkthrough-embed-rls.test.ts` (NEU).

Test-Setup gegen Coolify-DB im node:20-Container (Pattern `coolify-test-setup.md`):
- 2 Tenants (Demo-Tenant + neuer Test-Tenant via Fixture-Insert)
- Pro Tenant: 3 walkthrough_sessions (1 approved, 1 pending_review, 1 rejected)
- 4 User-Rollen: tenant_admin, tenant_member, employee, strategaize_admin
- Pro Rolle × Status × Tenant-Konstellation: erwartete RPC-Antwort

Test-Faelle (24 Total, oder Subset 12-16 wenn 24 zu redundant):
- tenant_admin Tenant-A: approved/own → `{ storage_path }`, pending → `{ error: 'not_approved' }`, rejected → `{ error: 'not_approved' }`, approved/other-tenant → `{ error: 'forbidden' }`
- tenant_member Tenant-A: alle Status → `{ error: 'forbidden' }` (Mitarbeiter sehen Reader nicht, V4.1 DEC-V4.1-2)
- employee Tenant-A: alle Status → `{ error: 'forbidden' }`
- strategaize_admin: approved cross-tenant → `{ storage_path }`, pending → `{ error: 'not_approved' }`, rejected → `{ error: 'not_approved' }`

SAVEPOINT-Pattern fuer expected Permission-Denials.

Cleanup: nach jedem Test alle Test-Sessions geloescht (DELETE WHERE tenant_id = test-tenant).

### F — Browser-Smoke (User-Pflicht)

User-Pflicht-Smoke nach Coolify-Deploy auf SLC-091+092-Commit:

1. `richard@bellaerts.de` als tenant_admin login.
2. `/admin/handbook` oeffnen → "Snapshot generieren" triggern (existing Trigger).
3. Snapshot ZIP-Inhalt-Inspektion via Download (existing FEAT-028-Pfad) — ZIP soll `XX_walkthroughs.md` enthalten.
4. Reader oeffnen `/dashboard/handbook/<snapshotId>` mit dem neuen Snapshot.
5. Walkthroughs-Section sichtbar (Sidebar-Eintrag + Section-Block im Markdown-Bereich).
6. `<video>`-Player rendert mit Roh-Video aus `walkthroughs`-Bucket.
7. **Play-Test**: Video startet, Audio + Video synchron.
8. **Seek-Test**: Klick in Timeline mid-Video → Browser sendet Range-Request → Player springt korrekt.
9. **Stale-Banner-Test**: neuer approved Walkthrough nach Snapshot-Generierung → Reader-Reload → Banner "Es gibt neuere Daten" erscheint.
10. **Audit-Log-Verify**: `SELECT * FROM error_log WHERE metadata->>'category' = 'walkthrough_video_embed' ORDER BY created_at DESC LIMIT 5` zeigt 1 Eintrag pro Reader-Page-Load (NICHT pro Range-Request).
11. **Cross-Tenant-Test**: zweiter tenant_admin (von Demo-Tenant-B falls vorhanden, sonst manueller URL-Manipulation-Test) → 403/404 fuer Tenant-A-Embed.

## Acceptance Criteria

1. `<video>`-Tag aus Snapshot-Markdown rendert im Reader als HTML5-Player mit Tailwind-Styling.
2. Stale-Banner triggert wenn `walkthrough_session.status='approved' AND approved_at > snapshot.created_at` existiert.
3. Audit-Log `walkthrough_video_embed` schreibt einmalig pro Reader-Page-Load mit Snapshot-ID + Walkthrough-IDs.
4. Audit-Log schreibt KEIN Eintrag pro Range-Request (Range-Request-Storm wird nicht ausgeloest).
5. Audit-Log schreibt KEIN Eintrag bei Cross-Tenant-403.
6. Browser-Player startet, spielt, seek-t korrekt (User-Pflicht).
7. Cross-Tenant-User bekommt 403/404 fuer Embed-Endpoint.
8. RLS-Matrix Vitest gegen Coolify-DB: alle 12-24 Faelle PASS.
9. Cockpit-Card-Sub-Hint "Snapshot empfehlbar" zeigt Counter wenn approved Walkthroughs nach letztem Snapshot existieren (optional, kann in V5.2+ verschoben werden).
10. **`npm run lint` + `npm run build` + `npm run test` alle gruen** (inkl. neue Reader-Tests).
11. **`npm audit --omit=dev` keine neuen Vulns**.

## Micro-Tasks

| # | Task | Files | Verify |
|---|------|-------|--------|
| MT-1 | react-markdown `<video>` allowedElements pruefen + Tailwind-Styling via components-Prop | `src/components/handbook/HandbookReader.tsx` | Lokal Test-Markdown mit `<video src="...">` rendert als Player; Vitest-Snapshot |
| MT-2 | Stale-Banner-Logic erweitern um approved-Walkthrough-Check | `src/lib/handbook/load-snapshot-content.ts` (oder Reader-Page) + Test | Vitest 2-3 Faelle: kein Walkthrough → no banner, neuer approved → banner, alter approved → no banner |
| MT-3 | Audit-Log `walkthrough_video_embed` einmalig pro Page-Load | `src/lib/handbook/load-snapshot-content.ts` + Test | Vitest 2 Faelle: Snapshot mit Walkthroughs → 1 Audit-Eintrag, ohne Walkthroughs → 0 Audit-Eintraege |
| MT-4 | RLS-Matrix Vitest gegen Coolify-DB | `src/lib/db/__tests__/walkthrough-embed-rls.test.ts` (NEU) | 12-24 Faelle PASS, SAVEPOINT-Pattern fuer Denials, cleanup nach Test |
| MT-5 | (Optional) Cockpit-Card-Sub-Hint "Snapshot empfehlbar" | `src/components/cockpit/PendingWalkthroughsCard.tsx` | Render-Snapshot-Test, Sub-Hint sichtbar wenn Counter > 0 |
| MT-6 | Code-Quality-Gates | — | `npm run lint` 0/0, `npm run build` PASS, `npm audit --omit=dev` 0 neue Vulns |
| MT-7 | Browser-Smoke User-Pflicht | Live-URL onboarding.strategaizetransition.com | 11-Punkte-Checklist (oben Sektion F) — alle PASS |

## Out of Scope (deferred)

- Walkthrough-Search im Reader → V5.2+ (existing Cross-Snapshot-Suche umfasst Walkthroughs-Markdown automatisch via V4.3 SLC-054, keine V5.1-Aenderung noetig)
- Subtitle-Tracks aus Whisper-Transkript → V5.2+ (FEAT-038-Spec)
- Adaptive Streaming / HLS → Pre-Production (DEC-096)
- Walkthrough-Embedding inline in andere Sections (z.B. SOP-Section) → V5.2+ (DEC-095)
- Re-Generation-Trigger Auto-Throttle → V5.2+ (DEC-097)

## Tests / Verifikation

- **Vitest-Mindestumfang:** 6+ neue Tests (Stale-Banner 2-3 + Audit 2 + RLS-Matrix 12-24 + Reader-Render 1-2 = 17-31 Tests)
- **Live-DB-Tests:** RLS-Matrix gegen Coolify-DB im node:20-Container
- **Build:** `npm run build` PASS, Reader-Page-Bundle-Size unverandert (kein neuer Code-Pfad-Sprawl)
- **Browser-Smoke:** User-Pflicht-Test 11-Punkte-Checklist PASS

## Risks

- **R-092-1** `react-markdown.allowedElements`-Default blockt `<video>`: falls so, in MT-1 explizit ergaenzen. **Mitigation:** in MT-1 erste Aktion ist Verify mit Test-Markdown.
- **R-092-2** Stale-Check bei vielen approved Walkthroughs (>100) wird langsam: aktuell `LIMIT 1` mit Index auf `(tenant_id, status, approved_at)`. **Mitigation:** SLC-074 hat keinen Index auf approved_at — falls Performance-Issue, nachschieben (Migration 090). Test in MT-2.
- **R-092-3** Audit-Spam wenn Reader-Page-Refreshes vorkommen: pro Page-Load 1 Eintrag ist akzeptabel. Browser-Reload = neuer Audit-Eintrag (consistent mit DEC-088-Pattern fuer raw_transcript_view-Toggle).
- **R-092-4** Browser-Smoke ohne 2-Tenant-Setup nicht voll testbar: Cross-Tenant-Pruefung erfordert 2 tenant_admin-User in 2 Tenants. **Mitigation:** entweder (a) URL-Manipulation-Test als tenant_admin-A versucht Embed fuer Tenant-B-Session direkt → 403/404, oder (b) Test-Setup mit zweitem Demo-Tenant einmalig via Fixture (kann in /qa SLC-092 erstellt werden, anschliessend wieder geloescht).

## Cross-Refs

- DEC-095 (Walkthroughs als eigener Section-Source-Typ)
- DEC-096 (HTML5 video + Range-faehiger Storage-Proxy)
- DEC-097 (manuelles Re-Generation-Trigger via Stale-Banner)
- DEC-098 (Audit einmalig pro Reader-Page-Load)
- DEC-099 (RPC-basierter RLS-Check)
- FEAT-038 In-Scope-Block 2 (Handbuch-Renderer-Erweiterung — Reader-Anteil)
- ARCHITECTURE.md V5.1-Sektion (Reader-Read-Phase + Audit-Strategie)
- V4.1 SLC-041 + SLC-042 (Stale-Banner-Pattern + Cockpit-Card-Pattern)
- V4.3 SLC-054 (Cross-Snapshot-Suche, umfasst Walkthroughs-Markdown automatisch)

## Dependencies

- **Pre-Conditions:** SLC-091 Code-Complete + Migration 089 LIVE auf Hetzner. SLC-092 MT-7 Browser-Smoke benoetigt funktionalen Embed-Endpoint und mind. 1 approved Walkthrough im Demo-Tenant.
- **Blockt:** Gesamt-/qa V5.1 + Final-Check + Go-Live + Deploy.
- **Wird blockiert von:** SLC-091 (Backend-Foundation muss live sein bevor Frontend dagegen testet).
