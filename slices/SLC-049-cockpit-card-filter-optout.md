# SLC-049 — Cockpit-Card "Mitarbeiter ohne Aktivitaet" + Mitarbeiter-Liste-Filter + Opt-Out-Toggle

## Goal
Frontend-Implementation der V4.2-User-Praeferenzen und der Cockpit-Visibility fuer Mitarbeiter-Aktivitaet. Drei UI-Surfaces: (1) neue Cockpit-Card auf `/dashboard` zeigt Anzahl inaktiver Mitarbeiter mit Klick-Ziel auf gefilterte Mitarbeiter-Liste, (2) `/admin/employees`-Page bekommt einen `?filter=inactive`-Filter, (3) neue oder erweiterte Settings-Page mit Opt-Out-Toggle fuer Reminders.

## Feature
FEAT-032 (Capture-Reminders) — Frontend-Anteil

## In Scope

### A — Cockpit-Card "Mitarbeiter ohne Aktivitaet"

Pfad: `src/components/cockpit/InactiveEmployeesCard.tsx` (neu)

Verhalten:
- Server-Component nutzt `getInactiveEmployeesCount(tenantId)` (existing oder neu in `src/lib/dashboard/inactive-employees.ts`).
- Aggregations-Query (existing employee_invitation-Lookup + NOT EXISTS block_checkpoint):
  ```sql
  SELECT count(*) FROM employee_invitation ei
  WHERE ei.tenant_id = $tenantId
    AND ei.status = 'accepted'
    AND NOT EXISTS (
      SELECT 1 FROM block_checkpoint bc WHERE bc.created_by = ei.accepted_user_id
    )
  ```
- Card-Layout (analog bestehende V4-Cockpit-Cards):
  - Titel: "Mitarbeiter ohne Aktivitaet"
  - Wert: zentrale Zahl
  - Sub-Text: "von X eingeladenen" (X = total accepted invitations)
  - Klickziel: `/admin/employees?filter=inactive`
  - Tooltip am Badge: "Mitarbeiter mit accepted Invitation aber ohne Block-Submit" (DEC-058)
- Refresh-Strategie: Page-Refresh-only (DEC-060). Server-Component fetcht pro Render — kein Polling.

Pfad: `src/lib/dashboard/inactive-employees.ts` (neu, Helper)

```typescript
export async function getInactiveEmployeesCount(tenantId: string): Promise<{
  inactiveCount: number;
  totalAccepted: number;
}>;
```

### B — Mitarbeiter-Liste-Filter

Pfad: `src/app/admin/employees/page.tsx` (geaendert, falls existing) ODER neu falls bisher keine /admin/employees-Page existiert

Verhalten:
- URL-Query-Param `?filter=inactive` rendert nur Mitarbeiter ohne block_checkpoint.
- Default-Filter (kein Query-Param): alle Mitarbeiter.
- Filter-UI: Toggle / Tabs / Dropdown — finale Wahl in /frontend.
- Tabelle zeigt pro Mitarbeiter: Name, E-Mail, Status (active/inactive), accepted_at, letzter Block-Submit (oder "—" wenn keiner).
- Zeile klickbar → Detail-Sicht oder Mitarbeiter-Profil (existing oder Stub).

### C — Opt-Out-Toggle in Settings-Page

Pfad: `src/app/dashboard/settings/page.tsx` (neu, falls noch nicht existing) ODER bestehende Settings-Page erweitern

Q-V4.2-L Empfehlung (eigene `/dashboard/settings`-Page) wird hier umgesetzt.

Verhalten:
- Server-Component liest `user_settings.reminders_opt_out` fuer aktuellen User (RLS regelt OWN-Row).
- Client-Component mit shadcn `Switch`-Komponente.
- Toggle-Click ruft Server-Action `toggleRemindersOptOut(value: boolean)`:
  - `UPDATE user_settings SET reminders_opt_out=$value, updated_at=now() WHERE user_id=auth.uid()`
  - revalidatePath('/dashboard/settings')
- Toast-Bestaetigung "Reminder-Praeferenz gespeichert".
- Sichtbar fuer alle authenticated User (jeder darf eigene Settings aendern).

Pfad: `src/app/dashboard/settings/actions.ts` (neu)
- `toggleRemindersOptOut(value: boolean): Promise<{ ok: boolean }>`

### D — Tests

- `src/lib/dashboard/__tests__/inactive-employees.test.ts` (neu): 3 Test-Cases mit DB-Mock — 0 inactive, 1 inactive, alle active.
- `src/components/cockpit/__tests__/InactiveEmployeesCard.test.tsx` (neu): Render-Tests + Click-to-Filter-Pfad.
- `src/app/admin/employees/__tests__/page.test.tsx`: Filter-Test (`?filter=inactive` zeigt nur inaktive).
- `src/app/dashboard/settings/__tests__/actions.test.ts` (neu): 2 Test-Cases — Toggle on, Toggle off, beide RLS-konform.

## Out of Scope

- Cron-Endpoint (SLC-048)
- SMTP-Send (SLC-048)
- Unsubscribe-Endpoint (SLC-048)
- Wizard-Modal (SLC-047)
- Help-Sheet (SLC-050)
- Reminder-Customization-UI fuer tenant_admin (V4.3+)
- E-Mail-Eskalation-Settings (V4.3+)

## Acceptance Criteria

- AC-1: Cockpit-Card "Mitarbeiter ohne Aktivitaet" rendert auf `/dashboard` als zusaetzliche MetricCard.
- AC-2: Card zeigt korrekten Wert (Mitarbeiter mit accepted Invitation aber ohne block_checkpoint).
- AC-3: Card-Klick fuehrt zu `/admin/employees?filter=inactive` (URL-Param sichtbar).
- AC-4: Card-Tooltip zeigt "Mitarbeiter mit accepted Invitation aber ohne Block-Submit" (DEC-058 Pflicht-Tooltip).
- AC-5: Card respektiert RLS — `tenant_admin` sieht nur eigenen Tenant-Count.
- AC-6: `/admin/employees?filter=inactive` zeigt nur Mitarbeiter ohne Block-Submit.
- AC-7: Default-Filter (kein Query-Param) zeigt alle Mitarbeiter.
- AC-8: `/dashboard/settings`-Page existiert mit Reminders-Opt-Out-Toggle.
- AC-9: Toggle-Click ruft Server-Action `toggleRemindersOptOut` und persistiert in `user_settings`.
- AC-10: Toggle-Initial-State stimmt mit DB-Status ueberein (Page-Reload zeigt aktuelle Praeferenz).
- AC-11: Toast-Bestaetigung erscheint nach erfolgreichem Toggle.
- AC-12: RLS-Test: User A kann nicht User B's Opt-Out-Setting aendern (DENY via OWN-Policy).
- AC-13: `npm run build` + `npm run test` gruen.

## Dependencies

- Vorbedingung: SLC-046 done (user_settings-Schema live).
- Vorbedingung: SLC-048 done oder parallel (Reminder-Logik nutzt user_settings, aber UI funktioniert auch standalone).
- Vorbedingung: V4 Mitarbeiter-Liste existiert (SLC-034 oder Erweiterung).

## Worktree

Mandatory (SaaS).

## Migrations-Zuordnung

Keine — Schema steht aus MIG-029 (SLC-046).

## Pflicht-QA-Vorgaben

- Browser-Smoke: Cockpit-Card ist sichtbar fuer tenant_admin auf /dashboard.
- Browser-Smoke: Card-Klick navigiert korrekt zu gefilterter Mitarbeiter-Liste.
- Browser-Smoke: Settings-Toggle persistiert ueber Reload.
- RLS-Test: Cross-User-Settings-Block verifiziert (User A kann nicht User B's user_settings aendern).
- Tooltip ist sichtbar bei Hover am Inactive-Badge.
- `npm run test` + `npm run build` gruen.
- Cockpit-Records-Update nach Slice-Ende.

## Risks

- **R1 — Inactive-Count-Performance bei vielen Mitarbeitern:** NOT EXISTS-Subquery-Performance. Mitigation = bestehender Index `idx_block_checkpoint_created_by` deckt Lookup ab. Bei >1000 Mitarbeitern pro Tenant evtl. View materialized. Akzeptabel fuer V4.2-Volume.
- **R2 — Settings-Page-Konflikt mit existing Pattern:** Falls bestehende `/dashboard/settings` existiert, Erweiterung statt Neu-Anlage. Wenn nicht: neue Page mit minimalem Layout (Page-Title + Toggle + Save-Pattern).
- **R3 — Filter-URL-Param-Persistence-Bug:** Wenn Filter-Toggle nicht via Query-Param sondern lokalem State, Page-Reload verliert Filter. Mitigation = Filter ist Query-Param (`?filter=inactive`), persistiert ueber Reload.

### Micro-Tasks

#### MT-1: getInactiveEmployeesCount Helper
- Goal: Server-Side Helper fuer Aggregation der inaktiven Mitarbeiter-Anzahl.
- Files: `src/lib/dashboard/inactive-employees.ts` (neu), `src/lib/dashboard/__tests__/inactive-employees.test.ts` (neu)
- Expected behavior: Returns `{ inactiveCount, totalAccepted }` gefiltert auf tenantId.
- Verification: 3 Vitest-Tests (0/1/all-active).
- Dependencies: SLC-046 (user_settings irrelevant fuer diesen Helper, aber MIG-029 deployed)

#### MT-2: InactiveEmployeesCard-Komponente
- Goal: Cockpit-Card-Komponente mit Server-Component-Fetch + Click-Link + Tooltip.
- Files: `src/components/cockpit/InactiveEmployeesCard.tsx` (neu), `src/components/cockpit/__tests__/InactiveEmployeesCard.test.tsx` (neu)
- Expected behavior: Card rendert Wert + Sub-Text + Tooltip + Click-Link.
- Verification: Render-Tests + Tooltip-Hover-Test + Link-Klick-Test.
- Dependencies: MT-1

#### MT-3: Cockpit-Layout-Integration
- Goal: InactiveEmployeesCard in `/dashboard/page.tsx` als zusaetzliche MetricCard einbinden.
- Files: `src/app/dashboard/page.tsx` (geaendert)
- Expected behavior: Card erscheint im Cockpit-Grid neben bestehenden V4-Cards (BlockReviewStatusCard etc.).
- Verification: Browser-Smoke + Snapshot-Test.
- Dependencies: MT-2

#### MT-4: Mitarbeiter-Liste-Filter
- Goal: `/admin/employees?filter=inactive` Query-Param-Filter implementieren.
- Files: `src/app/admin/employees/page.tsx` (geaendert oder neu)
- Expected behavior: Filter-UI (Tabs/Toggle), Filter-Logik in Server-Component, leere Liste fuer Tenants ohne inaktive Mitarbeiter (kein Crash).
- Verification: Browser-Smoke + Vitest-Test mit Mock-Data.
- Dependencies: MT-1 (Helper kann wiederverwendet werden)

#### MT-5: Settings-Page mit Opt-Out-Toggle
- Goal: `/dashboard/settings`-Page mit Reminders-Opt-Out-Toggle + Server-Action.
- Files: `src/app/dashboard/settings/page.tsx` (neu), `src/app/dashboard/settings/actions.ts` (neu), `src/app/dashboard/settings/__tests__/actions.test.ts` (neu)
- Expected behavior: Toggle persistiert ueber Reload, RLS regelt Cross-User-Block, Toast-Bestaetigung.
- Verification: 2 Vitest-Tests + Browser-Smoke.
- Dependencies: SLC-046 (user_settings-Schema)

#### MT-6: RLS-Cross-User-Block-Verifikation
- Goal: Negativ-Test verifiziert dass User A nicht User B's user_settings aendern kann.
- Files: `src/lib/db/__tests__/user-settings-cross-user.test.ts` (neu)
- Expected behavior: User A's UPDATE-Attempt auf User B's row → 0 rows affected (RLS DENY).
- Verification: Test gegen Live-DB via SSH-Tunnel.
- Dependencies: SLC-046 (Schema), MT-5 (Server-Action existiert)
