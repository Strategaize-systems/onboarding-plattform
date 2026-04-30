# SLC-046 — Wizard Backend-Foundation + MIG-029 Schema-Aufstellung

## Goal
Backend-Foundation fuer V4.2 Tenant Self-Service Onboarding. MIG-029 (Migration 080) als atomare 3-Block-Migration auf Hetzner deployen — alle V4.2-Schema-Aenderungen upfront, identisch zum V4.1 SLC-041 Pattern. SLC-046 selbst nutzt davon nur die `tenants.onboarding_wizard_*`-Spalten und schafft die Server-Actions und Layout-Helper fuer das Wizard-Auto-Trigger-Verhalten. `reminder_log` + `user_settings` sind in der Migration bereits live, werden aber erst in SLC-048 mit Code befuellt — kein Risiko, weil RLS-Policies den User-Zugriff von Anfang an korrekt regeln.

## Feature
FEAT-031 (Tenant-Onboarding-Wizard) — Backend-Anteil + V4.2-Schema-Foundation

## In Scope

### A — Migration MIG-029 / sql/migrations/080_v42_self_service.sql

Atomare Migration mit drei logischen Bloecken (Variante A aus /architecture V4.2):

**Block 1: tenants ALTER + Backfill**
```sql
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS onboarding_wizard_state text NOT NULL DEFAULT 'pending'
    CHECK (onboarding_wizard_state IN ('pending', 'started', 'skipped', 'completed')),
  ADD COLUMN IF NOT EXISTS onboarding_wizard_step integer NOT NULL DEFAULT 1
    CHECK (onboarding_wizard_step BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS onboarding_wizard_completed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tenants_wizard_state
  ON public.tenants (onboarding_wizard_state)
  WHERE onboarding_wizard_state IN ('pending', 'started');

-- Backfill: alle pre-V4.2-Tenants haben das Tool schon erlebt
UPDATE public.tenants
   SET onboarding_wizard_state = 'completed',
       onboarding_wizard_completed_at = COALESCE(onboarding_wizard_completed_at, now())
 WHERE onboarding_wizard_state = 'pending';
```

**Block 2: reminder_log Tabelle + RLS + Index**
```sql
CREATE TABLE IF NOT EXISTS public.reminder_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  employee_user_id  uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  reminder_stage    text        NOT NULL CHECK (reminder_stage IN ('stage1', 'stage2')),
  sent_date         date        NOT NULL DEFAULT current_date,
  email_to          text        NOT NULL,
  status            text        NOT NULL DEFAULT 'sent'
                                CHECK (status IN ('sent', 'failed', 'skipped_opt_out')),
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_user_id, reminder_stage, sent_date)
);

CREATE INDEX IF NOT EXISTS idx_reminder_log_tenant_date
  ON public.reminder_log (tenant_id, sent_date DESC);

ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY reminder_log_admin_full ON public.reminder_log FOR ALL
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

CREATE POLICY reminder_log_tenant_admin_select ON public.reminder_log FOR SELECT
  USING (auth.user_role() = 'tenant_admin' AND tenant_id = auth.user_tenant_id());

GRANT SELECT TO authenticated; -- nur SELECT, INSERT/UPDATE via service_role
GRANT ALL ON public.reminder_log TO service_role;
```

**Block 3: user_settings Tabelle + Trigger + Backfill**
```sql
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id            uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  reminders_opt_out  boolean     NOT NULL DEFAULT false,
  unsubscribe_token  text        NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unsubscribe_token)
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_settings_admin_full ON public.user_settings FOR ALL
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

CREATE POLICY user_settings_own_rw ON public.user_settings FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT ALL ON public.user_settings TO authenticated, service_role;

-- Trigger: auto-create user_settings beim auth.users-INSERT
CREATE OR REPLACE FUNCTION public.tg_create_user_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  BEGIN
    INSERT INTO public.user_settings (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tg_create_user_settings soft-fail: %', SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_create_user_settings_on_auth_users_insert ON auth.users;
CREATE TRIGGER tg_create_user_settings_on_auth_users_insert
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.tg_create_user_settings();

-- Backfill: alle bestehenden auth.users
INSERT INTO public.user_settings (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
```

Trigger ist Soft-Fail (analog tg_block_review_pending_on_employee_submit aus MIG-028) — Bug im Trigger blockiert auth.users-INSERTs nicht.

### B — Wizard-Server-Actions

Pfad: `src/app/dashboard/wizard-actions.ts` (neu)

```typescript
"use server";

export async function setWizardStarted(): Promise<{ ok: boolean; alreadyStarted: boolean }>;
export async function setWizardStep(step: 1 | 2 | 3 | 4): Promise<{ ok: boolean }>;
export async function setWizardSkipped(): Promise<{ ok: boolean }>;
export async function setWizardCompleted(): Promise<{ ok: boolean }>;
```

Verhalten:
- **`setWizardStarted`**: Multi-Admin-Lock via atomarem UPDATE
  ```sql
  UPDATE tenants SET onboarding_wizard_state='started', onboarding_wizard_step=1
  WHERE id = $tenant_id AND onboarding_wizard_state = 'pending'
  ```
  Wenn `rowCount=0`: `alreadyStarted=true` (anderer Admin war schneller). Bei `rowCount=1`: `alreadyStarted=false`.
- **`setWizardStep(step)`**: `UPDATE tenants SET onboarding_wizard_step=$step WHERE id=$tenant_id AND onboarding_wizard_state='started'`. Validiert step in 1..4.
- **`setWizardSkipped`**: `UPDATE tenants SET onboarding_wizard_state='skipped' WHERE id=$tenant_id AND onboarding_wizard_state IN ('pending','started')`.
- **`setWizardCompleted`**: `UPDATE tenants SET onboarding_wizard_state='completed', onboarding_wizard_completed_at=now() WHERE id=$tenant_id AND onboarding_wizard_state='started'`.
- Alle Actions: `requireRole('tenant_admin')` (NICHT strategaize_admin — DEC-051 Cross-Role-Check) und `tenantId` aus `auth.user_tenant_id()`.
- `revalidatePath('/dashboard')` nach jedem erfolgreichen Update.

### C — Wizard-Layout-Helper + Auto-Trigger-Logik

Pfad: `src/lib/wizard/get-wizard-state.ts` (neu)

```typescript
type WizardState = {
  shouldShow: boolean;
  state: 'pending' | 'started' | 'skipped' | 'completed';
  step: 1 | 2 | 3 | 4;
};

export async function getWizardStateForCurrentUser(): Promise<WizardState>;
```

Logik:
- Wenn `auth.user_role() !== 'tenant_admin'` → `shouldShow=false` (DEC-051: nur tenant_admin sieht Wizard)
- Sonst `SELECT onboarding_wizard_state, onboarding_wizard_step FROM tenants WHERE id = auth.user_tenant_id()`
- Wenn `state IN ('skipped', 'completed')` → `shouldShow=false`
- Wenn `state = 'started'` → `shouldShow=true` (User kommt aus dem Wizard zurueck)
- Wenn `state = 'pending'` UND `count(capture_session WHERE tenant_id=...) = 0` → `shouldShow=true`
- Sonst → `shouldShow=false`

Aufruf im `/dashboard/layout.tsx` Server-Component (siehe SLC-047).

### D — Tests

- `src/app/dashboard/__tests__/wizard-actions.test.ts` (neu): 4 Test-Cases je Server-Action + Multi-Admin-Race (atomar Update mit `state='pending'`-WHERE).
- `src/lib/wizard/__tests__/get-wizard-state.test.ts` (neu): 5 Test-Cases (strategaize_admin → false, tenant_admin pending+0 sessions → true, tenant_admin pending+1 session → false, tenant_admin started → true, tenant_admin skipped/completed → false).
- `src/lib/db/__tests__/wizard-rls.test.ts` (neu): 4-Rollen-RLS-Matrix-Erweiterung: bestehende `tenants`-Policies decken neue Spalten ab. Verifikation: `tenant_admin` darf eigenes `onboarding_wizard_state` lesen+aendern, `tenant_member`/`employee` SELECT/UPDATE auf neuen Spalten DENY (sind ohnehin nicht in tenants-Policies).

## Out of Scope

- Wizard-Modal-UI (SLC-047)
- 4 Step-Komponenten (SLC-047)
- reminder_log Cron-Endpoint (SLC-048) — nur Schema in MIG-029
- user_settings Opt-Out-UI (SLC-049) — nur Schema in MIG-029
- Help-Content (SLC-050)

## Acceptance Criteria

- AC-1: Migration `sql/migrations/080_v42_self_service.sql` existiert mit allen 3 Bloecken (tenants ALTER + reminder_log + user_settings).
- AC-2: Migration auf Live-DB (Hetzner Onboarding-Server 159.69.207.29) deployed via base64-pipe + `psql -U postgres`. Verifizierbar: `\d tenants` zeigt 3 neue Spalten + Index, `\d reminder_log` + `\d user_settings` zeigen Schema, RLS aktiv, Trigger `tg_create_user_settings_on_auth_users_insert` existiert.
- AC-3: Backfill `tenants`: alle pre-V4.2-Tenants haben `onboarding_wizard_state='completed'` (`SELECT count(*) FROM tenants WHERE onboarding_wizard_state='completed'` >= 1 nach Backfill).
- AC-4: Backfill `user_settings`: alle bestehenden auth.users haben einen user_settings-Eintrag mit `reminders_opt_out=false` und einem 64-char unsubscribe_token (`SELECT count(*) FROM user_settings` = `SELECT count(*) FROM auth.users`).
- AC-5: Trigger `tg_create_user_settings_on_auth_users_insert` feuert bei neuem auth.users-INSERT (Test-Einfuegen + SELECT user_settings).
- AC-6: Trigger ist Soft-Fail (RAISE WARNING bei Exception).
- AC-7: `setWizardStarted` ist Multi-Admin-Lock-atomar — Race-Test: zwei parallele Aufrufe → einer bekommt `alreadyStarted=false`, der andere `alreadyStarted=true`.
- AC-8: `setWizardStarted/Step/Skipped/Completed` lehnen `strategaize_admin`-Aufrufer ab (DEC-051 Cross-Role-Check, AuthError oder Forbidden).
- AC-9: `getWizardStateForCurrentUser` returns korrekt `shouldShow=false` fuer strategaize_admin (auch wenn tenant.state='pending').
- AC-10: `getWizardStateForCurrentUser` returns korrekt `shouldShow=true` fuer tenant_admin mit `state='pending'` UND `0 capture_sessions`.
- AC-11: `getWizardStateForCurrentUser` returns korrekt `shouldShow=false` fuer tenant_admin mit `state='pending'` aber `>=1 capture_session` (Soft-Bedingung — User hat Tool schon genutzt).
- AC-12: 4-Rollen-RLS-Matrix-Erweiterung um `reminder_log` (8 Test-Faelle: 4 Rollen × {SELECT, INSERT, je Allow/Deny}) und `user_settings` (8 Test-Faelle) gegen Live-DB. Alle 16 PASS.
- AC-13: `npm run build` + `npm run test` gruen.

## Dependencies

- Vorbedingung: V4.1 released (REL-009 deployed 2026-04-29). Foundation steht.
- Kein vorgelagerter V4.2-Slice — SLC-046 ist V4.2-Backend-Foundation.
- Nachgelagerte V4.2-Slices: SLC-047 (Wizard-Modal-UI nutzt Server-Actions + getWizardStateForCurrentUser), SLC-048 (reminder_log + user_settings sind in MIG-029 schon live, SLC-048 ergaenzt nur Code), SLC-049 (Cockpit-Card + Opt-Out-Toggle), SLC-050 (Help — unabhaengig).

## Worktree

Mandatory (SaaS).

## Migrations-Zuordnung

- MIG-029 / `sql/migrations/080_v42_self_service.sql` — atomare 3-Block-Migration (Variante A aus /architecture V4.2).

## Pflicht-QA-Vorgaben

- **Pflicht-Gate: 4-Rollen-RLS-Matrix erweitert** um `reminder_log` + `user_settings` (mind. 8 Test-Faelle pro Tabelle = 16 total, gegen Live-DB via SSH-Tunnel).
- **Pflicht-Gate: Multi-Admin-Lock-Race-Test** fuer `setWizardStarted` (zwei parallele Calls → exakt einer setzt state='started').
- **Pflicht-Gate: Trigger-Soft-Fail-Test** fuer `tg_create_user_settings` (Exception im Trigger blockiert auth.users-INSERT nicht).
- **Pflicht-Gate: Migration-Live-Deploy** auf Hetzner via base64-pipe + `psql -U postgres` (rules/sql-migration-hetzner.md).
- `npm run test` + `npm run build` gruen.
- Cockpit-Records-Update nach Slice-Ende: slices/INDEX.md SLC-046 status `done`, planning/backlog.json BL-048 bleibt `in_progress`, MIGRATIONS.md MIG-029 von "geplant" auf "live" updaten.

## Risks

- **R1 — Multi-Admin-Lock-Race-Bedingung nicht atomar:** Mitigation = WHERE-Clause `state='pending'` + UPDATE liefert rowCount. Test mit zwei parallelen Aufrufen verifiziert.
- **R2 — Trigger blockiert auth.users-INSERT bei Bug:** Mitigation = Soft-Fail-Wrap (analog MIG-028). Auth-Smoke-Test nach Migration-Deploy verifiziert.
- **R3 — Backfill verfaelscht V4.1-Live-Daten:** Mitigation = Backfill ist `UPDATE WHERE state='pending'` und `INSERT ... ON CONFLICT DO NOTHING`. Idempotent. Test: Re-Run aendert nichts.
- **R4 — Cross-Role-Check umgangen:** Mitigation = Server-Actions pruefen `auth.user_role() === 'tenant_admin'` als Pflicht. Negativ-Test mit strategaize_admin schlaegt fehl.

### Micro-Tasks

#### MT-1: MIG-029 SQL schreiben + Live-Deploy
- Goal: `sql/migrations/080_v42_self_service.sql` mit allen 3 Bloecken schreiben und auf Hetzner-DB ausfuehren.
- Files: `sql/migrations/080_v42_self_service.sql` (neu), `docs/MIGRATIONS.md` (MIG-029 von "geplant" auf "live" umstellen nach Deploy)
- Expected behavior: Migration laeuft idempotent, RLS-Policies aktiv auf reminder_log + user_settings, Trigger feuert bei neuem auth.users-INSERT, Backfill setzt completed-State fuer pre-V4.2-Tenants und user_settings-Eintraege fuer alle bestehenden auth.users.
- Verification: `\d tenants` zeigt 3 neue Spalten; `\d reminder_log` + `\d user_settings` zeigen Schema + Policies; `SELECT count(*) FROM tenants WHERE onboarding_wizard_state='completed'` >= 1; `SELECT count(*) FROM user_settings = SELECT count(*) FROM auth.users`; Test-INSERT in auth.users → user_settings-Eintrag entsteht.
- Dependencies: keine
- Live-Deploy-Pattern: base64-pipe + `psql -U postgres` auf 159.69.207.29 (sql-migration-hetzner.md, MIG-028 als Vorlage).

#### MT-2: Wizard-Server-Actions
- Goal: 4 Server-Actions in `src/app/dashboard/wizard-actions.ts` mit Cross-Role-Check + Multi-Admin-Lock + revalidatePath.
- Files: `src/app/dashboard/wizard-actions.ts` (neu), `src/app/dashboard/__tests__/wizard-actions.test.ts` (neu)
- Expected behavior: setWizardStarted ist atomar (rowCount-basiert), setWizardStep validiert step in 1..4, setWizardSkipped/Completed setzen final-States. Alle Actions DENY fuer strategaize_admin.
- Verification: 4 Vitest-Test-Cases pro Action + 1 Multi-Admin-Race-Test + 1 Cross-Role-Negativ-Test. `npm run test src/app/dashboard` gruen.
- Dependencies: MT-1 (Schema muss live sein)
- TDD-Note: TDD-Pflicht (SaaS) — Tests vor Implementation.

#### MT-3: getWizardStateForCurrentUser Helper
- Goal: Layout-Helper in `src/lib/wizard/get-wizard-state.ts` der die 4-Bedingungen-Logik kapselt (Rolle + State + Soft-Bedingung capture_session_count=0).
- Files: `src/lib/wizard/get-wizard-state.ts` (neu), `src/lib/wizard/__tests__/get-wizard-state.test.ts` (neu)
- Expected behavior: Returns `{ shouldShow, state, step }`. shouldShow=true nur fuer tenant_admin mit state='pending'+0 sessions ODER state='started'.
- Verification: 5 Vitest-Test-Cases (strategaize_admin DENY, tenant_admin states, soft-condition).
- Dependencies: MT-1 (Schema), MT-2 (Server-Actions koennen Tests-Setup helfen)

#### MT-4: RLS-Test-Matrix-Erweiterung
- Goal: 4-Rollen-RLS-Matrix um `reminder_log` + `user_settings` erweitern (16+ Test-Faelle gegen Live-DB).
- Files: `src/lib/db/__tests__/v42-foundation-rls.test.ts` (neu) — kombinierte Test-Suite fuer beide neuen Tabellen.
- Expected behavior: Pro Rolle (strategaize_admin, tenant_admin, tenant_member, employee) je 1 SELECT + 1 INSERT-Test pro Tabelle. Erwartete Ergebnisse: strategaize_admin ALL, tenant_admin SELECT-OWN auf reminder_log + ALL-OWN auf user_settings, tenant_member/employee DENY auf reminder_log + ALL-OWN auf user_settings (eigene User-Praeferenz).
- Verification: `npm run test src/lib/db` gruen, alle 16+ Test-Faelle PASS gegen Live-DB.
- Dependencies: MT-1 (Schema live)
- Pflicht-Gate: dieser MT ist der RLS-Matrix-Beweis fuer SC-V4.2-11.
