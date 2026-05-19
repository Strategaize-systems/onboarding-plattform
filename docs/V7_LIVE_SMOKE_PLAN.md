# V7 Live-Smoke-Plan (SLC-131..135 Cross-System-Self-Signup-Funnel)

**Status:** SLC-135 MT-2 (Dokumentation). Tatsaechliche Ausfuehrung erfolgt im `/qa V7` Gesamt-Lauf oder direkt vor `/deploy V7`.

**Scope:** Cross-System-Live-Smoke fuer den V7 Self-Signup-Funnel:
- Intelligence-Studio-Landing-Form ruft Onboarding-Plattform-Public-Signup-Endpoint
- Email-Verify-Klick → Auto-Provisioning (Tenant + Auth-User + Profile + Partner-Client-Mapping)
- Set-Password → Dashboard → optional Lead-Push an Business-System

**Vorgaengig:** SLC-131 + SLC-132 + SLC-133 + SLC-134 LIVE. SLC-135 selbst (Cron + ENV + Postfach + dieser Plan) muss vor `/qa V7` durch sein.

---

## Pre-Conditions

| Bereich | Pflicht | Verifikation |
|---|---|---|
| Migration 098 (`pending_signup` Tabelle) live auf Onboarding-Coolify-DB | YES | `\d pending_signup` zeigt 13 Spalten, 4 Indices |
| Migration 098a (Service-Role GRANTs) live | YES | `\dp public.pending_signup` zeigt `service_role=arwd/postgres` |
| ENV `PUBLIC_SIGNUP_SERVICE_KEY` in BEIDEN Coolify-Resources (Onboarding + IS) identisch gesetzt | YES | siehe MT-4 |
| ENV `PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS` in Onboarding-Resource gesetzt | YES | siehe MT-4 |
| Coolify-Scheduled-Task `pending-signup-cleanup-hourly` aktiv | YES | siehe MT-3 |
| IONOS-Postfach `onboarding@strategaize.de` existiert + Smoke-Send-Test gruen | YES | siehe MT-5 |
| V7 Code-Side komplett: `/api/public/signup`, `/auth/verify-signup`, `/api/cron/pending-signup-cleanup` deployed | YES | `curl -s -o /dev/null -w '%{http_code}' https://onboarding.strategaizetransition.com/api/public/partner/qa-steuerberater-demo` → 200 |
| Test-Partner `qa-steuerberater-demo` (Slug, partner_organization-Row) existiert | YES | aus V6.3-Setup |

---

## Migration-Apply Standard-Procedure (PFLICHT vor jedem Live-Smoke + `/deploy V7`)

Quelle: RPT-305 F-5 + RPT-306 QA-F2 (OP V7 SLC-134), Memory `reference_postgrest_schema_reload.md`, `.claude/rules/sql-migration-hetzner.md`.

**Hintergrund:** PostgREST auf Coolify-Self-hosted-Supabase cached Schema-Metadata. Nach jeder Migration (CREATE/ALTER TABLE, GRANT, neue Policy, neue Function im `public`-Schema) bleibt der `/rest/v1/<tabelle>`-Endpoint fuer ~5 min auf dem alten Cache und gibt HTTP 404 statt 200/201 zurueck — bis Auto-Reload greift. Wer den expliziten `NOTIFY pgrst, 'reload schema'` vergisst, sieht in den Live-Smoke-Schritten 4–7 `relation "<tabelle>" does not exist` ODER leere PostgrestError-Objekte. Beobachtet bei SLC-134 Pen-Test nach Hotfix-Migration 098a (~5 min 404-Fenster bis Auto-Reload).

**Standard-Sequenz (per `sql-migration-hetzner.md`):**

```bash
# 0. Vorbereitung — Container-Namen ermitteln
SERVER=root@159.69.207.29  # Onboarding-Plattform Hetzner
DB_CONTAINER=$(ssh $SERVER "docker ps --format '{{.Names}}' | grep ^supabase-db")

# 1. Migration als Base64 übertragen (Heredoc + scp vermeiden — Paste-Chaos)
base64 -w0 sql/migrations/NNN_<name>.sql > /tmp/mig.b64
scp /tmp/mig.b64 $SERVER:/tmp/mig.b64
ssh $SERVER "base64 -d /tmp/mig.b64 > /tmp/mig.sql && wc -l /tmp/mig.sql"

# 2. Migration applizieren (postgres-Superuser, NICHT supabase_admin)
ssh $SERVER "docker exec -i $DB_CONTAINER psql -U postgres -d postgres < /tmp/mig.sql"

# 3. PostgREST Schema-Cache invalidieren — PFLICHT
ssh $SERVER "docker exec $DB_CONTAINER psql -U postgres -d postgres -c \"NOTIFY pgrst, 'reload schema';\""

# 4. Verifikation: betroffene Tabelle/Function ueber PostgREST in <5s erreichbar
ssh $SERVER "curl -s -o /dev/null -w 'HTTP=%{http_code}\n' \
  -H 'apikey: <SUPABASE_SERVICE_ROLE_KEY>' \
  'http://supabase-kong:8000/rest/v1/<tabelle>?limit=1'"
# Erwartet: HTTP=200. Bei HTTP=404: NOTIFY pgrst ein zweites Mal senden + 30s warten + erneut testen.
```

**Cross-Links:**
- `.claude/rules/sql-migration-hetzner.md` — Base64-Pattern, postgres-vs-supabase_admin
- Memory `reference_postgrest_schema_reload.md` — Schema-Cache Hintergrund + Auto-Reload-Timing
- Memory `feedback_migration_rls_needs_grants.md` — RLS-Policy-Migrationen brauchen explizite GRANTs an `service_role` + `authenticated`
- Memory `reference_coolify_supabase_db_alias.md` — `supabase-db` ist stabiler DNS-Alias (loest Container-Hostname-Drift)

**Wer das vergisst:** Schritte 4–7 schlagen mit `relation "<tabelle>" does not exist` oder leerem PostgrestError fehl. Fix: nach jedem `psql <` Schritt sofort den NOTIFY pgrst senden und HTTP-200 verifizieren.

---

## 13-Schritt-Live-Smoke (Cross-System OP + IS)

### Schritt 0 — Migration-Apply Standard-Procedure

Falls noch Migrationen im SLC-131..135-Scope nicht apply'd sind (098, 098a, evtl. spaetere Hotfixes), die obenstehende Standard-Procedure pro Migration durchlaufen. NOTIFY pgrst + HTTP-200-Check auf `pending_signup`, `partner_client_mapping`, `partner_organization` PFLICHT vor Schritt 1.

### Schritt 1 — Service-Key-Cross-Check beide Resources

```bash
# Onboarding-Coolify-Resource:
ssh root@159.69.207.29 "docker exec app-bwkg80w04wgccos48gcws8cs-<suffix> printenv PUBLIC_SIGNUP_SERVICE_KEY | wc -c"
# Erwartet: 65 (64 hex chars + newline).

# Intelligence-Studio-Coolify-Resource:
ssh root@162.55.216.180 "docker exec <is-app-container> printenv PUBLIC_SIGNUP_SERVICE_KEY | wc -c"
# Erwartet: 65.

# Cross-Check: beide Werte muessen IDENTISCH sein.
ssh root@159.69.207.29 "docker exec app-bwkg80w04wgccos48gcws8cs-<suffix> printenv PUBLIC_SIGNUP_SERVICE_KEY"
ssh root@162.55.216.180 "docker exec <is-app-container> printenv PUBLIC_SIGNUP_SERVICE_KEY"
# Erwartet: gleicher 64-hex-String.
```

### Schritt 2 — Test-Partner-Slug verifizieren

```bash
ssh root@159.69.207.29 "docker exec supabase-db-bwkg80w04wgccos48gcws8cs-<suffix> \
  psql -U postgres -d postgres -c \
  \"SELECT slug, legal_name, contact_email FROM partner_organization WHERE slug = 'qa-steuerberater-demo'\""
# Erwartet: 1 Row.
```

### Schritt 3 — Intelligence-Studio Landing-Form-Submit

Browser oder curl gegen `https://intelligence.strategaizetransition.com/[partner]/qa-steuerberater-demo`:

```bash
curl -s -X POST https://intelligence.strategaizetransition.com/api/landing/signup \
  -H 'Content-Type: application/json' \
  -d '{
    "partner_slug": "qa-steuerberater-demo",
    "email": "qa-selfsignup-test@strategaizetransition.com",
    "first_name": "V7",
    "last_name": "Smoke",
    "company_name": "Smoke Test GmbH",
    "dsgvo_consent_accepted": true,
    "dsgvo_consent_text_version": "v1-2026-05"
  }'
# Erwartet: 202 {"ok":true} oder gleichwertiger Success-Response (Schema gemaess IS-Implementation).
```

### Schritt 4 — Onboarding-Plattform Pending-Row im DB pruefen

```bash
ssh root@159.69.207.29 "docker exec supabase-db-bwkg80w04wgccos48gcws8cs-<suffix> \
  psql -U postgres -d postgres -c \
  \"SELECT id, email_lower, first_name, last_name, status, expires_at
    FROM pending_signup
    WHERE email_lower = 'qa-selfsignup-test@strategaizetransition.com'
    ORDER BY created_at DESC LIMIT 1\""
# Erwartet: 1 Row, status='pending', expires_at = jetzt + 24h.
```

### Schritt 5 — Mailbox-Check IONOS

Im IONOS-Webmail `qa-selfsignup-test@strategaizetransition.com` oeffnen (falls echtes Postfach) ODER Alias-Empfaenger pruefen (falls Alias-Routing aktiv). Subject sollte mit `Strategaize` oder `Onboarding` beginnen.

Verify-Link aus Mail kopieren — Form: `https://onboarding.strategaizetransition.com/auth/verify-signup?token=<64-hex>`.

### Schritt 6 — Verify-Link aufrufen (Browser)

Browser auf den extrahierten Link. Erwartet: redirect zu `/auth/set-password?session=<one-time>`.

Falls Cookie-blocking oder Browser-Cache stoert: Inkognito-Tab nutzen.

### Schritt 7 — Auto-Provisioning verifizieren

```bash
ssh root@159.69.207.29 "docker exec supabase-db-bwkg80w04wgccos48gcws8cs-<suffix> \
  psql -U postgres -d postgres -c \
  \"SELECT
      au.id AS auth_user_id,
      au.email,
      p.first_name,
      p.last_name,
      p.tenant_id AS client_tenant_id,
      t.tenant_kind,
      t.parent_partner_tenant_id,
      pcm.invitation_source,
      pcm.dsgvo_consent_text_version
    FROM auth.users au
    JOIN profiles p ON p.id = au.id
    JOIN tenants t ON t.id = p.tenant_id
    JOIN partner_client_mapping pcm ON pcm.client_tenant_id = p.tenant_id
    WHERE au.email = 'qa-selfsignup-test@strategaizetransition.com'\""
# Erwartet:
#   - tenant_kind = 'partner_client'
#   - parent_partner_tenant_id = <qa-steuerberater-demo Tenant-ID>
#   - invitation_source = 'self_signup'
#   - dsgvo_consent_text_version = 'v1-2026-05'
#   - first_name = 'V7', last_name = 'Smoke'
```

### Schritt 8 — Pending-Row Status nach Verify

```bash
ssh root@159.69.207.29 "docker exec supabase-db-bwkg80w04wgccos48gcws8cs-<suffix> \
  psql -U postgres -d postgres -c \
  \"SELECT status, verified_at FROM pending_signup
    WHERE email_lower = 'qa-selfsignup-test@strategaizetransition.com'
    ORDER BY created_at DESC LIMIT 1\""
# Erwartet: status='verified', verified_at IS NOT NULL.
```

### Schritt 9 — Set-Password ausfuehren

Im Browser auf `/auth/set-password`-Seite: Passwort min. 12 Zeichen eingeben + bestaetigen. Submit → Redirect auf `/dashboard`.

### Schritt 10 — Dashboard-Login verifizieren

Browser auf `/dashboard`. Erwartet: Tenant-Admin-View, kein 401, kein 500.

### Schritt 11 — Diagnose-Start (FEAT-045 V6.3)

`/dashboard/diagnose/start` aufrufen, Diagnose starten. Erwartet: Erste Frage rendert, Audio/Text-Input funktional.

### Schritt 12 — Lead-Push-Smoke (Optional, je nach User-Opt-In)

Wenn User im Onboarding-Flow Lead-Push aktiviert hatte: Business-System-Coolify-Resource pruefen:

```bash
ssh root@91.98.20.191 "docker exec supabase-db-dcog0kcc0880soccg0ws08cc-<suffix> \
  psql -U postgres -d postgres -c \
  \"SELECT id, email, first_name, utm_source, created_at FROM lead
    WHERE email = 'qa-selfsignup-test@strategaizetransition.com'
    ORDER BY created_at DESC LIMIT 1\""
# Erwartet: 1 Row, utm_source = 'partner_qa-steuerberater-demo'.
```

### Schritt 13 — Post-Smoke-Cleanup

```sql
-- Reihenfolge: auth.users CASCADE → profiles
-- Tenant CASCADE → partner_client_mapping + pending_signup

DELETE FROM auth.users
WHERE email = 'qa-selfsignup-test@strategaizetransition.com';

DELETE FROM tenants
WHERE id IN (
  SELECT id FROM tenants
  WHERE name LIKE 'Smoke Test%'
     OR parent_partner_tenant_id IN (
       SELECT tenant_id FROM partner_organization
       WHERE slug = 'qa-steuerberater-demo'
     )
);
-- Sicherheits-Cleanup: vergessene Pending-Rows
DELETE FROM pending_signup
WHERE email_lower = 'qa-selfsignup-test@strategaizetransition.com';
```

**Wenn Lead-Push-Step durchlief:** Business-System ebenfalls aufraeumen:

```sql
DELETE FROM lead
WHERE email = 'qa-selfsignup-test@strategaizetransition.com';
```

---

## Coolify-Scheduled-Task `pending-signup-cleanup-hourly` (SLC-135 MT-3)

**Status: PENDING — User-Pflicht-Aktion. Setup-Bestaetigung in dieser Sektion eintragen.**

### Setup-Tabelle fuer Coolify-UI (Onboarding-Coolify-Resource → Scheduled Tasks → Add Task)

| Feld | Wert |
|---|---|
| Name | `pending-signup-cleanup-hourly` |
| Container | `app` |
| Cron-Schedule | `0 * * * *` (jede volle Stunde) |
| Command | `node -e "fetch('http://localhost:3000/api/cron/pending-signup-cleanup', { headers: { 'x-cron-secret': process.env.CRON_SECRET } }).then(r => r.text()).then(console.log)"` |
| Timezone | UTC (Coolify-Default, hourly-Cron daher Sommerzeit-irrelevant) |

**Hinweis:** Per Memory `feedback_coolify_cron_node` — `curl` koennte im `app`-Container fehlen (Alpine-Base ohne curl). Daher direkt `node -e fetch(...)` als robusten Fallback nutzen. Pattern wie bei V4.2 `capture-reminders-daily` und V5 `walkthrough-cleanup-daily`.

### User-Bestaetigung (auszufuellen in MT-3)

```text
[ ] Cron-Task in Coolify-UI angelegt am: ____________________________
[ ] Manueller Test-Run via `docker exec`:
    docker exec app-bwkg80w04wgccos48gcws8cs-<suffix> sh -c 'node -e "fetch(\"http://localhost:3000/api/cron/pending-signup-cleanup\", { headers: { \"x-cron-secret\": process.env.CRON_SECRET } }).then(r => r.text()).then(console.log)"'
    Expected: {"ok":true,"expired_count":0,"deleted_count":0}
[ ] error_log enthaelt category='pending_signup_cleanup' nach erstem Run
[ ] Naechster automatischer Cron-Run beobachtet (Coolify-UI → Scheduled Tasks → Last Run)
```

---

## ENV-Variable-Setup (SLC-135 MT-4)

**Status: PENDING — User-Pflicht-Aktion. Setup-Bestaetigung in dieser Sektion eintragen.**

### PUBLIC_SIGNUP_SERVICE_KEY (BEIDE Coolify-Resources)

Per Memory `feedback_env_value_not_command` liefert der Agent den ready-to-paste Wert direkt. Bei Bedarf kann der User stattdessen einen eigenen Wert via `openssl rand -hex 32` erzeugen — beide Wege funktionieren, Hauptsache der Wert ist in BEIDEN Resources identisch.

**Vom Agent generierter Wert (kann direkt in Coolify gepastet werden):**

```text
PUBLIC_SIGNUP_SERVICE_KEY=b48c1d55f7aae78b2ed5befd4a7534b036b555ba7d4410347c8bed6f8380c090
```

Setzung in:
1. **Onboarding-Coolify-Resource** (App-Service): obenstehender Wert
2. **Intelligence-Studio-Coolify-Resource** (App-Service): **identischer** Wert

Beide Resources MUESSEN denselben 64-Zeichen-Hex-String haben. Sonst forwarded der IS-Caller zu Onboarding mit falschem Key → 403.

Wenn der User einen eigenen Wert generieren moechte (z.B. Security-Rotation):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# oder
openssl rand -hex 32
```

Den neuen Wert dann in BEIDEN Resources setzen + IS-Resource neu deployen + Onboarding-Resource neu deployen.

### PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS (Onboarding-Resource only)

Default-Liste (10 Wegwerf-Domains, Komma-getrennt, kein Whitespace):

```text
mailinator.com,guerrillamail.com,tempmail.io,sharklasers.com,mvrht.com,trashmail.com,getairmail.com,maildrop.cc,yopmail.com,dispostable.com
```

### User-Bestaetigung (auszufuellen in MT-4)

```text
[ ] PUBLIC_SIGNUP_SERVICE_KEY in Onboarding-Resource gesetzt am: ____________________________
    Verifikation: `docker exec app-bwkg80w04wgccos48gcws8cs-<suffix> printenv PUBLIC_SIGNUP_SERVICE_KEY | wc -c`
    Erwartet: 65 (64 hex + newline)
[ ] PUBLIC_SIGNUP_SERVICE_KEY in IS-Resource (162.55.216.180) gesetzt mit IDENTISCHEM Wert
    Verifikation: `docker exec <is-app-container> printenv PUBLIC_SIGNUP_SERVICE_KEY | wc -c` → 65
[ ] Beide Werte cross-checked (sind identisch)
[ ] PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS in Onboarding-Resource gesetzt mit Default-Liste
    Verifikation: `docker exec app-bwkg80w04wgccos48gcws8cs-<suffix> printenv PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS`
    Erwartet: 10 Domains, komma-getrennt
```

---

## IONOS-Postfach-Check (SLC-135 MT-5)

**Status: PENDING — User-Pflicht-Aktion. Setup-Bestaetigung in dieser Sektion eintragen.**

Pre-Deploy-Pflicht: `onboarding@strategaize.de` muss als Postfach existieren ODER als Alias auf `noreply@strategaize.de` konfiguriert sein (DEC-134). Sonst schlaegt der IONOS-SMTP-Send-Test beim ersten Self-Signup mit 550 oder Connection-Reject fehl.

### User-Aktion

1. IONOS-Webadmin oeffnen (`https://www.ionos.de/login/`)
2. E-Mail → Postfach-Verwaltung → Suche nach `onboarding@strategaize.de`
3. Entweder Postfach anlegen (Aufwand 5 min) ODER Alias konfigurieren (Aufwand 2 min)
4. Smoke-Send-Test via IONOS-Webmail:
   - Absender: `onboarding@strategaize.de` (Postfach) oder `noreply@strategaize.de` (Alias-Routing)
   - Empfaenger: `bellaerts@bellaerts.de` (oder andere private Adresse zur Bestaetigung)
   - Subject: `Strategaize V7 Pre-Deploy Smoke`
   - Body: kurzer Text, z.B. `MT-5 Smoke-Send-Test bestanden.`
5. Posteingang `bellaerts@bellaerts.de` pruefen — Mail muss innerhalb 1 min ankommen.

### User-Bestaetigung (auszufuellen in MT-5)

```text
[ ] IONOS-Postfach `onboarding@strategaize.de` existiert ODER Alias konfiguriert am: ____________________________
[ ] Smoke-Send-Test mit Subject "Strategaize V7 Pre-Deploy Smoke" verschickt am: ____________________________
[ ] Mail in Empfaenger-Postfach angekommen
[ ] Reply-To-Header-Check (optional): Antwort an `onboarding@strategaize.de` kommt zurueck
```

---

## Troubleshooting

### Live-Smoke Schritt 4 → "relation pending_signup does not exist"

PostgREST-Schema-Cache veraltet. Migration-Apply Standard-Procedure NOTIFY-Step nicht ausgefuehrt. Fix:

```bash
ssh $SERVER "docker exec $DB_CONTAINER psql -U postgres -d postgres -c \"NOTIFY pgrst, 'reload schema';\""
# 30s warten, dann Schritt 4 wiederholen.
```

### Live-Smoke Schritt 5 → "Mail nicht angekommen"

1. IONOS-Postfach-Check (MT-5) durch?
2. `SMTP_FROM` ENV stimmt mit IONOS-Postfach ueberein?
3. Spam-Ordner geprueft?
4. error_log Eintrag mit `source='email:signup-verify'`?
   ```sql
   SELECT * FROM error_log
   WHERE source LIKE '%signup-verify%' OR source LIKE '%email%'
   ORDER BY created_at DESC LIMIT 5;
   ```

### Live-Smoke Schritt 7 → fehlende profiles-Row

`handle_new_user`-Trigger hat Probleme. Pruefen:

```sql
SELECT au.email, au.raw_user_meta_data, p.first_name, p.tenant_id
FROM auth.users au
LEFT JOIN profiles p ON p.id = au.id
WHERE au.email = 'qa-selfsignup-test@strategaizetransition.com';
```

Wenn `profiles` NULL: trigger schlug fehl. error_log fuer Details:

```sql
SELECT * FROM error_log
WHERE source LIKE '%verify-signup%' OR source LIKE '%auto-provision%'
ORDER BY created_at DESC LIMIT 10;
```

### Live-Smoke Schritt 12 → Lead nicht in Business-System

Lead-Push ist OPTIONAL und an User-Opt-In gekoppelt. Wenn nicht im Onboarding-Flow gewaehlt: kein Lead-Push erwartet. Wenn doch gewaehlt + dennoch fehlend: Business-System `lead_push`-Endpoint-Logs pruefen.

---

## Cross-Links

- Slice-Spec: `slices/SLC-135-ttl-cleanup-cron-final-hardening-live-smoke.md`
- V7 Feature: `features/FEAT-053-self-signup-email-verify-auto-provisioning.md`
- Migration-Pattern: `.claude/rules/sql-migration-hetzner.md`
- Cron-Pattern: Memory `feedback_coolify_cron_node`
- Schema-Reload: Memory `reference_postgrest_schema_reload.md`
- Test-Setup: `.claude/rules/coolify-test-setup.md`
- DEC-131 (TTL 24h + Cleanup hourly), DEC-134 (IONOS-Sender), DEC-136 (Service-Key-Rotation), DEC-138 (Pending-Status-Maschine)
