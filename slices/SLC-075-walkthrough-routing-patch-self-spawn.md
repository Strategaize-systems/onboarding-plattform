# SLC-075 — Walkthrough Routing-Patch + Self-Spawn-Pattern

## Goal

V5 Option 2 Foundation-Closing-Slice. Loest Q-V5-F (HTTP 404 aus SLC-071 Browser-Smoke-Versuch) ueber den Self-Spawn-Pattern aus DEC-080. Bestehender SLC-071-Code (`WalkthroughCapture.tsx`, `requestWalkthroughUpload`, `confirmWalkthroughUploaded`) bleibt funktional unveraendert — nur Routing-Wrapping aendert sich. Neue Server Action `startWalkthroughSession()` erzeugt fresh `capture_session` (capture_mode='walkthrough', owner_user_id=auth.uid()) + `walkthrough_session` und gibt `walkthroughSessionId` zurueck. Neue UI-Routen `/employee/walkthroughs` (Liste + "Neuen Walkthrough starten"-Button) und `/employee/walkthroughs/[id]/record` ersetzen den 404-anfaelligen `/employee/capture/walkthrough/[capture_session_id]`-Pfad. AC-10/11/12 Browser-Smoke wird nachgeholt.

## Feature

FEAT-034 (Walkthrough Capture-Session) — Self-Spawn-Pattern-Routing als Architektur-Korrektur aus DEC-080. Schliesst BL-086. Voraussetzung fuer alle weiteren V5-Option-2-Slices, weil ohne korrektes Routing kein Mitarbeiter den Capture-Pfad erreicht.

## In Scope

### A — Server Action `startWalkthroughSession`

Pfad: `src/app/actions/walkthrough.ts` (modify — bestehende `requestWalkthroughUpload` + `confirmWalkthroughUploaded` bleiben unveraendert).

```typescript
"use server";

export async function startWalkthroughSession(): Promise<{
  walkthroughSessionId: string;
}> {
  const user = await requireAuth();
  const tenantId = await getUserTenantId(user.id);

  // Atomare Transaction: capture_session + walkthrough_session zusammen
  const { data, error } = await supabaseAdmin.rpc(
    "start_walkthrough_session",
    { p_user_id: user.id, p_tenant_id: tenantId }
  );

  if (error) throw error;
  return { walkthroughSessionId: data.walkthrough_session_id };
}
```

Optionale Variante: ohne RPC — zwei sequentielle INSERTs in einer Service-Role-Transaction. Final in MT-1.

### B — Neue Routen-Struktur

| Route | Rolle | Zweck |
|-------|-------|-------|
| `/employee/walkthroughs` (page.tsx, Server Component) | tenant_member, employee | Liste eigener Walkthroughs + "Neuen Walkthrough starten"-Button → triggert `startWalkthroughSession` → Redirect /record |
| `/employee/walkthroughs/[id]/record` | tenant_member, employee | Recording-UI (Wrapper um existing `<WalkthroughCapture>`) |
| `/employee/walkthroughs/[id]` | tenant_member, employee | Status-Polling-Page (Pipeline-Progress nach Stopp+Upload) |

Bestehende Route `/employee/capture/walkthrough/[capture_session_id]/page.tsx` wird **geloescht** (404-Source).

### C — UI-Komponenten Anpassung

- `src/app/employee/walkthroughs/page.tsx` (neu) — Server Component, lade eigene `walkthrough_session`-Liste via Owner-Filter (RLS-trivial), Button-Form mit `action={startWalkthroughSession}` + Redirect.
- `src/app/employee/walkthroughs/[id]/record/page.tsx` (neu) — wrappt existing `<WalkthroughCapture>`; lade walkthroughSession, pruefe `recorded_by_user_id === auth.uid()`, sonst 404.
- `src/app/employee/walkthroughs/[id]/page.tsx` (neu) — Status-Polling-Page (zeigt Status-Pipeline-Stufen mit Refresh-Pattern, nicht Polling — DEC-060-Konsistenz).
- `src/components/walkthrough/WalkthroughCapture.tsx` (modify) — Props-Aenderung von `captureSessionId` auf `walkthroughSessionId`. Interne `requestWalkthroughUpload` ruft jetzt mit walkthroughSessionId.
- `src/app/actions/walkthrough.ts`: `requestWalkthroughUpload(walkthroughSessionId)` (Refactor) — capture_session-Lookup intern, kein UI-Pfad fuer captureSessionId mehr.

### D — Browser-Smoke AC-10/11/12

Nach Routing-Patch in der QA-Phase nachholen:
- **AC-10**: Mitarbeiter ruft `/employee/walkthroughs` auf, sieht Liste + Button.
- **AC-11**: Klick auf "Neuen Walkthrough starten" → Self-Spawn → Redirect auf `/record` → MediaRecorder startet (Berechtigungs-Dialog).
- **AC-12**: Aufnahme stoppen, Upload, Redirect auf Status-Page, Status-Anzeige korrekt.

## Micro-Tasks

### MT-1: Self-Spawn-Server-Action `startWalkthroughSession`
- Goal: Atomare capture_session + walkthrough_session-Erzeugung mit owner_user_id=auth.uid().
- Files: `src/app/actions/walkthrough.ts`, ggf. `sql/migrations/088_v5opt2_start_walkthrough_rpc.sql` (optional RPC-Variante).
- Expected behavior: Action liefert walkthroughSessionId, RLS sieht Session sofort fuer den Owner.
- Verification: Vitest mit Test-User (employee Demo-Tenant) → Action laeuft → SELECT walkthrough_session WHERE recorded_by_user_id=auth.uid() liefert die Row → SELECT capture_session WHERE owner_user_id=auth.uid() AND capture_mode='walkthrough' liefert die Row.
- Dependencies: none

### MT-2: Neue Routen `/employee/walkthroughs/*`
- Goal: 3 neue Routen + alte Route entfernen.
- Files: `src/app/employee/walkthroughs/page.tsx` (neu), `src/app/employee/walkthroughs/[id]/record/page.tsx` (neu), `src/app/employee/walkthroughs/[id]/page.tsx` (neu), `src/app/employee/capture/walkthrough/[capture_session_id]/page.tsx` (DELETE).
- Expected behavior: Liste-Page rendert eigene Sessions, Record-Page rendert WalkthroughCapture, Status-Page rendert Pipeline-Status.
- Verification: `npm run build` ohne Fehler. Manuelle Pfad-Tests via curl auf 200.
- Dependencies: MT-1

### MT-3: WalkthroughCapture-Refactor + Browser-Smoke AC-10/11/12
- Goal: Komponente nutzt walkthroughSessionId statt captureSessionId. Browser-Smoke nachholen.
- Files: `src/components/walkthrough/WalkthroughCapture.tsx` (modify), `src/app/actions/walkthrough.ts` (Signaturanpassung).
- Expected behavior: Komponente unveraendert in MediaRecorder-Logik, nur Server-Action-Aufruf-Signatur aktualisiert.
- Verification: Browser-Smoke richard@bellaerts.de auf https://onboarding.strategaizetransition.com/employee/walkthroughs → Klick Button → Permissions-Dialog → kurz aufnehmen → Stoppen → Status-Page laedt mit `uploaded`. Screenshot-Beleg pro AC.
- Dependencies: MT-1, MT-2

## Out of Scope

- Pipeline-Stages (`redacting`, `extracting`, `mapping`) — kommen in SLC-076..078.
- Status-Polling-UI mit Auto-Refresh — Status-Page nutzt manuellen Refresh, kein Polling-JS.
- Methodik-Review-UI — SLC-079.
- Cleanup-Cron-Erweiterung — SLC-074.

## Risks / Mitigations

- **R1 — RPC-Variante Migration noetig**: Falls atomare Transaction in Server Action ohne RPC nicht zuverlaessig (Service-Role + zwei INSERTs ohne BEGIN/COMMIT-Wrapper), Migration 088 als optionale RPC nachziehen. Fallback: zwei separate Server-Actions wenn Service-Role-Client Transactional ist (Standard `supabase-js` mit service_role-Key — beide INSERTs in einer DB-Connection sind atomar).
- **R2 — Bestehende SLC-071-Tests**: Tests die `captureSessionId`-Pfad asserten muessen umgezogen werden. Erkennung in MT-3 via `npm run test`.
- **R3 — RLS-Drift**: Self-Spawn-Pattern setzt `owner_user_id=auth.uid()` — RLS-Policy fuer capture_session muss employee SELECT auf owner_user_id=auth.uid() erlauben. Per V4 SLC-037 + Memory `feedback_no_browser_supabase` ist das etabliert. Verifikation in MT-1-Vitest.

## Verification

- `npm run lint` 0/0
- `npm run build` ohne Fehler
- `npm run test` PASS (eingeschlossen ist neuer Vitest fuer MT-1)
- Browser-Smoke AC-10/11/12 mit richard@bellaerts.de auf Live-URL — Screenshot-Beleg + Cookie-Pfad.

## Pflicht-Gates

- AC-10/11/12 Browser-Smoke gruen (loest BL-086 = Q-V5-F kritisch).
- 0 RLS-Test-Regression auf bestehender capture_session 4-Rollen-Matrix.
- Keine Schema-Migration in MT-1 wenn ohne RPC machbar (Risk-Reduktion). MT-1-Reviewer entscheidet.

## Status

planned

## Created

2026-05-06
