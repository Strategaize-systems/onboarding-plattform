# Runbook

Operative Prozeduren fuer die Onboarding-Plattform. Dokumentiert wiederkehrende Aufgaben, die auf der Live-Infrastruktur ausgefuehrt werden muessen.

## Seed-User anlegen (erster Deploy)

Quelle: SLC-002b, DEC-011.

Die Onboarding-Plattform braucht nach dem ersten Deploy zwei seed-User:
- `strategaize_admin` — Cross-Tenant-Zugriff (Debrief-UI, Template-Verwaltung)
- Demo-`tenant_admin` — erlaubt realen Login-Smoke-Test gegen den Demo-Tenant

### Voraussetzung

Die SQL-Migration `027_seed_demo_tenant.sql` muss gelaufen sein. Sie legt den Demo-Tenant mit fixer UUID `00000000-0000-0000-0000-0000000000de` an.

### Schritt 1 — ENV-Variablen im App-Container setzen

In Coolify unter der `app`-Resource der Onboarding-Plattform folgende ENV-Vars setzen:

```
SEED_ADMIN_EMAIL=admin@<domain>
SEED_ADMIN_PASSWORD=<starkes Passwort>
SEED_DEMO_TENANT_ADMIN_EMAIL=demo-admin@<domain>
SEED_DEMO_TENANT_ADMIN_PASSWORD=<starkes Passwort>
```

Deploy nicht zwingend noetig, wenn der Container per `docker exec` mit `-e` gestartet wird. Fuer Reproduzierbarkeit aber besser in Coolify hinterlegen.

### Schritt 2 — Seed-Script im App-Container starten

```bash
# Container-Namen ermitteln (Coolify vergibt dynamische Namen)
docker ps --format "{{.Names}}" | grep ^app- | grep -v supabase

# Script ausfuehren — zwei aequivalente Wege:
docker exec <onboarding-app-container> node scripts/seed-admin.mjs
# oder
docker exec <onboarding-app-container> npm run seed:admin
```

Der direkte `node`-Aufruf ist robuster, wenn das standalone-package.json die Script-Liste beim Build getrimmt haben sollte.

Erwartete Ausgabe (Auszug):

```
seed-admin: starting
seed-admin: demo tenant ok (Demo Onboarding GmbH)
seed-admin: strategaize_admin created (id=...)
seed-admin: demo tenant_admin created (id=...)
seed-admin: profiles verification:
  - admin@...: role=strategaize_admin, tenant_id=NULL
  - demo-admin@...: role=tenant_admin, tenant_id=00000000-0000-0000-0000-0000000000de
seed-admin: done
```

Exit-Code 0 = Erfolg. Jeder andere Exit-Code = Problem.

### Schritt 3 — Login-Smoke-Test

1. Browser auf `https://<domain>/login`
2. Mit `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` einloggen → Redirect zum Admin-Bereich
3. Logout
4. Mit `SEED_DEMO_TENANT_ADMIN_EMAIL` + `SEED_DEMO_TENANT_ADMIN_PASSWORD` einloggen → Redirect zum Tenant-Cockpit

### Idempotenz

Ein zweiter Script-Lauf ist unproblematisch. Das Script findet existierende User per `listUsers` und ueberspringt die Anlage. Profile-Rollen und Tenant-IDs werden bei jedem Lauf auf den Soll-Stand gepatcht.

## Seed-Passwort rotieren

Wenn ein Seed-Passwort kompromittiert ist oder im Rahmen der Hygiene gewechselt wird:

### Option A — ueber die Login-UI

1. Mit altem Passwort einloggen
2. In der App "Passwort aendern" (Account-Seite) nutzen
3. Coolify-ENV `SEED_ADMIN_PASSWORD` auf Platzhalter-Wert setzen (das Script laeuft nicht erneut, wir wollen nur kein Klartext-Passwort mehr im ENV-Store)

### Option B — per Admin-API-Call

Einmaliger Node-REPL im App-Container:

```bash
docker exec -it <onboarding-app-container> node -e '
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
(async () => {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
  const user = list.users.find(u => u.email === "admin@<domain>");
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: "NEUES_PASSWORT"
  });
  console.log(error ?? "ok");
})();
'
```

Danach Coolify-ENV auf den neuen Wert aktualisieren (fuer Dokumentation, nicht fuer erneuten Seed-Lauf).

## Seed-User loeschen (Disaster-Recovery)

Nur wenn ein Seed-User endgueltig weg soll (z.B. vor Uebergabe an echten Kunden):

```bash
docker exec <supabase-db-container> psql -U postgres -d postgres -c \
  "DELETE FROM auth.users WHERE email = 'admin@<domain>';"
```

Cascade loescht die profiles-Row. Demo-Tenant bleibt bestehen (separater Loesch-Schritt). Erneuter `npm run seed:admin`-Lauf legt die User wieder an.

## Seed-Scope erweitern

Neue Seed-User gehoeren:
- ins Script `scripts/seed-admin.mjs` (neuer `ensureUser`-Call)
- als zusaetzliche ENV-Vars in `.env.deploy.example`
- hier ins Runbook

Neue Seed-Tenants gehoeren in eine neue SQL-Migration `02X_seed_<name>_tenant.sql` (analog 027) mit eigener fixer UUID.

## V9.1 Continuous-Cost-Cap + Pipeline-Trigger

Quelle: SLC-V9.1-B (FEAT-077), DEC-197 (Cost-Cap-Modell), DEC-207 (Pipeline-Entry), MIG-062.

Der Continuous-Forward-Bucket-Modus laeuft autonom: der Cron `POST /api/cron/email-bulk-pipeline-trigger` (stuendlich, `x-cron-secret`) walkt jeden `inbound_source='forward_bucket'`-Run cost-cap-gated durch die V9.0-Pipeline. Bei Cap-Hit oder Per-Email-Approval pausiert ein Run und braucht einen manuellen Founder-Eingriff.

### Coolify-Scheduled-Task (einmaliges Setup)

In Coolify unter der `app`-Resource → Scheduled-Tasks:

```
Schedule: 0 * * * *
Command/HTTP: POST https://onboarding.strategaizetransition.com/api/cron/email-bulk-pipeline-trigger
Header: x-cron-secret: $CRON_SECRET
```

Optionale ENV-Tuning-Variablen (Defaults in Klammern): `V91_BULK_EMAIL_DAILY_CAP_EUR` (5), `V91_BULK_EMAIL_MONTHLY_CAP_EUR` (100), `V91_BULK_EMAIL_TRIGGER_MIN_COUNT` (25), `V91_BULK_EMAIL_PER_EMAIL_APPROVAL_THRESHOLD_EUR` (0.50), `FOUNDER_ALERT_EMAIL` (Fallback `ERROR_ALERT_EMAIL` / `SMTP_USER`).

### Cap-Hit-Reset (Run-Status `paused`)

Bei Daily/Monthly-Cap-Hit setzt der Cron den Run auf `status='paused'` und schickt eine Founder-Email. Nach manueller Kosten-Pruefung im Admin-Audit (`/admin/audit/bulk-email`, gelbes Banner) den Run wieder freigeben:

```bash
docker exec <supabase-db-container> psql -U postgres -d postgres -c \
  "UPDATE email_bulk_run SET status='continuous', updated_at=now() WHERE status='paused' AND tenant_id='<TENANT_UUID>';"
```

Der naechste stuendliche Cron-Tick nimmt den Run wieder auf (sofern der Cap inzwischen unterschritten ist — sonst pausiert er erneut). Cap-Reset effektiv erst nach Tages-/Monatswechsel oder ENV-Cap-Erhoehung.

### Per-Email-Approval-Reset (Run-Status `awaiting_approval`)

Reisst die Per-Email-Schaetzung die Schwelle (Outlier-Run), pausiert der Pattern-Extract-Worker auf `status='awaiting_approval'` (kein Sonnet-Call) und schickt eine Founder-Email. Nach Freigabe den Pattern-Extract-Job mit `approval_token` im Payload neu anstossen:

```bash
docker exec <supabase-db-container> psql -U postgres -d postgres -c \
  "UPDATE email_bulk_run SET status='pattern_extracting', updated_at=now() WHERE id='<BULK_RUN_ID>';"
docker exec <supabase-db-container> psql -U postgres -d postgres -c \
  "INSERT INTO ai_jobs (tenant_id, job_type, status, payload) VALUES ('<TENANT_UUID>','email_bulk_pattern_extract','pending', '{\"bulk_run_id\":\"<BULK_RUN_ID>\",\"approval_token\":\"founder-approved\"}'::jsonb);"
```

Der `approval_token` im Payload ueberspringt den Per-Email-Gate, der Worker laeuft mit dem Sonnet-Call durch.

### Manueller Trigger / Smoke-Test

```bash
curl -X POST https://onboarding.strategaizetransition.com/api/cron/email-bulk-pipeline-trigger \
  -H "x-cron-secret: <CRON_SECRET>"
# Antwort: { success, runs_evaluated, runs_triggered, runs_advanced, runs_skipped_cap, runs_skipped_threshold }
```

## V9.1 Storage-Retention-Cron (DSGVO-Lifecycle, SLC-V9.1-C / DEC-208)

Run-Level-Retention (DEC-208): `email_bulk_run` traegt `retention_until` + `soft_delete_at` (MIG-058). `email_message` haengt per FK `ON DELETE CASCADE` am Run. Default-Policy 60d Soft-Delete + 90d Hard-Delete (ENV `V91_RETENTION_SOFT_DELETE_DAYS` / `V91_RETENTION_HARD_DELETE_DAYS`, gegen `email_bulk_run.created_at`). Runs, deren Pattern ins Handbuch importiert wurde (`knowledge_unit.metadata->>'bulk_run_id'`), bleiben dauerhaft erhalten. Audit je Lauf in `error_log` (`message='email_retention_sweep_run'`).

### Coolify-Scheduled-Task (einmaliges Setup)

Coolify-UI -> Resource -> Scheduled-Tasks -> neuer Task:

```
Command:   curl -fsS -X POST https://onboarding.strategaizetransition.com/api/cron/bulk-email-retention-sweep -H "x-cron-secret: $CRON_SECRET"
Frequency: 0 2 * * *      # taeglich 02:00 UTC
```

### Manueller Trigger / Smoke-Test

```bash
curl -X POST https://onboarding.strategaizetransition.com/api/cron/bulk-email-retention-sweep \
  -H "x-cron-secret: <CRON_SECRET>"
# Antwort: { success, runs_evaluated, soft_deleted_runs, hard_deleted_runs,
#            skipped_imported, deleted_storage_objects, storage_errors, duration_ms }
# V9.1-Initial-State (kein Run > 60d): erwartet alle Counts = 0.
```

### Founder-Override: DSGVO-Loesch-Anspruch sofort (vor Ablauf der Retention)

Loescht einen Run vorzeitig (DSGVO Art. 17). Container-Name per `docker ps --format '{{.Names}}' | grep '^supabase-db'`:

```sql
-- 1. Run hart loeschen (Cascade entfernt email_message); Storage-Objekte separat
--    per Bucket-Cleanup, falls noetig.
DELETE FROM public.email_bulk_run WHERE id = '<bulk_run_id>';
-- 2. Audit-Eintrag.
INSERT INTO public.error_log (level, source, message, metadata)
VALUES ('info', 'manual:retention-override', 'email_retention_manual_override',
        jsonb_build_object('bulk_run_id', '<bulk_run_id>', 'reason', 'dsgvo_art17'));
```

### Restore aus Soft-Delete (vor Hard-Delete-Schwelle)

Solange ein Run nur soft-deleted ist (`soft_delete_at` gesetzt, `created_at` noch nicht 90d alt), kann er reaktiviert werden (Auto-Restore-UI ist V9.2+):

```sql
UPDATE public.email_bulk_run SET soft_delete_at = NULL WHERE id = '<bulk_run_id>';
```

### Per-Tenant-Retention-Override

Per-Tenant-Override via Tenant-Settings-JSONB ist V9.1.x (out of scope). Founder-Manuell bis dahin: einzelnen Run laenger behalten, indem `created_at` der Sweep-Logik entzogen wird — praktisch via Soft-Delete-Reset oben oder durch frueheres Handbook-Import (importierte Runs werden nie hart-geloescht).
