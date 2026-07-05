# Architecture

## Status
V1-Architektur festgelegt am 2026-04-14. Letzte Erweiterung: **V8 Mandanten-Report-Port** (2026-05-28, RPT-349) — Addendum-Section am Ende dieses Dokuments. 8 V8-DECs (DEC-157..164) in `docs/DECISIONS.md`, 1 geplante Migration (MIG-047 / Migration 102) in `docs/MIGRATIONS.md`. Vorherige Erweiterung: V7.4 (App-Shell Touch-Target, 2026-05-23, RPT-340).

## Architektur-Zusammenfassung

Die Onboarding-Plattform V1 ist eine Next.js-16-App auf einem selbst-gehosteten Supabase-Stack, der per Docker Compose via Coolify auf Hetzner laeuft. Die Codebasis wurde aus Blueprint V3.4 geforkt und bringt damit den vollstaendigen Web-Stack (Auth, UI, LLM-Client, Deployment) mit.

V1 fuegt dem bestehenden Stack drei neue Bausteine hinzu:

1. **Generisches Knowledge-Schema** — 5 neue Kerntabellen (`capture_session`, `knowledge_unit`, `block_checkpoint`, `validation_layer`, `template`) als template-ready Grundstruktur.
2. **Portierter Verdichtungs-Layer** — die OS-Ebene-1 (Migrations 033 / 049 / 050 + Query-Layer + Worker + Import-Endpoint) wird auf das neue Schema und auf AWS Bedrock umgebaut.
3. **Separater Worker-Container** — `onboarding-worker` laeuft neben dem Next.js-Container, pollt eine `ai_jobs`-Queue und fuehrt die Single-Pass-Verdichtung aus.

Die Anwendung bleibt eine Server-Side-gerenderte Next.js App mit Server Actions + API-Routes. Browser-Clients sprechen nur mit Next.js (bzw. mit Supabase Kong fuer direkte Lese-Calls), niemals direkt mit dem LLM oder der DB.

## Main Components

### 1. Web App (Next.js 16, App Router)
- Next.js 16.1.1, React 19, TypeScript 5.x
- App Router mit Server Components als Default
- UI: Tailwind CSS + shadcn/ui (Radix-basiert)
- Betrieb als eigener Docker-Container `app` auf Port 3000

Verantwortlich fuer:
- UI-Rendering fuer alle Rollen (tenant_admin, tenant_member, strategaize_admin)
- Server Actions fuer mutierende Operationen (Block-Submit, KU-Edit, Meeting-Snapshot)
- API-Routes fuer Worker-Kommunikation (Import-Endpoint, Job-Enqueue)
- KI-Chat-Endpoints (synchron, Bedrock-Calls direkt aus Next.js)

### 2. Worker Container (Node.js)
- Neuer Docker-Service `worker` im selben Compose-Netz
- Polling-Loop gegen `ai_jobs`-Tabelle (Standard 2000 ms, ENV `AI_WORKER_POLL_MS`)
- Portiert aus OS: `src/workers/ai/blueprint-block-draft-worker.ts` umbenannt zu `knowledge-unit-condensation-worker.ts`
- LLM-Client: AWS Bedrock (Claude Sonnet, Region `eu-central-1`) statt Ollama
- Keine HTTP-Endpoints nach aussen, nur DB-Queue-Verbindung via Service-Role-Key

Verantwortlich fuer:
- Claimen + Abarbeiten aller KI-Jobs des Typs `knowledge_unit_condensation`
- Bedrock-Call mit Prompt-Template, JSON-Parsing, Evidence-Validation
- Schreiben der Knowledge Units via `rpc_bulk_import_knowledge_units`
- Kosten-Logging in `ai_cost_ledger` (pro Call: tenant_id, tokens_in, tokens_out, usd)

### 3. Supabase Stack (self-hosted)
Aus Blueprint 1:1 uebernommen, kein Umbau in V1:
- `supabase-db` — Postgres 15, speichert alle Daten
- `supabase-auth` — GoTrue, E-Mail/Passwort-Auth
- `supabase-rest` — PostgREST fuer direkte SQL-Zugriffe aus dem Browser (nur fuer RLS-geschuetzte Reads)
- `supabase-kong` — API-Gateway, bindet Auth + REST + Storage unter einer URL
- `supabase-storage` — Objekt-Storage (V1 nicht aktiv genutzt, aber Teil des Stacks)
- `supabase-realtime` — Realtime-Subscription (V1 nicht aktiv genutzt)
- `supabase-studio` — DB-Admin-UI
- `whisper` — Speech-to-Text (V1 nicht genutzt, aus Blueprint geerbt, bleibt drin)

### 4. AWS Bedrock (external)
- Region: `eu-central-1` (Frankfurt) — DSGVO-Entscheidung aus Blueprint
- Modell: `anthropic.claude-sonnet-4-20250514-v1:0`
- Wird von zwei Stellen aufgerufen:
  - Worker-Container (Single-Pass-Verdichtung pro Block-Submit)
  - Next.js-API-Routes (KI-Chat waehrend der Questionnaire-Bearbeitung)

## Responsibilities per Component

| Component | Owns | Does NOT own |
|-----------|------|--------------|
| Next.js App | UI, Auth-Cookies, Server Actions, Chat-Endpoints, Job-Enqueue, Debrief-UI | Lange KI-Calls, Background-Polling, Queue-Verarbeitung |
| Worker | Queue-Abarbeitung, Verdichtungs-Prompts, Bedrock-Calls, RPC-Import | HTTP-Endpoints, User-Interaktion, Auth-Logik |
| Supabase DB | Daten, RLS-Policies, RPCs, Queue-Tabelle | Business-Logik jenseits der Policies |
| Bedrock | LLM-Inferenz | Alles andere |

## Data Model

5 neue Kerntabellen plus 1 wiederverwendete Queue-Tabelle. Alle generisch benannt (DEC-003).

### `template`
Metadaten einer Wissens-Template-Instanz (z.B. "Exit-Readiness", spaeter weitere).

Kern-Spalten:
- `id uuid PK`
- `slug text UNIQUE` — z.B. `exit_readiness`
- `name text`
- `version text` — Semver der Template-Content-Version
- `description text`
- `blocks jsonb` — Liste der Bloecke (id, key, title, description, questions[], order, required_bool)
- `created_at / updated_at`

Keine Tenant-Bindung: Templates sind system-weit, werden durch `strategaize_admin` verwaltet.

### `capture_session`
Eine laufende Wissenserhebung eines Tenants gegen ein Template. Ersatz fuer OS `blueprint_block_sessions`, aber auf Session-Ebene statt pro Block (Bloecke werden pro Session in `block_checkpoint` getrackt).

Kern-Spalten:
- `id uuid PK`
- `tenant_id uuid FK` — RLS-Filter
- `template_id uuid FK`
- `template_version text` — eingefrorene Template-Version fuer Reproduzierbarkeit
- `owner_user_id uuid FK auth.users` — tenant_admin, der die Session gestartet hat
- `status text` — `open | in_progress | submitted | reviewed | finalized`
- `started_at / updated_at`

### `block_checkpoint`
Versionierter Submit-Zustand pro Block. Loest Q3-Versionierung aus dem PRD (SC-6).

Kern-Spalten:
- `id uuid PK`
- `tenant_id uuid FK`
- `capture_session_id uuid FK`
- `block_key text` — generisch, korrespondiert zu `template.blocks[].key`
- `checkpoint_type text` — `questionnaire_submit | meeting_final`
- `content jsonb` — eingefrorener Snapshot (Antworten, Exception-Text, KI-Chat-Kontext, bei `meeting_final` auch die finalisierten KUs)
- `content_hash text` — SHA-256 des `content` fuer Audit-Trail
- `created_by uuid FK auth.users`
- `created_at`

### `knowledge_unit`
Das verdichtete KI-Ergebnis pro Block. Ersatz fuer OS `blueprint_debrief_items`. Jede KU gehoert zu genau einem `block_checkpoint` (dem auslosenden Submit).

Kern-Spalten:
- `id uuid PK`
- `tenant_id uuid FK`
- `capture_session_id uuid FK`
- `block_checkpoint_id uuid FK` — verknuepft KU eindeutig mit dem Submit, aus dem sie entstanden ist
- `block_key text`
- `unit_type text` — `finding | risk | action | observation | ai_draft` (aus OS geerbt, erweiterbar)
- `source text` — `questionnaire | exception | ai_draft | meeting_final`
- `title text`
- `body text`
- `confidence text` — Enum `low | medium | high` (DEC-008)
- `evidence_refs jsonb` — Liste der Antwort-IDs / Exception-Referenzen, aus denen die KU gezogen wurde
- `status text` — `proposed | accepted | edited | rejected`
- `created_at / updated_at / updated_by`

### `validation_layer`
Audit-Log der menschlichen Review-Schritte auf einer KU. Jeder Status-Wechsel einer `knowledge_unit` erzeugt hier einen Eintrag.

Kern-Spalten:
- `id uuid PK`
- `tenant_id uuid FK`
- `knowledge_unit_id uuid FK`
- `reviewer_user_id uuid FK auth.users`
- `reviewer_role text` — `strategaize_admin | tenant_admin`
- `action text` — `accept | edit | reject | comment`
- `previous_status text`
- `new_status text`
- `note text`
- `created_at`

### `ai_jobs` (wiederverwendet, Blueprint-Erbe)
Queue-Tabelle mit `SKIP LOCKED`-Claim via RPC. Kein Schema-Umbau in V1. Nur neuer `job_type = 'knowledge_unit_condensation'`.

## Data Flow

### Flow 1 — Block-Submit (Kunde → Verdichtung)

```
Browser (tenant_admin)
  -> Server Action: submitBlock(capture_session_id, block_key)
       -> Supabase RPC: rpc_create_block_checkpoint()
            * schreibt block_checkpoint (type=questionnaire_submit)
            * content = aktuelle Antworten + Exception-Text
       -> Supabase INSERT ai_jobs
            * job_type = knowledge_unit_condensation
            * payload = { block_checkpoint_id }
       -> return 200 OK
  -> UI zeigt Block-Status = "submitted, wird verdichtet"

Worker-Container (parallel, unabhaengig)
  -> Polling-Loop (2s): rpc_claim_next_ai_job_for_type('knowledge_unit_condensation')
       -> laedt block_checkpoint + template + prompt
       -> Bedrock-Call (Claude Sonnet eu-central-1)
       -> parst JSON-Output, validiert evidence_refs
       -> Supabase RPC: rpc_bulk_import_knowledge_units()
            * schreibt knowledge_unit-Eintraege (status=proposed)
       -> Supabase INSERT ai_cost_ledger
       -> Supabase RPC: rpc_complete_ai_job(job_id)
  -> UI (nach Refresh oder Polling) zeigt Block-Status = "reviewed, bereit fuer Debrief"
```

### Flow 2 — Debrief Meeting (strategaize_admin)

```
Browser (strategaize_admin)
  -> GET /debrief/{capture_session_id}/{block_key}
       -> Server Component laedt knowledge_unit + validation_layer
  -> User editiert KU -> Server Action: updateKnowledgeUnit()
       -> UPDATE knowledge_unit (status, body)
       -> INSERT validation_layer (action=edit)
  -> User klickt "Meeting-Snapshot erzeugen"
       -> Server Action: createMeetingSnapshot()
            * INSERT block_checkpoint (type=meeting_final, content=KUs im Endzustand)
            * UPDATE capture_session.status (falls alle Bloecke final)
  -> JSON-Export via GET /api/export/checkpoint/{id}
```

### Flow 3 — KI-Chat im Questionnaire (synchron)

```
Browser -> POST /api/chat/block
  -> Next.js Route laedt aktuellen Block-Kontext
  -> Bedrock Invoke (Claude Sonnet, streaming response)
  -> Browser erhaelt Antwort, kein Queue-Detour
```

Rationale: KI-Chat ist ein synchroner UX-Call, waehrend Verdichtung asynchroner Background-Job ist. Beide nutzen denselben Bedrock-Client, aber getrennte Aufrufpfade.

## External Dependencies

| Dependency | Zweck | Betriebs-Ort | V1-Kritikalitaet |
|-----------|-------|--------------|------------------|
| AWS Bedrock (eu-central-1) | LLM-Inferenz fuer Chat + Verdichtung | AWS | kritisch |
| Hetzner Cloud Server | Host fuer Docker-Stack | Hetzner | kritisch |
| Coolify | Orchestrator, Domain, TLS, Logs | Self-hosted auf gleichem Server | kritisch |
| SMTP-Anbieter (ENV) | Einladungsmails fuer neue Tenants | external | wichtig |

Keine weiteren externen Services in V1 (kein S3, kein Sentry, kein Stripe).

## Internal URL Strategy

Aus Blueprint uebernommen, wichtig fuer Deployment-Flexibilitaet:

| Variable | Zweck | Beispiel |
|----------|-------|----------|
| `SUPABASE_URL` | Container-intern (Server Components, Worker) | `http://supabase-kong:8000` |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-extern (Client Components, Direct REST) | `https://api.kunde.tld` |
| `NEXT_PUBLIC_APP_URL` | Public URL der App | `https://app.kunde.tld` |

Next.js Server Components und der Worker nutzen immer den internen Kong-Hostnamen. Nur Browser-Code sieht die externe URL. Das verhindert Hairpin-NAT-Probleme.

## Auth Flow

Aus Blueprint 1:1 uebernommen:
- Supabase Auth via SSR-Cookies (`@supabase/ssr`)
- Server-seitige Auth in `src/lib/supabase/server.ts`
- Admin-Client mit Service Role in `src/lib/supabase/admin.ts` (nur fuer Worker + privilegierte RPCs)
- Middleware in `src/middleware.ts` aktualisiert Session bei jedem Request

### Rollen (kanonisch ab V1)
- `strategaize_admin` — Cross-Tenant-Zugriff, Debrief-Meeting-UI, Template-Verwaltung
- `tenant_admin` — voller Lese-/Schreibzugriff im eigenen Tenant, Block-Submit, Session-Start (DEC-010: im Blueprint-Code heisst diese Rolle `tenant_owner`, wird in der ersten Migration auf `tenant_admin` umbenannt)
- `tenant_member` — nur Bloecke lesen/schreiben, auf die der `tenant_admin` freigegeben hat

Cross-Tenant-Zugriff fuer `strategaize_admin` wird ueber separate Admin-Policies gelost, nicht ueber Service-Role-Bypass im Browser.

## RLS-Modell

Alle 5 neuen Tabellen haben RLS aktiv. Policies folgen dem Blueprint-Muster:

```sql
-- Beispiel-Policy: knowledge_unit
CREATE POLICY ku_tenant_read ON knowledge_unit
  FOR SELECT USING (
    tenant_id = auth.user_tenant_id()
    OR auth.user_role() = 'strategaize_admin'
  );

CREATE POLICY ku_tenant_write ON knowledge_unit
  FOR INSERT WITH CHECK (
    tenant_id = auth.user_tenant_id()
    OR auth.user_role() = 'strategaize_admin'
  );
```

Helper-Funktionen `auth.user_tenant_id()` und `auth.user_role()` (SECURITY DEFINER) sind schon aus Blueprint vorhanden.

## Security / Privacy

### Tenant-Isolation
Primaere Schutzschicht = RLS auf DB-Ebene. Applikations-seitige Filterung ist sekundaer (Defense-in-Depth). Ein fehlender RLS-Policy-Eintrag ist ein Security-Incident, kein UX-Bug.

### Bedrock-Daten
Prompts + Antworten gehen nach Bedrock (eu-central-1). Kein Cross-Region-Traffic. Bedrock-Retention-Policy ist AWS-Default (kein Training auf Kunden-Daten laut AWS-TOS fuer Bedrock-Claude). Fuer On-Premise-Deployments ohne AWS-Zugang ist V1 nicht geeignet (Scope-Grenze).

### Secrets
- `SUPABASE_SERVICE_ROLE_KEY` — nur im Worker + Server-Container, nie im Browser-Bundle
- `AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY` — nur im Worker + Server-Container
- Keine Secrets in `NEXT_PUBLIC_*`-Vars

### Logging
- Bedrock-Calls loggen: tenant_id, tokens_in, tokens_out, usd_cost, model, duration_ms
- Keine Prompts oder Antworten im Log (Privacy)
- Errors loggen Stack-Trace, aber KEINE User-Daten

## Constraints and Tradeoffs

### Constraint — Deployment-Flexibilitaet (DEC-002)
Alle Konfiguration ueber ENV. Kein Hardcoded-Tenant, kein Hardcoded-Domain.
**Tradeoff:** Feature-Entwicklung ist leicht schwerfaelliger, weil neue Parameter immer als ENV angelegt + dokumentiert werden muessen.

### Constraint — Template-ready (DEC-003)
Schema ist generisch (`capture_session`, `knowledge_unit`), nicht `questionnaire_session` oder `exit_readiness_block`.
**Tradeoff:** Erschwertes Debugging ("was ist `block_key=opsA`?"), weil Semantik im Template-Content steckt, nicht im Schema-Namen.

### Constraint — Single-Pass-Verdichtung (V1 only, DEC-005)
Keine Agenten-Loop, keine iterative Luecken-Erkennung.
**Tradeoff:** Schlechtere KI-Qualitaet bei komplexen Bloecken. Akzeptiert, weil Berater-Review die Luecke schliesst (SC-2).

### Constraint — Worker als separater Container (DEC-007)
Zweiter Docker-Service neben `app`.
**Tradeoff:** Mehr Deployment-Komplexitaet (2 Services statt 1), aber robust, reuseable und konform zum OS-Portierungs-Pfad. Alternative "API-Route als Worker" wurde verworfen, weil Next.js-Requests auf Hetzner/Coolify nicht lang genug laufen duerfen (Proxy-Timeouts + Cold-Restarts).

### Constraint — Confidence als Enum (DEC-008)
LLM liefert `low / medium / high`, keine Float-Werte.
**Tradeoff:** Keine feine statistische Aggregation moeglich, aber Debrief-UI wird lesbar und LLM-Output wird zuverlaessiger.

### Constraint — Export = JSON only (DEC-009)
V1 liefert nur JSON-Export. Kein PDF, kein Markdown.
**Tradeoff:** Kunde muss den JSON-Export extern weiterverarbeiten, falls er einen formatierten Report braucht. Akzeptiert, weil V1-Zielgruppe der interne User und erste externe Testkunde sind.

## Open Technical Questions

- **Q5 — Prompt-Template-Management:** V1 haelt Prompts als SQL-Seed in `ai_prompts`-Tabelle (OS-Muster). Soll ein Admin-UI fuer Prompt-Editing her, oder bleiben Aenderungen Migration-only? Entscheidung: Migration-only in V1, Admin-UI V2+.
- **Q6 — Multi-Block-Dependency:** Was, wenn ein Block-Submit auf Antworten eines anderen Blocks verweist? V1 verarbeitet jeden Block isoliert. Cross-Block-Logik = V2.
- **Q7 — Worker-Skalierung:** Ein Worker-Container fuer V1 reicht. Mehrere Worker parallel (horizontal scaling) waere trivial (SKIP LOCKED ist konkurrenzsicher), aber in V1 kein Use-Case.
- **Q8 — Template-Content-Updates:** Wenn `template.version` sich aendert, was passiert mit laufenden `capture_session`? V1: `capture_session` friert `template_version` ein, alte Sessions laufen auf alter Version weiter. Kein In-Flight-Upgrade.

## Recommended Implementation Direction

Empfohlene Slice-Reihenfolge (zur Uebergabe an `/slice-planning`):

1. **SLC-001: Schema-Fundament** — 5 neue Tabellen + RLS + Migrations (Basis fuer alles)
2. **SLC-002: Rollen-Umbenennung** — `tenant_owner` → `tenant_admin` (kleine Migration, kann mit SLC-001 gebuendelt werden)
3. **SLC-003: Template + Exit-Readiness-Content** — Template-Tabelle + Content-Import aus Blueprint
4. **SLC-004: Capture-Session-Start + Block-Listing** — Kunde sieht seine Session und die Bloecke
5. **SLC-005: Questionnaire-UI-Portierung** — portiertes Blueprint-Questionnaire auf neues Schema
6. **SLC-006: Block-Submit + Checkpoint** — Server-Action, Checkpoint-Erzeugung, Job-Enqueue
7. **SLC-007: Exception-Mode-Layer** — zusaetzliches Freitext-Feld + Prompt-Layer
8. **SLC-008: Worker-Container + Verdichtung** — neuer Docker-Service, Bedrock-Umbau, RPC-Import
9. **SLC-009: Debrief-UI + KU-Editor** — strategaize_admin-Seite, Validation-Layer-Writes
10. **SLC-010: Meeting-Snapshot + JSON-Export** — finaler Checkpoint, Export-Endpoint

Jeder Slice sollte mit Tests fuer seine RLS-Erwartungen abgeschlossen werden (SaaS-Mode TDD laut `.claude/rules/tdd.md`).

## Naechster Schritt

`/slice-planning` mit Scope "V1 alle 10 Slices".

---

## V1.1 Architecture Addendum — Maintenance Release

### Status
V1.1-Architektur ergaenzt am 2026-04-18. Keine strukturellen Aenderungen am V1-Stack — rein subtraktive Arbeit (Legacy-Loeschung) plus zwei kleine Ergaenzungen (Dashboard-Datenquelle, error_log-Tabelle).

### Architektur-Aenderungen V1.1

**Keine.** V1.1 aendert nichts an der Architektur. Kein neuer Service, kein neues Schema-Konzept, keine neue Abhaengigkeit. Die Aenderungen sind:

1. **Subtraktiv:** ~42 tote Dateien + 16 Legacy-Migrations loeschen
2. **Korrektur:** Dashboard-Datenquelle von `/api/tenant/runs` (nicht-existent) auf `capture_session`-Query umstellen
3. **Ergaenzung:** `error_log`-Tabelle erstellen (fehlte seit V1-Deploy)

### FEAT-007: Blueprint-Legacy-Cleanup — Technische Spezifikation

#### Zu loeschende Verzeichnisse (komplett)

| Verzeichnis | Dateien | Referenziert |
|-------------|---------|-------------|
| `src/app/api/tenant/runs/` | 15 Route-Dateien | runs, questions, evidence_items, run_memory |
| `src/app/api/admin/runs/` | 6 Route-Dateien | runs |
| `src/app/api/admin/catalog/` | 2 Route-Dateien | question_catalog_snapshots |
| `src/app/api/tenant/mirror/` | 5 Route-Dateien | mirror_profiles, mirror_policy_confirmations, mirror_nominations |
| `src/app/admin/runs/` | 6 Dateien (Pages + Clients) | runs |
| `src/app/admin/catalog/` | 2 Dateien (Page + Client) | question_catalog_snapshots |
| `src/app/mirror/profile/` | 2 Dateien (Page + Client) | mirror_profiles |
| `src/app/mirror/nominations/` | 2 Dateien (Page + Client) | mirror_nominations |
| `src/app/mirror/policy/` | 1 Datei (Page) | mirror_policy_confirmations |
| `src/app/runs/` | 2 Dateien (Page + Client) | runs |

#### Zu loeschende Einzel-Dateien
- `src/components/status-badge.tsx` — nur von Legacy-Runs verwendet (nach Dashboard-Umbau pruefen)
- `src/components/progress-indicator.tsx` — nur von Legacy-Runs verwendet (nach Dashboard-Umbau pruefen)

#### Zu aktualisierende Dateien
- `src/app/api/admin/tenants/route.ts` — Legacy-Run-Counting entfernen, auf capture_session-Count umstellen
- `src/components/dashboard-sidebar.tsx` — ggf. Legacy-Links entfernen (bereits in V1 Smoke-Test teilweise bereinigt)
- `src/components/admin-sidebar.tsx` — Legacy-Links pruefen

#### Legacy-Migrations zu loeschen (sql/migrations/)
Migrations 003-020 (16 Dateien). Diese wurden nie auf der Onboarding-DB ausgefuehrt und existieren nur als Datei-Artefakte.

**Ausnahme:** Migration 005 (`005_error_logging.sql`) wird NICHT geloescht, sondern als Referenz fuer die neue error_log-Migration verwendet, dann aber ebenfalls entfernt.

#### Bewusst beibehaltene Legacy-Artefakte
- `src/lib/llm.ts` — `buildOwnerContext` + `OwnerProfileData` bleiben per DEC-012 fuer V2+ Template-spezifische Owner-Erhebung
- `src/lib/freeform.ts` — Wird von V2 Free-Form Capture-Mode benoetigt (BL-021)

#### Validierungs-Strategie
1. **Vor Loeschung:** `grep -r` auf jeden Verzeichnisnamen, um unerwartete Imports zu finden
2. **Nach Loeschung:** `npm run build` muss erfolgreich sein
3. **Nach Loeschung:** `npm run test` muss erfolgreich sein (soweit lokal verfuegbar)

### FEAT-008: Dashboard Capture-Sessions — Technische Spezifikation

#### Ist-Zustand
`dashboard-client.tsx` fetcht von `/api/tenant/runs` → HTTP 500 → Empty-State.

#### Soll-Zustand
Dashboard zeigt aktive Capture-Sessions des eingeloggten Users. Datenquelle: `capture_session`-Tabelle via Supabase-Client (RLS-geschuetzt, kein separater API-Endpoint noetig).

#### Query
```typescript
const { data: sessions } = await supabase
  .from('capture_session')
  .select('id, status, started_at, updated_at, template:template_id(name, slug)')
  .order('updated_at', { ascending: false });
```

#### UI-Aenderungen
- `Run`-Interface ersetzen durch `CaptureSession`-Interface
- Statt `title`, `description`, `question_count`, `answered_count`, `evidence_count` → `template.name`, `status`, `started_at`, `updated_at`
- Link-Ziel: `/capture/{sessionId}` statt `/runs/{id}`
- Fortschrittsanzeige: Block-Completion statt Frage-Completion (Anzahl finalisierter Bloecke / Gesamt-Bloecke aus Template)
- Empty-State bleibt bestehen, Text anpassen

#### Kein neuer API-Endpoint
Die Query laeuft direkt im Client via Supabase-Client. RLS garantiert Tenant-Isolation. Das entspricht dem V1-Pattern (capture_session-Reads laufen immer ueber Supabase-Client, nicht ueber API-Routes).

### FEAT-009: Error-Logging — Technische Spezifikation

#### Migration 039_error_log.sql

```sql
CREATE TABLE IF NOT EXISTS error_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL DEFAULT 'error',
  source text NOT NULL DEFAULT 'unknown',
  message text NOT NULL,
  stack text,
  metadata jsonb DEFAULT '{}',
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: nur strategaize_admin darf lesen, Service-Role schreibt
ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY error_log_admin_read ON error_log
  FOR SELECT USING (auth.user_role() = 'strategaize_admin');

-- Service-Role-Key umgeht RLS automatisch (INSERT kommt von logger.ts via supabaseAdmin)

-- Index fuer Abfrage nach Datum
CREATE INDEX idx_error_log_created_at ON error_log(created_at DESC);
```

#### Keine Code-Aenderung an logger.ts
`logger.ts` schreibt bereits korrekt in `error_log`. Die Tabelle fehlte nur in der DB. Nach Migration funktioniert der Logger automatisch.

#### Keine Code-Aenderung an /api/admin/errors
Die Route `/api/admin/errors/route.ts` liest bereits aus `error_log`. Nach Migration funktioniert sie automatisch.

### Empfohlene Slice-Reihenfolge V1.1

1. **SLC-011: Legacy-Cleanup** — Loeschung aller Legacy-Dateien + Migrations + Build-Verifikation (FEAT-007)
2. **SLC-012: Dashboard + error_log** — Dashboard-Umbau + Migration 039 (FEAT-008 + FEAT-009)

Zwei Slices reichen. SLC-011 ist rein subtraktiv (Loeschen + Verifizieren). SLC-012 ist ein kleiner Frontend-Umbau + eine Migration.

### Naechster Schritt V1.1

`/slice-planning` mit 2 Slices.

---

## V2 Architecture Addendum — Intelligence Upgrade + Evidence + Template-Expansion

### Status
V2-Architektur festgelegt am 2026-04-19. Baut auf V1.1-Stack (stabil, released) auf.

### Architektur-Zusammenfassung V2

V2 erweitert den bestehenden Stack ohne neue Docker-Services. Die drei Kernprinzipien:

1. **Worker-Erweiterung statt Service-Explosion** — Orchestrator, SOP-Generation, Evidence-Extraction und Backspelling-Re-Condensation laufen alle als neue Job-Types im bestehenden Worker-Container (DEC-017).
2. **Whisper reaktivieren, nicht neu bauen** — Der Whisper-Container existiert bereits im Docker-Compose (Blueprint-Erbe). Er wird ueber ein Adapter-Pattern (DEC-018) angebunden, das spaeter Azure EU oder andere Provider erlaubt.
3. **Template-Infrastruktur statt Template-Hardcoding** — Template-Tabelle bekommt erweiterbare Felder (sop_prompt, owner_fields), ein Demo-Template beweist den Mechanismus.

### Service-Topologie V2

Keine neuen Docker-Services. Bestehende 9 Services + Worker bleiben.

| Service | V2-Aenderung |
|---------|-------------|
| `app` | Neue API-Routes (Transcribe, Evidence-Upload, Gap-Questions, SOP-Trigger), Template-Switcher-UI, Evidence-UI, Backspelling-UI |
| `worker` | 4 neue Job-Types, Orchestrator-Prompt, SOP-Prompt, Evidence-Extraction-Logic |
| `supabase-storage` | Neuer Bucket `evidence` (tenant-isoliert) |
| `whisper` | Reaktiviert (bereits vorhanden, ASR_MODEL konfigurierbar via ENV) |
| Alle anderen | Unveraendert |

### Neue Tabellen V2

#### `gap_question` (FEAT-011 Backspelling)
Vom Orchestrator erkannte Wissensluecken als strukturierte Nachfragen.

```sql
CREATE TABLE gap_question (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  capture_session_id    uuid        NOT NULL REFERENCES capture_session ON DELETE CASCADE,
  block_checkpoint_id   uuid        NOT NULL REFERENCES block_checkpoint ON DELETE CASCADE,
  knowledge_unit_id     uuid        REFERENCES knowledge_unit ON DELETE SET NULL,
  question_text         text        NOT NULL,
  context               text,
  subtopic              text,
  priority              text        NOT NULL CHECK (priority IN ('required', 'nice_to_have'))
                                    DEFAULT 'required',
  status                text        NOT NULL CHECK (status IN (
                                      'pending', 'answered', 'skipped', 'recondensed'))
                                    DEFAULT 'pending',
  answer_text           text,
  answered_at           timestamptz,
  backspelling_round    integer     NOT NULL DEFAULT 1,
  created_at            timestamptz NOT NULL DEFAULT now()
);
```

RLS: tenant_admin/member liest+schreibt eigenen Tenant, strategaize_admin Cross-Tenant.

#### `sop` (FEAT-012 SOP Generation)
Generierte Standard Operating Procedures pro Block.

```sql
CREATE TABLE sop (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  capture_session_id    uuid        NOT NULL REFERENCES capture_session ON DELETE CASCADE,
  block_key             text        NOT NULL,
  block_checkpoint_id   uuid        NOT NULL REFERENCES block_checkpoint ON DELETE CASCADE,
  content               jsonb       NOT NULL,
  generated_by_model    text        NOT NULL,
  cost_usd              numeric(10,6),
  created_by            uuid        REFERENCES auth.users,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
```

SOP `content` JSONB-Struktur:
```json
{
  "title": "SOP: Nachfolgeplanung",
  "objective": "...",
  "prerequisites": ["..."],
  "steps": [
    {
      "number": 1,
      "action": "Nachfolger-Profil definieren",
      "responsible": "Geschaeftsfuehrer",
      "timeframe": "2 Wochen",
      "success_criterion": "Schriftliches Profil liegt vor",
      "dependencies": []
    }
  ],
  "risks": ["..."],
  "fallbacks": ["..."]
}
```

RLS: strategaize_admin Full, tenant_admin Read eigener Tenant.

#### `evidence_file` (FEAT-013 Evidence-Mode)
Metadaten hochgeladener Dateien.

```sql
CREATE TABLE evidence_file (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  capture_session_id    uuid        NOT NULL REFERENCES capture_session ON DELETE CASCADE,
  block_key             text,
  storage_path          text        NOT NULL,
  original_filename     text        NOT NULL,
  mime_type             text        NOT NULL,
  file_size_bytes       integer     NOT NULL,
  extraction_status     text        NOT NULL CHECK (extraction_status IN (
                                      'pending', 'extracting', 'extracted', 'failed'))
                                    DEFAULT 'pending',
  extraction_error      text,
  created_by            uuid        NOT NULL REFERENCES auth.users,
  created_at            timestamptz NOT NULL DEFAULT now()
);
```

RLS: tenant_admin/member Write+Read eigener Tenant, strategaize_admin Cross-Tenant Read.

#### `evidence_chunk` (FEAT-013 Evidence-Mode)
Extrahierte Text-Chunks mit KI-Mapping-Vorschlaegen.

```sql
CREATE TABLE evidence_chunk (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  evidence_file_id      uuid        NOT NULL REFERENCES evidence_file ON DELETE CASCADE,
  chunk_index           integer     NOT NULL,
  chunk_text            text        NOT NULL,
  mapping_suggestion    jsonb,
  mapping_status        text        NOT NULL CHECK (mapping_status IN (
                                      'pending', 'suggested', 'confirmed', 'rejected'))
                                    DEFAULT 'pending',
  confirmed_question_id uuid,
  confirmed_block_key   text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
```

`mapping_suggestion` JSONB:
```json
{
  "question_id": "uuid",
  "block_key": "A",
  "question_text": "Was macht Ihr Unternehmen...",
  "confidence": 0.85,
  "relevant_excerpt": "Wir sind spezialisiert auf..."
}
```

RLS: analog evidence_file.

### Template-Schema-Erweiterung

Bestehende `template`-Tabelle bekommt 2 neue JSONB-Spalten:

```sql
ALTER TABLE template
  ADD COLUMN sop_prompt     jsonb DEFAULT NULL,
  ADD COLUMN owner_fields   jsonb DEFAULT NULL;
```

`sop_prompt`: Template-spezifischer System-Prompt fuer SOP-Generation. Jedes Template definiert eigene SOP-Struktur und Fokus.

`owner_fields`: Template-spezifische Fragen zur Owner-Erhebung (DEC-012). Werden als spezielle Fragen im ersten Block dargestellt.

```json
{
  "fields": [
    { "key": "owner_age", "label": {"de": "Alter", "en": "Age"}, "type": "number" },
    { "key": "owner_years", "label": {"de": "Jahre als Inhaber"}, "type": "number" },
    { "key": "owner_education", "label": {"de": "Ausbildung"}, "type": "text" }
  ]
}
```

### Worker-Erweiterung V2

Der Worker bleibt ein einzelner Container mit Polling-Loop. Neue Job-Types werden im bestehenden `handle-job.ts`-Dispatcher registriert.

#### Neue Job-Types

| Job-Type | Trigger | Input | Output |
|----------|---------|-------|--------|
| `orchestrator_assessment` | Automatisch nach A+C-Loop | block_checkpoint_id + KU-IDs | quality_report JSONB auf block_checkpoint, gap_question-Rows |
| `recondense_with_gaps` | Automatisch nach Gap-Antworten | block_checkpoint_id + gap_answers | Neue KUs (neuer Checkpoint), evtl. weitere Gaps (max 2 Runden) |
| `sop_generation` | On-demand (Admin-Button) | block_checkpoint_id + template.sop_prompt | sop-Row |
| `evidence_extraction` | Automatisch nach Upload | evidence_file_id | evidence_chunk-Rows mit mapping_suggestions |

#### Erweiterter Condensation-Flow (FEAT-010 + FEAT-011)

```
Job: knowledge_unit_condensation (V2 erweitert)
  1. [Unveraendert] A+C Loop (2-8 Iterationen) → KUs
  2. [Unveraendert] KUs importieren via RPC
  3. [NEU] Orchestrator-Assessment:
     - Input: Alle KUs des Blocks + Original-Antworten + Template-Metadaten
     - Bedrock-Call mit Orchestrator-Prompt
     - Output: quality_report JSONB
       {
         "overall_score": "acceptable",
         "coverage": { "covered": 8, "total": 10, "gaps": [...] },
         "evidence_quality": "medium",
         "consistency": "good",
         "gap_questions": [
           {
             "question_text": "Sie erwaehnen eine Nachfolgeregelung...",
             "context": "Block A, Subtopic Unternehmensstrategie",
             "subtopic": "A1 Grundverstaendnis",
             "priority": "required",
             "affected_ku_id": "uuid"
           }
         ],
         "recommendation": "backspelling_needed"
       }
  4. [NEU] Quality-Report auf block_checkpoint speichern
  5. [NEU] Gap-Questions in gap_question-Tabelle schreiben
  6. [Unveraendert] Embeddings generieren
  7. Job abschliessen
```

#### Re-Condensation-Flow (FEAT-011)

```
Job: recondense_with_gaps
  1. Lade Original-Checkpoint + Gap-Antworten
  2. Erstelle erweiterten Input (Original-Answers + Gap-Answers)
  3. A+C Loop (2-8 Iterationen) mit erweitertem Input
  4. Orchestrator-Assessment (Runde 2)
  5. Neuer block_checkpoint (type=backspelling_recondense)
  6. Neue/aktualisierte KUs
  7. Wenn weitere Gaps UND Runde < 2: neue gap_questions
  8. Wenn Runde = 2 und noch Gaps: als meeting_agenda markieren
  9. Embeddings aktualisieren
```

### Evidence-Processing-Flow (FEAT-013)

```
Job: evidence_extraction
  1. evidence_file laden (Metadaten)
  2. Datei aus Supabase Storage herunterladen
  3. Text-Extraktion:
     - PDF: pdf-parse (text-basiert)
     - DOCX: mammoth (HTML → Text)
     - TXT/CSV: Direkt-Lesen
     - ZIP: node:zlib → Rekursion ueber Einzeldateien
  4. Chunking (~500-800 Tokens, kein Overlap bei Dokumenten)
  5. evidence_chunk-Rows schreiben (status=pending)
  6. KI-Mapping pro Chunk:
     - Bedrock-Call: "Welche Template-Frage passt zu diesem Text-Chunk?"
     - mapping_suggestion JSONB schreiben (status=suggested)
  7. evidence_file.extraction_status = 'extracted'
```

Bestaetigung durch Kunden: Server Action akzeptiert/lehnt Mappings ab. Bestaetigte Mappings werden in `capture_session.answers` gemerged (neuer Key-Prefix `evidence.{blockKey}.{questionId}` damit Original-Antworten erhalten bleiben).

### Whisper-Integration (FEAT-015)

#### Adapter-Pattern (DEC-018)

```
/src/lib/ai/whisper/
  provider.ts          — WhisperProvider Interface
  local.ts             — Self-hosted Whisper (HTTP POST to whisper:9000)
  azure.ts             — Azure Speech EU (Fallback/Spaeter)
  factory.ts           — Factory: liest WHISPER_PROVIDER ENV
  index.ts             — Re-Export
```

Interface:
```typescript
interface WhisperProvider {
  transcribe(audioBuffer: Buffer, options?: {
    language?: string;
    format?: 'verbose_json' | 'json' | 'text';
  }): Promise<{ text: string; duration_ms: number }>;
}
```

ENV-Konfiguration:
```bash
WHISPER_PROVIDER=local               # local | azure
WHISPER_URL=http://whisper:9000      # Nur fuer local
WHISPER_MODEL=medium                 # large-v3 | medium | small
AZURE_SPEECH_KEY=                    # Nur fuer azure
AZURE_SPEECH_REGION=westeurope       # Nur fuer azure
```

#### Transkriptions-Endpoint

```
POST /api/capture/[sessionId]/transcribe
  - Auth: Session-Owner (RLS)
  - Request: multipart/form-data { audio: Blob }
  - Response: { text: string, duration_ms: number }
  - Audio wird nach Transkription NICHT persistiert (DSGVO)
```

#### RAM-Budget Whisper

Whisper-Modell-Groessen auf CPX62 (16 GB RAM):

| Modell | RAM | Qualitaet | Empfehlung |
|--------|-----|-----------|------------|
| large-v3 | ~3-4 GB | Beste | Nur mit Server-Upgrade auf CPX72 (32 GB) |
| medium | ~2 GB | Gut, fuer Deutsch ausreichend | **Default fuer V2** |
| small | ~1 GB | Akzeptabel | Fallback bei RAM-Druck |

Empfehlung: Start mit `medium` (WHISPER_MODEL=medium in ENV). Monitoring des Server-RAM nach Deploy. Upgrade auf CPX72 + large-v3 wenn Qualitaet nicht reicht oder weitere Services dazukommen.

### Supabase Storage Bucket (FEAT-013)

Neuer Bucket `evidence` mit RLS:
- Tenant-Isolation: Pfad-Pattern `{tenant_id}/{session_id}/{filename}`
- Upload-Limit: 20 MB pro Datei, 100 MB pro Bulk-Upload (serverseitig validiert)
- Accepted MIME-Types: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`, `text/csv`, `application/zip`
- Bucket-Policy: INSERT fuer tenant_admin/member, SELECT fuer tenant + strategaize_admin

Bucket wird per Migration als SQL erstellt:
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('evidence', 'evidence', false, 20971520, 
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
        'text/plain', 'text/csv', 'application/zip']);
```

### Neue Dependencies V2

| Dependency | Zweck | Wo |
|-----------|-------|-----|
| `pdf-parse` | PDF-Text-Extraktion | Worker |
| `mammoth` | DOCX → Text | Worker |
| `node:zlib` | ZIP-Entpacken | Worker (bereits in Node.js) |

Keine neuen externen Services. Keine neuen Cloud-Provider.

### Kosten-Erweiterung V2

Bestehender `ai_cost_ledger` wird fuer alle neuen Bedrock-Calls genutzt. Neues Feld `feature` fuer Kosten-Zuordnung:

```sql
ALTER TABLE ai_cost_ledger ADD COLUMN feature text DEFAULT 'condensation';
-- Values: condensation, orchestrator, sop, evidence_mapping, backspelling, chat, embedding
```

Geschaetzte Kosten pro Session (9 Blocks, alle Features aktiv):
| Feature | Calls | Kosten |
|---------|-------|--------|
| A+C Loop (V1) | ~36-144 | $0.90-$3.60 |
| Orchestrator | ~9-18 | $0.45-$1.35 |
| Backspelling Re-Condensation (max 2 Runden) | ~0-72 | $0-$3.60 |
| SOP Generation (on-demand) | ~9 | $0.45-$0.90 |
| Evidence Mapping (10 Docs) | ~50-200 | $0.50-$2.00 |
| **Gesamt pro Session** | | **$2.30-$11.45** |

Fuer B2B-SaaS mit Beratungs-Hintergrund akzeptabel (Vergleich: 1h Berater-Zeit = €200+).

### Security / Privacy V2

Alle V1-Regeln gelten weiter. Zusaetzlich:

- **Evidence-Dateien:** Tenant-isoliert in Supabase Storage. Kein Cross-Tenant-Zugriff. Dateien werden nach Extraktion NICHT geloescht (Audit-Trail). Loeschung per Retention-Policy spaeter (V3).
- **Audio-Daten:** Werden nach Whisper-Transkription sofort verworfen. Kein persistentes Audio in V2.
- **Gap-Questions:** Enthalten potenziell Business-sensitiven Kontext. RLS-geschuetzt wie alle anderen tenant-scoped Tabellen.
- **SOP-Content:** Enthaelt operative Handlungsplaene. Gleiche Schutzstufe wie Knowledge Units.

### Constraints und Tradeoffs V2

#### Constraint — Worker als einziger Job-Processor (DEC-017)
Alle neuen Job-Types laufen im selben Worker-Container.
**Tradeoff:** Ein langer Evidence-Extraction-Job blockiert kurzzeitig andere Jobs. Akzeptabel in V2 (Volumen gering). Horizontale Worker-Skalierung (SKIP LOCKED) ist trivial, falls noetig.

#### Constraint — Whisper Medium statt Large (RAM-Budget)
CPX62 hat 16 GB RAM. Medium-Modell spart ~1-2 GB.
**Tradeoff:** Leicht geringere Transkriptions-Qualitaet bei Akzent/Dialekt. Fuer Deutsch-Geschaeftskontexte ausreichend. Upgrade-Pfad klar (ENV-Aenderung + Server-Upgrade).

#### Constraint — Max 2 Backspelling-Runden
Nach 2 Runden werden verbleibende Gaps als Meeting-Agenda markiert.
**Tradeoff:** Nicht alle Gaps werden automatisch geschlossen. Akzeptiert, weil unendliches Backspelling den Kunden frustriert und das Meeting-Review (DEC-004) als Auffangnetz dient.

#### Constraint — Evidence OCR nicht in V2
Bild-PDFs (Scans) werden nicht via OCR extrahiert.
**Tradeoff:** Nur Text-PDFs und DOCX liefern Ergebnisse. Scans zeigen eine Warnung. OCR (Tesseract) kommt in V2.1 wenn Bedarf.

### Open Technical Questions V2

- **Q12 — Orchestrator-Prompt-Qualitaet:** Wie gut erkennt Claude Sonnet Wissensluecken in einem Meta-Assessment? Muss in den ersten Slices empirisch getestet und prompt-optimiert werden.
- **Q13 — Evidence-Chunk-Groesse fuer Mapping:** Optimale Chunk-Groesse fuer KI-Mapping auf Template-Fragen. Start mit 500-800 Tokens, empirisch anpassen.
- **Q14 — Backspelling-UX:** Nachfragen als eigene Sektion im Questionnaire oder als eigener Tab? Entscheidung in /frontend.
- **Q15 — SOP-Format-Iteration:** SOP-Struktur muss template-spezifisch tuned werden. V2 startet mit generischem JSON-Format, Iteration nach erstem Kunden-Feedback.

### Empfohlene Slice-Reihenfolge V2

1. **SLC-013: Orchestrator-Integration** — Orchestrator-Prompt + quality_report auf block_checkpoint + ai_cost_ledger feature-Spalte (FEAT-010 Kern)
2. **SLC-014: Gap-Question-Schema + Backspelling-Backend** — gap_question-Tabelle + RLS + Orchestrator→Gap-Generierung + recondense_with_gaps Job-Type (FEAT-010+011 Backend)
3. **SLC-015: Backspelling-UI** — Nachfragen-Sektion im Questionnaire + Dashboard-Badge + Re-Submit-Flow (FEAT-011 Frontend)
4. **SLC-016: SOP-Schema + Generation** — sop-Tabelle + sop_generation Job-Type + template.sop_prompt (FEAT-012 Backend)
5. **SLC-017: SOP-UI** — SOP-Anzeige/Edit im Debrief + JSON-Export (FEAT-012 Frontend)
6. **SLC-018: Evidence-Schema + Storage** — evidence_file + evidence_chunk Tabellen + Supabase Storage Bucket + Upload-API (FEAT-013 Infra)
7. **SLC-019: Evidence-Extraction + Mapping** — Worker evidence_extraction Job-Type + pdf-parse + mammoth + KI-Mapping (FEAT-013 Backend)
8. **SLC-020: Evidence-UI** — Upload-UI + Mapping-Review + Integration in Block-Submit (FEAT-013 Frontend)
9. **SLC-021: Template-Erweiterung + Demo-Template** — Template-Schema (sop_prompt, owner_fields) + Demo-Template + Switcher-UI (FEAT-014)
10. **SLC-022: Whisper-Adapter + Voice-Input** — Whisper-Provider-Pattern + Transcribe-Endpoint + Mic-Button reaktivieren (FEAT-015)

### Naechster Schritt V2

`/slice-planning` mit 10 Slices.

---

## FEAT-016 Architecture Addendum — Template-driven Diagnosis Layer

### Status
FEAT-016-Architektur festgelegt am 2026-04-19. Baut auf V2-Stack auf (SLC-013..017 stabil).

### Architektur-Zusammenfassung FEAT-016

FEAT-016 fuegt dem bestehenden Stack eine **strukturierte Analyse-Praesentation** zwischen Knowledge-Unit-Verdichtung und SOP-Generierung hinzu. Der Diagnose-Layer beantwortet drei Fragen pro Unterthema, bevor SOPs generiert werden:

1. **"Wie ist der Ist-Zustand?"** (Ist-Situation, Belege)
2. **"Wie reif/riskant ist es?"** (Ampel, Reifegrad, Risiko, Hebel)
3. **"Was hat strategische Prioritaet?"** (Relevanz, Empfehlung, Owner, Zielbild)

Kein neuer Docker-Service. Kein neues externes Dependency. Diagnose folgt dem SOP-Pattern exakt (on-demand, Worker-Job, RPC-Persistierung, Debrief-UI-Integration).

### Position im Pipeline-Flow

```
Block-Submit
    ↓
A+C Loop (Verdichtung)
    ↓
Knowledge Units
    ↓
Orchestrator Assessment
    ↓
Gap-Questions / Backspelling (falls noetig)
    ↓
━━━ Diagnose-Layer (FEAT-016, on-demand) ━━━
    ↓
Diagnosis confirmed?
    ├── Nein → SOP-Button gesperrt, Hinweis
    └── Ja → SOP-Generierung freigeschaltet
    ↓
SOP (FEAT-012, on-demand)
```

### Service-Topologie FEAT-016

Keine neuen Docker-Services. Aenderungen an bestehenden:

| Service | FEAT-016-Aenderung |
|---------|-------------------|
| `app` | Neue Server Actions (diagnosis-actions.ts), Diagnose-UI-Komponenten im Debrief, SOP-Gate-Logik |
| `worker` | Neuer Job-Type `diagnosis_generation`, Handler + Prompt-Builder |
| Alle anderen | Unveraendert |

### Neue Tabelle: `block_diagnosis`

Folgt dem `sop`-Tabellen-Pattern exakt. Speichert die KI-generierte Diagnose pro Block.

```sql
CREATE TABLE block_diagnosis (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  capture_session_id    uuid        NOT NULL REFERENCES capture_session ON DELETE CASCADE,
  block_key             text        NOT NULL,
  block_checkpoint_id   uuid        NOT NULL REFERENCES block_checkpoint ON DELETE CASCADE,
  content               jsonb       NOT NULL,
  status                text        NOT NULL DEFAULT 'draft'
                                    CHECK (status IN ('draft', 'reviewed', 'confirmed')),
  generated_by_model    text        NOT NULL,
  cost_usd              numeric(10,6),
  created_by            uuid        REFERENCES auth.users,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_block_diagnosis_session_block ON block_diagnosis(capture_session_id, block_key);
CREATE INDEX idx_block_diagnosis_checkpoint ON block_diagnosis(block_checkpoint_id);
```

RLS: `strategaize_admin` Full (Cross-Tenant), `tenant_admin` Read eigener Tenant. Analog zu `sop`.

### Template-Erweiterung: 2 neue JSONB-Spalten

```sql
ALTER TABLE template
  ADD COLUMN diagnosis_schema  jsonb DEFAULT NULL,
  ADD COLUMN diagnosis_prompt  jsonb DEFAULT NULL;
```

#### `diagnosis_schema` — Template-spezifische Diagnose-Struktur

Definiert pro Block die Unterthemen (Subtopics) und die Bewertungsfelder (Fields), die pro Unterthema generiert werden sollen. Jedes Template kann voellig andere Bewertungsfelder definieren.

```json
{
  "blocks": {
    "A": {
      "subtopics": [
        {
          "key": "kernlogik",
          "name": "Kernlogik Geschaeftsmodell",
          "question_keys": ["A1", "A2"]
        },
        {
          "key": "marktposition",
          "name": "Marktposition & Wettbewerb",
          "question_keys": ["A3", "A4", "A5"]
        }
      ]
    }
  },
  "fields": [
    { "key": "ist_situation", "label": "Beschreibung Ist-Situation", "type": "text" },
    { "key": "ampel", "label": "Ampel", "type": "enum", "options": ["green", "yellow", "red"] },
    { "key": "reifegrad", "label": "Reifegrad", "type": "number", "min": 0, "max": 10 },
    { "key": "risiko", "label": "Risiko", "type": "number", "min": 0, "max": 10 },
    { "key": "hebel", "label": "Hebel", "type": "number", "min": 0, "max": 10 },
    { "key": "relevanz_90d", "label": "90-Tage-Relevanz", "type": "enum", "options": ["high", "medium", "low"] },
    { "key": "empfehlung", "label": "Empfehlung / Massnahme", "type": "text" },
    { "key": "belege", "label": "Belege / Zitate / Quelle", "type": "text" },
    { "key": "owner", "label": "Owner (Intern)", "type": "text" },
    { "key": "aufwand", "label": "Aufwand", "type": "enum", "options": ["S", "M", "L"] },
    { "key": "naechster_schritt", "label": "Naechster Schritt", "type": "text" },
    { "key": "abhaengigkeiten", "label": "Abhaengigkeiten/Blocker", "type": "text" },
    { "key": "zielbild", "label": "Zielbild (DOD)", "type": "text" }
  ]
}
```

**Subtopic-Granularitaet (Q12-Entscheidung):** Thematisch gruppiert (2-3 Fragen pro Subtopic), nicht 1:1 mit Fragen. Die Diagnose arbeitet auf Themenebene, nicht auf Fragenebene. `question_keys` ordnet Subtopics den relevanten Template-Fragen zu, damit der KI-Prompt die zugehoerigen KUs filtern kann.

#### `diagnosis_prompt` — Template-spezifischer System-Prompt

Analog zu `sop_prompt`. Definiert Rolle, Analysefokus und Qualitaetskriterien fuer die KI-Diagnose. Jedes Template kann eigene Diagnose-Perspektiven definieren.

```json
{
  "system_prompt": "Du bist ein erfahrener M&A-Berater und strategischer Analyst...",
  "output_instructions": "Antworte IMMER mit einem JSON-Objekt...",
  "field_instructions": {
    "ist_situation": "Beschreibe den aktuellen Zustand basierend auf den Knowledge Units...",
    "ampel": "Bewerte: green = solide, yellow = Handlungsbedarf, red = kritisch...",
    "reifegrad": "0 = nicht vorhanden, 10 = Best Practice..."
  }
}
```

### Diagnosis Content (gespeichert in block_diagnosis.content)

```json
{
  "block_key": "A",
  "block_title": "Geschaeftsmodell & Markt",
  "subtopics": [
    {
      "key": "kernlogik",
      "name": "Kernlogik Geschaeftsmodell",
      "fields": {
        "ist_situation": "Das Geschaeftsmodell basiert auf...",
        "ampel": "yellow",
        "reifegrad": 6,
        "risiko": 4,
        "hebel": 7,
        "relevanz_90d": "high",
        "empfehlung": "Kernleistung schaerfen...",
        "belege": "Antwort A1: '...'",
        "owner": "",
        "aufwand": "M",
        "naechster_schritt": "",
        "abhaengigkeiten": "",
        "zielbild": ""
      }
    }
  ]
}
```

Leere Felder sind explizit erlaubt — der Mensch fuellt sie im Meeting (R12).

### Worker-Erweiterung: Job-Type `diagnosis_generation`

#### Handler-Architektur

```
src/workers/diagnosis/
  handle-diagnosis-job.ts   — Job-Handler (analog handle-sop-job.ts)
  diagnosis-prompt.ts       — Prompt-Builder (System + User)
  types.ts                  — TypeScript Interfaces (DiagnosisContent, DiagnosisSubtopic)
```

#### Handler-Flow

```typescript
export async function handleDiagnosisJob(job: ClaimedJob): Promise<void> {
  // 1. Load block_checkpoint by payload.block_checkpoint_id
  // 2. Load Knowledge Units for this checkpoint (status IN proposed/accepted/edited)
  // 3. Load template (diagnosis_schema + diagnosis_prompt)
  // 4. Build system prompt from diagnosis_prompt config
  // 5. Build user prompt with: KUs, subtopic definitions, quality_report
  // 6. chatWithLLM() — temperature 0.3, maxTokens 8192
  // 7. Parse JSON output, validate against diagnosis_schema fields
  // 8. rpc_create_diagnosis() — persist result
  // 9. Log costs to ai_cost_ledger (feature='diagnosis')
  // 10. rpc_complete_ai_job()
}
```

#### Claim-Loop-Integration

```typescript
// claim-loop.ts — erweitert um diagnosis-Handler
const JOB_TYPES = [
  'knowledge_unit_condensation',
  'recondense_with_gaps',
  'sop_generation',
  'diagnosis_generation'   // NEU
];
```

```typescript
// run.ts — erweitert
import { handleDiagnosisJob } from "../diagnosis/handle-diagnosis-job";
await startClaimLoop(
  handleCondensationJob,
  handleRecondenseJob,
  handleSopJob,
  handleDiagnosisJob  // NEU
);
```

#### Prompt-Strategie

**System-Prompt** (aus template.diagnosis_prompt):
- Rolle: M&A-Berater / strategischer Analyst (template-spezifisch)
- Aufgabe: Analyse der Knowledge Units pro Unterthema
- Output-Format: JSON matching diagnosis_schema-Struktur
- Feld-Instruktionen: Was jedes Assessment-Feld enthalten soll
- Qualitaetskriterien: evidenzbasiert, KU-Quellen zitieren, realistische Bewertungen

**User-Prompt:**
- Block-Kontext (key, title)
- Subtopic-Definitionen aus diagnosis_schema
- Alle Knowledge Units des Blocks (title, body, type, confidence, status)
- Quality-Report vom Orchestrator (falls vorhanden)
- Instruktion: pro Subtopic alle definierten Felder ausfuellen

**LLM-Parameter:**
- Temperature: 0.3 (niedriger als SOP 0.4 — Diagnose soll analytisch/faktisch sein)
- Max Tokens: 8192 (Diagnose ist umfangreicher als SOP — 13 Felder × N Subtopics)
- Modell: Bedrock Claude Sonnet (identisch zu SOP)

### RPCs

#### `rpc_create_diagnosis`

```sql
CREATE OR REPLACE FUNCTION rpc_create_diagnosis(
  p_session_id       uuid,
  p_block_key        text,
  p_checkpoint_id    uuid,
  p_content          jsonb,
  p_model            text,
  p_cost             numeric,
  p_created_by       uuid
) RETURNS jsonb AS $$
  -- Ermittelt tenant_id aus capture_session
  -- INSERT block_diagnosis
  -- RETURN { diagnosis_id: uuid }
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### `rpc_update_diagnosis`

```sql
CREATE OR REPLACE FUNCTION rpc_update_diagnosis(
  p_diagnosis_id     uuid,
  p_content          jsonb
) RETURNS void AS $$
  -- Prueft strategaize_admin-Rolle
  -- UPDATE block_diagnosis SET content = p_content, updated_at = now()
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### `rpc_confirm_diagnosis`

```sql
CREATE OR REPLACE FUNCTION rpc_confirm_diagnosis(
  p_diagnosis_id     uuid
) RETURNS void AS $$
  -- Prueft strategaize_admin-Rolle
  -- UPDATE block_diagnosis SET status = 'confirmed', updated_at = now()
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

Alle RPCs: `GRANT EXECUTE TO authenticated` (Rollencheck intern via `auth.user_role()`).

### UI-Architektur im Debrief

#### Layout-Position

```
Debrief Page /admin/debrief/[sessionId]/[blockKey]
  ┌─────────────────────────────────────┐
  │  Block Header                       │
  ├─────────────────────────────────────┤
  │  Knowledge Units (bestehend)        │
  │  Gap Questions (bestehend)          │
  ├─────────────────────────────────────┤
  │  ▼ Diagnose-Sektion (NEU)           │  ← FEAT-016
  │    [Diagnose generieren] Button     │
  │    Tabelle/Karten pro Subtopic      │
  │    Ampel-Visualisierung (Farben)    │
  │    Inline-Editing aller Felder      │
  │    [Diagnose bestaetigen] Button    │
  │    [JSON Export] Button             │
  ├─────────────────────────────────────┤
  │  ▼ SOP-Sektion (bestehend, GATED)  │  ← SOP-Gate
  │    Hinweis: "Erst Diagnose          │
  │    bestaetigen" ODER SOP-Buttons    │
  └─────────────────────────────────────┘
```

#### Neue Komponenten

| Komponente | Verantwortung |
|-----------|--------------|
| `DiagnosisGenerateButton.tsx` | Trigger-Button, enqueued ai_job, pollt fetchDiagnosis alle 3s |
| `DiagnosisView.tsx` | Strukturierte Anzeige: Tabelle/Karten pro Subtopic, Ampel-Farben |
| `DiagnosisEditor.tsx` | Inline-Editing aller Felder, Save via updateDiagnosisContent |
| `DiagnosisConfirmButton.tsx` | Bestaetigt Diagnose (status → confirmed), zeigt Bestaetigt-State |
| `DiagnosisExportButton.tsx` | JSON-Download der Diagnose-Daten |

#### Server Actions

```typescript
// diagnosis-actions.ts (analog sop-actions.ts)
export async function triggerDiagnosisGeneration(sessionId, blockKey, checkpointId)
export async function fetchDiagnosis(sessionId, blockKey)
export async function updateDiagnosisContent(diagnosisId, content)
export async function confirmDiagnosis(diagnosisId)
```

Auth-Check: Nur `strategaize_admin` kann generieren, editieren, bestaetigen. `tenant_admin` kann lesen (eigener Tenant via RLS).

#### Polling-Pattern

Identisch zu SOP: `DiagnosisGenerateButton` pollt `fetchDiagnosis()` alle 3 Sekunden bis ein Result in der DB erscheint. Kein WebSocket, kein Realtime — konsistent mit bestehendem Pattern.

### SOP-Gate-Mechanismus

Einfacher Status-Check, kein separater Mechanismus (DEC-024):

```typescript
// Im Debrief Page Server Component:
const diagnosis = await fetchDiagnosis(sessionId, blockKey);
const diagnosisConfirmed = diagnosis?.status === 'confirmed';

// SOP-Sektion:
{diagnosisConfirmed ? (
  <SopSection ... />
) : (
  <Alert>Erst Diagnose bestaetigen, bevor SOPs generiert werden koennen.</Alert>
)}
```

Bestehender SOP-Code bleibt unveraendert. Nur die Button-Sichtbarkeit wird durch eine Bedingung gesteuert.

### Kosten-Schaetzung

| Operation | Input-Tokens | Output-Tokens | Kosten/Block | Kosten/Session (9 Blocks) |
|-----------|-------------|--------------|-------------|--------------------------|
| Diagnosis Generation | ~3.000-5.000 | ~2.000-4.000 | ~$0.03-$0.10 | ~$0.27-$0.90 |

Gesamtkosten pro Session (alle Features):
- Bisherig (V2): $2.30-$11.45
- Mit Diagnose: **$2.57-$12.35**

Fuer B2B-SaaS mit Beratungs-Hintergrund weiterhin akzeptabel.

### Migrationen (geplant)

3 neue Migrationen:

| Nr. | Datei | Inhalt |
|-----|-------|--------|
| 050 | `050_block_diagnosis.sql` | block_diagnosis-Tabelle + RLS + Indexes + GRANTs + updated_at-Trigger |
| 051 | `051_template_diagnosis_fields.sql` | ALTER template ADD diagnosis_schema + diagnosis_prompt, UPDATE exit_readiness mit initialem Schema + Prompt |
| 052 | `052_rpc_diagnosis.sql` | rpc_create_diagnosis + rpc_update_diagnosis + rpc_confirm_diagnosis |

### Security / Privacy FEAT-016

Alle V1/V2-Regeln gelten weiter. Zusaetzlich:

- **Diagnose-Content:** Enthaelt analytische Bewertungen ueber Unternehmensdaten. Gleiche Schutzstufe wie Knowledge Units und SOPs.
- **RLS:** block_diagnosis ist tenant-isoliert. strategaize_admin Cross-Tenant fuer Beratungsarbeit.
- **Diagnose-Prompt:** Enthaelt keine Kundendaten — nur Template-spezifische Instruktionen. Wird in template-Tabelle gespeichert (system-weit, nicht tenant-scoped).
- **Export:** JSON-Export enthaelt potenziell sensitive Unternehmensbewertungen. Download nur fuer strategaize_admin (UI-seitig, nicht API-geschuetzt in V2 — API-Level Export-Auth in V3).

### Constraints und Tradeoffs FEAT-016

#### Constraint — Diagnose ist on-demand (DEC-022)
Admin kontrolliert, wann Diagnose generiert wird. Keine automatische Generierung nach Verdichtung.
**Tradeoff:** Admin muss aktiv den Button klicken. Vorteil: Kosten-Kontrolle, Timing-Kontrolle (Diagnose erst nach KU-Review sinnvoll).

#### Constraint — Diagnose-Schema auf Template-Tabelle (DEC-023)
Keine separate `diagnosis_template`-Tabelle. Schema + Prompt als JSONB-Spalten am bestehenden `template`.
**Tradeoff:** Template-Tabelle waechst (jetzt 5 JSONB-Spalten: blocks, sop_prompt, owner_fields, diagnosis_schema, diagnosis_prompt). Akzeptabel — wenige Templates (<10 in V2), keine Performance-Relevanz.

#### Constraint — SOP-Gate ist reiner Status-Check (DEC-024)
Kein Event-System, kein Trigger, kein separater Gate-Mechanismus.
**Tradeoff:** Gate ist UI-seitig — ein API-Caller koennte theoretisch SOP ohne Diagnose-Bestaetigung triggern. Fuer V2 akzeptabel (nur strategaize_admin hat Zugriff). API-Level Gate in V3 moeglich ueber CHECK in rpc_create_sop.

#### Constraint — 13 Felder pro Subtopic im Prompt
Ein einzelner LLM-Call soll 13 Bewertungsfelder pro Subtopic fuellen. Bei 5-8 Subtopics pro Block sind das 65-104 Felder.
**Tradeoff:** Prompt-Komplexitaet ist hoch. Mitigation: field_instructions im diagnosis_prompt geben dem LLM klare Feld-Definitionen. Leere Felder sind explizit erlaubt (R12). Iterative Prompt-Verbesserung nach erstem Template (R11).

### Open Technical Questions FEAT-016

- **Q12 (beantwortet):** Subtopic-Granularitaet → thematisch gruppiert (2-3 Fragen pro Subtopic)
- **Q13 (offen):** Meeting-Export-Format → JSON ist V2. Print-CSS als Quick-Win fuer druckbare Tabellen-Ansicht evaluieren in /frontend
- **Q16 — Diagnose-Re-Generierung:** Was passiert, wenn der Admin die Diagnose nochmal generiert? V2: Ueberschreibt die bestehende block_diagnosis-Row (kein Versioning). V2.1: Optional Versioning.
- **Q17 — Diagnose nach Backspelling:** Soll eine bestehende Diagnose invalidiert werden, wenn nach der Diagnose nochmal Backspelling laeuft? V2: Manuell (Admin entscheidet). Automatische Invalidierung in V3.

### Empfohlene Slice-Reihenfolge FEAT-016

1. **Diagnose-Backend:** block_diagnosis-Tabelle + RPCs + Template-Erweiterung + Worker diagnosis_generation + Exit-Readiness diagnosis_schema Seed
2. **Diagnose-Frontend:** Diagnose-UI im Debrief (Generate, View, Edit, Confirm, Export) + SOP-Gate + i18n

2 Slices. Backend-first, weil Frontend auf RPCs und Worker-Output aufsetzt.

### Naechster Schritt FEAT-016

`/slice-planning` fuer FEAT-016 (2 Slices mit Micro-Tasks).

---

## V3 Architecture Addendum — Dialogue-Mode

### Status
V3-Architektur festgelegt am 2026-04-21. Baut auf V2-Stack (stabil, released) auf.

### Architektur-Zusammenfassung V3

V3 fuegt dem bestehenden Stack eine **Video-Meeting-Infrastruktur** (Jitsi+Jibri) und eine **Post-Meeting-KI-Pipeline** hinzu. Die Kernprinzipien:

1. **Eigene Jitsi-Instanz** — 5 neue Docker-Services auf dem Onboarding-Server (159.69.207.29). Kein Shared-Infra mit Business System (DEC-025). Vollstaendige Unabhaengigkeit.
2. **Post-Meeting statt Live-KI** — V3 verarbeitet Recordings nach Meeting-Ende. Keine Echtzeit-Transkription, keine Live-Zusammenfassung. Haelt die Komplexitaet beherrschbar.
3. **Dialogue als gleichwertiger Capture-Mode** — `capture_mode='dialogue'` neben `questionnaire` und `evidence`. KUs aus Gespraechen fliessen in dieselbe Pipeline (Diagnose, SOP, Debrief).
4. **Meeting Guide Basic** — Basismässige Meeting-Vorbereitung in der Plattform. Volle KI-Vorbereitung nur mit Intelligence Platform (bewusster Produkt-Split).

### Architektur-Entscheidungen (Q12-Q16 beantwortet)

**Q12 → DEC-026: Keine Speaker Diarization in V3.**
Undifferenziertes Transkript reicht fuer V3. KI-Processing mappt Inhalte auf Meeting-Guide-Themen, nicht auf Sprecher. Diarization (pyannote/NeMo) wuerde GPU oder signifikante CPU erfordern plus eine neue Dependency. V3.1-Enhancement.

**Q13 → DEC-027: Beide Teilnehmer brauchen Plattform-Accounts.**
JWT-Auth fuer Jitsi erfordert User-Identitaet. RLS braucht Tenant-Zuordnung. Mindest-Rolle: `tenant_member`. Guest-Link-Mode (temporaerer JWT ohne Account) ist V3.1. Pragmatisch: Auftraggeber legt zweiten User als tenant_member an.

**Q14 → Meeting Guide Basic:**
Manuelles Erstellen von Themen + Leitfragen + Zielen. Ein Button "Vorschlaege generieren" nutzt Template-Bloecke/-Fragen als Kontext. Wenn die Session bereits Questionnaire-Antworten hat, werden diese als zusaetzlicher Kontext genutzt. Keine Analyse bestehender KUs, keine luecken-basierte Fragen — das ist Intelligence Platform Scope.

**Q15 → DEC-028: Recording-Storage via Supabase Storage.**
Jibri schreibt MP4 in Docker-Volume. Ein Finalize-Script verschiebt die Datei in Supabase Storage Bucket `recordings` (tenant-isoliert, analog Evidence-Pattern). Worker laedt fuer Verarbeitung aus Storage herunter. Vorteile: Tenant-Isolation, API-Zugriff, Retention-Management, konsistent mit Evidence.

**Q16 → DEC-029: Volles Transkript persistent gespeichert.**
Auf `dialogue_session.transcript`. Gruende: Audit-Relevant (DSGVO-Nachweis was verarbeitet wurde), Re-Processing bei besseren Modellen, Cross-Meeting-Analyse in V3.1+, Quellen-Verifikation fuer Knowledge Units.

### Service-Topologie V3

5 neue Docker-Services (Jitsi-Stack), alle anderen unveraendert oder erweitert:

| Service | V3-Aenderung | Neu/Erweitert |
|---------|-------------|---------------|
| `jitsi-web` | Jitsi Frontend, Traefik-exposed | **Neu** |
| `jitsi-prosody` | XMPP-Hub mit Netzwerk-Aliases | **Neu** |
| `jitsi-jicofo` | Konferenz-Fokus | **Neu** |
| `jitsi-jvb` | Video-Bridge, UDP/10000 | **Neu** |
| `jitsi-jibri` | Recording, shm_size: 2gb, /dev/snd | **Neu** |
| `app` | Meeting-Guide-UI, Dialogue-Session-UI, JWT-Generator, Meeting-Summary-View, Jitsi-IFrame-Embed | Erweitert |
| `worker` | 2 neue Job-Types: dialogue_transcription, dialogue_extraction | Erweitert |
| `supabase-storage` | Neuer Bucket `recordings` (tenant-isoliert) | Erweitert |
| `whisper` | Verarbeitet jetzt auch Meeting-MP4-Audio (laengere Dateien als Diktat) | Erweitert |
| Alle anderen | Unveraendert | — |

### Docker-Compose Jitsi-Block

Referenz: Dev System Rule `.claude/rules/jitsi-jibri-deployment.md` (7 dokumentierte Blocker). Business System `docker-compose.yml` (Commits d0e6a9a..b01d3f2) als Template.

```yaml
# Jitsi-Services im bestehenden Docker-Compose
jitsi-web:
  image: jitsi/web:stable-9258
  labels:
    - "traefik.http.services.jitsi-web-svc.loadbalancer.server.port=80"
    - "traefik.http.routers.https-0-<coolify-uuid>-jitsi-web.service=jitsi-web-svc"
    - "traefik.http.routers.http-0-<coolify-uuid>-jitsi-web.service=jitsi-web-svc"
    - "traefik.docker.network=<coolify-uuid>"
  environment:
    - ENABLE_AUTH=1
    - AUTH_TYPE=jwt
    - JWT_APP_ID=${JITSI_JWT_APP_ID}
    - JWT_APP_SECRET=${JITSI_JWT_APP_SECRET}
    - ENABLE_RECORDING=1  # Alle 3 Services brauchen das!
  volumes:
    - jitsi-web-config:/config
  networks:
    - <coolify-network>
    - jitsi-net

jitsi-prosody:
  image: jitsi/prosody:stable-9258
  environment:
    - ENABLE_AUTH=1
    - AUTH_TYPE=jwt
    - JWT_APP_ID=${JITSI_JWT_APP_ID}
    - JWT_APP_SECRET=${JITSI_JWT_APP_SECRET}
    - ENABLE_RECORDING=1
    - JICOFO_AUTH_PASSWORD=${JITSI_JICOFO_AUTH_PASSWORD}
    - JIBRI_RECORDER_PASSWORD=${JITSI_JIBRI_RECORDER_PASSWORD}
    - JIBRI_XMPP_PASSWORD=${JITSI_JIBRI_XMPP_PASSWORD}
    - JVB_AUTH_PASSWORD=${JITSI_JVB_AUTH_PASSWORD}
  networks:
    jitsi-net:
      aliases:
        - meet.jitsi
        - auth.meet.jitsi
        - muc.meet.jitsi
        - internal-muc.meet.jitsi
        - recorder.meet.jitsi
        - guest.meet.jitsi

jitsi-jicofo:
  image: jitsi/jicofo:stable-9258
  environment:
    - ENABLE_RECORDING=1  # Sonst: "No Jibri detector configured"
    - JICOFO_AUTH_PASSWORD=${JITSI_JICOFO_AUTH_PASSWORD}
    - JICOFO_COMPONENT_SECRET=${JITSI_JICOFO_COMPONENT_SECRET}
  networks:
    - jitsi-net

jitsi-jvb:
  image: jitsi/jvb:stable-9258
  ports:
    - "10000:10000/udp"
  environment:
    - JVB_AUTH_PASSWORD=${JITSI_JVB_AUTH_PASSWORD}
  networks:
    - jitsi-net

jitsi-jibri:
  image: jitsi/jibri:stable-9258
  shm_size: 2gb
  cap_add: [SYS_ADMIN]
  devices:
    - /dev/snd:/dev/snd
  environment:
    - JIBRI_RECORDER_PASSWORD=${JITSI_JIBRI_RECORDER_PASSWORD}
    - JIBRI_XMPP_PASSWORD=${JITSI_JIBRI_XMPP_PASSWORD}
    - PUBLIC_URL=https://meet.onboarding-domain.com  # NICHT weglassen!
    - JIBRI_FINALIZE_RECORDING_SCRIPT_PATH=/scripts/finalize.sh
  volumes:
    - jitsi-recordings:/recordings
    - ./scripts/jibri-finalize.sh:/scripts/finalize.sh:ro
  networks:
    - jitsi-net

networks:
  jitsi-net:
    driver: bridge

volumes:
  jitsi-web-config:
  jitsi-recordings:
```

### Host-Level-Setup (einmalig am Server)

```bash
# snd-aloop Kernel-Modul (Jibri braucht ALSA-Loopback)
apt-get install -y linux-modules-extra-$(uname -r)
modprobe snd_aloop
echo 'snd-aloop' > /etc/modules-load.d/snd-aloop.conf

# Hetzner Cloud Firewall: UDP/10000 eingehend oeffnen
# DNS: A-Record meet.<domain> → 159.69.207.29
```

### Jibri Finalize-Script (Recording → Storage)

Jibri ruft nach jeder Aufzeichnung ein Finalize-Script auf. Dieses verschiebt die MP4-Datei in Supabase Storage:

```bash
#!/bin/bash
# scripts/jibri-finalize.sh
# Wird von Jibri aufgerufen mit $1 = Recording-Verzeichnis
RECORDING_DIR="$1"
MP4_FILE=$(find "$RECORDING_DIR" -name "*.mp4" | head -1)

if [ -z "$MP4_FILE" ]; then
  echo "No MP4 found in $RECORDING_DIR" >&2
  exit 0
fi

# Room-Name aus Verzeichnisname extrahieren (Jibri-Konvention)
ROOM_NAME=$(basename "$RECORDING_DIR")

# Webhook an App: "Recording fertig, bitte verarbeiten"
curl -s -X POST "http://app:3000/api/dialogue/recording-ready" \
  -H "Authorization: Bearer ${RECORDING_WEBHOOK_SECRET}" \
  -H "Content-Type: application/json" \
  -d "{\"room_name\": \"$ROOM_NAME\", \"file_path\": \"$MP4_FILE\"}"
```

App-API-Route empfaengt den Webhook, uploaded die Datei in Supabase Storage (Bucket `recordings`, Pfad `{tenant_id}/{dialogue_session_id}/{filename}`) und enqueued den `dialogue_transcription` Job.

### Neue Tabellen V3

#### `meeting_guide` (DEC-030)

```sql
CREATE TABLE meeting_guide (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  capture_session_id    uuid        NOT NULL REFERENCES capture_session ON DELETE CASCADE,
  goal                  text,           -- Gesamtziel des Meetings
  context_notes         text,           -- Hintergrund-Informationen
  topics                jsonb       NOT NULL DEFAULT '[]',
  -- topics: [{ key: string, title: string, description: string,
  --            questions: string[], block_key: string|null, order: number }]
  -- block_key: optional Zuordnung zu Template-Block (fuer KU-Mapping)
  ai_suggestions_used   boolean     DEFAULT false,  -- KI-Vorschlaege genutzt?
  created_by            uuid        REFERENCES auth.users,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(capture_session_id)  -- 1:1 pro Session
);
```

`topics` JSONB-Struktur:
```json
[
  {
    "key": "topic-1",
    "title": "Nachfolgeregelung",
    "description": "Aktueller Stand der Nachfolgeplanung",
    "questions": [
      "Gibt es einen designierten Nachfolger?",
      "Welche Qualifikationen fehlen dem Nachfolger?"
    ],
    "block_key": "C",
    "order": 1
  }
]
```

`block_key`-Zuordnung ist zentral: Damit werden extrahierte KUs den richtigen Template-Bloecken zugewiesen. Wenn null: KUs werden einem generischen "unzugeordnet"-Block zugewiesen.

RLS: tenant_admin Read+Write eigener Tenant, strategaize_admin Full.

#### `dialogue_session`

```sql
CREATE TABLE dialogue_session (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  capture_session_id    uuid        NOT NULL REFERENCES capture_session ON DELETE CASCADE,
  meeting_guide_id      uuid        REFERENCES meeting_guide ON DELETE SET NULL,
  jitsi_room_name       text        NOT NULL UNIQUE,
  status                text        NOT NULL DEFAULT 'planned'
                                    CHECK (status IN (
                                      'planned',       -- Meeting erstellt, noch nicht gestartet
                                      'in_progress',   -- Meeting laeuft
                                      'recording',     -- Recording aktiv
                                      'completed',     -- Meeting beendet, Recording vorhanden
                                      'transcribing',  -- Whisper laeuft
                                      'processing',    -- KI-Extraktion laeuft
                                      'processed',     -- Fertig verarbeitet
                                      'failed'         -- Fehler in Pipeline
                                    )),
  participant_a_user_id uuid        NOT NULL REFERENCES auth.users,
  participant_b_user_id uuid        NOT NULL REFERENCES auth.users,
  recording_storage_path text,      -- Pfad in Supabase Storage (recordings bucket)
  recording_duration_s  integer,    -- Dauer in Sekunden
  transcript            text,       -- Vollstaendiges Transkript (persistent, DEC-029)
  transcript_model      text,       -- z.B. 'whisper-medium'
  summary               jsonb,      -- Strukturierte Meeting-Summary
  gaps                  jsonb,      -- Nicht besprochene Themen
  -- summary: { topics: [{ key, title, highlights: string[], decisions: string[],
  --            open_points: string[] }], overall: string }
  -- gaps: [{ topic_key, topic_title, reason: string }]
  extraction_model      text,       -- z.B. 'claude-sonnet-4-20250514'
  extraction_cost_usd   numeric(10,6),
  consent_a             boolean     DEFAULT false,  -- DSGVO: Aufnahme-Einwilligung
  consent_b             boolean     DEFAULT false,
  started_at            timestamptz,
  ended_at              timestamptz,
  created_by            uuid        NOT NULL REFERENCES auth.users,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dialogue_session_capture ON dialogue_session(capture_session_id);
CREATE INDEX idx_dialogue_session_status ON dialogue_session(status) WHERE status NOT IN ('processed', 'failed');
```

RLS: tenant_admin + tenant_member Read eigener Tenant (Teilnehmer muessen Summary sehen), strategaize_admin Full.

### Schema-Erweiterungen bestehender Tabellen

```sql
-- capture_session: Neuer capture_mode-Wert
ALTER TABLE capture_session
  DROP CONSTRAINT IF EXISTS capture_session_capture_mode_check,
  ADD CONSTRAINT capture_session_capture_mode_check
    CHECK (capture_mode IS NULL OR capture_mode IN ('questionnaire', 'evidence', 'dialogue'));

-- knowledge_unit: Neuer source-Wert
ALTER TABLE knowledge_unit
  DROP CONSTRAINT IF EXISTS knowledge_unit_source_check,
  ADD CONSTRAINT knowledge_unit_source_check
    CHECK (source IN ('questionnaire', 'exception', 'ai_draft', 'meeting_final', 'manual', 'evidence', 'dialogue'));
```

### Data Flows V3

#### Flow 4 — Meeting Guide erstellen

```
Browser (strategaize_admin / tenant_admin)
  → Meeting Guide Editor
       → Themen/Leitfragen manuell eingeben
       → Optional: Button "Vorschlaege generieren"
            → POST /api/meeting-guide/suggest
            → Bedrock: Template-Bloecke + Fragen + bestehende Antworten als Kontext
            → Return: Vorgeschlagene Themen + Leitfragen
       → Topics mit block_key verknuepfen (Template-Block-Zuordnung)
       → Save via Server Action → INSERT/UPDATE meeting_guide
```

#### Flow 5 — Dialogue Session (Meeting + Recording)

```
1. Auftraggeber erstellt Dialogue Session
     → dialogue_session.status = 'planned'
     �� jitsi_room_name = UUID-basiert (z.B. 'onb-{session_id_short}')

2. Teilnehmer treten bei
     → Platform-UI: Jitsi IFrame API Embed
     → JWT pro Teilnehmer: { room: room_name, sub: user_id, name: display_name,
                              context: { user: { name, email } } }
     → Consent-Screen vor Meeting-Start (DSGVO)
     → consent_a / consent_b = true

3. Meeting laeuft
     → dialogue_session.status = 'in_progress'
     → Meeting-Guide sichtbar als Seitenpanel
     → Jibri-Recording startet (automatisch oder manuell)
     → dialogue_session.status = 'recording'

4. Meeting endet
     → Jibri stoppt Recording → MP4 im Volume
     → Finalize-Script → Webhook an App
     → App uploaded MP4 in Supabase Storage (recordings/{tenant_id}/{dialogue_id}/recording.mp4)
     → dialogue_session.recording_storage_path = Pfad
     → dialogue_session.status = 'completed'
     → Enqueue ai_job: dialogue_transcription
```

#### Flow 6 — Post-Meeting Pipeline

```
Job: dialogue_transcription
  1. dialogue_session laden (recording_storage_path)
  2. MP4 aus Supabase Storage herunterladen (Service-Role)
  3. Audio extrahieren (ffmpeg -i input.mp4 -vn -acodec pcm_s16le -ar 16000 output.wav)
  4. Whisper-Transkription (bestehender Whisper-Container, POST /asr mit Audio-Datei)
  5. Transkript speichern: UPDATE dialogue_session SET transcript = text, transcript_model = 'whisper-medium'
  6. dialogue_session.status = 'transcribing' → 'processing'
  7. Enqueue ai_job: dialogue_extraction (automatischer Uebergang)
  8. Temporaere Audio/Video-Dateien loeschen

Job: dialogue_extraction
  1. dialogue_session + meeting_guide laden
  2. Prompt-Kontext aufbauen:
     - System: "Du analysierst ein Meeting-Transkript..."
     - User: Transkript + Meeting-Guide (Topics + Questions + block_keys)
     - Instruktion: Pro Topic → KUs extrahieren + Gaps erkennen + Summary
  3. Bedrock-Call (Claude Sonnet, temperature 0.3, maxTokens 16384)
  4. Parse JSON-Output:
     a) Knowledge Units: Pro Thema 1-3 KUs mit source='dialogue'
        → rpc_bulk_import_knowledge_units (bestehender RPC)
        → Block-Zuordnung via meeting_guide.topics[].block_key
     b) Gaps: Topics die nicht/oberflaechlich besprochen wurden
        → UPDATE dialogue_session SET gaps = [...]
     c) Meeting-Summary: Strukturiert pro Topic
        → UPDATE dialogue_session SET summary = {...}
  5. Kosten loggen: ai_cost_ledger (feature='dialogue_extraction')
  6. dialogue_session.status = 'processed'
```

### Worker-Erweiterung V3

2 neue Job-Types im bestehenden Worker-Container:

| Job-Type | Trigger | Input | Output |
|----------|---------|-------|--------|
| `dialogue_transcription` | Automatisch nach Recording-Upload | dialogue_session_id | transcript TEXT auf dialogue_session |
| `dialogue_extraction` | Automatisch nach Transkription | dialogue_session_id | KUs (source='dialogue') + summary JSONB + gaps JSONB |

Beide Jobs laufen sequentiell (Transkription muss vor Extraktion fertig sein). dialogue_transcription enqueued dialogue_extraction automatisch.

#### Whisper-Aufruf fuer lange Recordings

Bisherig (V2 Voice-Input): Kurze Audio-Clips (~5-30s Diktat).
Neu (V3 Meeting): Lange Recordings (~15-60min Gespraech).

Whisper verarbeitet lange Dateien intern in 30s-Segmenten. Fuer ein 60-Minuten-Meeting:
- Audio-Groesse: ~60 MB WAV (16kHz, mono)
- Verarbeitungsdauer (medium-Modell): ~3-8 Minuten auf CPX62
- RAM-Bedarf: ~2 GB (unveraendert)

Das bestehende Whisper-Container-Setup reicht. Der Worker wartet auf die Response (kein Timeout-Problem, Worker hat keinen HTTP-Proxy).

### JWT-Generierung fuer Jitsi

```typescript
// src/lib/jitsi/jwt.ts
import { createHmac } from 'node:crypto';

export function generateJitsiJwt(params: {
  roomName: string;
  userId: string;
  displayName: string;
  email: string;
  isModerator: boolean;
}): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: process.env.JITSI_JWT_APP_ID,
    room: params.roomName,
    sub: '*',
    aud: process.env.JITSI_JWT_APP_ID,
    exp: Math.floor(Date.now() / 1000) + 3600, // 1h
    context: {
      user: {
        id: params.userId,
        name: params.displayName,
        email: params.email,
        moderator: params.isModerator
      },
      features: {
        recording: params.isModerator  // Nur Moderator kann Recording starten
      }
    }
  };

  // HS256 Signing (analog Business System gen-test-jwt.mjs)
  const segments = [
    base64url(JSON.stringify(header)),
    base64url(JSON.stringify(payload))
  ];
  const signature = createHmac('sha256', process.env.JITSI_JWT_APP_SECRET!)
    .update(segments.join('.'))
    .digest('base64url');

  return [...segments, signature].join('.');
}
```

### Meeting-Guide KI-Vorschlaege (Basic)

```
POST /api/meeting-guide/suggest
  Input: { capture_session_id, template_id }
  Logik:
    1. Template laden (blocks + questions)
    2. Optional: Bestehende Antworten aus capture_session.answers laden
    3. Bedrock-Call:
       System: "Du hilfst einem Knowledge Manager, ein Meeting vorzubereiten..."
       User: Template-Bloecke + Fragen + (optional) bestehende Antworten
       Instruktion: "Schlage 5-8 Gespraechsthemen mit je 2-3 Leitfragen vor.
                     Ordne jedes Thema einem Template-Block zu."
    4. Parse JSON-Output → Topics mit block_key
  Output: { topics: [{ title, description, questions[], block_key }] }
  Kosten: ~$0.02-$0.05 pro Aufruf (klein, kein kostenkritischer Flow)
```

### Supabase Storage Bucket `recordings`

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('recordings', 'recordings', false, 524288000,  -- 500 MB
  ARRAY['video/mp4', 'audio/wav', 'audio/webm']);

-- Storage-Policies (analog Evidence-Pattern)
-- INSERT: Auftraggeber + strategaize_admin
-- SELECT: Tenant-Mitglieder + strategaize_admin
-- DELETE: nur strategaize_admin
```

500 MB Limit pro Datei (1h Meeting in MP4 = ~100-200 MB bei Jibri-Standard-Qualitaet).

### Jitsi IFrame API Integration

```typescript
// src/components/dialogue/JitsiMeeting.tsx
'use client';

import { useEffect, useRef } from 'react';

interface JitsiMeetingProps {
  roomName: string;
  jwt: string;
  displayName: string;
  meetingGuideTopics: Topic[];
  onMeetingEnd: () => void;
}

export function JitsiMeeting({ roomName, jwt, displayName, meetingGuideTopics, onMeetingEnd }: JitsiMeetingProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Jitsi IFrame API laden
    const domain = process.env.NEXT_PUBLIC_JITSI_DOMAIN; // meet.onboarding-domain.com
    const api = new JitsiMeetExternalAPI(domain, {
      roomName,
      jwt,
      parentNode: containerRef.current,
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        disableDeepLinking: true,
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
      },
      userInfo: { displayName }
    });

    api.addEventListener('videoConferenceLeft', onMeetingEnd);
    return () => api.dispose();
  }, []);

  return (
    <div className="flex h-full">
      <div ref={containerRef} className="flex-1" />
      {/* Meeting Guide Seitenpanel */}
      <MeetingGuideSidebar topics={meetingGuideTopics} />
    </div>
  );
}
```

Fallback: Falls IFrame blockiert wird (Browser-Restriktionen), Link zum direkten Jitsi-Raum (`https://meet.domain.com/{roomName}?jwt={jwt}`).

### DSGVO: Consent-Flow

Vor Meeting-Beitritt:
1. UI zeigt: "Dieses Meeting wird aufgezeichnet und transkribiert."
2. Checkbox: "Ich stimme der Aufzeichnung zu"
3. Erst nach Zustimmung wird der Jitsi-IFrame geladen
4. `dialogue_session.consent_a` / `.consent_b` = true
5. Ohne Consent beider Teilnehmer startet kein Recording

### Pipeline-Integration (FEAT-021)

#### capture_session erweitert

capture_session bekommt eine optionale `capture_mode` Spalte (falls noch nicht vorhanden) mit den Werten: `questionnaire`, `evidence`, `dialogue`. Dashboard-UI zeigt Mode-Icon.

Session-Erstellungs-Flow:
```
Auftraggeber waehlt Template → waehlt Capture-Mode:
  - Fragebogen (questionnaire) → direkt zum Questionnaire
  - Dokumente (evidence) → Evidence-Upload
  - Gespraech (dialogue) → Meeting-Guide-Editor → Dialogue-Session
```

#### KU-Mapping auf Template-Bloecke

Zentral fuer Pipeline-Integration: Meeting-Guide-Topics haben `block_key` (Zuordnung zu Template-Block). Bei der dialogue_extraction werden KUs dem entsprechenden Block zugewiesen. Diagnose-Layer und SOP-Generation arbeiten pro Block — sie sehen KUs aller Quellen (questionnaire + evidence + dialogue) gleichwertig.

```
Block "C: Nachfolge"
  KU-1 (source=questionnaire) — aus Fragebogen-Antworten
  KU-2 (source=evidence) — aus hochgeladenem Dokument
  KU-3 (source=dialogue) — aus Meeting-Gespraech  ← NEU
  → Diagnose-Generation nutzt alle 3 KUs
  → SOP-Generation nutzt alle 3 KUs
```

### Kosten-Schaetzung V3

| Operation | Tokens | Kosten/Meeting | Kosten/Session (3 Meetings) |
|-----------|--------|---------------|----------------------------|
| Meeting-Guide KI-Vorschlaege | ~2.000 in, ~1.500 out | ~$0.02 | ~$0.06 |
| Whisper-Transkription (60min) | n/a (self-hosted) | $0.00 | $0.00 |
| Dialogue-Extraction | ~20.000 in, ~4.000 out | ~$0.10-$0.20 | ~$0.30-$0.60 |
| **V3-Zusatzkosten pro Session** | | | **~$0.36-$0.66** |

Gesamtkosten pro Session (alle Features V1-V3):
- V2 baseline: $2.57-$12.35
- Mit V3 Dialogue: **$2.93-$13.01**

Marginal — die Kosten fuer Dialogue-Processing sind gering im Vergleich zur Verdichtungs-Pipeline.

### Security / Privacy V3

Alle V1/V2-Regeln gelten weiter. Zusaetzlich:

- **Meeting-Recording:** Besonders sensitiv (gesprochenes Unternehmenswissen). DSGVO-Consent vor Aufnahme mandatory. MP4 in tenant-isoliertem Storage. Kein Cross-Tenant-Zugriff.
- **Transkript-Persistence (DEC-029):** Volles Transkript gespeichert. Audit-relevant aber auch sensitiv. Gleiche Schutzstufe wie KUs. Loeschen via Retention-Policy spaeter evaluieren.
- **Jitsi JWT-Secrets:** 6 separate Secrets (JWT_APP_SECRET, 4 Auth-Passwords, 1 Recorder-Password). Alle in Coolify-ENV, nie im Code.
- **Recording-Webhook:** Authentifiziert via RECORDING_WEBHOOK_SECRET (Shared Secret zwischen Jibri-Finalize-Script und App).
- **Meeting-Video:** MP4 enthaelt Video + Audio. Fuer KI-Processing wird nur Audio gebraucht. Video bleibt als Backup in Storage, aber KI verarbeitet nur Audio-Extrakt.

### ENV-Erweiterung V3

```bash
# Jitsi
JITSI_JWT_APP_ID=onboarding
JITSI_JWT_APP_SECRET=<generated>
JITSI_JICOFO_AUTH_PASSWORD=<generated>
JITSI_JICOFO_COMPONENT_SECRET=<generated>
JITSI_JVB_AUTH_PASSWORD=<generated>
JITSI_JIBRI_RECORDER_PASSWORD=<generated>
JITSI_JIBRI_XMPP_PASSWORD=<generated>
NEXT_PUBLIC_JITSI_DOMAIN=meet.onboarding-domain.com
RECORDING_WEBHOOK_SECRET=<generated>
```

### Neue Dependencies V3

| Dependency | Zweck | Wo |
|-----------|-------|-----|
| `@jitsi/react-sdk` oder IFrame API (CDN) | Jitsi-Embed in Next.js | App (Frontend) |
| `fluent-ffmpeg` oder `node:child_process` + ffmpeg | Audio-Extraktion aus MP4 | Worker |

ffmpeg ist bereits im Worker-Container verfuegbar (Node-Image hat ffmpeg via apt). Keine neuen externen Cloud-Provider.

### Constraints und Tradeoffs V3

#### Constraint — Eigene Jitsi-Instanz (DEC-025)
5 neue Docker-Services auf dem Onboarding-Server.
**Tradeoff:** Mehr RAM/CPU-Verbrauch. CPX62 (16 GB RAM) wird eng: App (~1 GB) + Worker (~0.5 GB) + Supabase (~3 GB) + Whisper (~2 GB) + Jitsi (~1 GB) + Jibri (~3 GB bei Recording) = ~10.5 GB. Monitoring nach Deploy essential. Server-Upgrade auf CPX72 (32 GB) moeglicherweise noetig.

#### Constraint — Post-Meeting only (kein Live-KI)
V3 verarbeitet erst nach Meeting-Ende.
**Tradeoff:** Keine Live-Zusammenfassung, keine Echtzeit-Rueckfragen. Teilnehmer muessen sich auf den Meeting-Guide verlassen. V3.1 kann Streaming-Transkription + Live-Summaries ergaenzen.

#### Constraint — Beide Teilnehmer brauchen Accounts (DEC-027)
Kein Guest-Link-Mode in V3.
**Tradeoff:** Auftraggeber muss zweiten Teilnehmer als tenant_member anlegen. Mehr Reibung bei externen Gespraechspartnern. V3.1 Guest-Mode reduziert das.

#### Constraint — Keine Speaker Diarization (DEC-026)
Transkript ist ein Fliesstext ohne Sprecher-Kennzeichnung.
**Tradeoff:** KI-Extraktion kann nicht zwischen Sprecher A und B unterscheiden. Fuer themenbasiertes Mapping reicht das. Fuer sprecherbasierte Analyse (wer hat was gesagt) nicht. V3.1 Enhancement.

### Geplante Migrationen V3

| Nr. | Datei | Inhalt |
|-----|-------|--------|
| 058 | `058_meeting_guide.sql` | meeting_guide-Tabelle + RLS + Indexes + GRANTs + updated_at-Trigger |
| 059 | `059_dialogue_session.sql` | dialogue_session-Tabelle + RLS + Indexes + GRANTs + updated_at-Trigger |
| 060 | `060_capture_mode_dialogue.sql` | ALTER capture_session CHECK + ALTER knowledge_unit source CHECK fuer 'dialogue' |
| 061 | `061_recordings_bucket.sql` | Supabase Storage Bucket 'recordings' + Policies |
| 062 | `062_rpc_dialogue.sql` | RPCs: meeting_guide CRUD, dialogue_session Management, transcript/summary Persistierung |

### Empfohlene Slice-Reihenfolge V3

1. **SLC-025: Jitsi-Infrastructure** — Docker-Compose, Host-Setup, DNS, JWT-Generator, Smoke-Test (FEAT-017)
2. **SLC-026: Meeting-Guide Backend** — meeting_guide-Tabelle + RLS + RPCs + KI-Suggest-API (FEAT-018 Backend)
3. **SLC-027: Meeting-Guide UI** — Editor-UI, Themen-Verwaltung, Template-Block-Zuordnung, KI-Vorschlaege (FEAT-018 Frontend)
4. **SLC-028: Dialogue Session Backend** — dialogue_session-Tabelle + RLS + capture_mode='dialogue' + Session-Management-API (FEAT-019 Backend)
5. **SLC-029: Dialogue Session UI** — Jitsi-Embed, Consent-Flow, Meeting-Guide-Seitenpanel, Recording-Status (FEAT-019 Frontend)
6. **SLC-030: Recording Pipeline** — Finalize-Script + Storage-Upload + dialogue_transcription Job + ffmpeg + Whisper (FEAT-020 Transkription)
7. **SLC-031: Dialogue Extraction** — dialogue_extraction Job + Prompt + KU-Import + Summary + Gaps (FEAT-020 KI-Processing)
8. **SLC-032: Pipeline Integration + Debrief** — Dashboard Dialogue-Sessions, Debrief-UI Erweiterung, Diagnose/SOP mit Dialogue-KUs (FEAT-021)

8 Slices. Reihenfolge strikt sequentiell (jeder baut auf dem vorherigen auf). SLC-025 ist ein Infra-Slice (Deploy + Verifikation, kein App-Code). SLC-026-027 und SLC-028-029 koennen bei Bedarf leicht parallelisiert werden.

### Naechster Schritt V3

`/slice-planning` mit 8 Slices.

---

## V4 Architecture Addendum — Zwei-Ebenen-Verschmelzung (Mitarbeiter + Unternehmerhandbuch)

### Status
V4-Architektur festgelegt am 2026-04-23. Baut auf V3-Stack (Dialogue-Mode, deployed-pending) auf.

### Architektur-Zusammenfassung V4

V4 erweitert den bestehenden Stack ohne neue Docker-Services. Die vier Kernprinzipien:

1. **Vierte Rolle, kein Merge** — `employee` wird parallele Rolle neben `strategaize_admin`, `tenant_admin`, `tenant_member`. Bewusst kein Merge mit tenant_member in V4 (Scope-Schutz, Erfahrung sammeln).
2. **Bridge-Engine als Hybrid** — Template definiert Standard-Bridges fuer ~80% der Subtopics. KI verfeinert (Mitarbeiter-Auswahl + Wortlaut) plus max 3 Free-Form-Vorschlaege pro Lauf fuer unbekannte Themen.
3. **Handbuch-Aggregation deterministisch ueber Template-Schablone** — `template.handbook_schema` definiert Sektions-Struktur und Quellen-Filter. Aggregation ist Code, kein LLM. Reproduzierbar, audit-faehig, multi-template-faehig.
4. **Capture-Mode-Hook-Konvention statt Mode-Hardcoding** — Worker-Pipeline-Slot + UI-Slot-Konvention dokumentiert + via Pseudo-Mode `walkthrough_stub` validiert. V5/V6 docken ohne Schema-Aenderung an.

### Architektur-Entscheidungen (Q17-Q23 beantwortet)

**Q17 → DEC-034: Bridge-Engine ist Hybrid (Template-Standard + KI-Verfeinerung + max 3 Free-Form-Slots).**
Begruendung: R15-Mitigation. 80% der Bridge-Vorschlaege deterministisch aus Template-Schablonen, KI nur fuer Mitarbeiter-Zuordnung und leichte Wortlaut-Anpassung. Free-Form-Slot fuer Themen, die das Template nicht kennt — begrenzt auf 3 Vorschlaege pro Lauf, damit Bridge-Output kontrollierbar bleibt.

**Q18 → DEC-035: Klassisches Passwort fuer Mitarbeiter-Auth.**
Einladung per E-Mail mit Token-Link. Mitarbeiter setzt beim ersten Login eigenes Passwort. Begruendung: robust gegen E-Mail-Probleme, vertraut fuer Nicht-Tech-User, konsistent zu bestehender tenant_admin-Auth. Magic-Link bleibt fuer V4.2 evaluiert.

**Q19 → DEC-036: `employee` und `tenant_member` sind parallele Rollen, kein Merge in V4.**
Beide existieren nebeneinander. employee hat dedizierten Capture-Flow, tenant_member bleibt fuer bestehende Anwendungsfaelle. Mergung wird nach 2-3 Pilotkunden evaluiert.

**Q20 → DEC-037: Bridge-Trigger ist on-demand (tenant_admin loest aus).**
Konsistent mit DEC-020 (SOP) und DEC-022 (Diagnose). Cost-Kontrolle, Vertrauensaufbau. Kein Auto-Trigger nach Block-Submit.

**Q21 → DEC-038: Handbuch-Aggregation ueber `template.handbook_schema`-Schablone (deterministischer Code).**
Analog zu DEC-023 (diagnosis_schema). Pro Template eine Schablone, die Sektions-Struktur und Filter definiert. Aggregation ist deterministischer Markdown-Render-Code. Kein LLM-Call in V4 (R18-Mitigation: reproduzierbarer Output). Optional KI-Polish-Layer fuer Sektion-Intros in V4.1.

**Q22 → DEC-039: Mitarbeiter-Aufgaben-Re-Generierung ist on-demand mit "Bridge-Lauf veraltet"-Hinweis.**
`bridge_run.status='stale'` sobald neue `block_checkpoint`-Eintraege nach `bridge_run.created_at` existieren. UI zeigt Hinweis im Bridge-Review. Konsistent mit Q20 — kein KI-Auto-Push.

**Q23 → DEC-040: Capture-Mode-Hook-Granularitaet = Worker-Pipeline-Slot + UI-Slot-Konvention.**
Kein Routing-Slot, kein Permissions-Slot in V4. Mode-Worker registrieren sich ueber Job-Type-Naming-Konvention (`{mode}_processing`). Mode-UI-Komponenten leben unter `src/components/capture-modes/{mode}/`. Per Pseudo-Mode `walkthrough_stub` validiert.

### Service-Topologie V4

Keine neuen Docker-Services. Aenderungen an bestehenden:

| Service | V4-Aenderung |
|---------|-------------|
| `app` | Mitarbeiter-Verwaltungs-UI (tenant_admin), Mitarbeiter-Dashboard (employee), Bridge-Review-UI, Handbuch-Generieren-UI + Download, Self-Service-Cockpit-View, /accept-invitation-Flow |
| `worker` | 2 neue Job-Types: `bridge_generation`, `handbook_snapshot_generation` |
| `supabase-storage` | Neuer Bucket `handbook` (tenant-isoliert, ZIP-Storage) |
| Alle anderen | Unveraendert |

### Neue Tabellen V4

#### `employee_invitation` (FEAT-022)

```sql
CREATE TABLE public.employee_invitation (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  email                 text        NOT NULL,
  display_name          text,
  role_hint             text,           -- z.B. "Operations Manager" (informational, nicht sicherheitsrelevant)
  invitation_token      text        NOT NULL UNIQUE,
  invited_by_user_id    uuid        NOT NULL REFERENCES auth.users,
  status                text        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  accepted_user_id      uuid        REFERENCES auth.users,   -- gesetzt bei Annahme
  expires_at            timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_employee_invitation_pending_email
  ON public.employee_invitation (tenant_id, lower(email))
  WHERE status = 'pending';
CREATE INDEX idx_employee_invitation_tenant ON public.employee_invitation(tenant_id);
```

RLS: `strategaize_admin` Full, `tenant_admin` R+W eigener Tenant, `employee` kein Zugriff, `tenant_member` kein Zugriff.

#### `bridge_run` (FEAT-023)

```sql
CREATE TABLE public.bridge_run (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  capture_session_id    uuid        NOT NULL REFERENCES capture_session ON DELETE CASCADE,  -- die GF-Session, aus der die Bridge gespeist wird
  template_id           uuid        NOT NULL REFERENCES template,
  template_version      text        NOT NULL,
  status                text        NOT NULL DEFAULT 'running'
                                    CHECK (status IN ('running', 'completed', 'failed', 'stale')),
  triggered_by_user_id  uuid        NOT NULL REFERENCES auth.users,
  source_checkpoint_ids uuid[]      NOT NULL DEFAULT '{}',   -- welche Checkpoints flossen ein
  proposal_count        integer     NOT NULL DEFAULT 0,
  cost_usd              numeric(10,6),
  generated_by_model    text,
  error_message         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz
);

CREATE INDEX idx_bridge_run_session ON public.bridge_run(capture_session_id);
CREATE INDEX idx_bridge_run_tenant_status ON public.bridge_run(tenant_id, status);
```

RLS: `strategaize_admin` Full, `tenant_admin` R+W eigener Tenant. `employee`, `tenant_member` kein Zugriff.

`status='stale'` wird via Trigger gesetzt, sobald nach `bridge_run.created_at` neue `block_checkpoint`-Eintraege fuer `capture_session_id` entstehen — UI zeigt "Bridge-Lauf veraltet" (DEC-039).

#### `bridge_proposal` (FEAT-023)

```sql
CREATE TABLE public.bridge_proposal (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  bridge_run_id            uuid        NOT NULL REFERENCES bridge_run ON DELETE CASCADE,
  proposal_mode            text        NOT NULL
                                       CHECK (proposal_mode IN ('template', 'free_form')),
  source_subtopic_key      text,           -- bei mode=template: matcht diagnosis_schema.subtopics[].key
  proposed_block_title     text        NOT NULL,
  proposed_block_description text,
  proposed_questions       jsonb       NOT NULL DEFAULT '[]'::jsonb,
                                       -- [{ id, text, hint, required }]
  proposed_employee_user_id uuid       REFERENCES auth.users,   -- KI-Vorschlag, tenant_admin kann editieren
  proposed_employee_role_hint text,        -- "Operations Manager" wenn keine konkrete Person passt
  status                   text        NOT NULL DEFAULT 'proposed'
                                       CHECK (status IN ('proposed', 'edited', 'approved', 'rejected', 'spawned')),
  approved_capture_session_id uuid     REFERENCES capture_session,   -- gesetzt bei status=spawned
  reviewed_by_user_id      uuid        REFERENCES auth.users,
  reviewed_at              timestamptz,
  reject_reason            text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bridge_proposal_run ON public.bridge_proposal(bridge_run_id);
CREATE INDEX idx_bridge_proposal_tenant_status ON public.bridge_proposal(tenant_id, status);
```

RLS: `strategaize_admin` Full, `tenant_admin` R+W eigener Tenant. `employee`, `tenant_member` kein Zugriff.

Status-Lifecycle: `proposed` → (Edit:) `edited` → (Genehmigen:) `approved` → (capture_session erstellt:) `spawned`. Oder `proposed` → `rejected` (Endzustand).

#### `handbook_snapshot` (FEAT-026)

```sql
CREATE TABLE public.handbook_snapshot (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  capture_session_id    uuid        NOT NULL REFERENCES capture_session ON DELETE CASCADE,
  template_id           uuid        NOT NULL REFERENCES template,
  template_version      text        NOT NULL,
  status                text        NOT NULL DEFAULT 'generating'
                                    CHECK (status IN ('generating', 'ready', 'failed')),
  storage_path          text,           -- Pfad in Bucket 'handbook' nach Erfolg
  storage_size_bytes    integer,
  section_count         integer,
  knowledge_unit_count  integer,
  diagnosis_count       integer,
  sop_count             integer,
  generated_by_user_id  uuid        NOT NULL REFERENCES auth.users,
  error_message         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz
);

CREATE INDEX idx_handbook_snapshot_session ON public.handbook_snapshot(capture_session_id);
CREATE INDEX idx_handbook_snapshot_tenant ON public.handbook_snapshot(tenant_id);
```

RLS: `strategaize_admin` Full, `tenant_admin` R+W eigener Tenant. `employee`, `tenant_member` kein Zugriff.

V4 hat keine Versionierungs-Logik (V4.1) — `handbook_snapshot` wird einfach pro Generierungs-Lauf eingefuegt. Mehrere Snapshots pro Session sind erlaubt; UI zeigt nur den juengsten.

### Schema-Erweiterungen V4

#### `profiles.role` CHECK erweitert

```sql
ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('strategaize_admin', 'tenant_admin', 'tenant_member', 'employee'));
```

#### `auth.user_role()` Helper unveraendert
Liefert weiterhin den `role`-Wert aus profiles. Neue Rolle wird automatisch erkannt.

#### `capture_session.capture_mode` CHECK erweitert

```sql
ALTER TABLE public.capture_session
  DROP CONSTRAINT capture_session_capture_mode_check;
ALTER TABLE public.capture_session
  ADD CONSTRAINT capture_session_capture_mode_check
  CHECK (capture_mode IS NULL OR capture_mode IN (
    'questionnaire',
    'evidence',
    'dialogue',
    'employee_questionnaire',   -- NEU V4
    'walkthrough_stub'          -- NEU V4 (Spike, kein produktiver Mode)
  ));
```

`walkthrough` (V5) und `diary` (V6) werden in spaeteren Migrations additiv hinzugefuegt — ohne strukturelle Aenderung. Das ist die zentrale SC-V4-6-Validierung.

#### `knowledge_unit.source` CHECK erweitert

```sql
ALTER TABLE public.knowledge_unit
  DROP CONSTRAINT knowledge_unit_source_check;
ALTER TABLE public.knowledge_unit
  ADD CONSTRAINT knowledge_unit_source_check
  CHECK (source IN (
    'questionnaire', 'exception', 'ai_draft', 'meeting_final', 'manual',
    'evidence', 'dialogue',
    'employee_questionnaire'    -- NEU V4
  ));
```

#### `template` neue JSONB-Spalten (DEC-034 + DEC-038)

```sql
ALTER TABLE public.template
  ADD COLUMN employee_capture_schema jsonb DEFAULT NULL,
  ADD COLUMN handbook_schema         jsonb DEFAULT NULL;
```

`template`-Tabelle hat damit jetzt 7 JSONB-Spalten: `blocks`, `sop_prompt`, `owner_fields`, `diagnosis_schema`, `diagnosis_prompt`, `employee_capture_schema`, `handbook_schema`. Akzeptabel — wenige Templates (<10 in V4-Horizont), keine Performance-Relevanz.

#### `template.employee_capture_schema` Struktur (Q17-Detail)

```json
{
  "subtopic_bridges": [
    {
      "subtopic_key": "kernlogik",
      "block_template": {
        "title": "Mitarbeiter-Sicht: Kernlogik im Tagesgeschaeft",
        "description": "Wie fuehlt sich das Geschaeftsmodell aus operativer Sicht an?",
        "questions": [
          { "id": "EM-A1", "text": "Was sind die 3 wichtigsten Schritte in deinem typischen Tag?", "required": true },
          { "id": "EM-A2", "text": "Wo verlierst du am haeufigsten Zeit?", "required": false }
        ]
      },
      "typical_employee_role_hints": ["Operations Manager", "Vertriebsmitarbeiter", "Projektleiter"],
      "skip_if": null
    }
  ],
  "free_form_slot": {
    "max_proposals": 3,
    "system_prompt_addendum": "Generiere bis zu 3 zusaetzliche Mitarbeiter-Aufgaben fuer Themen, die das Template nicht abdeckt. Nur wenn die GF-Antworten klare Hinweise auf operative Bereiche geben, die nicht in den subtopic_bridges enthalten sind."
  }
}
```

#### `template.handbook_schema` Struktur (Q21-Detail)

```json
{
  "sections": [
    {
      "key": "geschaeftsmodell_und_markt",
      "title": "Geschaeftsmodell & Markt",
      "order": 1,
      "sources": [
        { "type": "knowledge_unit", "filter": { "block_keys": ["A"], "exclude_source": ["employee_questionnaire"] } },
        { "type": "diagnosis", "filter": { "block_keys": ["A"], "min_status": "confirmed" } },
        { "type": "sop", "filter": { "block_keys": ["A"] } }
      ],
      "render": {
        "subsections_by": "subtopic",   // gruppiert nach diagnosis_schema.subtopics
        "intro_template": "Dieser Abschnitt beschreibt das Geschaeftsmodell aus Sicht der Geschaeftsfuehrung."
      }
    },
    {
      "key": "operatives_tagesgeschaeft",
      "title": "Operatives Tagesgeschaeft (Mitarbeiter-Perspektive)",
      "order": 5,
      "sources": [
        { "type": "knowledge_unit", "filter": { "source_in": ["employee_questionnaire"] } }
      ],
      "render": {
        "subsections_by": "block_key",
        "intro_template": "Dieser Abschnitt fasst die Sicht der Mitarbeiter auf das operative Tagesgeschaeft zusammen."
      }
    }
  ],
  "cross_links": [
    {
      "from_section": "operatives_tagesgeschaeft",
      "to_section": "geschaeftsmodell_und_markt",
      "anchor_match": "subtopic_key"
    }
  ]
}
```

`handbook_schema` ist deklarativ: Render-Code interpretiert die Struktur, kein LLM-Call. Cross-Links verweisen ueber Subtopic-Keys zwischen Sektionen.

### Worker-Erweiterung V4

Der Worker bleibt ein einzelner Container mit Polling-Loop. 2 neue Job-Types werden im bestehenden Dispatcher registriert.

| Job-Type | Trigger | Input | Output |
|----------|---------|-------|--------|
| `bridge_generation` | On-demand (Bridge-Button) | bridge_run_id | bridge_proposal-Rows + bridge_run.status='completed' |
| `handbook_snapshot_generation` | On-demand (Handbuch-Button) | handbook_snapshot_id | ZIP in Storage + handbook_snapshot.status='ready' |

#### Bridge-Generation-Flow (Hybrid, DEC-034)

```
Job: bridge_generation
  1. Lade bridge_run + Tenant + Template (mit employee_capture_schema)
  2. Lade alle block_checkpoint (status submitted/finalized) der Quell-Session
  3. Lade KUs (status accepted/proposed) + Diagnose (status confirmed) der Quell-Session
  4. Lade aktive employees des Tenants (profiles.role='employee', auch ohne aktuelle Sessions)
  5. Pro subtopic_bridge im employee_capture_schema:
       a. Pruefe skip_if-Bedingung (z.B. "diagnosis.ampel == green") -> skip falls true
       b. Pruefe ob Subtopic in Diagnose vorkommt -> wenn nicht, skip
       c. Bedrock-Call (klein, ~$0.01-$0.03):
          Input: subtopic-KUs + subtopic-Diagnose + Mitarbeiter-Liste + block_template
          Output: { proposed_employee_user_id | role_hint, leichte_wortlaut_anpassung }
       d. INSERT bridge_proposal mit mode='template', proposed_questions = Template-Schablone, KI-Output appliziert
  6. Free-Form-Slot:
       a. Bedrock-Call (~$0.05-$0.10):
          Input: alle KUs + alle Diagnosen + bestehende subtopic_bridges + Mitarbeiter-Liste + free_form_slot.system_prompt_addendum
          Output: max 3 Vorschlaege [{ block_title, description, questions[], proposed_employee }]
       b. Pro Vorschlag: INSERT bridge_proposal mit mode='free_form'
  7. UPDATE bridge_run.status='completed', proposal_count, cost_usd
  8. Log ai_cost_ledger pro Bedrock-Call (feature='bridge_template_refine' oder 'bridge_free_form')
  9. rpc_complete_ai_job
```

Approval-Pfad (separater RPC, kein Worker-Job):

```
RPC: rpc_approve_bridge_proposal(proposal_id)
  - Pruefe tenant_admin-Rolle
  - UPDATE bridge_proposal SET status='approved', reviewed_by_user_id, reviewed_at
  - INSERT capture_session (capture_mode='employee_questionnaire',
                            owner_user_id=proposed_employee_user_id,
                            template_id=Tenant-Template,
                            status='open',
                            answers={})
  - Optional: INSERT block_checkpoint nicht noetig (kommt mit erstem Submit)
  - UPDATE bridge_proposal SET status='spawned', approved_capture_session_id
  - Return capture_session_id
```

#### Handbook-Snapshot-Generation-Flow (Deterministisch, DEC-038)

```
Job: handbook_snapshot_generation
  1. Lade handbook_snapshot + Tenant + Template (mit handbook_schema)
  2. Pro section in handbook_schema.sections (sortiert nach order):
       a. Pro source in section.sources:
          - knowledge_unit: SELECT knowledge_unit WHERE filter applied
          - diagnosis: SELECT block_diagnosis WHERE filter applied
          - sop: SELECT sop WHERE filter applied
       b. Render Markdown (Code, deterministisch):
          - Section-Header (#)
          - intro_template (statisch aus Schema)
          - Subsections gruppiert nach render.subsections_by (subtopic | block_key)
          - KU-Listen, Diagnose-Tabellen, SOP-Steps
          - Cross-Link-Anchors fuer cross_links
  3. Render INDEX.md (Inhaltsverzeichnis)
  4. ZIP erstellen mit Standard-Library:
     /handbuch/
       INDEX.md
       01_geschaeftsmodell_und_markt.md
       02_*.md
       ...
  5. Upload ZIP in Storage Bucket 'handbook' unter {tenant_id}/{snapshot_id}.zip
  6. UPDATE handbook_snapshot SET status='ready', storage_path, storage_size_bytes, section_count, ku_count, ...
  7. rpc_complete_ai_job
```

Kein Bedrock-Call in V4. Kosten = $0 fuer Aggregation. Render-Performance: bei ~500 KUs + 9 Diagnosen + 9 SOPs erwartet <2 Sekunden pro Snapshot.

### Capture-Mode Hooks Spike (FEAT-025, SC-V4-6)

#### Worker-Pipeline-Hook-Konvention

Neue Capture-Modes registrieren sich ueber Job-Type-Naming-Konvention `{mode}_processing`. Der bestehende Dispatcher (siehe DEC-017) routed Jobs anhand des `job_type` automatisch:

```
src/workers/
  capture-modes/
    questionnaire/handle.ts       — handler fuer job_type='questionnaire_processing'
    evidence/handle.ts            — handler fuer job_type='evidence_extraction' (V2 bestehend)
    dialogue/handle.ts            — handler fuer job_type='dialogue_extraction' (V3 bestehend)
    employee-questionnaire/handle.ts — handler fuer job_type='employee_questionnaire_processing' (V4 neu, identisch zu questionnaire)
    walkthrough-stub/handle.ts    — Pseudo-Handler fuer Spike (V4)
    walkthrough/handle.ts         — V5 spaeter
    diary/handle.ts               — V6 spaeter
```

V4-Wert: `employee_questionnaire`-Worker ist 1:1 der bestehende `questionnaire`-Pfad — eingebunden ueber denselben Bedrock-Client, dieselbe Verdichtungs-Pipeline (Analyst+Challenger Loop, Diagnose, SOP). Block-Submit eines Mitarbeiters erzeugt einen `block_checkpoint` und enqueued `knowledge_unit_condensation`-Job (unveraendert) — der Mode steuert nur die UI und die Sicht-Filter, nicht die Verdichtung.

#### UI-Slot-Konvention

Neue Capture-Modes liefern eine UI-Komponente unter:

```
src/components/capture-modes/
  questionnaire/QuestionnaireMode.tsx
  evidence/EvidenceMode.tsx
  dialogue/DialogueMode.tsx
  employee-questionnaire/EmployeeQuestionnaireMode.tsx (V4 neu, wrapped QuestionnaireMode)
  walkthrough-stub/WalkthroughStubMode.tsx (V4)
  walkthrough/...   (V5 spaeter)
  diary/...         (V6 spaeter)
```

`/capture/[sessionId]/page.tsx` lookup'd `capture_session.capture_mode` und delegiert:

```typescript
const ModeComponent = CAPTURE_MODE_REGISTRY[session.capture_mode] ?? QuestionnaireMode;
return <ModeComponent session={session} ... />;
```

Registry ist eine simple Map in `src/components/capture-modes/registry.ts`. Neue Modes werden durch Eintrag in der Registry registriert — keine Routing-Aenderung, keine Schema-Aenderung.

#### Spike: `walkthrough_stub` Pseudo-Mode

Validiert SC-V4-6: Ein neuer Mode kann ohne Schema-Aenderung registriert werden.

V4 liefert konkret:
1. `capture_mode='walkthrough_stub'` ist im CHECK-Constraint erlaubt
2. `src/workers/capture-modes/walkthrough-stub/handle.ts` mit minimal-Handler (loggt nur "stub mode")
3. `src/components/capture-modes/walkthrough-stub/WalkthroughStubMode.tsx` rendert Platzhalter-Box "Walkthrough-Mode wird in V5 implementiert"
4. Eintrag in CAPTURE_MODE_REGISTRY
5. Keine Migration noetig fuer V5 — nur Registry-Eintrag, Worker-Handler, UI-Komponente. Migration `070_walkthrough_v5.sql` (V5-Zukunft) wird nur den CHECK-Constraint um `'walkthrough'` erweitern, nichts anderes.

Die Stub-Komponente wird im Self-Service-Cockpit nicht beworben — sie existiert nur fuer den Architektur-Spike und die Doku.

#### Was NICHT zur Hook-Granularitaet gehoert (DEC-040)

Bewusst ausgelassen, weil V5/V6 das nicht brauchen:

- **Routing-Slot:** Alle Capture-Modes laufen unter `/capture/[sessionId]`. Kein per-Mode-Sub-Routing. Wenn ein zukuenftiger Mode eigene Routes braucht (z.B. Mobile-First Diary), wird das in V6 entschieden.
- **Permissions-Slot:** Mode-spezifische RLS-Policies sind nicht vorgesehen — Sichtbarkeit folgt der Rollen-Matrix (employee sieht nur eigene Sessions, etc.). Wenn ein Mode neue Tabellen braucht (z.B. Walkthrough-Screen-Captures), bekommt diese Tabelle eigene Standard-RLS-Policies.

### Self-Service Status Cockpit Foundation (FEAT-027)

Server-Component-basiertes Dashboard auf `/dashboard` (nur tenant_admin). Lade alle Daten server-seitig (DEC-031).

#### Status-Daten

```typescript
// dashboard/page.tsx (Server Component)
const sessionId = await getCurrentTenantCaptureSessionId();
const blocksTotal = template.blocks.length;
const blocksSubmitted = await countCheckpoints(sessionId, 'questionnaire_submit');
const employeesInvited = await countEmployeesByTenant(tenantId);
const employeeTasksOpen = await countEmployeeCaptureSessions(tenantId, ['open', 'in_progress']);
const employeeTasksDone = await countEmployeeCaptureSessions(tenantId, ['submitted', 'finalized']);
const lastBridgeRun = await getLatestBridgeRun(sessionId);
const lastHandbookSnapshot = await getLatestHandbookSnapshot(sessionId);
const recommendedNextStep = computeRecommendedNextStep({ ... });
```

#### Empfohlener Naechster Schritt (regelbasiert, kein LLM in V4)

```
if (blocksSubmitted === 0) -> "Block A starten"
else if (blocksSubmitted < blocksTotal) -> "Block ${nextOpenBlock} fortsetzen"
else if (!lastBridgeRun || lastBridgeRun.status === 'stale')
  -> "Bridge ausfuehren / aktualisieren"
else if (employeesInvited === 0) -> "Mitarbeiter einladen"
else if (employeeTasksOpen > 0) -> "Mitarbeiter erinnern (manuell)"
else if (!lastHandbookSnapshot) -> "Unternehmerhandbuch generieren"
else -> "Onboarding abgeschlossen — Handbuch herunterladen"
```

Reminders sind in V4.2. UI zeigt nur "Mitarbeiter erinnern (manuell)" als statischen Hinweis ohne Aktion.

### RPCs V4

| RPC | Rolle | Zweck |
|-----|-------|-------|
| `rpc_create_employee_invitation` | tenant_admin | Erzeugt Invitation-Token, schickt E-Mail (via Server-Action) |
| `rpc_accept_employee_invitation(token, password)` | anonymous (Token-validiert) | Erzeugt auth.users + profiles.role='employee' + setzt invitation status='accepted' |
| `rpc_revoke_employee_invitation(invitation_id)` | tenant_admin | Setzt invitation status='revoked' |
| `rpc_trigger_bridge_run(capture_session_id)` | tenant_admin | Erzeugt bridge_run + enqueued ai_jobs |
| `rpc_approve_bridge_proposal(proposal_id, edited_payload)` | tenant_admin | Approve + spawned capture_session fuer employee |
| `rpc_reject_bridge_proposal(proposal_id, reason)` | tenant_admin | Reject |
| `rpc_trigger_handbook_snapshot(capture_session_id)` | tenant_admin | Erzeugt handbook_snapshot + enqueued ai_job |
| `rpc_get_handbook_download_url(snapshot_id)` | tenant_admin | Signierte Storage-URL (5 Min Gueltigkeit) |
| Trigger `bridge_run_set_stale` | system | Markiert bridge_run als stale wenn neue Checkpoints |

Alle RPCs SECURITY DEFINER mit explizitem Rollencheck. GRANTs: `authenticated` (Rolle intern geprueft). `rpc_accept_employee_invitation` ist explizit fuer `anon` (Token validiert die Berechtigung).

### Storage Bucket V4

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('handbook', 'handbook', false, 52428800, ARRAY['application/zip']);
```

Pfad-Pattern: `{tenant_id}/{snapshot_id}.zip`. Tenant-Isolation per Storage-Policy:

```sql
CREATE POLICY handbook_select_tenant_admin ON storage.objects
  FOR SELECT USING (
    bucket_id = 'handbook'
    AND (
      auth.user_role() = 'strategaize_admin'
      OR (auth.user_role() = 'tenant_admin' AND auth.user_tenant_id()::text = (storage.foldername(name))[1])
    )
  );

-- INSERT/DELETE nur via service_role (Worker)
```

50 MB Limit pro Snapshot. Bei realistischem Datenvolumen (~500 KUs + Markdown-Render) erwartet 200KB-2MB pro Snapshot.

### ENV-Erweiterung V4

```bash
# Mitarbeiter-Einladungs-E-Mails (nutzen bestehenden SMTP aus V1)
EMPLOYEE_INVITATION_FROM=onboarding@strategaizetransition.com
EMPLOYEE_INVITATION_BASE_URL=https://onboarding.strategaizetransition.com   # bereits vorhanden via NEXT_PUBLIC_APP_URL
EMPLOYEE_INVITATION_EXPIRY_DAYS=14   # Default in DB, ENV optional override
```

Keine neuen Provider, keine neuen Secrets.

### Geplante Migrationen V4

| Nr. | Datei | Inhalt |
|-----|-------|--------|
| 065 | `065_employee_role.sql` | ALTER profiles.role CHECK erweitert um 'employee'; sql/schema.sql Init-Script Parity |
| 066 | `066_employee_invitation.sql` | employee_invitation-Tabelle + RLS (admin_full + tenant_admin_rw) + Indexes + GRANTs |
| 067 | `067_capture_mode_v4.sql` | ALTER capture_session.capture_mode CHECK erweitert um 'employee_questionnaire' + 'walkthrough_stub'; ALTER knowledge_unit.source CHECK erweitert um 'employee_questionnaire' |
| 068 | `068_bridge_tables.sql` | bridge_run + bridge_proposal Tabellen + RLS + Indexes + GRANTs + updated_at-Trigger; bridge_run_set_stale Trigger-Funktion |
| 069 | `069_template_v4_fields.sql` | ALTER template ADD employee_capture_schema + handbook_schema JSONB; UPDATE exit_readiness mit initialem employee_capture_schema (3-5 subtopic_bridges) + handbook_schema (8-10 sections) |
| 070 | `070_handbook_snapshot.sql` | handbook_snapshot-Tabelle + RLS + Indexes + GRANTs + updated_at-Trigger |
| 071 | `071_handbook_storage_bucket.sql` | Supabase Storage Bucket 'handbook' + 3 Policies (insert via service_role, select tenant_admin/strategaize_admin, delete strategaize_admin) |
| 072 | `072_rpc_employee_invite.sql` | 3 RPCs: rpc_create_employee_invitation, rpc_accept_employee_invitation, rpc_revoke_employee_invitation |
| 073 | `073_rpc_bridge.sql` | 3 RPCs: rpc_trigger_bridge_run, rpc_approve_bridge_proposal, rpc_reject_bridge_proposal |
| 074 | `074_rpc_handbook.sql` | 2 RPCs: rpc_trigger_handbook_snapshot, rpc_get_handbook_download_url |
| 075 | `075_rls_employee_perimeter.sql` | RLS-Policies fuer alle bestehenden Tabellen so erweitert, dass `employee` ausschliesslich eigene Capture-Sessions, eigene Checkpoints, eigene KUs, eigene validation_layer-Eintraege sieht — und NICHT block_diagnosis, sop, handbook_snapshot, bridge_*, employee_invitation, andere Tenants, andere Mitarbeiter |

Pflicht-Verifikation in /qa: 4×N RLS-Test-Matrix (4 Rollen × N Tabellen) — strategaize_admin/tenant_admin/tenant_member/employee × capture_session/knowledge_unit/block_diagnosis/sop/handbook_snapshot/bridge_run/bridge_proposal/employee_invitation. Mindestens 32 Failure-Tests fuer employee-Sichtperimeter (R16, SC-V4-3).

### Kosten-Schaetzung V4

| Operation | Tokens | Kosten/Lauf | Notiz |
|-----------|--------|-------------|-------|
| Bridge — Template-Verfeinerung pro Subtopic | ~1.500 in, ~500 out | $0.01-$0.03 | typisch 4-6 Subtopics pro Bridge |
| Bridge — Free-Form-Slot | ~5.000 in, ~2.000 out | $0.05-$0.10 | ein Call pro Bridge |
| **Bridge gesamt pro Lauf** | | **$0.10-$0.30** | abhaengig von Subtopic-Anzahl |
| Handbuch-Snapshot | n/a | **$0.00** | rein deterministisch |
| Mitarbeiter-Block-Verdichtung | wie GF | wie GF | identische Pipeline |

Bei einem Pilotkunden mit 5 Mitarbeitern, 1 Bridge-Lauf und 1 Handbuch-Snapshot pro Onboarding-Zyklus: ~$0.20-$0.30 zusaetzliche V4-Kosten je Onboarding (oben auf $2.93-$13.01 V3-Baseline).

### Security / Privacy V4

Alle V1-V3-Regeln gelten weiter. Zusaetzlich:

- **Mitarbeiter-Sicht-Perimeter (R16, SC-V4-3):** RLS muss garantieren, dass `employee` keine Cross-Mitarbeiter-, Cross-Tenant-, Bridge-, Diagnose-, SOP- oder Handbuch-Daten sehen kann. Test-Matrix ist Pflicht-Bestandteil von /qa.
- **Invitation-Tokens:** Sind 32 Bytes random (`gen_random_bytes(32) :: text`), unique, nicht erratbar. 14 Tage Gueltigkeit. Token-Re-Use nach Annahme ausgeschlossen (status-Lifecycle).
- **Bridge-Ergebnisse:** Enthalten potenziell sensitive Hinweise auf Mitarbeiter-Beobachtungen. Tenant-isoliert. Mitarbeiter sehen nie ihre eigenen Bridge-Proposals (auch nicht spawned-State).
- **Handbuch-Snapshots:** Enthalten alle KUs/Diagnosen/SOPs des Tenants — also auch employee-Beitraege. Mitarbeiter haben KEINEN Zugriff (Sichtperimeter-Constraint). tenant_admin und strategaize_admin haben Zugriff. ZIP-Downloads ueber signierte URLs (max 5 Min Gueltigkeit), nicht ueber direkte Storage-Links.
- **employee_questionnaire-KUs:** Bekommen `source='employee_questionnaire'` Tag. Im Debrief und Handbuch klar als Mitarbeiter-Beitrag erkennbar (UI-Badge).

### Constraints und Tradeoffs V4

#### Constraint — Hybrid-Bridge mit Free-Form-Limit (DEC-034)
KI generiert max 3 Free-Form-Vorschlaege pro Lauf zusaetzlich zu Template-Verfeinerungen.
**Tradeoff:** Die Bridge findet nicht alle moeglichen Wissensbereiche, nur die im Template + 3 Free-Form. Akzeptiert, weil R15 (nutzlose Aufgaben) das groessere Risiko ist. Spaetere Bridge-Tuning-UI (V4.2+) kann Free-Form-Limit konfigurierbar machen.

#### Constraint — Handbuch deterministisch, kein LLM (DEC-038)
Aggregation ist Code, kein narrativer KI-Text in V4.
**Tradeoff:** Markdown-Output liest sich strukturiert, aber nicht "weich". R18 (Erwartungshaltung) erfuellt durch sauberen Aufbau (Inhaltsverzeichnis, Cross-Links, Sektion-Intros). KI-Polish kommt in V4.1 nur fuer kurze Sektion-Intros, nicht fuer Inhaltsumformulierung.

#### Constraint — Klassisches Passwort statt Magic-Link (DEC-035)
Mitarbeiter setzen Passwort beim ersten Login.
**Tradeoff:** Mehr Schritte beim ersten Login (Token-Link → Passwort setzen → Login), aber robuster gegen E-Mail-Probleme. Magic-Link bleibt fuer V4.2 evaluiert.

#### Constraint — Keine Mergung von employee und tenant_member (DEC-036)
4 parallele Rollen.
**Tradeoff:** Doppelte RLS-Policies an einigen Stellen. RLS-Test-Matrix wird komplexer (4 statt 3 Rollen). Akzeptiert fuer V4 (Erfahrung sammeln, dann V5+ Mergung evaluieren).

#### Constraint — Auto-Approval ist explizit ausgeschlossen
Jeder Bridge-Proposal braucht tenant_admin-Freigabe.
**Tradeoff:** Mehr UI-Aufwand fuer tenant_admin. Akzeptiert wegen R15 (Bridge-Qualitaet) und Vertrauensaufbau in der ersten V4-Generation.

### Open Technical Questions V4

- **Q24 — Bridge-Re-Run-Verhalten bei stale-Lauf:** Wenn der GF nach Bridge-Lauf weitere Bloecke submittet und neuen Bridge-Lauf startet — sollen alte rejected/edited Proposals als "Vorgeschichte" angezeigt werden oder hart verworfen? V4: hart verworfen (keine Diff-View). V4.1 kann Diff-View ergaenzen.
- **Q25 — Mitarbeiter-Re-Assignment:** Wenn der GF einen Mitarbeiter aus dem Tenant entfernt, der noch offene Aufgaben hat — was passiert? V4: tenant_admin muss Aufgaben manuell auf anderen Mitarbeiter umhaengen oder loeschen. Auto-Re-Assignment in V4.2.
- **Q26 — Handbuch-Output-Sprache:** Folgt `tenants.language` (DEC-033). Multi-language Handbuecher sind nicht V4.
- **Q27 — Mitarbeiter-Block-Submit ohne Diagnose:** Mitarbeiter-KUs durchlaufen die Standard-Verdichtungs-Pipeline. Sollen Mitarbeiter-Bloecke auch eine Diagnose bekommen, oder werden sie nur in den Handbuch-Aggregations-Layer eingespeist? V4-Empfehlung: Diagnose laeuft fuer alle Bloecke (Standard-Pipeline), aber tenant_admin sieht im Debrief Mitarbeiter-Diagnose mit Badge. Wird in /backend SLC-037 final entschieden.

### Empfohlene Slice-Reihenfolge V4

1. **SLC-033: V4 Schema-Fundament** — Migrations 065-071 (employee-Rolle + capture_mode-Enum + bridge/handbook Tabellen + Storage-Bucket + RLS-Erweiterung 075). RLS-Test-Matrix Skelett.
2. **SLC-034: Employee-Auth + Invitation-Flow** — RPCs (Migration 072) + Server-Action `inviteEmployee` mit E-Mail-Versand + tenant_admin Mitarbeiter-Verwaltungs-UI + /accept-invitation/[token] Page.
3. **SLC-035: Bridge-Engine Backend** — UPDATE exit_readiness Template mit employee_capture_schema (Migration 069) + Worker `bridge_generation` Job-Type + RPCs (Migration 073) + ai_cost_ledger feature='bridge_*'.
4. **SLC-036: Bridge-Review-UI** — tenant_admin Bridge-Review-Page + Edit-Form pro Proposal + Approve/Reject + Spawn-Verifikation.
5. **SLC-037: Employee Capture-UI + Sicht-Perimeter** — Mitarbeiter-Dashboard + EmployeeQuestionnaireMode (wrapped QuestionnaireMode mit RLS-Sichtfilter) + RLS-Test-Matrix Pflicht-Pass.
6. **SLC-038: Capture-Mode-Hooks Spike** — `walkthrough_stub` Worker-Handler-Stub + UI-Komponente + CAPTURE_MODE_REGISTRY + Architektur-Doku-Update "How to add a new Capture-Mode".
7. **SLC-039: Handbuch-Snapshot Backend** — UPDATE exit_readiness Template mit handbook_schema + Worker `handbook_snapshot_generation` Job-Type + ZIP-Builder + RPCs (Migration 074).
8. **SLC-040: Handbuch-UI + Self-Service-Cockpit Foundation** — tenant_admin Handbuch-Generieren-Button + Download (signierte URL) + Self-Service-Cockpit auf /dashboard mit 5 Metriken + regelbasierter "Naechster Schritt".

8 Slices. SLC-033 ist Schema-only-Slice (Backend-Setup ohne UI). SLC-035→036, SLC-037→038, SLC-039→040 sind Backend→Frontend-Paare. Reihenfolge: Schema → Auth → Bridge-Backend → Bridge-Frontend → Employee-Flow → Hooks-Spike → Handbuch-Backend → Handbuch+Cockpit-Frontend.

Pflicht-Browser-Smoke-Test mit Nicht-Tech-User vor V4-Release (R17, SC-V4-5) ist Bestandteil von /qa SLC-040 und der Gesamt-V4-QA.

### Naechster Schritt V4

`/slice-planning` mit 8 Slices.

---

## Anhang A — How to add a new Capture-Mode

Stand: V4 (SLC-038). Geltungsbereich: Capture-Modes innerhalb der Onboarding-Plattform. Bei neuen Hook-Punkten in V5+ ist diese Anleitung zu erweitern.

Capture-Modes sind ueber zwei Hooks plus eine Registry definiert (DEC-040): einen Worker-Pipeline-Slot und einen UI-Slot. Es gibt explizit **keinen** eigenen Routing- oder Permissions-Slot — Routing erfolgt ueber den `basePath` in der Registry, Permissions ueber RLS-Policies, die unabhaengig vom Mode definiert sind.

Die folgenden Schritte sind die vollstaendige Checkliste fuer einen neuen Mode. Vorlage: `walkthrough_stub` (SLC-038) — minimal, aber vollstaendig demonstriert.

### Schritt 1 — CHECK-Constraint erweitern (Migration)

`capture_session.capture_mode` ist ein TEXT mit CHECK-Constraint. Ein neuer Mode-String ist nur erlaubt, wenn er im Constraint enthalten ist. Migration analog zu MIG-067:

```sql
ALTER TABLE public.capture_session
  DROP CONSTRAINT capture_session_capture_mode_check;
ALTER TABLE public.capture_session
  ADD CONSTRAINT capture_session_capture_mode_check
  CHECK (capture_mode IS NULL OR capture_mode IN (
    'questionnaire',
    'evidence',
    'voice',
    'dialogue',
    'employee_questionnaire',
    'walkthrough_stub',
    'mein_neuer_mode'   -- NEU
  ));
```

Wenn der Mode auch als `knowledge_unit.source` auftritt, ist `knowledge_unit_source_check` analog zu erweitern.

### Schritt 2 — Worker-Handler

Liefere einen Handler unter:

```
src/workers/capture-modes/<mode>/handle.ts
```

Konvention: exportiere `handle<Mode>Job(job: ClaimedJob)`. Der Handler ist verantwortlich fuer:

- payload aus `job.payload` lesen
- Mode-spezifische Verarbeitung (Bedrock, Aggregation, Markdown-Render, etc.)
- am Ende `rpc_complete_ai_job` (Erfolg) oder Throw (Fehler — claim-loop ruft `rpc_fail_ai_job`)

Vorlage: `src/workers/capture-modes/walkthrough-stub/handle.ts` (Stub: loggt + completed).

### Schritt 3 — Worker-Job-Type registrieren

Drei Stellen in `src/workers/condensation/`:

1. **`claim-loop.ts`** — Job-Type-Konstante `JOB_TYPES` um `<mode>_processing` erweitern.
2. **`claim-loop.ts`** — `startClaimLoop`-Signatur um optionalen Handler-Parameter erweitern und im Dispatch-Switch eine neue `else if`-Verzweigung anlegen.
3. **`run.ts`** — Handler importieren und an `startClaimLoop` durchreichen.

Konvention: Job-Type-Naming `<mode>_processing` (z.B. `walkthrough_stub_processing`). Klassische Modes (questionnaire/evidence/dialogue) teilen sich aus historischen Gruenden den gemeinsamen `knowledge_unit_condensation`-Job — neue Modes sollen einen eigenen Job-Type haben, damit Telemetry und Re-Run klar trennbar sind.

### Schritt 4 — UI-Komponente

Liefere eine Komponente unter:

```
src/components/capture-modes/<mode>/<Mode>Mode.tsx
```

Zwei Varianten:

- **Vollstaendige Stub-Komponente** (wie `WalkthroughStubMode`): rendert eigene Page, ersetzt `QuestionnaireWorkspace` komplett. Geeignet fuer Modes, die nicht der Frage-Antwort-Logik folgen (z.B. Walkthrough-Recording, Diary-Stream).
- **Wrapper um `QuestionnaireWorkspace`** (wie `EmployeeQuestionnaireMode`): minimal, setzt nur `basePath` oder Mode-spezifische Props. Geeignet fuer Modes, die strukturell Fragebogen sind, aber ein anderes Routing oder einen anderen Visual-Frame brauchen.

### Schritt 5 — Registry-Eintrag

`src/components/capture-modes/registry.ts`:

1. Mode-String zum `CaptureMode`-Union ergaenzen.
2. Eintrag in `CAPTURE_MODE_REGISTRY` mit:
   - `basePath` — Routing-Praefix (z.B. `/capture` oder `/employee/capture`)
   - `workerJobType` — Job-Type aus Schritt 3
   - `displayName` — lesbarer Name fuer Cockpit/Logs
   - `productive` — `true` wenn der Mode in tenant_admin-UI auswaehlbar sein soll, `false` fuer Spike/Internal-Modes
   - `StubComponent` — die Komponente aus Schritt 4 wenn sie `QuestionnaireWorkspace` ersetzen soll, sonst `null`

Beispiel `walkthrough_stub`:

```typescript
walkthrough_stub: {
  basePath: "/capture",
  workerJobType: "walkthrough_stub_processing",
  displayName: "Walkthrough-Mode (Spike)",
  productive: false,
  StubComponent: WalkthroughStubMode,
},
```

### Schritt 6 — Optional: Mode-spezifische Tabellen oder Spalten

Wenn der Mode eigene Persistenz-Strukturen braucht (z.B. `dialogue_session` fuer V3 Dialogue), liefere eine eigene Migration. Wenn der Mode mit den bestehenden Tabellen auskommt (`capture_session`, `block_checkpoint`, `knowledge_unit`), ist Schritt 1 alleine ausreichend — das ist die zentrale SC-V4-6-Eigenschaft.

`employee_questionnaire` braucht keine eigene Tabelle, weil es 1:1 die `questionnaire`-Pipeline nutzt mit `source='employee_questionnaire'`. `walkthrough_stub` braucht keine eigene Tabelle, weil es als Spike keine Daten persistiert. Echte V5/V6-Modes (Walkthrough-Recording, Diary) werden Mode-spezifische Tabellen brauchen.

### Schritt 7 — Tests

Mindestens:

- **Registry-Test**: neuer Mode-Key ist in `ALL_CAPTURE_MODES`, `resolveCaptureMode('mein_neuer_mode')` liefert die korrekte Meta. Vorlage: `src/components/capture-modes/__tests__/registry.test.ts`.
- **Handler-Smoke** wenn der Handler nicht-trivial ist: Unit-Test auf payload-Parsing + Bedrock-Mock.
- **RLS-Tests** wenn der Mode Sicht-Perimeter-Auswirkungen hat (z.B. wenn ein neuer KU-source-Wert eingefuehrt wird).

### Was kein Hook ist (DEC-040)

- **Routing-Slot**: Es gibt keinen modularen Routing-Slot pro Mode. Mode-Pages liegen statisch unter `/capture/...` oder `/employee/capture/...`. Die Registry trifft nur die Komponenten-Auswahl innerhalb dieser Pages, nicht die URL-Struktur.
- **Permissions-Slot**: Es gibt keine Mode-spezifische Permission-Schicht. Sicht-Perimeter werden ueber RLS-Policies pro Tabelle gesteuert. Wenn ein Mode neue Tabellen einfuehrt, sind RLS-Policies dieser Tabellen unabhaengig vom Mode-Hook zu definieren.

Diese Beschraenkungen sind bewusst — sie halten die Komplexitaet der Hook-Konvention klein und vermeiden ein zweites Skill-System neben RLS.

### Spike-Beweis SC-V4-6

`walkthrough_stub` wurde in SLC-038 hinzugefuegt mit:

1. CHECK-Constraint-Erweiterung in MIG-067 (bereits in V4-Schema-Fundament SLC-033 vorbereitet, kein neuer Migration-Lauf in SLC-038 noetig).
2. `src/workers/capture-modes/walkthrough-stub/handle.ts` (Stub-Handler).
3. `walkthrough_stub_processing` in `claim-loop.ts` JOB_TYPES + Dispatch.
4. `src/components/capture-modes/walkthrough-stub/WalkthroughStubMode.tsx` (Platzhalter-Page).
5. Eintrag in `CAPTURE_MODE_REGISTRY`.
6. Routes `/capture/[sessionId]/page.tsx` und `/capture/[sessionId]/block/[blockKey]/page.tsx` delegieren via Registry-Lookup.

Keine zusaetzliche Tabelle, kein zusaetzlicher RLS-Eintrag, keine neue Storage-Bucket. Der Mode ist live, ohne dass das V4-Schema strukturell veraendert wurde — exakt SC-V4-6.

---

## V4.1 Architecture Addendum — Handbuch-Reader + Berater-Review-Workflow

### Architecture summary

V4.1 erweitert den V4-Stack um drei Aspekte, ohne die V4-Foundation strukturell zu veraendern:

1. **Ein neues Schema** (`block_review`) als Single-Source-of-Truth fuer den expliziten Berater-Approval-Schritt zwischen Mitarbeiter-Capture und Handbuch-Generation. Eine Tabelle, eine Migration, ein zusaetzlicher RLS-Block.
2. **Ein Worker-Pre-Filter-Schritt** im bestehenden `handle-snapshot-job.ts` (Reihenfolge VOR `renderHandbook`). Mitarbeiter-KUs (`source='employee_questionnaire'`) werden durch `block_review.status='approved'` gefiltert, bevor der bestehende `sections.ts`-Renderer arbeitet. GF-KUs sind unbeeinflusst. Der Renderer bleibt unveraendert — V4-Snapshots sind unveraendert reproduzierbar.
3. **Vier neue Frontend-Surfaces**:
   - Reader unter `/dashboard/handbook/[snapshotId]` (admin-only)
   - Konsolidierter Review-View `/admin/blocks/[blockKey]/review`
   - Cross-Tenant `/admin/reviews` + Pro-Tenant `/admin/tenants/[id]/reviews`
   - Cockpit-Card "Mitarbeiter-Bloecke reviewed" auf `/dashboard`

Keine neuen Worker, keine neuen Storage-Buckets, kein zweiter Bedrock-Job. Die Architektur bleibt **boring by design** — eine Tabelle, ein Pre-Filter, vier React-Pages.

### Main components

| Komponente | Typ | Status | Pfad |
|---|---|---|---|
| `block_review` Schema | Backend | NEU | `sql/migrations/079_block_review.sql` (MIG-028) |
| Worker-Pre-Filter | Backend | GEAENDERT | `src/workers/handbook/handle-snapshot-job.ts` |
| `loadApprovedBlockKeys()` Helper | Backend | NEU | `src/workers/handbook/block-review-filter.ts` |
| Approve/Reject Server Actions | Backend | NEU | `src/app/admin/blocks/[blockKey]/review/actions.ts` |
| Reader-Page | Frontend | NEU | `src/app/dashboard/handbook/[snapshotId]/page.tsx` |
| Konsolidierter Review-View | Frontend | NEU | `src/app/admin/blocks/[blockKey]/review/page.tsx` |
| Cross-Tenant-Reviews-Page | Frontend | NEU | `src/app/admin/reviews/page.tsx` |
| Pro-Tenant-Reviews-Page | Frontend | NEU | `src/app/admin/tenants/[tenantId]/reviews/page.tsx` |
| Cockpit-Card "Mitarbeiter-Bloecke reviewed" | Frontend | NEU | `src/components/cockpit/BlockReviewStatusCard.tsx` |
| Trigger-Dialog "Quality-Gate" | Frontend | GEAENDERT | `src/app/admin/handbook/TriggerHandbookButton.tsx` |
| Reviews-Badge in `/admin/tenants` | Frontend | GEAENDERT | `src/app/admin/tenants/TenantsClient.tsx` |
| `/admin/tenants/[id]/handbook` Direct-Link | Frontend | NEU | bestehende Page erweitern oder neue Sub-Page |

### Data model — `block_review`

```sql
CREATE TABLE block_review (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  capture_session_id uuid NOT NULL REFERENCES capture_session(id) ON DELETE CASCADE,
  block_key       text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, capture_session_id, block_key)
);

CREATE INDEX idx_block_review_status_created ON block_review (status, created_at)
  WHERE status = 'pending';
CREATE INDEX idx_block_review_tenant_status ON block_review (tenant_id, status);
```

**Audit-Modell:** Single-Row pro Block — KEINE History-Tabelle in V4.1 (DEC-050). Status-Transitionen werden ueberschrieben (`reviewed_by` und `reviewed_at` zeigen den letzten Reviewer + Zeitpunkt). Begruendung: V4.1-Reviews sind selten (max. einmal pro Block + Mitarbeiter-Review-Zyklus); das validation_layer-Pattern aus V2 deckt komplexere Audit-Faelle ab, falls noetig spaeter nachzuruesten.

**Konsistenz:** Block-Approval ist tenant-isoliert ueber `tenant_id`-Spalte plus RLS. Der Composite-UNIQUE `(tenant_id, capture_session_id, block_key)` verhindert doppelte Reviews fuer denselben Block.

### Data flow — Block-Submit → Review → Snapshot

```
[Mitarbeiter submitted Block]
       ↓
[capture_event + Worker-Verdichtung erzeugt KUs mit source='employee_questionnaire']
       ↓
[Trigger 1: ON INSERT capture_event WHERE source='employee_questionnaire']
   --> upsert block_review (tenant_id, session_id, block_key) DEFAULT 'pending'
       ↓
[Cross-Tenant-Sicht /admin/reviews zeigt 'pending']
       ↓
[strategaize_admin oeffnet /admin/blocks/[blockKey]/review?tenant=...&session=...]
   --> sieht alle Mitarbeiter-KUs des Blocks (Block-zentriert, DEC-046)
   --> Approve | Reject (+ optional note)
   --> UPDATE block_review SET status='approved', reviewed_by=auth.uid(), reviewed_at=now()
       ↓
[tenant_admin oder strategaize_admin klickt Trigger im /admin/handbook]
   --> TriggerHandbookButton:
       SELECT count(*) WHERE source='employee_questionnaire' GROUP BY block_review.status
       wenn pending > 0: Confirm-Dialog "X/Y reviewed. Trotzdem generieren?"
       click-through: enqueue handbook_snapshot_generation Job
       ↓
[Worker handle-snapshot-job.ts]
   1. Lade Snapshot + Tenant + Template + alle KUs/Diagnosen/SOPs (wie bisher)
   2. NEU: loadApprovedBlockKeys(tenant_id, capture_session_id) -> Set<string>
      (alle Block-Keys mit block_review.status='approved')
   3. NEU: Pre-Filter KU-Liste:
      filteredKus = allKus.filter(ku =>
        ku.source !== 'employee_questionnaire' || approvedBlockKeys.has(ku.block_key)
      )
   4. renderHandbook(filteredKus, ...)  // sections.ts unveraendert
   5. ZIP-Build + Storage-Upload + UPDATE handbook_snapshot
       ↓
[Reader /dashboard/handbook/[snapshotId] zeigt Snapshot]
   --> liest aus handbook-Storage-Bucket via API-Proxy /api/handbook/[id]/download
   --> Reader rendert Markdown via react-markdown (DEC-049)
   --> Sidebar-Liste der Snapshots (DEC-051) + Section-Anchors + Volltext-Suche client-side
```

**Backwards-Compat (DEC-048):** `loadApprovedBlockKeys` gibt fuer Bloecke OHNE `block_review`-Eintrag den Status implizit als `approved` zurueck — alte V4-Snapshots ohne Review-Daten werden weiter ohne Bruch generiert. Migration MIG-028 fuegt einen Backfill-Step ein, der fuer alle existierenden `(tenant_id, capture_session_id, block_key)`-Kombinationen mit Mitarbeiter-KUs einen `approved`-Eintrag setzt. Neue Mitarbeiter-Submits ab V4.1-Deploy starten als `pending`.

### Worker-Pre-Filter — wie konkret

Der bestehende Renderer-Filter in `src/workers/handbook/sections.ts::filterKnowledgeUnits` bleibt unveraendert (er filtert per `section.sources[].filter` nach Source/Status). Die Approval-Logik wird VORGELAGERT als Pre-Filter im `handle-snapshot-job.ts` zwischen Schritt 5 (Lade KUs) und Schritt 6 (renderHandbook):

```typescript
// src/workers/handbook/handle-snapshot-job.ts (vereinfacht)
const allKus = await loadKnowledgeUnits(...);
const approvedBlockKeys = await loadApprovedBlockKeys(
  adminClient,
  snapshot.tenant_id,
  snapshot.capture_session_id,
);
const filteredKus = allKus.filter((ku) =>
  ku.source !== "employee_questionnaire" || approvedBlockKeys.has(ku.block_key),
);
const rendered = renderHandbook({ ...input, knowledgeUnits: filteredKus });
```

Diese Aufteilung haelt die Verantwortlichkeiten sauber:
- **Pre-Filter** = Geschaeftsregel "nur approved Mitarbeiter-Bloecke ins Handbuch"
- **Renderer** = template-driven Section-Aggregation (unveraendert)

Audit-Log-Erweiterung: Pro Snapshot-Job wird ein `note` ins `handbook_snapshot.metadata` geschrieben mit `{ pending_blocks: N, approved_blocks: M, rejected_blocks: K }`. Sichtbar im Reader als Snapshot-Metadata.

### Reader-Architektur — Route + Stack

**Route:** `/dashboard/handbook/[snapshotId]` (DEC-V4.1-3 in PRD, formal als DEC-043 hier).
**Layout:** nutzt bestehendes `dashboard`-Layout (Sidebar + Header). `tenant_admin` sieht den Reader unter "Handbuch" im Sidebar.
**Direct-Link fuer strategaize_admin:** Aus `/admin/tenants/[id]` ein Button "Handbuch oeffnen" der zu `/dashboard/handbook/[snapshotId]?as_tenant=[id]` springt — RLS regelt dass `strategaize_admin` per service_role-Client den Snapshot lesen kann; tenant-Filter wird ueber Snapshot-Row's `tenant_id` ausgewertet, nicht ueber `auth.uid()`.

**Stack:**
- Server-Component laedt `handbook_snapshot`-Row + Snapshot-Markdown-Files aus Storage via Service-Role-Client
- Client-Component rendert Markdown via **`react-markdown`** (DEC-049) mit `remark-gfm` (Tables, Strikethrough)
- Section-Anchors via `rehype-slug` + `rehype-autolink-headings`
- Volltext-Suche client-side ueber den geladenen Markdown-String (`String.includes()` + Highlight via `mark.js`-aequivalentes Inline-DOM-Update)
- Snapshot-Liste als Sidebar-Element (DEC-051) — neueste oben, Klick wechselt Snapshot ohne Page-Reload (Client-Navigation)

**Begruendung `react-markdown` statt `next-mdx-remote` (Q-V4.1-B / DEC-049):** Der Markdown ist generiert und vertrauenswuerdig (kein User-Input), keine MDX-Komponenten noetig, kein Server-Render-Vorteil bei dynamischen Inhalten. `react-markdown` ist deutlich kleiner, hat keine Build-Time-Compilation, und die Plugin-Kette (`remark-gfm`, `rehype-slug`, `rehype-autolink-headings`) ist Standard. `next-mdx-remote` bringt nur Vorteile bei MDX-Komponenten-Embedding — wir brauchen das nicht.

### Konsolidierter Review-View — Layout

**Route:** `/admin/blocks/[blockKey]/review?tenant=...&session=...` (Block-zentriert, DEC-046).
**Layout:**
- Block-Header: Tenant-Name + Block-Titel + Anzahl Mitarbeiter-KUs + Approval-Status
- Hauptbereich: gestapelte Mitarbeiter-KUs, jede mit:
  - Mitarbeiter-Quelle (Name + E-Mail aus `capture_session.created_by` lookup)
  - Confidence-Indikator
  - KU-Inhalt (Title + Content)
  - Optional: Link zur ursprünglichen Mitarbeiter-Capture-Session
- Footer-Aktion: Approve | Reject | Approve mit Notiz (Modal mit Textarea)
- History-Anzeige (read-only): Letzter Reviewer + Zeitpunkt + Notiz

Approve/Reject sind Server Actions die `block_review` upserten und Audit-Felder setzen.

### Cross-Tenant + Pro-Tenant Review-Sichten

**`/admin/reviews`:** Aggregations-Query
```sql
SELECT br.tenant_id, t.name AS tenant_name, br.capture_session_id,
       br.block_key, br.created_at,
       (SELECT count(*) FROM knowledge_unit ku
        WHERE ku.tenant_id = br.tenant_id
          AND ku.capture_session_id = br.capture_session_id
          AND ku.block_key = br.block_key
          AND ku.source = 'employee_questionnaire') AS ku_count
FROM block_review br
JOIN tenants t ON t.id = br.tenant_id
WHERE br.status = 'pending'
ORDER BY br.created_at ASC;
```
Sortiert oldest-first. Index `idx_block_review_status_created` deckt diese Query ab.

**`/admin/tenants/[id]/reviews`:** Gleiche Query, gefiltert auf `br.tenant_id = $1`. Index `idx_block_review_tenant_status` deckt diese ab.

**Quick-Stats-Badge in `/admin/tenants`:** Aggregate count per tenant
```sql
SELECT tenant_id, count(*) FILTER (WHERE status = 'pending') AS pending_reviews
FROM block_review GROUP BY tenant_id;
```
LEFT-JOIN auf bestehende Tenant-Liste, Badge-Render im TenantsClient.

### Trigger-Dialog "Quality-Gate" — UX

`TriggerHandbookButton.tsx` wird erweitert:
1. Beim Click: Server-Action `getReviewSummary(tenantId, sessionId)` -> `{ approved: M, pending: K, rejected: 0 }`
2. Wenn `pending > 0`:
   - Confirm-Dialog (z.B. shadcn `AlertDialog`): "X/Y Mitarbeiter-Bloecke reviewed. K Bloecke werden NICHT ins Handbuch fliessen. Trotzdem generieren?"
   - Click-Through ruft die bestehende Trigger-Server-Action mit zusaetzlichem Audit-Field `pending_at_trigger: K`
3. Wenn `pending === 0`: Trigger laeuft direkt ohne Dialog (V4-Verhalten)

Audit-Log-Eintrag pro Trigger: in `error_log` (typisierte info-Severity, nicht "error") mit `{ snapshot_id, pending_blocks_at_trigger: K }`.

### Cockpit-Card "Mitarbeiter-Bloecke reviewed"

Neue Card auf `/dashboard` als 6. MetricCard (oder eingebettet als Sub-Card unter "Mitarbeiter-Aufgaben" — finale UI-Entscheidung in /frontend, aber Architektur schlaegt eigene Card vor wegen klarer Daten-Quelle):
- `tenant_admin`-Sicht: read-only "X/Y" mit Link auf eine read-only Pro-Tenant-Reviews-Sicht
- `strategaize_admin`-Sicht: gleiche Daten mit Link auf `/admin/tenants/[id]/reviews`
- Aggregations-Query laeuft als Server-Component-Fetch im Layout

### Security / RLS

**`block_review`-RLS-Policies (RLS-Test-Matrix-Erweiterung um diese Tabelle, SC-V4.1-12):**

| Rolle | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `strategaize_admin` | ALL | ALL | ALL | ALL |
| `tenant_admin` | OWN tenant_id | DENY | DENY | DENY |
| `tenant_member` | DENY | DENY | DENY | DENY |
| `employee` | DENY | DENY | DENY | DENY |

Begruendung:
- `tenant_admin` darf SEHEN (Cockpit-Card "X/Y reviewed", read-only Liste), darf aber NICHT approven/rejecten — Approval ist `strategaize_admin`-Hoheit (Berater entscheidet ueber Quality)
- `tenant_member` und `employee` sehen den Status nicht — er ist Berater-Workflow, nicht Mitarbeiter-Workflow

**Reader-Route-RLS:**
- `strategaize_admin` + `tenant_admin` (eigener Tenant): SELECT auf `handbook_snapshot` + Storage-Lese-Berechtigung via API-Proxy
- `tenant_member` + `employee`: 403 oder Redirect (Middleware-Block analog zu V4 `/admin/*` und `/dashboard/*` Logik)

**Cross-Link "Im Debrief bearbeiten" sichtbarkeits-Filter (SC-V4.1-3):**
- Server-seitig im Reader-Page-Render: `if (auth.role === 'strategaize_admin') showDebriefLink = true` — Link nicht im DOM fuer `tenant_admin`

### External dependencies / integrations

Keine neuen externen Dependencies. NPM-Pakete:
- `react-markdown` + `remark-gfm` + `rehype-slug` + `rehype-autolink-headings` — alle weit verbreitet, MIT-lizenziert, unter 50KB gzipped zusammen

Keine neuen API-Calls (kein Bedrock, kein Whisper, kein Storage-Provider).

### Constraints / tradeoffs

**Trade-off 1 — Reader-Performance bei grossen Snapshots:**
Reader laedt das gesamte Markdown beim ersten Render. Snapshots > 500KB Markdown werden als Warnung im Reader gekennzeichnet. Volltext-Suche bleibt client-side (`String.includes`) — Server-Side-Search waere overkill fuer V4.1-Volume und wuerde einen zweiten Index brauchen.
Akzeptiert: V4-Snapshots sind erfahrungsgemaess <200KB (siehe Live-Demo-Tenant-Daten).

**Trade-off 2 — Backfill `approved` vs `pending`:**
Backfill setzt fuer ALLE existierenden `(session, block)`-Kombinationen mit Mitarbeiter-KUs den Status `approved`. Alternative waere `pending` mit Berater-Aufforderung — aber das wuerde V4-Live-Tenants in Block-Limbo schicken. DEC-048 entscheidet fuer Backwards-Compat: alle bestehenden Daten = approved, neue ab V4.1-Deploy = pending.

**Trade-off 3 — Kein KU-granulares Flag:**
Block-Approval (DEC-044) ist gegen den User-Wunsch nach Granularitaet eine bewusste Vereinfachung. Begruendung: KU-Override haette pro Mitarbeiter-Beitrag eine UI-Decision verlangt — UX wird unueberblickbar, Berater verliert Zeit. Block-Approval haelt die Berater-Aktion auf 1 Klick pro Block.
Falls KU-Override echt gebraucht wird (V4.2+): Migration ergaenzt Spalte `included_in_handbook bool` auf `knowledge_unit`, Worker-Filter erweitert, Review-View bekommt KU-Toggles.

**Trade-off 4 — Kein Berater-Mode-Toggle:**
DEC-047 verzichtet bewusst auf Tenant-Impersonation oder UI-Switcher. Begruendung: `strategaize_admin` sieht via RLS-bypass alle Tenant-Daten — ein Toggle wuerde nur die Anzeige veraendern, nicht die Daten. `/admin/reviews` als Cross-Tenant-Sicht und `/admin/tenants/[id]/reviews` als Pro-Tenant-Sicht reichen fuer den Berater-Workflow.

**Trade-off 5 — Audit-Felder ohne History-Tabelle:**
DEC-050 nutzt single-row Audit (`reviewed_by`, `reviewed_at`, `note`). Status-Transitionen werden ueberschrieben. Begruendung: Reviews sind in V4.1 selten und in der Regel monoton (pending → approved). Falls History-Bedarf entsteht (z.B. Berater wechselt Approval mehrfach): validation_layer-Pattern aus V2 ist die etablierte Loesung und kann nachgeruestet werden.

### Open technical questions (verbleibend)

Die folgenden Fragen werden in `/slice-planning V4.1` oder spaeter (`/frontend`) entschieden:

- **Q-V4.1-F (Slice) — `as_tenant`-Query-Param oder Drill-Down-Stateful:** Wie `strategaize_admin` aus `/admin/tenants/[id]` zum Reader navigiert. Vorschlag: Direct-URL `/dashboard/handbook/[snapshotId]` reicht (RLS bypass durch service_role bzw. `strategaize_admin`-Pruefung in Layout).
- **Q-V4.1-G (Frontend) — Volltext-Suche-UX-Detail:** Suche-Eingabe als Sidebar-Filter oder Top-Bar? Anzahl Treffer als Counter? Decision in /frontend SLC-045.
- **Q-V4.1-H (Slice) — Cockpit-Card-Slot:** Eigene Card "Mitarbeiter-Bloecke reviewed" oder Erweiterung der bestehenden "Mitarbeiter-Aufgaben"-Card. Architektur empfiehlt eigene Card. Finaler Cut in /frontend SLC-042.

### Implementation direction

Empfohlene Slice-Reihenfolge (deckungsgleich mit PRD-Skizze):

1. **SLC-041** (Backend, ~3 MTs): MIG-028 + RLS-Policies + `loadApprovedBlockKeys`-Helper + Worker-Pre-Filter + Server-Action-Foundation. RLS-Test-Matrix erweitern.
2. **SLC-042** (Frontend, ~5 MTs): Konsolidierter Review-View `/admin/blocks/[blockKey]/review` + Approve/Reject Server-Actions + Trigger-Dialog "Quality-Gate" + Cockpit-Card.
3. **SLC-043** (Frontend, ~4 MTs): `/admin/reviews` Cross-Tenant + `/admin/tenants/[id]/reviews` Pro-Tenant + Quick-Stats-Badge in `/admin/tenants` + Direct-Links zu Konsolidiertem Review-View und `/admin/debrief`.
4. **SLC-044** (Frontend, ~6 MTs): Reader unter `/dashboard/handbook/[snapshotId]` mit react-markdown + Sidebar-Nav + Section-Anchors + Snapshot-Liste + Cross-Link "Im Debrief bearbeiten" + RLS-Sicht.
5. **SLC-045** (Frontend, ~3 MTs): Volltext-Suche Client-Side im Reader + Highlight + Stale-Snapshot-Warnung.

Pflicht-Gates fuer V4.1-Implementation:
- Pflicht-Browser-Smoke nach SLC-044 (Reader-UX-Test mit Nicht-Tech-User-Persona, analog SC-V4-5).
- 4-Rollen-RLS-Matrix erweitert um `block_review` (mind. 8 zusaetzliche Test-Faelle, Pflicht in /qa SLC-041 + SLC-042).
- Worker-Backwards-Compat-Test in /qa SLC-041 (alte V4-Snapshots koennen ohne `block_review`-Eintraege re-generiert werden).

---

## V4.2 Architecture Addendum — Tenant Self-Service Onboarding (Wizard + Reminders + In-App-Hilfe)

### Architecture summary

V4.2 erweitert die V4 + V4.1 Foundation um drei orthogonale Self-Service-Bausteine, ohne neue Container, neue Worker-Job-Typen, neue Storage-Buckets oder neue Bedrock-Calls einzufuehren:

1. **Drei neue Datenmodell-Erweiterungen**: 3 Spalten auf bestehender `tenants`-Tabelle fuer Wizard-State, neue `reminder_log`-Tabelle fuer Reminder-Idempotenz + Audit, neue `user_settings`-Tabelle fuer Per-User-Praeferenzen + Unsubscribe-Token.
2. **Ein neuer Cron-Endpoint** unter `/api/cron/capture-reminders` (POST mit `x-cron-secret`-Header). Coolify Scheduled Task ruft den Endpoint taeglich um 09:00 Europe/Berlin via `node -e fetch()`-Pattern (etabliert im Business System V4.x). Cron schreibt Audit-Log nach `error_log` (severity='info').
3. **Drei neue Frontend-Surfaces**: 4-Schritte-Wizard-Modal (shadcn `Dialog`), Right-Side Help-Sheet (shadcn `Sheet` mit Markdown-Render via `react-markdown` aus FEAT-028), Cockpit-Card "Mitarbeiter ohne Aktivitaet" (regelbasierte Aggregation, Page-Refresh-only).

Help-Content lebt unter `src/content/help/<page-key>.md` (5 Files, statisch ueber `fs.readFileSync` zur Server-Render-Zeit geladen). Tooltips an mind. 5 UI-Elementen ueber bestehendes shadcn `Tooltip` (Radix-Underlying).

Die V4.2-Architektur ist explizit **boring by design** — alles laeuft auf bestehender Infrastruktur, alle Patterns sind im System bereits validiert (Cron-Pattern aus Business System, Markdown-Render aus V4.1 Reader, RLS-Matrix-Erweiterung wie SLC-041).

### Main components

| Komponente | Typ | Status | Pfad |
|---|---|---|---|
| `tenants.onboarding_wizard_*` Spalten | Backend | NEU | `sql/migrations/080_v42_self_service.sql` (MIG-029) |
| `reminder_log` Tabelle | Backend | NEU | dito |
| `user_settings` Tabelle | Backend | NEU | dito |
| Cron-Endpoint `/api/cron/capture-reminders` | Backend | NEU | `src/app/api/cron/capture-reminders/route.ts` |
| `sendReminder()` Helper | Backend | NEU | `src/lib/reminders/send-reminder.ts` |
| `workdaysSince()` Helper | Backend | NEU | `src/lib/reminders/workdays.ts` |
| Unsubscribe-Endpoint `/api/unsubscribe/[token]` | Backend | NEU | `src/app/api/unsubscribe/[token]/route.ts` |
| `getInactiveEmployeesCount()` | Backend | NEU | `src/lib/dashboard/inactive-employees.ts` |
| Wizard-Server-Actions (setStarted/setStep/setSkipped/setCompleted) | Backend | NEU | `src/app/dashboard/wizard-actions.ts` |
| Wizard-Modal (4 Steps) | Frontend | NEU | `src/components/onboarding-wizard/Wizard.tsx` + 4 Step-Komponenten |
| Wizard-Auto-Trigger im Layout | Frontend | GEAENDERT | `src/app/dashboard/layout.tsx` |
| Help-Sheet | Frontend | NEU | `src/components/help/HelpSheet.tsx` |
| Help-Trigger-Button (`?`-Icon im Header) | Frontend | NEU | `src/components/help/HelpTrigger.tsx` |
| `loadHelpMarkdown(pageKey)` Helper | Backend (server-side) | NEU | `src/lib/help/load.ts` |
| 5 Help-Markdown-Files | Frontend Content | NEU | `src/content/help/*.md` |
| Cockpit-Card "Mitarbeiter ohne Aktivitaet" | Frontend | NEU | `src/components/cockpit/InactiveEmployeesCard.tsx` |
| Mitarbeiter-Liste-Filter `?filter=inactive` | Frontend | GEAENDERT | `src/app/admin/employees/page.tsx` |
| Opt-Out-Toggle (User-Settings) | Frontend | NEU | `src/app/dashboard/settings/page.tsx` (oder Inline auf /dashboard) |
| Tooltips an 5 UI-Elementen | Frontend | GEAENDERT | (verteilt: Bridge-Trigger, Approve-Block, Generate-Snapshot, Wizard-Spaeter, Inactive-Badge) |

### Data model — `tenants.onboarding_wizard_*` (Wizard-State pro Tenant)

```sql
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS onboarding_wizard_state text NOT NULL DEFAULT 'pending'
    CHECK (onboarding_wizard_state IN ('pending', 'started', 'skipped', 'completed')),
  ADD COLUMN IF NOT EXISTS onboarding_wizard_step integer NOT NULL DEFAULT 1
    CHECK (onboarding_wizard_step BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS onboarding_wizard_completed_at timestamptz;

-- Partial index — nur die Tenants die noch im Wizard koennten
CREATE INDEX IF NOT EXISTS idx_tenants_wizard_state
  ON public.tenants (onboarding_wizard_state)
  WHERE onboarding_wizard_state IN ('pending', 'started');
```

**State-Maschine:**
- `pending` (default fuer neue Tenants ab V4.2-Deploy) → `started` (erster Wizard-Open) → `completed` (Schritt 4 mit "Erledigt"-Click) ODER → `skipped` ("Spaeter"-Click oder "Nicht mehr zeigen")
- Backwards-Compat: Migration setzt fuer alle pre-V4.2 Tenants `state='completed'` (DEC-053). Diese Tenants kennen das Tool bereits, Wizard waere unnoetig.

**Multi-Admin-Lock (DEC-053):**
```typescript
// Server-Action setStarted (atomar)
const { rowCount } = await db.query`
  UPDATE tenants
  SET onboarding_wizard_state = 'started',
      onboarding_wizard_step = 1
  WHERE id = ${tenantId}
    AND onboarding_wizard_state = 'pending'
`;
return rowCount === 1; // true = dieser User darf den Wizard starten
```

Wenn 0 Rows: anderer Admin war schneller, dieser User sieht direkt das Cockpit.

**RLS:** Bestehende Policies auf `tenants` decken die neuen Spalten ab (existing `tenant_admin` SELECT/UPDATE OWN, `strategaize_admin` ALL). Kein neuer RLS-Block.

### Data model — `reminder_log` (Idempotenz + Audit)

```sql
CREATE TABLE public.reminder_log (
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

CREATE INDEX idx_reminder_log_tenant_date
  ON public.reminder_log (tenant_id, sent_date DESC);
```

**Idempotenz:** Unique-Constraint `(employee_user_id, reminder_stage, sent_date)` verhindert Doppel-Sends bei Cron-Doppellauf am selben Tag. Cron-Endpoint nutzt `INSERT ... ON CONFLICT DO NOTHING` und prueft `rowCount` ob tatsaechlich gesendet wurde.

**Status `skipped_opt_out`:** Wird auch geloggt, damit Audit zeigt warum kein Send erfolgte (nicht "stiller Skip"). `error_message` traegt SMTP-Fehler bei `status='failed'`.

**RLS:**
- `strategaize_admin`: ALL (Cross-Tenant-Audit)
- `tenant_admin`: SELECT OWN tenant_id (Audit-Lese fuer eigene Tenant-Reminders)
- `tenant_member`, `employee`: DENY
- INSERT/UPDATE: NUR via service_role (Cron-Endpoint nutzt service_role-Client mit RLS-Bypass)

### Data model — `user_settings` (Per-User-Praeferenzen + Unsubscribe-Token)

```sql
CREATE TABLE public.user_settings (
  user_id            uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  reminders_opt_out  boolean     NOT NULL DEFAULT false,
  unsubscribe_token  text        NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unsubscribe_token)
);

-- Trigger: auto-create user_settings beim auth.users-INSERT (passive seed)
CREATE OR REPLACE FUNCTION public.tg_create_user_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER tg_create_user_settings_on_auth_users_insert
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.tg_create_user_settings();
```

**Token-Strategie:** 64-char-Hex-Token via `gen_random_bytes(32)`. Kein Expiry — Unsubscribe-Token bleibt gueltig solange der User existiert. Token ist NICHT zur Authentifizierung geeignet, nur fuer einen einzigen Unsubscribe-Effekt.

**Backfill (in MIG-029 Schritt 3):**
```sql
INSERT INTO public.user_settings (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
```

**RLS:**
- `strategaize_admin`: ALL
- jeder authenticated User: SELECT/UPDATE OWN row (`user_id = auth.uid()`)
- Cross-User-Lookup (z.B. `tenant_admin` will sehen welche Mitarbeiter opt-out): bewusst nicht erlaubt (User-Praeferenz ist privat)

### Data flow — Wizard

```
[tenant_admin loggt sich erstmalig ein]
       ↓
[Server-Component dashboard/layout.tsx prueft:
  - auth.user_role() === 'tenant_admin' (kein strategaize_admin!)
  - tenant.onboarding_wizard_state === 'pending'
  - capture_session_count === 0 (zusaetzliche Soft-Bedingung)]
       ↓
[Wenn alle 3 erfuellt: render <WizardModal> mit initialStep=1]
       ↓
[Client-Klick "Weiter" auf Schritt 1
  → Server-Action setStarted(tenantId)
  → atomares UPDATE state='started', step=1 WHERE state='pending'
  → wenn rowCount=0: anderer Admin war schneller → modal schliesst]
       ↓
[Schritt 2: Template-Auswahl
  → Lokal-State (selectedTemplateId) bis Submit
  → "Weiter" → setStep(2)]
       ↓
[Schritt 3: Mitarbeiter-Invite-Form
  → Inline 0..N Inputs (E-Mail + Anzeigename)
  → Submit → bestehende Server-Action inviteEmployees(...)
  → setStep(3) nach Erfolg]
       ↓
[Schritt 4: 3 Quick-Action-Cards
  → "Erledigt" → setCompleted(tenantId) + completed_at=now()
  → "Schliessen + nicht mehr zeigen" → setSkipped(tenantId)
  → Card-Klicks navigieren zu /capture, /admin/bridge, /admin/handbook]
```

**Skip-Pfade:**
- "Spaeter"-Button auf Schritt 1-3 → setSkipped(tenantId)
- "Schliessen + nicht mehr zeigen" auf Schritt 4 → setSkipped(tenantId)
- Beide setzen `state='skipped'` final — Wizard erscheint danach nie wieder.

**Crash-Recovery:** Wenn Wizard durch JS-Exception bricht, fuehrt der Error-Boundary einen `setSkipped(tenantId)` Server-Action aus + leitet zum Cockpit weiter. User wird nicht aus dem Tool ausgesperrt (Constraint aus PRD).

### Data flow — Capture-Reminders Cron

```
[Coolify Scheduled Task (taeglich 09:00 Europe/Berlin)]
       ↓
[POST /api/cron/capture-reminders mit x-cron-secret: $CRON_SECRET]
       ↓
[Endpoint validiert Header gegen ENV CRON_SECRET (403 bei Mismatch + error_log severity='warn')]
       ↓
[Service-Role-Client lade Mitarbeiter-Kandidaten:
  SELECT u.id AS user_id, u.email, ei.tenant_id, ei.accepted_at,
         us.reminders_opt_out, us.unsubscribe_token
  FROM auth.users u
  JOIN employee_invitation ei ON ei.accepted_user_id = u.id AND ei.status='accepted'
  LEFT JOIN user_settings us ON us.user_id = u.id
  WHERE NOT EXISTS (
    SELECT 1 FROM block_checkpoint bc WHERE bc.created_by = u.id
  )]
       ↓
[Pro Kandidat:
  workdays = workdaysSince(accepted_at)
  if workdays >= 3 and < 7: stage = 'stage1'
  if workdays >= 7: stage = 'stage2'
  if workdays < 3: skip]
       ↓
[Pro stage:
  if reminders_opt_out: status = 'skipped_opt_out' (kein Send)
  else: try sendReminder(email, stage, unsubscribe_token)
        if ok: status = 'sent'
        if exception: status = 'failed', error_message = e.message]
       ↓
[INSERT INTO reminder_log (tenant_id, employee_user_id, reminder_stage,
   email_to, status, error_message)
 ON CONFLICT (employee_user_id, reminder_stage, sent_date) DO NOTHING]
       ↓
[Aggregiere Counts: stage1_sent, stage2_sent, skipped_opt_out, failed]
       ↓
[INSERT INTO error_log (severity='info', message='cron:capture-reminders',
   metadata = JSON.stringify({ stage1_sent, stage2_sent, skipped_opt_out, failed }))]
       ↓
[Response 200 JSON: { stage1_sent, stage2_sent, skipped_opt_out, failed }]
```

**Werktage-Helper (DEC-055):**
```typescript
// src/lib/reminders/workdays.ts
export function workdaysSince(start: Date, end: Date = new Date()): number {
  let count = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}
```

Mo-Fr ohne Holiday-Calendar. Drift bei Feiertagen (z.B. Mo Feiertag → Reminder kommt einen Tag spaeter) ist akzeptabel weil max. 2 Reminder.

**SMTP-Send (DEC-056):**
Wiederverwendung der bestehenden Supabase-Auth-SMTP-Konfiguration aus V1+. Eigentliche Send-Methode in `src/lib/reminders/send-reminder.ts`:
- Wenn Supabase JS-SDK keine Custom-Send-API hat: Direct-SMTP via `nodemailer` mit den bestehenden Supabase-SMTP-ENVs (`SUPABASE_SMTP_HOST`, `_PORT`, `_USER`, `_PASS`).
- Subject Stage 1: `"Erinnerung: Du hast noch nicht angefangen"`
- Subject Stage 2: `"Letzte Erinnerung: Bitte starte deine Erfassung"`
- Body: einfacher Text mit Tenant-Name + Capture-Link + Unsubscribe-Link `https://onboarding.../api/unsubscribe/<token>`
- Templates inline im Code (max. 2 Templates, kein eigenes Template-File-System in V4.2)

Falls Volume >50/Tag (Cron-Run loggt Warning): V4.3+ Migration auf Resend/SES.

### Data flow — In-App-Hilfe

```
[User auf z.B. /dashboard]
       ↓
[Server-Component lade Help-Content:
  const helpMd = loadHelpMarkdown('dashboard') // fs.readFileSync zur Render-Zeit]
       ↓
[Page rendert HelpTrigger-Button (?-Icon) im Header
  + HelpSheet als Hidden-Component mit pageKey + helpMd-Prop]
       ↓
[Klick auf '?' → openHelp() (lokaler React-State)
  → HelpSheet wird sichtbar (shadcn Sheet, Right-Side-Slide-In)]
       ↓
[Sheet rendert helpMd via react-markdown + remark-gfm
  (gleiche Lib wie Reader FEAT-028, kein neuer NPM-Pakete)]
       ↓
[User schliesst via Esc / Outside-Click / X-Button]
```

**`loadHelpMarkdown` Helper (DEC-057):**
```typescript
// src/lib/help/load.ts
import { readFileSync } from 'fs';
import { join } from 'path';

const HELP_DIR = join(process.cwd(), 'src/content/help');

export function loadHelpMarkdown(pageKey: string): string {
  return readFileSync(join(HELP_DIR, `${pageKey}.md`), 'utf-8');
}
```

Server-Side-Read zur Render-Zeit. Next.js Server Components cachen das Ergebnis pro Request — kein Re-Read pro Sheet-Open. Fuer Production-Build wird `fs.readFileSync` durch Next.js' Static-Asset-Inlining-Logik gehandhabt (Files unter `src/` werden gebundelt).

**Help-Files (5):**
- `src/content/help/dashboard.md` — "Was zeigt das Cockpit", "Was ist der naechste Schritt-Banner"
- `src/content/help/capture.md` — "Wie funktioniert Block-Submit", "Was sind Knowledge Units"
- `src/content/help/bridge.md` — "Was macht die Bridge-Engine", "Wann nutzen"
- `src/content/help/reviews.md` — "Wozu Block-Reviews", "Wie approven"
- `src/content/help/handbook.md` — "Wie liest man das Handbuch", "Was sind Snapshots"

Mindestens 100 Worter pro File (SC-V4.2-7-Pflicht). Inhalts-Pflege via Git-PR (kein In-App-Editor in V4.2, R-V4.2-3 Mitigation).

**Tooltip-Integration (5 Pflicht-Elemente, DEC-058):**

| UI-Element | Tooltip-Text |
|---|---|
| Bridge-Trigger-Button (`/admin/bridge`) | "Erzeugt Mitarbeiter-Capture-Vorschlaege aus GF-Blueprint" |
| Approve-Block-Button (`/admin/blocks/[blockKey]/review`) | "Approve = Mitarbeiter-Antworten fliessen ins Handbuch" |
| Generate-Snapshot-Button (`/admin/handbook`) | "Generiert das Unternehmerhandbuch aus aktuellem Stand" |
| Wizard-"Spaeter"-Button (Wizard-Modal) | "Du kannst den Wizard jederzeit abschliessen" |
| Inactive-Employees-Badge (`/dashboard`) | "Mitarbeiter mit accepted Invitation aber ohne Block-Submit" |

Alle Tooltips ueber shadcn `Tooltip` (Radix-basiert). Kein "Verstanden, nicht mehr zeigen"-Toggle (DEC-058: Tooltips sind kontextuell, nicht Onboarding-Schritte).

### Cockpit-Card "Mitarbeiter ohne Aktivitaet"

```typescript
// src/lib/dashboard/inactive-employees.ts
export async function getInactiveEmployeesCount(tenantId: string): Promise<number> {
  // Mitarbeiter mit accepted Invitation aber ohne block_checkpoint
  const result = await db.query`
    SELECT count(*) AS cnt FROM employee_invitation ei
    WHERE ei.tenant_id = ${tenantId}
      AND ei.status = 'accepted'
      AND NOT EXISTS (
        SELECT 1 FROM block_checkpoint bc WHERE bc.created_by = ei.accepted_user_id
      )
  `;
  return result.rows[0]?.cnt ?? 0;
}
```

Aufruf im /dashboard Server-Component (RLS-konform, `tenant_admin` darf `employee_invitation` lesen). Refresh-Strategie (DEC-060): Page-Refresh-only — Cockpit ist kein Real-Time-Tool. Aggregation laeuft als Server-Component-Fetch pro Request.

**Card-Layout:**
- Titel: "Mitarbeiter ohne Aktivitaet"
- Wert: Zahl (z.B. "3")
- Kontext: "von X eingeladenen Mitarbeitern" (X = total accepted invitations)
- Klickziel: `/admin/employees?filter=inactive` (Mitarbeiter-Liste mit aktivem Filter)
- Tooltip am Badge: siehe oben (DEC-058)

### Cron-Job Coolify-Configuration

**Coolify Scheduled Task** (DEC-059):

| Feld | Wert |
|------|------|
| **Name** | `capture-reminders-daily` |
| **Command** | `node -e "fetch('http://localhost:3000/api/cron/capture-reminders', { method: 'POST', headers: { 'x-cron-secret': process.env.CRON_SECRET } }).then(r => r.json()).then(console.log).catch(console.error)"` |
| **Frequency** | `0 9 * * *` |
| **Container** | `app` |
| **Timezone** | `Europe/Berlin` (server-default oder explizit `TZ=Europe/Berlin` in app-Container-ENV) |

**ENV-Vars (neu in V4.2):**
- `CRON_SECRET` (zufaelliger 32+ Char Hex-String, in Coolify ENV gesetzt vor erstem Cron-Run)

Cron-Endpoint:
```typescript
// src/app/api/cron/capture-reminders/route.ts (skizziert)
export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    await logError('cron-auth-fail', 'warn');
    return new Response('Unauthorized', { status: 403 });
  }

  const { stage1_sent, stage2_sent, skipped_opt_out, failed }
    = await runReminderBatch();

  await logError('cron:capture-reminders', 'info', {
    stage1_sent, stage2_sent, skipped_opt_out, failed
  });

  return Response.json({ stage1_sent, stage2_sent, skipped_opt_out, failed });
}
```

**Audit-Log:** Jeder Cron-Run schreibt in bestehende `error_log`-Tabelle (V1.1) mit `severity='info'`. Keine neue `cron_log`-Tabelle in V4.2 — wiederverwendet bestehende Infrastruktur.

### External dependencies / integrations

**Keine neuen externen Dependencies.** Wiederverwendung:
- `react-markdown` + `remark-gfm` aus V4.1 (FEAT-028 Reader)
- shadcn `Dialog`, `Sheet`, `Tooltip` (V3+ etabliert)
- Supabase-Auth-SMTP (V1+ etabliert)
- Coolify Scheduled-Task-Pattern (analog Business System V4.x)

**Optionale neue NPM-Dependencies fuer SMTP-Direct-Call (Q-V4.2-I, /backend SLC-048):**
- `nodemailer` falls Supabase-JS-SDK keine Custom-Send-API freigibt. Standard-Library, MIT-lizenziert, 0 Sicherheits-Issues.

### Security / RLS

**`tenants.onboarding_wizard_*`:**
RLS bleibt unveraendert. Bestehende `tenants`-Policies decken die neuen Spalten ab. Wizard-Server-Actions laufen als `tenant_admin`-Client (UPDATE OWN row gilt).

**`reminder_log` RLS-Policies:**

| Rolle | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `strategaize_admin` | ALL | ALL | ALL | ALL |
| `tenant_admin` | OWN tenant_id | DENY | DENY | DENY |
| `tenant_member` | DENY | DENY | DENY | DENY |
| `employee` | DENY | DENY | DENY | DENY |

Cron-Endpoint nutzt service_role-Client, RLS-Bypass.

**`user_settings` RLS-Policies:**

| Rolle | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `strategaize_admin` | ALL | ALL | ALL | ALL |
| jeder User (`auth.uid()`) | OWN | OWN | OWN | DENY |

Begruendung: User darf eigene Praeferenzen sehen + aendern. Cross-User-Lookup verboten — User-Privatsphaere. Trigger-basierte `INSERT` beim auth.users-Insert nutzt SECURITY DEFINER.

**Cron-Endpoint Auth:**
- `x-cron-secret`-Header gegen ENV `CRON_SECRET` validieren
- Bei Mismatch: 403 + `error_log` severity='warn'
- service_role-Client fuer DB-Writes (RLS-Bypass)

**Unsubscribe-Endpoint Auth:**
- Token-basiert (kein Login noetig — DSGVO-konform)
- Token-Lookup in `user_settings.unsubscribe_token` via service_role
- Bei valid Token: UPDATE `user_settings.reminders_opt_out=true` + Bestaetigungs-Page rendern
- Bei invalid Token: 404 + neutrale "Link ungueltig"-Page (kein Token-Existence-Leak)
- Rate-Limit (zukuenftig): falls Brute-Force-Versuche, IP-Throttle nachruesten — V4.3+

**Wizard-Cross-Role-Check:**
- Wizard-Auto-Trigger im Layout pruft `auth.user_role() === 'tenant_admin'`. `strategaize_admin` sieht den Wizard NIE (DEC-051), auch wenn `tenants.onboarding_wizard_state='pending'`.
- Server-Actions (`setStarted`/`setStep`/`setSkipped`/`setCompleted`) pruefen `auth.user_role()` und werfen Forbidden bei falscher Rolle.

### Constraints / tradeoffs

**Trade-off 1 — Werktage ohne Holiday-Calendar:**
Mitarbeiter Fr eingeladen bekommt Stage 1 frueher (Wochenende zaehlt nicht) als Mo-eingeladener. Drift bei Feiertagen ist kosmetisch (max. 2 Reminder, der Effekt ist 1 Tag). Akzeptiert.

**Trade-off 2 — Wizard-State pro Tenant statt pro User:**
Multi-Admin-Tenant: nur erster Admin sieht Wizard. Konsequenz: zweiter Admin sieht Wizard nie, auch wenn er die App noch nicht kennt. Mitigation: Help-Sheet (FEAT-033) deckt das Per-User-Onboarding-Bedarf ab (jeder User kann Help oeffnen). Per-User-Onboarding-Tour ist V5+.

**Trade-off 3 — Help-Content statisch im Repo:**
Berater-Edits brauchen PR-Workflow (kein In-App-Editor). Akzeptabel fuer V4.2-Volume (5 Pages × ~200 Worter). In-App-Editor wird gebraucht wenn Help oft wechselt — V5+.

**Trade-off 4 — Cron-Endpoint statt pg_cron:**
Cron-Endpoint im app-Container (kein DB-Cron via pg_cron). Begruendung: Reminder-Send braucht JS-Helpers (Werktage-Berechnung, SMTP-Templates) — pg_cron muesste plpgsql + http_post-Extension nutzen. Coolify-Pattern ist etabliert, Cron-Logs ueber Coolify-UI sichtbar.

**Trade-off 5 — Reminder-Provider weiterhin Supabase-Auth-SMTP:**
Volume-Risk: bei >50 Reminders/Tag droht Rate-Limit oder Spam-Reputation. Mitigation: Cron-Run loggt Warning bei `>50 stage1+stage2_sent`, V4.3+ Migration auf Resend/SES wenn noetig. SPF/DKIM-Audit der Server-Domain (eigener Maintenance-Sprint, nicht V4.2-Slice).

**Trade-off 6 — Tooltip ohne Persistenz:**
Tooltips sind kontextuell. Kein "Verstanden, nicht mehr zeigen". Wenn als nervig empfunden: V5+ User-Setting nachruesten.

**Trade-off 7 — Page-Refresh-only fuer Inactive-Employees-Badge:**
Kein Polling, keine SSE. Cockpit zeigt ggf. veralteten Stand bis User F5 drueckt. Akzeptabel: Cockpit ist nicht Real-Time-Tool, Throughput "wer hat heute Capture gestartet" ist <1/Tag in V4.2-Volume.

**Trade-off 8 — Eine Migration fuer drei Datenmodell-Aenderungen:**
MIG-029 enthaelt 3 logische Bloecke (tenants ALTER + reminder_log + user_settings) in einer Migration-Datei. Begruendung: alle drei sind V4.2-Foundation, gehoeren atomar deployed. V4.1 hatte das gleiche Pattern (MIG-028 hatte 4 Bloecke: Tabelle + Indizes + RLS + Backfill + Trigger).

### Open technical questions (verbleibend)

Verbleibende Detail-Fragen werden in `/slice-planning V4.2` oder spaeter (`/frontend`/`/backend`) entschieden:

- **Q-V4.2-H (Frontend) — Wizard-Step-3-Form-Validation:** Inline-Validierung pro E-Mail-Input vs. Submit-Time-Validierung? Empfehlung Architektur: Submit-Time, einfacher und konsistent mit `inviteEmployees`-Server-Action-Pattern. Decision in /frontend SLC-047.
- **Q-V4.2-I (Backend) — SMTP-Klient-Library:** Wiederverwendung Supabase-JS-SDK vs. `nodemailer`-Direct-Call? Empfehlung Architektur: Erst Supabase-SDK pruefen (kein neues NPM-Paket), Fallback `nodemailer` falls SDK keine Send-Custom-Mail-API hat. Decision in /backend SLC-048.
- **Q-V4.2-J (Backend) — Reminder-Email-Templates:** Inline-TS-Template-Strings vs. eigene Template-Files? Empfehlung Architektur: inline (max. 2 Templates Stage 1+2, ~30 Zeilen each). Decision in /backend SLC-048.
- **Q-V4.2-K (Frontend) — Wizard-Visual-Style:** Modal-Overlay (shadcn `Dialog`) vs. Full-Screen-Page? Empfehlung Architektur: Modal-Overlay (weniger invasiv, Cockpit-Hintergrund bleibt sichtbar). Decision in /frontend SLC-047.
- **Q-V4.2-L (Frontend) — Opt-Out-Toggle-Lokalitaet:** Eigene `/dashboard/settings`-Page vs. Inline-Toggle im Cockpit-Header-Menu? Empfehlung Architektur: Eigene Settings-Page (V4.2 hat sonst nur 1 Setting, aber V4.3+ koennten mehr kommen). Decision in /frontend SLC-049.

### Implementation direction

Empfohlene Slice-Reihenfolge (deckungsgleich mit PRD-Skizze):

1. **SLC-046** (Backend, ~3 MTs): MIG-029 ALTER TABLE tenants + Backfill (alle pre-V4.2 Tenants = 'completed') + Wizard-Server-Actions (setStarted/setStep/setSkipped/setCompleted) + Server-Component-Helper `getWizardStateForTenant()` + Layout-Integration. RLS-Test bestaetigt: tenants-Policies decken neue Spalten ab.
2. **SLC-047** (Frontend, ~7 MTs): WizardModal mit 4 Step-Komponenten (Welcome, TemplatePick, EmployeeInvite, WhatNow) + Skip-Logic + Form-Validation Schritt 3 + Was-nun-Cards + Layout-Auto-Trigger via `getWizardStateForTenant()`. Tests: 4 Step-Renders + Skip-Pfade + Multi-Admin-Lock-Race-Test.
3. **SLC-048** (Backend, ~6 MTs): MIG-029 reminder_log + user_settings + Trigger + Backfill + RLS + Cron-Endpoint `/api/cron/capture-reminders` + workdaysSince-Helper + sendReminder-Helper + Unsubscribe-Endpoint + RLS-Test-Matrix-Erweiterung (4 Rollen × 2 Tabellen = 8 Tests). **Cron-Idempotenz-Test Pflicht** (zwei Cron-Runs am selben Tag → 0 Doppel-Mails).
4. **SLC-049** (Frontend, ~3 MTs): InactiveEmployeesCard auf /dashboard + Mitarbeiter-Liste-Filter `?filter=inactive` + Opt-Out-Toggle in /dashboard/settings (oder bestehender Settings-Page).
5. **SLC-050** (Frontend, ~5 MTs): 5 Help-Markdown-Files schreiben (mind. 100 Worter pro File) + HelpSheet-Component + HelpTrigger im Header-Layout + Tooltip-Integration an 5 UI-Elementen + `loadHelpMarkdown`-Helper + Tests (Help-Sheet-Render + Markdown-Inhalt-Pruefung).

Pflicht-Gates fuer V4.2-Implementation:
- 4-Rollen-RLS-Matrix erweitert um `reminder_log` + `user_settings` (mind. 8 zusaetzliche Test-Faelle, Pflicht in /qa SLC-048).
- Pflicht-Browser-Smoke-Test mit Nicht-Tech-User vor V4.2-Release (SC-V4.2-9, R17 aus V4-Pflicht-Gates).
- Cron-Idempotenz-Test als Pflicht-AC fuer SLC-048 /qa.
- Coolify-Cron-Setup-Anleitung (Tabelle + Bestaetigung) in /deploy V4.2 (feedback_cron_job_instructions).
- Vor V4.2-/deploy: User-manueller Check der Spam-Reputation der Reminder-Mails (SPF/DKIM auf onboarding.strategaizetransition.com).

## V4.3 Architecture Addendum — Maintenance-Sammelrelease (Reader-UX + Worker-Hygiene + Tooling + Help-Konsolidierung + State-Machine-ADR + Spike)

### Status (V4.3)
- /requirements V4.3 done 2026-05-01 (RPT-131): 15 Items in 6 Kategorien, 6 Open Questions Q-V4.3-A..F.
- /architecture V4.3 done 2026-05-01 (this section + DEC-062..067): alle 6 Open Questions geklaert + dokumentiert.
- Naechste Schritte: /slice-planning V4.3 (6 Slices SLC-051..056 + 1 Content-Item BL-067), dann Implementation in der Reihenfolge SLC-053 → 051 → 052 → 055 → 056 → 054.

### Architektur-Zusammenfassung (V4.3)
V4.3 ist ein Maintenance-Sammelrelease ohne neue Features, ohne Schema-Aenderung und ohne neuen Container/Cron. Der Code-Touch erstreckt sich auf vier ausgewaehlte Bereiche der bestehenden V4-Architektur:
1. **Reader-UI-Layer** (Frontend, `/dashboard/handbook/[snapshotId]`) bekommt UX-Polish (Scroll-Spy, Permalink, Skeleton, Mobile-h1, Heading-Anchor-Hover) und client-side Cross-Snapshot-Suche mit localStorage-History.
2. **Worker+Templates-Layer** (Verdichtungs-Worker + Template-Files) erhaelt Output-Hygiene (TOC-Format auf In-App-Anchors, Umlaut-Konsistenz).
3. **Tooling-Layer** (Next.js + ESLint Convention-Migrations): `src/middleware.ts` → `src/proxy.ts` (Next 16 Convention) + ESLint flat-config.
4. **Help-Layer** (SLC-050 HelpSheet + Learning Center FEAT-029): wird konsolidiert auf Single-Trigger pro Page mit Learning-Center-Tab "Diese Seite".

Drei zusaetzliche Querschnittsthemen: ADR fuer State-Maschinen-UPDATE-Pattern (DEC-065, beruehrt kein Code direkt), Investigation Turbopack-Layout-Inlining (Spike in eigenem Branch, kein main-Code), Berater-Help-Review (Content-only via Editor).

Es entsteht keine neue Komponente. Keine Tabelle, kein Trigger, keine RLS-Policy aendert sich. RLS-Test-Matrix bleibt 100% PASS-Pflicht (SC-V4.3-5).

### Komponenten-Sicht (V4.3)

#### A. Reader-UX-Komponenten (SLC-051 + SLC-054)
**Bestand (V4.1):** `src/app/dashboard/handbook/[snapshotId]/page.tsx` als Server-Component, `ReaderShell.tsx` als Client-Component, `react-markdown` mit `remark-gfm` + `rehype-slug` + `rehype-autolink-headings` (DEC-049). Sidebar-Navigation existiert mit Section-Links (kein Active-Marker).

**Aenderungen V4.3:**
- `useScrollSpy(headingIds: string[])`-Hook (neu, client-side): IntersectionObserver pro h2/h3 → setzt aktive Section-ID in State, wird in Sidebar als Active-Class konsumiert. Kein Server-Touch.
- `CopyPermalinkButton`-Komponente (neu, client-side): pro Section-Heading ein kleiner Clipboard-Icon-Button, kopiert `window.location.href + '#section-anchor'` in `navigator.clipboard`. Toast-Feedback via shadcn `useToast()`.
- `ReaderLoadingSkeleton`-Komponente (neu, server- oder client-side): wird waehrend `Suspense` beim Snapshot-Wechsel gezeigt — TOC-Outline-Skeleton + Content-Block-Skeleton.
- `ReaderShell`-Mobile-Layout: h1-Title bei `max-width: 375px` mit `text-balance` + `word-break: break-word`, max 2 Zeilen.
- Heading-Anchor-Hover am h1-Titel: `rehype-autolink-headings`-Config erweitert (existiert seit V4.1) um den h1-Hauptanker (vorher nur h2/h3).
- `useSearchHistory()`-Hook (neu, client-side, SLC-054): liest/schreibt `localStorage['onboarding.reader.searchHistory.v1']` (DEC-063), max 10 Eintraege, FIFO-Trim, dedupliziert.
- `ReaderSearchBox`-Komponente (neu, client-side): Eingabefeld + Dropdown mit History + Treffer-Liste; Suche laeuft client-side ueber alle aktuell geladenen Snapshots des Tenants (SELECT auf `handbook_snapshot` ohne Filter, in der `ReaderShell`-Server-Component vorab geladen). KEIN dedizierter Search-Index, KEIN Backend-Endpoint.

**Trade-off:** Cross-Snapshot-Suche client-side bedeutet, die `ReaderShell`-Server-Component muss alle Snapshots inkl. ihrer rendered Sections ans Frontend ausliefern. Bei vielen Snapshots (>10) wird das DOM-Payload merklich groesser. Akzeptabel fuer V4.3-Maintenance, da Tenants typischerweise 1-3 aktuelle Snapshots gleichzeitig haben. Server-side Search-Index ist V5+ (per Out-of-Scope).

#### B. Worker-Output + Templates (SLC-052)
**Bestand (V4.1):** Verdichtungs-Worker schreibt pro Snapshot ein `INDEX.md` mit `[Title](01_section.md)`-Links, plus pro Section eigene `.md`-Datei. Reader rendert via `react-markdown` mit `components.a`-Override, der die Markdown-File-Links auf In-App-Anchors umschreibt.

**Aenderungen V4.3:**
- Worker-Template `INDEX.md.template` (im Repo unter `src/worker/templates/` oder `bin/worker/`) wird umgestellt: statt `[Title](01_section.md)` schreibt der Worker `[Title](#section-anchor)` mit dem gleichen Anchor-Slug, den `rehype-slug` im Reader generiert (kebab-case auf dem Heading-Text).
- `react-markdown` `components.a`-Override im Reader bleibt fuer alte Snapshots (Backward-Compat) — neue Snapshots brauchen ihn nicht. KEIN Auto-Migrate alter Snapshots (per Out-of-Scope, R-V4.3-2-Mitigation).
- Umlaut-Konsistenz: alle Templates + Worker-Heading-Generators + UI-Strings auf konsistente UTF-8 Umlaute (oe → oe ASCII, oder UTF-8 ö wo bisher inkonsistent). Snapshot-Helper `scripts/audit-umlauts.ts` (neu, dev-only) prueft die Konsistenz pre-deploy.

**Trade-off:** Pre-V4.3-Snapshots behalten ihre `01_section.md`-Links. Reader rendert sie korrekt dank `components.a`-Override. Ein User kann manuell ueber den /admin/snapshots Trigger einen Re-Generate ausloesen — kein Auto-Migration in V4.3 (per Out-of-Scope-Decision).

#### C. Convention + Tooling-Migrations (SLC-053)
**Bestand (V4.2):** `src/middleware.ts` mit Next 15-Convention. ESLint via `.eslintrc.json` (legacy-config) mit `eslint-config-next`.

**Aenderungen V4.3:**
- **Next 16 Convention `middleware`→`proxy`:** Datei wird zu `src/proxy.ts` umbenannt + ggf. minor-Konvention-Anpassungen aus Next 16 Migration-Guide. Build zeigt keine middleware-Deprecation-Warning mehr (Pflicht-AC SC-V4.3-4). Auth-Middleware-Tests (existieren seit V1) bleiben 100% PASS.
- **ESLint 9 flat-config:** `.eslintrc.json` → `eslint.config.mjs` mit flat-config-Schema. `eslint-config-next` muss in 16.x kompatibel sein (Kompatibilitaets-Pruefung als erste MT). Pre-Migration: `npm run lint` Output-Snapshot speichern. Post-Migration: gleicher Snapshot, ggf. Diff-Analyse fuer neue Warnings (R-V4.3-3-Mitigation).
- Beide Migrations werden in einem Slice gebuendelt, weil sie strukturell aehnlich sind (Convention + Tooling Update) und sich gegenseitig nicht stoeren. Rollback-Pfad pro Migration einfach (1-2 Datei-Renames).

**Trade-off:** Wenn `eslint-config-next` in Next 16 noch nicht flat-config-kompatibel ist, wird ein `FlatCompat`-Adapter-Layer noetig sein (kurzfristig, bis upstream nachzieht). DEC dafuer wird im SLC-053-Slice-File festgehalten, falls noetig.

#### D. Help-Konsolidierung (SLC-055)
**Bestand (V4.2):** SLC-050 HelpSheet (shadcn `Sheet` Right-Side, geoeffnet ueber `?`-Trigger im Header, rendert `src/content/help/<page-key>.md` via `react-markdown`). Learning Center (FEAT-029) als separate Page `/dashboard/learning` mit 2 Tabs (z.B. "Getting Started", "Konzepte"). Beide Mechanismen koexistieren — User-Smoke hat das als zwei `?`-Icons konkurrieren-Verwirrung markiert (BL-063).

**Aenderungen V4.3 (DEC-064 Variante 3):**
- Learning Center bekommt 3. Tab "Diese Seite" der `loadHelpMarkdown(pageKey)` aus SLC-050 wiederverwendet. Tab ist Default-aktiv, wenn URL-Parameter `?tab=this-page&page=<page-key>` gesetzt sind.
- HelpSheet-Trigger im Header (`?`-Icon) bleibt sichtbar, oeffnet aber nicht mehr das shadcn-Sheet, sondern navigiert per `router.push()` zu `/dashboard/learning?tab=this-page&page=<page-key>` (oder Modal-Variante des Learning-Center, je nach LC-Implementierung).
- shadcn `Sheet`-Komponente fuer HelpSheet kann entfallen — `HelpTrigger` wird zur Wrapper-Komponente die das Learning Center mit den richtigen Query-Params oeffnet. Cleanup entweder in SLC-055 (wenn klein) oder als BL-XXX nach V4.3.
- Tooltip-Trigger an spezifischen UI-Elementen (DEC-058 Layer 2) bleibt unveraendert — der Tooltip ist KEIN Help-Trigger, sondern ein "Was ist das?"-Hint. Die Konsolidierung betrifft ausschliesslich den Page-Level-Help.

**Trade-off:** Der ehemalige Sofort-Effekt von "Sheet schiebt von rechts rein, ohne Page-Wechsel" geht verloren — User wird zu /dashboard/learning navigiert (Page-Wechsel oder Modal-Open, je nach LC-Variante). Akzeptabel, weil das Learning Center bereits als zentrale Wissens-Anlaufstelle etabliert ist und die Page-Context-Help dort thematisch besser passt. Wenn der Sofort-Effekt zurueck soll, kann das Learning Center spaeter als Modal/Sheet implementiert werden — V4.3-Out-of-Scope.

#### E. Tooltip-Target-Fix (SLC-055, DEC-067)
**Bestand (V4.2):** `?`-Button (16x16px Lucide-Icon) im Card-Header. Tooltip-Trigger ist nur das Icon. Hit-Target-Sicke auf Mobile zu klein.

**Aenderungen V4.3 (DEC-067 Variante 2):**
- shadcn `Tooltip.Trigger` umfasst den ganzen Card-Header (`<header>`-Element oder `<div className="card-header">`-Wrapper).
- `?`-Icon bleibt visuell unveraendert sichtbar (kein Click-Target-Vergroessern).
- `tabIndex={0}` + `aria-describedby`-Verknuepfung am Card-Header fuer Screen-Reader.
- Mobile-Tap auf den Header oeffnet Tooltip; shadcn-`Tooltip` mit `delayDuration={0}` auf Touch (oder controlled `open`-State per Tap).

#### F. ADR State-Maschinen-UPDATE-Pattern (SLC-056, DEC-065)
Code-loses Architektur-Item. Neuer DEC-065 dokumentiert den Default (`Service-Role-UPDATE` mit `requireXyz()`-Pruefung in Server-Action) und die Ausnahme (RLS-UPDATE-Policy bei rein nutzer-getriebenem UPDATE auf eigene Zeile). Ist Reference-DEC fuer alle zukuenftigen Slices die State-Maschinen einfuehren.

Pflicht-Test pro neuer State-Maschine:
- 4-Rollen-RLS-Test fuer SELECT-Sichtbarkeit (existierende V4-Test-Matrix-Pflicht).
- Server-Action-Test fuer UPDATE-Pruefung (Mock unauthorized → erwarte Throw, Mock authorized → erwarte Erfolg).

**Detail-Pattern + Code-Beispiele**: siehe **Anhang B — State-Machine-UPDATE-Pattern** (am Dokument-Ende). Der Anhang ist ab V4.3 verbindliche Referenz fuer alle neuen Slices, die eine State-Spalte (`status`, `phase`, `wizard_status`, etc.) einfuehren oder aendern.

#### G. Investigation BL-066 Turbopack (SLC-056, DEC-066)
Spike in eigenem Branch `spike/v43-turbopack-layout-inlining`, max 4h-Box. Output entweder GitHub-Issue-URL beim `vercel/next.js`-Repo (Genuine-Bug) oder Workaround-ADR + KNOWN_ISSUES-Eintrag (erwartetes Verhalten). Branch wird NICHT in main gemergt; Stress-Test-Artefakte bleiben isoliert.

### Datenfluss-Sicht (V4.3)

V4.3 aendert keinen Backend-Datenfluss. Alle Aenderungen sind:
- **Frontend-Render-Layer** (Reader-UX + Help-Konsolidierung + Tooltip-Trigger).
- **Worker-Output-Format** (TOC-Anchor-Links + Umlaut-Konsistenz) — der Worker schreibt anders, aber der Datenflussweg (Job-Queue → Worker → Storage) bleibt.
- **Tooling-Layer** (Convention + Lint-Config) — kein Datenfluss-Effekt.
- **localStorage** (Search-History) — kein Server-Touch.

RLS-Modell, Auth-Flow, Internal-URL-Strategy, Bridge-Engine, Reminder-Pipeline, Wizard-Flow: alle unveraendert. Pflicht-Gate SC-V4.3-5 (RLS-Matrix bleibt 100% PASS) ist konsequent — wenn ein V4.3-Slice doch ein RLS-Touch braeuchte, ist es kein V4.3-Item per Constraint.

### Externe Dependencies (V4.3)

Keine neue externe Dependency.
Existierende relevante:
- `react-markdown` + `remark-gfm` + `rehype-slug` + `rehype-autolink-headings` (DEC-049) — wiederverwendet fuer "Diese Seite"-Tab.
- `lucide-react` (Icons) — `Clipboard`, `ChevronRight` etc.
- shadcn-Komponenten — `Tooltip`, `Toast`, ggf. `Sheet`-Cleanup.
- ESLint 9 + flat-config + `eslint-config-next` (Tooling-Migration).
- Next.js 16 (`middleware`→`proxy` Convention).

Annahme A-V4.3-3 (`react-markdown` reicht weiter) ist erfuellt.

### Internal URL Strategy (V4.3)

Unveraendert gegenueber V4.2. Help-Konsolidierung navigiert intern zu `/dashboard/learning?tab=this-page&page=<page-key>` — relative URL, kein externer Endpoint. Reader-Permalink kopiert `window.location.href + '#section-anchor'` (browser-relative URL, kein Server-Touch).

### RLS-Modell (V4.3)

UNVERAENDERT. SC-V4.3-5 ist Pflicht-Gate.

### Security / Privacy (V4.3)

- localStorage-Search-History (DEC-063): User-lokal, kein PII-Leak. Suche gegen Snapshot-Content der ohnehin im Browser des Users gerendert wird — kein neues Privacy-Risk.
- Service-Role-UPDATE-Pattern (DEC-065): Bestaetigt durch ADR. Kein bestehender Code-Refactor noetig; Pattern ist in V4-Slices schon durchgaengig angewendet.
- Investigation-Branch (DEC-066): Stress-Test-Artefakte bleiben in Spike-Branch, NICHT in main. Kein Production-Risk.

### Constraints und Tradeoffs (V4.3)

**Trade-off 1 — Cross-Snapshot-Suche client-side ohne Server-Index:**
DEC-063. Skaliert nicht ueber ~10-20 Snapshots gleichzeitig. Akzeptabel fuer V4.3-Tenant-Profile (1-3 aktuelle Snapshots). V5+ kann bei Bedarf einen Postgres-FTS-Index oder pgvector-Lookup nachruesten.

**Trade-off 2 — Help-Konsolidierung bedeutet Page-Wechsel auf /learning:**
DEC-064. Sofort-Effekt des Side-Sheets geht verloren. Mitigiert durch klare URL-Param-Steuerung und ggf. spaetere Modal-Variante des Learning Centers.

**Trade-off 3 — Pre-V4.3-Snapshots behalten alten TOC-Format:**
SLC-052. Reader rendert beide Formate dank `components.a`-Override. Re-Generate manuell durch User pro Snapshot, kein Auto-Migrate.

**Trade-off 4 — ESLint-9-Migration-Output kann sich aendern:**
R-V4.3-3. Pre-/Post-Migration Lint-Output-Snapshot ist Pflicht-AC. Bei Mehr-Warnings: separate Pflicht-Bewertung im Slice-File ob es Bug-Hints sind.

**Trade-off 5 — Investigation BL-066 ohne garantiertes Root-Cause-Outcome:**
DEC-066 + R-V4.3-5. 4h-Timebox; Workaround-ADR ist akzeptables Outcome.

**Trade-off 6 — Card-Header-Tooltip-Trigger weitet Hit-Target deutlich:**
DEC-067. Mobile-Tap auf den Header-Bereich aktiviert ggf. ungewollt das Tooltip beim Scrollen — Mitigation: shadcn-`Tooltip` mit `delayDuration` auch auf Touch, oder explicit `pointerEvents`-Steuerung; in /qa pruefen.

**Trade-off 7 — Service-Role-Default-Pattern verlagert Sicherheits-Last in Server-Actions:**
DEC-065. RLS-Sicht ist nicht mehr die einzige Verteidigungslinie fuer State-UPDATEs. Mitigation: Pflicht-Test pro neuer State-Maschine (RLS-SELECT + Server-Action-UPDATE), 4-Rollen-RLS-Matrix bleibt unveraendert.

### Open technical questions (verbleibend)

Verbleibende Detail-Fragen werden in `/slice-planning V4.3` oder spaeter (`/frontend`/`/backend`) entschieden:

- **Q-V4.3-G (Frontend) — Learning-Center-Modal-vs-Page-Form:** Ist `/dashboard/learning` als eigene Page gebaut (ggf. mit Page-Wechsel) oder als shadcn-Dialog/Sheet aus jeder Page heraus? Empfehlung Architektur: pruefen in SLC-055 anhand des bestehenden FEAT-029-Codes; falls Page → mit Router-Push (mit `?tab=...&page=...`-Query); falls Modal → bleibt im Page-Context. Decision in /frontend SLC-055.
- **Q-V4.3-H (Frontend) — Reader-Search-UI-Position:** Search-Box im Reader-Header (sticky) oder im Sidebar oben? Empfehlung Architektur: Sidebar oben (passt zur bestehenden TOC-Navigation, weniger Layout-Bruch). Decision in /frontend SLC-054.
- **Q-V4.3-I (Backend) — Worker-Anchor-Slug-Generation:** Identisch zur Reader-`rehype-slug`-Strategie (kebab-case mit Diacritic-Strip)? Empfehlung Architektur: ja — gleiche Util-Funktion `slugifyHeading(text)` im Worker und im Reader teilen (utils-Module). Decision in /backend SLC-052.
- **Q-V4.3-J (Tooling) — `eslint-config-next` flat-config-Adapter:** `FlatCompat`-Adapter aus `@eslint/eslintrc` notwendig? Empfehlung Architektur: erst pruefen ob `eslint-config-next@^16` native flat-config liefert; falls nein, `FlatCompat`-Layer als bewusste DEC im Slice-File. Decision in /backend SLC-053.

### Implementation direction

Empfohlene Slice-Reihenfolge (deckungsgleich mit Requirements-Empfehlung):

1. **SLC-053** (Backend/Tooling, ~3 MTs): `middleware`→`proxy`-Rename + Next 16 Convention-Anpassungen + ESLint-9 flat-config-Migration. Pre-Migration Lint-Output-Snapshot (Pflicht-AC). Auth-Middleware-Tests bleiben 100% PASS. Migration-Risiko zuerst, damit nachfolgende Slices auf stabilem Tooling laufen.
2. **SLC-051** (Frontend, ~5 MTs): Reader-UX-Bundle. `useScrollSpy` + `CopyPermalinkButton` + `ReaderLoadingSkeleton` + Mobile-h1-Wrap + Heading-Anchor-Hover am h1. Pflicht: Browser-Smoke 1280×800 + 375×667.
3. **SLC-052** (Backend+Templates, ~4 MTs): Worker-Template `INDEX.md.template` auf In-App-Anchors + `slugifyHeading`-Utility-Module + Umlaut-Konsistenz-Sweep + `scripts/audit-umlauts.ts`. Reader behaelt `components.a`-Override fuer alte Snapshots.
4. **SLC-055** (Frontend, ~4 MTs): Help-Konsolidierung Variante 3 (Learning-Center-Tab "Diese Seite") + Tooltip-Target-Fix Variante 2 (Card-Header als Wrapper-Trigger). Browser-Smoke beide Findings auf Desktop + Mobile.
5. **SLC-056** (Doku+Spike, ~3 MTs): ADR-Dokumentation State-Maschinen-Pattern (DEC-065 ist schon geschrieben; SLC-056 verlinkt + macht Pflicht-Test-Pattern explizit) + Investigation-Spike Turbopack in `spike/v43-turbopack-layout-inlining`-Branch (4h-Box, Output GitHub-Issue oder Workaround-ADR).
6. **SLC-054** (Frontend, ~3 MTs): Cross-Snapshot-Suche client-side mit `useSearchHistory` + `ReaderSearchBox` + `localStorage`-Persistenz.
7. **(kein Slice) BL-067** Berater-Help-Review parallel: User editiert direkt 5 Files unter `src/content/help/*.md`, Push als eigener Commit.

Pflicht-Gates fuer V4.3-Implementation:
- Keine Schema-Migration. Wenn ein Slice doch eine wuerde, sofort an User eskalieren (V4.3-Constraint).
- ESLint-Migration-Output (Lint-Warnings) muss vor + nach SLC-053 Snapshot dokumentiert werden (R-V4.3-3-Mitigation).
- Investigation BL-066 timeboxed 4h, danach Spike-Abschluss-Pflicht (ADR oder GitHub-Issue, R-V4.3-5).
- Browser-Smoke-Test nach SLC-051 + SLC-055 (Reader-UX + Help-Konsolidierung) auf Desktop + Mobile (SC-V4.3-2 + SC-V4.3-7).
- 4-Rollen-RLS-Matrix bleibt 100% PASS in /qa pro Slice (SC-V4.3-5).
- V4.2-Regression-Smoke nach jedem Slice: Wizard pending → completed funktioniert, Cron-Reminder-Pipeline funktioniert weiter, Help-Sheet auf allen 5 Pages erreichbar (SC-V4.3-6).

### Naechster Schritt (V4.3)

`/slice-planning V4.3` — Micro-Task-Schnitt der 6 Slices SLC-051..056 + 1 Content-Item BL-067, mit Pflicht-Gates pro Slice und expliziter Implementation-Reihenfolge.

## Anhang B — State-Machine-UPDATE-Pattern (verbindlich ab V4.3)

**Eingefuehrt mit:** SLC-056 / DEC-065
**Geltungsbereich:** Alle Slices ab V4.3, die eine State-Spalte (`status`, `phase`, `wizard_status`, `bridge_run.status`, `block_review.status`, etc.) einfuehren oder aendern. Bestehende V4/V4.1/V4.2-State-Maschinen sind regelkonform und brauchen keinen Refactor (per DEC-065).

### Default-Pattern: Service-Role-UPDATE in Server-Action

**Wann:** Default fuer alle State-Transitionen, deren Pruefung mehr Application-Context braucht als die DB allein hat (Rolle, Tenant, Owner-Beziehung, erlaubte Transition).

**Warum:** Pruefung in TS ist bullet-proof testbar, kennt den vollen User-Context, und vermeidet Duplikation der State-Transition-Tabelle in plpgsql.

**Code-Beispiel-Snippet (illustrativ, real-Implementation referenziert die echten requireXyz-Helper):**

```typescript
// src/app/admin/bridge/actions.ts
"use server";

import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireTenantAdmin } from "@/lib/auth/guards";

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending:     ["in_progress", "cancelled"],
  in_progress: ["completed", "failed", "cancelled"],
  completed:   [],
  failed:      ["pending"],   // Retry erlaubt
  cancelled:   [],
};

export async function setBridgeRunStatus(
  runId: string,
  newStatus: string,
): Promise<{ ok: true } | { error: string }> {
  // 1. Auth + Application-Context-Pruefung
  const { user, tenantId } = await requireTenantAdmin();

  // 2. State-Transition-Validierung (Server-Side, nicht in DB)
  const supabase = createSupabaseServiceClient();
  const { data: row, error: readErr } = await supabase
    .from("bridge_run")
    .select("status, tenant_id")
    .eq("id", runId)
    .single();
  if (readErr || !row) return { error: "not_found" };
  if (row.tenant_id !== tenantId) return { error: "forbidden" };
  if (!ALLOWED_TRANSITIONS[row.status]?.includes(newStatus)) {
    return { error: `invalid_transition_${row.status}_to_${newStatus}` };
  }

  // 3. Service-Role-UPDATE (umgeht RLS bewusst, weil Auth-Pruefung schon greift)
  const { error: updErr } = await supabase
    .from("bridge_run")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", runId);
  if (updErr) return { error: updErr.message };

  return { ok: true };
}
```

**Was hier sichtbar ist:**
1. **Auth-Guard** (`requireTenantAdmin`) liefert User + tenantId aus Session. Wirft bei nicht-eingeloggt / falsche Rolle.
2. **State-Transition-Tabelle** lebt in TS-Objekt — leicht refactorbar, leicht testbar, in DB nicht dupliziert.
3. **Service-Role-Client** wird erst nach erfolgreicher Auth-Pruefung benutzt. Davor: keine DB-Touches.
4. **Tenant-Match-Check** (`row.tenant_id !== tenantId`) ist defensiv — RLS-Bypass bedeutet, der Server muss diese Pruefung selbst machen.
5. **UPDATE** ist atomic, nutzt den Service-Role-Client.

### Ausnahme: RLS-UPDATE-Policy bei rein nutzer-getriebenem UPDATE auf eigene Zeile

**Wann:** Wenn der UPDATE-Pfad die Bedingung "user_id = auth.uid()" als einzige Auth-Bedingung hat, und keine Application-Context-Pruefung erforderlich ist (keine Rolle-Pruefung, keine Cross-Row-Validierung, kein State-Transition-Graph).

**Warum erlaubt:** Die RLS-Policy ist hier eine 1:1-Spiegelung der Auth-Anforderung. Keine Duplikations-Last, keine Drift-Gefahr. Server-Action darf direkt mit `createClient()` (User-Context) arbeiten.

**Code-Beispiel-Snippet:**

```typescript
// src/app/dashboard/settings/actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";

export async function setReminderOptOut(
  optedOut: boolean,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient(); // User-Client mit auth.uid()
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthenticated" };

  // RLS-Policy auf user_settings:
  //   USING (user_id = auth.uid())
  //   WITH CHECK (user_id = auth.uid())
  // Stellt sicher: User kann nur die eigene Zeile UPDATEn.
  const { error } = await supabase
    .from("user_settings")
    .upsert(
      { user_id: user.id, reminder_opt_out: optedOut },
      { onConflict: "user_id" },
    );
  if (error) return { error: error.message };

  return { ok: true };
}
```

**Was hier sichtbar ist:**
1. **User-Client** (`createClient`, kein Service-Role) — auth.uid() ist im Request-Context greifbar.
2. **RLS-Policy** auf `user_settings.user_id = auth.uid()` macht die Sicherheit.
3. Kein State-Graph-Check noetig — `reminder_opt_out` ist binaer, jede Transition ist erlaubt.
4. Server-Action ist trivial — fast ein 1:1-Pass-through.

**Begruendungs-Pflicht:** Wenn die Ausnahme genutzt wird, muss der Slice-File einen DEC-Eintrag oder eine knappe Begruendung im Slice-Spec enthalten ("rein nutzer-getrieben, 1:1-User-Owner, kein State-Graph").

### Pflicht-Test-Pattern (pro neuer State-Maschine)

Jede neue State-Maschine MUSS zwei Test-Layer haben:

**Test 1 — 4-Rollen-RLS-SELECT-Test (existierende V4-Pflicht):**
- Tenant A Admin sieht nur Tenant A Rows.
- Tenant B Admin sieht nur Tenant B Rows.
- Employee von Tenant A sieht nur eigene Rows (oder Sichtperimeter per Slice).
- Anonym / Strategaize-Admin: per Slice-Spec.

Test laeuft gegen Live-DB (Coolify-Postgres) mit den 4 Rollen. Pflicht-Erweiterung der bestehenden RLS-Test-Matrix.

**Test 2 — Server-Action-UPDATE-Test (neu Pflicht ab V4.3):**
Mindestens drei Cases pro Server-Action:

```typescript
import { describe, it, expect, vi } from "vitest";
import { setBridgeRunStatus } from "@/app/admin/bridge/actions";

describe("setBridgeRunStatus", () => {
  it("Unauthorized → wirft / liefert error", async () => {
    vi.mocked(requireTenantAdmin).mockRejectedValue(new Error("forbidden"));
    await expect(setBridgeRunStatus("run-x", "completed")).rejects.toThrow();
  });

  it("Authorized + erlaubte Transition → ok:true", async () => {
    vi.mocked(requireTenantAdmin).mockResolvedValue({ user: {...}, tenantId: "t-a" });
    // Mock supabase row mit status='in_progress', tenant_id='t-a'
    const result = await setBridgeRunStatus("run-x", "completed");
    expect(result).toEqual({ ok: true });
  });

  it("Authorized + verbotene Transition → error", async () => {
    vi.mocked(requireTenantAdmin).mockResolvedValue({ user: {...}, tenantId: "t-a" });
    // Mock supabase row mit status='completed' (kein outgoing edge)
    const result = await setBridgeRunStatus("run-x", "in_progress");
    expect(result).toMatchObject({ error: expect.stringContaining("invalid_transition") });
  });

  it("Authorized aber Tenant-Mismatch → error", async () => {
    vi.mocked(requireTenantAdmin).mockResolvedValue({ user: {...}, tenantId: "t-b" });
    // Mock supabase row mit tenant_id='t-a'
    const result = await setBridgeRunStatus("run-x", "completed");
    expect(result).toEqual({ error: "forbidden" });
  });
});
```

### Migration-Path fuer bestehende V4/V4.1/V4.2-Slices

**Kein Refactor-Pflicht.** Bestehende Service-Role-UPDATEs in V4-Slices (`bridge_run.status`, `block_review.status`, `wizard_status`, etc.) sind regelkonform — sie folgen dem Default-Pattern de facto schon, auch ohne formalen ADR.

Wenn ein bestehender Slice in einer Folge-Iteration ohnehin angefasst wird (z.B. Bug-Fix), darf der Refactor opportunistisch erfolgen — nicht verpflichtend.

### Lokal-Override / Begruendungs-Pflicht

Ein Slice darf vom Default-Pattern abweichen (z.B. RLS-UPDATE-Policy fuer eine State-Maschine, die nicht "rein nutzer-getrieben" ist) — **nur** mit Slice-File-DEC, der explizit:
1. die abweichende Wahl benennt,
2. die Begruendung skizziert (warum Default nicht passt),
3. die Test-Pflicht mit angepasstem Mock-Schema dokumentiert.

Beispiel-Skizze:
> "DEC-XYZ: SLC-AAB nutzt RLS-UPDATE-Policy fuer `xyz_table.status`, weil State-Graph trivial (binaer) und Owner-Beziehung 1:1 zu `auth.uid()`. Pflicht-Test 2 reduziert auf 'authorized → ok' + 'unauthenticated → error', kein Cross-Row-Test noetig."

Drift-Risiko: Wenn diese Ausnahmen sich haeufen, IMP in `docs/SKILL_IMPROVEMENTS.md` eintragen → Pattern ggf. anpassen.

## V4.4 Architecture Addendum — Pre-V5-Hygiene (Lint-Sweep + Daten-Backfill + Berater-Review)

### Scope

V4.4 ist Maintenance ohne Architektur-Aenderung. Drei Hygiene-Items werden auf einer stabilen V4.3-Basis adressiert:

1. **BL-068 Lint-Sweep** — 7 Errors + 6 Warnings im V2-V4.2-Code, jetzt wo `npm run lint` durch SLC-053 wieder funktioniert. Kein Architektur-Touch, kein Behaviour-Change ueber das hinaus, was die Lint-Regel praeskribiert.
2. **BL-069 SQL-Backfill 046_seed_demo_template** — 328 Umlaut-Vorkommnisse in templates.blocks/sop_prompt JSONB-Feldern (Live-DB). Reine Daten-Korrektur, kein DDL.
3. **BL-067 Berater-Inhalts-Review** — 5 Help-Markdown-Files unter `src/content/help/`. Content-Only, User-Editor-Workflow.

### V4.4 Architectural Constraints

Aus `/requirements V4.4` als verbindlich uebernommen + in /architecture bestaetigt:

- **Keine Schema-DDL.** BL-069 ist DML (`UPDATE template SET blocks=...` auf JSONB-Werten).
- **Keine neuen Container, keine neuen Cron-Jobs.** Maintenance-Disziplin wie V3.1 / V4.3.
- **Keine Verhaltens-Aenderung ueber Lint-Regel-Praeskription hinaus.** BL-068-Fixes sind code-neutral.
- **BL-068-False-Positives nur fuer Library-/shadcn-Code** akzeptiert (siehe DEC-070).

### Lint-Sweep-Strategie (BL-068)

Per-Item-Klassifikation in DEC-070 zementiert. Zusammenfassung:

- **6 TRUE-POSITIVE Errors** (BridgeProposalEditDialog setState-in-effect, FileUploadZone use-before-declared, jitsi-meeting setState-in-effect, SearchResultsList unescaped-quotes × 2) → echte Fixes.
- **1 TRUE-POSITIVE-aber-Inline-Disable** (EvidenceFileList Date.now-in-render) → Inline-Disable mit Begruendung "intended freshness check, V4.4 ohne UX-Change". Proper-Fix als V5+-Backlog-Item.
- **1 FALSE-POSITIVE Error** (sidebar.tsx Math.random in useMemo) → Inline-Disable, weil shadcn-Library-Code mit intendierter Skeleton-Width-Randomisierung.
- **6 TRUE-POSITIVE Warnings** (Anonymous-Export, alt-text, useCallback-missing-dep, 3 × unused-eslint-disable) → alle echte Fixes.

Output-Erwartung nach SLC-061: `npm run lint` liefert **0 Errors, 0 Warnings**.

### Daten-Backfill-Strategie (BL-069)

**MIG-030** (Datei `sql/migrations/081_v44_umlaut_backfill_demo_template.sql`, siehe MIGRATIONS.md fuer Skizze).

Gewaehltes Format (DEC-071): **PL/pgSQL DO-Block mit curated word-list `replace()` ueber JSONB::text-Roundtrip**.

Begruendung gegen alternative Ansaetze:
- **Blunt `replace(blocks::text, 'ae', 'ä')`** — verboten, zerstoert deutsch-englische Wortgrenzen wie "neue", "Steuer", "treuer". Risiko zu hoch.
- **`jsonb_set` per explizitem Pfad** — 328 Vorkommnisse × Pfade ist nicht praktikabel.
- **DELETE + Re-INSERT aus 046** — verboten wegen FK-Constraints (capture_session.template_id), riskiert Daten-Verlust.
- **Programmatisches PL/pgSQL-Walk** — verbose, schwer lesbar.

Curated-Word-List wird in **SLC-062 MT-1** extrahiert: audit-umlauts.mjs gegen Live-DB-Export (templates.blocks/sop_prompt als Text) laufen lassen, Output liefert die Wort-Treffer. Aus Treffer-Liste wird `(suspect_word -> correct_word)` Mapping gebaut, in MIG-030 hartkodiert.

**Idempotenz:** Re-Run der Migration liefert keine Aenderungen, weil bereits korrigierte Worte nicht mehr gemappt werden. Audit nach Apply liefert **0 Vorkommnisse**.

**Risiko-Profil:**
- Live-DB-UPDATE auf einer Tabelle (`template`) → 1 Row betroffen (slug=`mitarbeiter_wissenserhebung`). Andere Templates unangetastet.
- Verifikation post-Apply: `audit-umlauts.mjs` extrahiert blocks/sop_prompt aus Live-DB → 0 Vorkommnisse.
- Rollback: Pre-Apply-Snapshot der beiden JSONB-Felder (per `\copy template TO 'pre-mig-030.csv'`) → bei Bedarf re-import. **DB-Backup vor Apply Pflicht.**

### Berater-Review-Strategie (BL-067)

DEC-072: **User editiert direkt im Repo.** Kein Code-Slice, kein Review-Doc-Iteration. 5 Files unter `src/content/help/{dashboard,capture,bridge,reviews,handbook}.md`, je ~200-250 Worter, Editier-Aufwand geschaetzt 30 min total.

Kein Architektur-Impact. Keine Mock-Faehigkeit, keine Test-Auswirkung. Files werden in normalem Commit + Push integriert.

### V4.4 Slice-Bundling

DEC-073: **2 Slices** (SLC-061 Lint-Sweep + SLC-062 SQL-Backfill) + 1 Content-Item (BL-067 ohne Slice).

Begruendung gegen 1-Slice-All-In:
- Lint-Sweep ist Code-Touch in 7 Files unter `src/`, mit Verifikations-Pfad `npm run lint && npm run build && npm run test`.
- SQL-Backfill ist DB-Touch in `template`-Tabelle, mit Verifikations-Pfad `audit-umlauts.mjs gegen Live-DB`.
- Unterschiedliche Risk-Klassen + Rollback-Pfade (Code vs. Daten) → eigene Slices, eigene QA.

### Migration-Path fuer V5

V5 (Walkthrough-Mode) startet nach V4.4-Release mit:
- 0 Lint-Errors (V4.4 SLC-061 Resultat).
- Demo-Daten umlaut-konsistent (V4.4 SLC-062 Resultat).
- 5 Help-Files inhaltlich review-finalisiert (BL-067).

V4.4 ist explizit minimaler Scope und blockiert V5 nur fuer den Zeitraum von 1-2 Implementierungstagen.

---

## V5 Architecture Addendum — Walkthrough-Mode MVP (Capture + Berater-Review)

### Status

Architecture done 2026-05-05 nach /architecture V5 mit User-Sign-Off zu Q-V5-A..E. KI-Pipeline (PII-Redaction, Schritt-Extraktion, Handbuch-Integration) ist explizit **V5.1** und wird nach V5-Release in eigenem /architecture-Run ergaenzt.

### Architektur-Zusammenfassung V5

V5 fuegt einen fuenften produktiven Capture-Mode `walkthrough` hinzu — vollstaendig **browser-nativ** ueber `getDisplayMedia` + `getUserMedia`, ohne Browser-Extension, ohne Native-Build, ohne Server-Transcoding.

Vier strukturelle Bausteine:

1. **Neue Tabelle `walkthrough_session`** (FK zu `capture_session`) mit eigener Status-Maschine und eigener RLS-Policy. Pattern analog `dialogue_session` aus V3.
2. **Neuer Storage-Bucket `walkthroughs`** (tenant-isoliert, signed-URL-only, kein Public-Access), Pfad `<tenant_id>/<walkthrough_session_id>/recording.webm`.
3. **Direct-Upload-Pfad** vom Browser via signed URL (15min TTL) — kein Body durch Next.js Server Actions.
4. **Whisper-Adapter wird wiederverwendet** — neuer Job-Type `walkthrough_transcribe` mit eigenem Worker-Handler, Output ist `knowledge_unit` mit `source='walkthrough_transcript'`.

Approval ist **manuell** in V5: Berater sieht Roh-Aufnahme + Whisper-Transkript, bestaetigt per Pflicht-Checkbox "keine kundenspezifischen oder sensitiven Inhalte sichtbar", approved oder rejected. Kein KI-Pfad in V5 — der kommt in V5.1.

### Service-Topologie V5

| Service | Aenderung in V5 |
|---------|------------------|
| Web App (Next.js) | Neue Routen: `/employee/capture/walkthrough/[id]` (Recording-UI), `/admin/walkthroughs` (Cross-Tenant-Pending-Liste), `/admin/walkthroughs/[id]` (Detail+Approve), `/admin/tenants/[id]/walkthroughs` (Pro-Tenant). 3 neue Server Actions: `requestWalkthroughUpload`, `confirmWalkthroughUploaded`, `approveOrRejectWalkthrough`. |
| Worker Container | Neuer Job-Handler `walkthrough_transcribe` (laedt WebM aus Storage → extrahiert Audio via ffmpeg → Whisper-Adapter → speichert Transcript-KU). |
| Supabase Storage | Neuer Bucket `walkthroughs` mit RLS-Policies (siehe Bucket-Section). |
| Supabase Postgres | Neue Tabelle `walkthrough_session` + CHECK-Erweiterungen auf `capture_session.capture_mode` und `knowledge_unit.source`. |
| AWS Bedrock | **Keine Aenderung in V5** — Bedrock kommt erst in V5.1 fuer PII-Redaction + Schritt-Extraktion. |
| Self-hosted Whisper | Wiederverwendung, keine Container-Aenderung. |

### Datenmodell V5

#### `walkthrough_session` (neu) — DEC-074

Eigene Tabelle mit FK auf `capture_session`. Walkthrough-spezifische Status-Maschine + Privacy-Policy. Pattern analog `dialogue_session` (V3 DEC-026).

```sql
CREATE TABLE walkthrough_session (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  capture_session_id          uuid        NOT NULL REFERENCES capture_session ON DELETE CASCADE,

  -- Aufnehmer (Mitarbeiter oder GF, der die Session laeuft)
  recorded_by_user_id         uuid        NOT NULL REFERENCES auth.users,

  -- Storage
  storage_path                text,                                                 -- "walkthroughs/<tenant>/<id>/recording.webm" (gesetzt nach Upload-Confirm)
  storage_bucket              text        NOT NULL DEFAULT 'walkthroughs',
  duration_sec                integer     CHECK (duration_sec IS NULL OR duration_sec <= 1800),  -- DEC-076 Hard-Cap 30min
  file_size_bytes             bigint,
  mime_type                   text        DEFAULT 'video/webm',

  -- Status-Maschine
  status                      text        NOT NULL DEFAULT 'recording'
                              CHECK (status IN (
                                'recording',         -- Browser nimmt aktiv auf (UI-State)
                                'uploading',         -- Browser uploaded zur signed URL
                                'uploaded',          -- Upload bestaetigt, Whisper-Job queued
                                'transcribing',      -- Whisper laeuft
                                'pending_review',    -- Whisper fertig, wartet auf Berater
                                'approved',          -- Berater hat approved
                                'rejected',          -- Berater hat rejected
                                'failed'             -- Upload/Transcription fehlgeschlagen
                              )),

  -- Whisper-Output (Transkript wird zusaetzlich als knowledge_unit mit source='walkthrough_transcript' persistiert,
  -- hier liegt nur der Header fuer schnelle Status-Polling-UI)
  transcript_started_at       timestamptz,
  transcript_completed_at     timestamptz,
  transcript_model            text,                                                 -- z.B. 'whisper-medium'
  transcript_knowledge_unit_id uuid REFERENCES knowledge_unit ON DELETE SET NULL,

  -- Berater-Review (V5: manuell, V5.1: KI-augmented)
  reviewer_user_id            uuid        REFERENCES auth.users,
  reviewed_at                 timestamptz,
  privacy_checkbox_confirmed  boolean     DEFAULT false,                            -- DEC-077 Pflicht-Bestaetigung vor Approve
  reviewer_note               text,                                                 -- kurz, V5.2+ ggf. Markdown
  rejection_reason            text,

  recorded_at                 timestamptz NOT NULL DEFAULT now(),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_walkthrough_session_tenant       ON walkthrough_session(tenant_id);
CREATE INDEX idx_walkthrough_session_capture      ON walkthrough_session(capture_session_id);
CREATE INDEX idx_walkthrough_session_recorded_by  ON walkthrough_session(recorded_by_user_id);
CREATE INDEX idx_walkthrough_session_status_pending
  ON walkthrough_session(tenant_id, recorded_at DESC)
  WHERE status = 'pending_review';
```

**Constraints:**
- `duration_sec <= 1800` (DEC-076 Hard-Cap 30min als DB-Schutz; UI setzt MediaRecorder-Auto-Stopp).
- `status='approved'` impliziert `privacy_checkbox_confirmed=true` AND `reviewer_user_id IS NOT NULL` (UPDATE-Trigger oder Server-Side-Validation).
- `status='approved' OR status='rejected'` impliziert `reviewed_at IS NOT NULL`.

#### Schema-Erweiterungen bestehender Tabellen

```sql
-- capture_session: 'walkthrough' wird produktiver Mode (V4 hatte nur 'walkthrough_stub')
ALTER TABLE capture_session
  DROP CONSTRAINT capture_session_capture_mode_check;
ALTER TABLE capture_session
  ADD CONSTRAINT capture_session_capture_mode_check
  CHECK (capture_mode IS NULL OR capture_mode IN (
    'questionnaire',
    'evidence',
    'dialogue',
    'employee_questionnaire',
    'walkthrough_stub',   -- bleibt als Architektur-Beispiel im Code, nicht mehr in UI
    'walkthrough'         -- NEU V5 (produktiv)
  ));

-- knowledge_unit.source: neue Quelle fuer Whisper-Transkript
ALTER TABLE knowledge_unit
  DROP CONSTRAINT knowledge_unit_source_check;
ALTER TABLE knowledge_unit
  ADD CONSTRAINT knowledge_unit_source_check
  CHECK (source IN (
    'questionnaire', 'exception', 'ai_draft', 'meeting_final', 'manual',
    'evidence', 'dialogue',
    'employee_questionnaire',
    'walkthrough_transcript'  -- NEU V5
  ));
```

### Capture-Mode-Registry-Update

`src/components/capture-modes/walkthrough_stub/` bleibt als Code-Baseline erhalten (Architektur-Beispiel-Eintrag, dokumentiert SC-V4-6). Neue Implementierung lebt unter `src/components/capture-modes/walkthrough/`. Der Registry-Eintrag `walkthrough` wird neu hinzugefuegt; der `walkthrough_stub`-Eintrag wird aus der UI-Anzeige entfernt (nur noch Code-Doku-Beispiel).

### Storage-Bucket `walkthroughs`

#### Bucket-Konfiguration

```sql
-- Supabase Storage: Bucket-Eintrag
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'walkthroughs',
  'walkthroughs',
  false,                                      -- KEIN Public-Access (R-V5-3 Privacy)
  524288000,                                  -- 500 MB Hard-Cap (Sicherheits-Puffer ueber 30min/300MB)
  ARRAY['video/webm']                         -- DEC-075 nur WebM/VP9 in V5
);
```

#### Bucket-RLS-Policies

```sql
-- INSERT: nur recorded_by oder strategaize_admin
CREATE POLICY "walkthroughs_bucket_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'walkthroughs'
    AND (
      -- Pfad-Praefix muss tenant_id des aufnehmenden Users sein
      (storage.foldername(name))[1] IN (
        SELECT tenant_id::text FROM tenant_user WHERE user_id = auth.uid()
      )
    )
  );

-- SELECT (signed-URL-Generierung erlaubt es nur fuer berechtigte User):
-- Pre-Approve: nur recorded_by_user_id + tenant_admin des Tenants + strategaize_admin
-- Post-Approve: gleiche Policy (V5 — keine breitere Sichtbarkeit, weil PII noch nicht redacted ist)
CREATE POLICY "walkthroughs_bucket_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'walkthroughs'
    AND EXISTS (
      SELECT 1 FROM walkthrough_session ws
      WHERE ws.storage_path = name
        AND (
          ws.recorded_by_user_id = auth.uid()
          OR (auth.jwt()->>'role') = 'strategaize_admin'
          OR (
            ws.tenant_id IN (
              SELECT tenant_id FROM tenant_user
              WHERE user_id = auth.uid() AND role IN ('tenant_admin')
            )
          )
        )
    )
  );

-- DELETE: nur strategaize_admin (Lifecycle/Cleanup) oder Auto-Delete-Job (service_role)
CREATE POLICY "walkthroughs_bucket_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'walkthroughs'
    AND (auth.jwt()->>'role') = 'strategaize_admin'
  );
```

#### Pfad-Konvention

`<tenant_id>/<walkthrough_session_id>/recording.webm`

Beispiel: `walkthroughs/4f1a.../9c3e.../recording.webm`. Tenant-Isolation per Pfad-Praefix + Bucket-RLS doppelt abgesichert.

#### Lifecycle-Policy (V5-Light, MIG-031 Teil)

- `status='rejected'` → Auto-Delete der Storage-Datei nach 30 Tagen (Coolify-Scheduled-Task `walkthrough-cleanup-daily`, idempotent).
- `status='approved'` → keine Auto-Loeschung in V5 (Retention wird im Pre-Production-Compliance-Gate bewertet).
- `status='failed'` → Auto-Delete nach 7 Tagen.

Implementierung des Cleanup-Jobs erfolgt in SLC-074 (Capture-Session-Integration + Cleanup).

### Upload-Strategie (Direct-Upload via signed URL) — DEC-077

Server-Proxy via Server Actions ist fuer 150–300 MB Body **nicht praktikabel** (Next.js 4MB Body-Default, Coolify-Timeout-Risiko, doppelte Memory-Last). Direct-Upload ueber signed URL ist Browser-Standard fuer grosse Uploads.

#### Pre-Upload-Phase (Server Action)

```typescript
// src/app/actions/walkthrough.ts
'use server';

export async function requestWalkthroughUpload(input: {
  captureSessionId: string;
  estimatedDurationSec: number;
}): Promise<{ walkthroughSessionId: string; uploadUrl: string; storagePath: string }> {
  const { user, tenantId } = await requireAuth();
  // Validierung: estimatedDurationSec <= 1800, captureSession gehoert zu user oder seinem Tenant
  // INSERT walkthrough_session mit status='recording', recorded_by_user_id=user.id
  // storage_path = "<tenantId>/<walkthroughId>/recording.webm" (vorab reserviert)
  // signed Upload-URL via supabaseAdmin.storage.from('walkthroughs').createSignedUploadUrl(path, { upsert: false })
  // TTL: 15min (Default-Supabase-Signed-Upload)
  // Server Action gibt {walkthroughSessionId, uploadUrl, storagePath} zurueck
}
```

#### Browser-Upload

Browser POSTet das WebM-Blob direkt an die signed URL. Kein Next.js-Hop. Fortschritt via `XMLHttpRequest.upload.onprogress` fuer UI-Indikator.

#### Confirm-Phase (Server Action)

```typescript
export async function confirmWalkthroughUploaded(input: {
  walkthroughSessionId: string;
  durationSec: number;
  fileSizeBytes: number;
}): Promise<void> {
  // Validierung: walkthroughSession gehoert zu user, status='recording'|'uploading'
  // durationSec <= 1800 (DB-CHECK fangs ab, hier Fast-Fail)
  // UPDATE walkthrough_session SET storage_path, duration_sec, file_size_bytes, status='uploaded'
  // INSERT ai_jobs (job_type='walkthrough_transcribe', payload={walkthroughSessionId})
  // Worker pollt ai_jobs, transkribiert, setzt status='transcribing' → 'pending_review'
}
```

#### Approve/Reject (Server Action)

```typescript
export async function approveOrRejectWalkthrough(input: {
  walkthroughSessionId: string;
  decision: 'approved' | 'rejected';
  privacyCheckboxConfirmed: boolean;
  reviewerNote?: string;
  rejectionReason?: string;
}): Promise<void> {
  // Validierung: requireRole(['strategaize_admin', 'tenant_admin'])
  // decision='approved' verlangt privacyCheckboxConfirmed=true (DEC-077, sonst HTTP 422)
  // walkthroughSession.status muss 'pending_review' sein
  // UPDATE walkthrough_session SET status, reviewer_user_id, reviewed_at, privacy_checkbox_confirmed, reviewer_note, rejection_reason
  // Audit-Log: error_log mit category='walkthrough_review', user_id=reviewer, walkthrough_session_id, decision
}
```

### Data Flow V5

#### Flow 1 — Walkthrough Aufnahme (Mitarbeiter)

```
Browser (Mitarbeiter)
  → /employee/capture/walkthrough/[capture_session_id]
       → Klick "Walkthrough starten"
            → navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })   // Screen-Spur ohne System-Audio (DEC-078)
            → navigator.mediaDevices.getUserMedia({ audio: true })                    // Mic-Spur
            → Stream-Combine: ein VideoTrack + ein AudioTrack zu MediaStream
            → MediaRecorder({ mimeType: 'video/webm;codecs=vp9,opus' })              // DEC-075
            → setTimeout(autoStopAt30Min) als Hard-Stop
       → Recording laeuft (UI: Pause/Resume/Stopp + Restzeit + Mic-Pegel optional)
       → Bei Stopp:
            → MediaRecorder gibt Blob (video/webm)
            → Server Action requestWalkthroughUpload({captureSessionId, estimatedDurationSec})
                 → Returns: walkthroughSessionId, signed uploadUrl, storagePath
            → Browser PUT Blob → signed URL (XHR mit Progress-Bar)
            → Server Action confirmWalkthroughUploaded({walkthroughSessionId, durationSec, fileSizeBytes})
                 → walkthrough_session.status='uploaded'
                 → ai_jobs INSERT job_type='walkthrough_transcribe'
       → UI redirect zu /employee/walkthroughs/[walkthroughSessionId] (Status-Polling-Page)
```

#### Flow 2 — Whisper-Transkription (Worker, asynchron)

```
Worker pollt ai_jobs WHERE job_type='walkthrough_transcribe' AND status='pending'
  → walkthrough_session laden
  → status='transcribing', transcript_started_at=now()
  → Storage Download: WebM-Blob (Service-Role) → /tmp/<id>.webm
  → ffmpeg extract Audio-Spur: -vn -acodec libopus -b:a 64k → /tmp/<id>.opus
       (Audio-only-Submit reduziert Whisper-Payload um ~95%)
  → POST /transcribe an Self-hosted Whisper (siehe DEC-018)
  → Whisper liefert Transkript-Text (medium-Modell, DE, no language detection)
  → INSERT knowledge_unit (
       tenant_id, capture_session_id, source='walkthrough_transcript',
       unit_type='observation', confidence='medium', body=transcript_text,
       evidence_refs={ walkthrough_session_id }
     )
  → UPDATE walkthrough_session SET
       transcript_completed_at, transcript_model='whisper-medium',
       transcript_knowledge_unit_id, status='pending_review'
  → /tmp Cleanup
```

#### Flow 3 — Berater-Review (manueller Approve-Pfad)

```
Browser (strategaize_admin oder tenant_admin)
  → /admin/walkthroughs (cross-tenant) oder /admin/tenants/[id]/walkthroughs (per Tenant)
       → Liste: alle walkthrough_session WHERE status='pending_review' ORDER BY recorded_at ASC
       → Klick auf Eintrag
            → /admin/walkthroughs/[id]
                 → HTML5 video src=signedDownloadUrl (15min TTL, Server-side erzeugt)
                 → Transkript-Anzeige (knowledge_unit.body)
                 → Pflicht-Checkbox: "Ich habe geprueft: keine kundenspezifischen oder sensitiven Inhalte sichtbar"
                 → Approve / Reject Buttons (Approve disabled solange Checkbox unchecked)
       → Klick "Approve" oder "Reject"
            → Server Action approveOrRejectWalkthrough(...)
                 → UPDATE walkthrough_session
                 → Audit-Log error_log INSERT
       → Liste-Refresh
```

#### Flow 4 — Cleanup-Job (Coolify-Scheduled-Task)

```
Coolify Cron: walkthrough-cleanup-daily (0 3 * * * Europe/Berlin)
  → Container app, Command: node -e "fetch('http://localhost:3000/api/cron/walkthrough-cleanup', {headers:{Authorization:'Bearer '+process.env.CRON_SECRET}})"
  → Endpoint validiert CRON_SECRET
  → Query 1: SELECT walkthrough_session WHERE status='rejected' AND reviewed_at < NOW() - INTERVAL '30 days'
  → Query 2: SELECT walkthrough_session WHERE status='failed' AND created_at < NOW() - INTERVAL '7 days'
  → Pro Eintrag: supabaseAdmin.storage.from('walkthroughs').remove([storage_path])
  → DELETE walkthrough_session-Eintrag (oder soft-delete via status='deleted', je SLC-074-Entscheidung)
  → Audit-Log error_log
```

### RLS-Modell V5

#### `walkthrough_session` 4-Rollen-Matrix

| Rolle | SELECT | INSERT | UPDATE (Approve/Reject) | UPDATE (Status-Wechsel via Worker) |
|-------|--------|--------|-------------------------|-----------------------------------|
| `strategaize_admin` | alle Tenants | alle Tenants | alle Tenants | service_role only |
| `tenant_admin` | nur eigener Tenant | eigener Tenant | nur eigener Tenant | nein |
| `tenant_member` (Default-Mitarbeiter) | nur eigene `recorded_by_user_id` | eigene Sessions | nein | nein |
| `employee` | nur eigene `recorded_by_user_id` | eigene Sessions | nein | nein |

```sql
-- SELECT-Policy
CREATE POLICY "walkthrough_session_select" ON walkthrough_session
  FOR SELECT TO authenticated
  USING (
    -- strategaize_admin sieht alle
    (auth.jwt()->>'role') = 'strategaize_admin'
    OR
    -- tenant_admin sieht eigenen Tenant
    (
      (auth.jwt()->>'role') = 'tenant_admin'
      AND tenant_id IN (SELECT tenant_id FROM tenant_user WHERE user_id = auth.uid())
    )
    OR
    -- tenant_member / employee sieht nur eigene Aufnahmen
    recorded_by_user_id = auth.uid()
  );

-- INSERT-Policy: nur eigene Aufnahmen, eigener Tenant
CREATE POLICY "walkthrough_session_insert" ON walkthrough_session
  FOR INSERT TO authenticated
  WITH CHECK (
    recorded_by_user_id = auth.uid()
    AND tenant_id IN (SELECT tenant_id FROM tenant_user WHERE user_id = auth.uid())
  );

-- UPDATE-Policy: Approve/Reject nur strategaize_admin oder tenant_admin (eigener Tenant)
-- Worker-Status-Updates ('uploading' → 'uploaded' → 'transcribing' → 'pending_review') laufen via service_role
CREATE POLICY "walkthrough_session_update_review" ON walkthrough_session
  FOR UPDATE TO authenticated
  USING (
    (auth.jwt()->>'role') = 'strategaize_admin'
    OR (
      (auth.jwt()->>'role') = 'tenant_admin'
      AND tenant_id IN (SELECT tenant_id FROM tenant_user WHERE user_id = auth.uid())
    )
  );
```

#### Test-Matrix Pflicht (SC-V5-4)

Vitest-Integration-Test gegen Coolify-DB (Pattern: coolify-test-setup.md). 4 Rollen × 4 Operationen (Create/SelectOwn/SelectOther/Approve) = 16 Faelle, alle erwarteten Permission-Denials per SAVEPOINT-Pattern.

### Security / Privacy V5

#### Pre-Approve-Sicht (R-V5-3 Privacy-Leak Mitigation)

- Roh-WebM ist NUR fuer `recorded_by_user_id` + `tenant_admin` (eigener Tenant) + `strategaize_admin` lesbar.
- Roh-Transkript (knowledge_unit `source='walkthrough_transcript'`) folgt derselben RLS — `tenant_member` ohne Bezug zur Session sieht es **nicht**.
- Kein Public-URL, kein Embed-Code, keine Cross-Tenant-Sichtbarkeit.

#### Privacy-Checkbox als Pflicht-Stufe (DEC-077)

Approve ohne `privacy_checkbox_confirmed=true` schlaegt server-side mit HTTP 422 fehl. UI-Block + Server-Side-Validation (Defense-in-Depth). Audit-Log enthaelt User, Timestamp, Decision, Checkbox-Status.

#### Storage-Lifecycle

`status='rejected'` → 30 Tage → Auto-Delete (Storage + DB-Eintrag). Verhindert dauerhaft gespeicherte rejected-Aufnahmen, die irrelevant aber sensitiv sind.

#### DSGVO-Posture

- Speicherort: Self-hosted Coolify+Supabase auf Hetzner Frankfurt — DSGVO-konform.
- Whisper: Self-hosted Container, keine Datenuebertragung an Drittanbieter.
- Bedrock kommt NICHT in V5 zum Einsatz — V5 ist KI-frei (Whisper ist Transkriptions-Pipeline, nicht generative KI).
- V5.1 fuegt Bedrock fuer PII-Redaction hinzu — eu-central-1 (existing-konform).

### Constraints und Tradeoffs V5

#### Constraint — Browser-Kompatibilitaet (DEC-075)

WebM/VP9+Opus only. Safari <16 ist explizit nicht Pflicht. Bei spaeterem Safari-Bedarf ist optionales ffmpeg-Transcoding-Job in V5.2 additiv. **Tradeoff bewusst:** weniger Browser-Reichweite vs. keine Server-Transcoding-Komplexitaet.

#### Constraint — 30min Hard-Cap (DEC-076)

Storage-Wachstum (R-V5-1: 15-30 GB / 100 Sessions) und Whisper-Backlog (45min/Session bei 1.5x Realtime) wuerden bei 60min ungeprueft eskalieren. **Tradeoff bewusst:** lange Walkthroughs muessen auf 2 Sessions geschnitten werden — akzeptabel, weil Onboarding-Walkthroughs typisch 12-25min sind.

#### Constraint — Mic-only (DEC-078)

Screen-Audio aus `getDisplayMedia({audio:true})` wird in Firefox nicht unterstuetzt; Chrome braucht User-Checkbox "Audio teilen", die typisch nicht aktiviert wird. **Tradeoff bewusst:** System-Sounds gehen verloren (selten relevant fuer Onboarding-Wissen). Bei spaeterem Bedarf (Software-Tutorials mit Klingelton/Alert) als V5.2-Option additiv.

#### Constraint — Direct-Upload (DEC-077)

150–300 MB durch Next.js Server Actions waere nicht praktikabel (4MB-Body-Default, Coolify-Timeout). **Tradeoff bewusst:** signed URLs sind kurzlebig (15min TTL) und tenant-isoliert — dadurch RLS-Aequivalent auf Storage-Ebene gewaehrleistet.

#### Constraint — Manueller Approve-Pfad (V5)

V5 hat KEINEN KI-Vorschlag. Berater muss Roh-Transkript komplett selbst lesen + per Hand pruefen. **Tradeoff bewusst:** Privacy-First in V5, KI-Geschwindigkeit in V5.1. Risiko: Berater-Review-Aufwand pro Walkthrough = ~Realtime der Aufnahme (30min Walkthrough = 30min Review). V5.1 reduziert das auf ~5-10min via PII-redacted Schritt-Vorschlag.

### V5 Decisions (Cross-Reference)

- **DEC-074** — Walkthrough-Datenmodell: eigene Tabelle `walkthrough_session` mit FK zu `capture_session`, kein capture_session-Erweiterungs-Pattern.
- **DEC-075** — Walkthrough-Storage-Codec: WebM/VP9+Opus only, kein MP4-Transcoding in V5.
- **DEC-076** — Walkthrough-Max-Dauer: 30 Minuten Hard-Cap, durchgesetzt im Browser (MediaRecorder Auto-Stopp) UND DB (CHECK `duration_sec <= 1800`).
- **DEC-077** — Walkthrough-Upload-Strategie: Direct-Upload via Supabase Storage Signed URL (15min TTL), kein Server-Proxy. Plus: Approve verlangt `privacy_checkbox_confirmed=true` als DB+Server-Side-Validation.
- **DEC-078** — Walkthrough-Audio-Mix: Mic-only (`getUserMedia audio:true` + `getDisplayMedia audio:false`), kein Screen-Audio.

### Open Technical Questions V5

Alle 5 Q-V5-A..E sind durch DEC-074..078 geklaert. **Keine offenen technischen Fragen** zur V5-MVP-Architektur.

V5.1-spezifische Open Questions (Q-V5.1-A..C zu Bedrock-Modell, PII-Pattern-Liste, Original-vs-Redacted-Storage) bleiben fuer eigenes /architecture V5.1 nach V5-Live-Feedback offen.

### Migrations-Plan V5

**MIG-031** (siehe MIGRATIONS.md) buendelt:

- Migration 082 — `082_v5_walkthrough_capture_mode.sql`: CHECK-Erweiterung `capture_session.capture_mode` um `'walkthrough'` + `knowledge_unit.source` um `'walkthrough_transcript'`.
- Migration 083 — `083_v5_walkthrough_session.sql`: CREATE TABLE `walkthrough_session` + Indizes + RLS-Policies (4 Rollen).
- Migration 084 — `084_v5_walkthrough_storage_bucket.sql`: INSERT INTO storage.buckets + 3 Storage-RLS-Policies (insert/select/delete).

Alle 3 Migrations sind idempotent (`IF NOT EXISTS` / `DROP CONSTRAINT IF EXISTS` / Bucket-Upsert via `ON CONFLICT DO NOTHING`).

### Recommended Implementation Direction

#### Slice-Empfehlung (an /slice-planning V5)

PRD-Skizze (4 Slices SLC-071..074) bleibt nach Architektur-Pruefung tragfaehig. Architektur-bedingte Verfeinerung:

| Slice | Scope (architektur-praezisiert) | Geschaetzt |
|-------|----------------------------------|------------|
| SLC-071 | Migration 082+083+084 + Storage-Bucket-Setup + Walkthrough-Capture-UI (`/employee/capture/walkthrough/[id]`) + getDisplayMedia/getUserMedia + MediaRecorder + 30min Auto-Stopp + Direct-Upload (signed URL) + Server Actions `requestWalkthroughUpload` + `confirmWalkthroughUploaded` | ~7-9 MTs |
| SLC-072 | Worker-Handler `walkthrough_transcribe` + ffmpeg Audio-Extract + Whisper-Adapter-Wiederverwendung + knowledge_unit Persistierung (`source='walkthrough_transcript'`) + Status-Maschine `transcribing → pending_review` + Status-Polling-API | ~4-5 MTs |
| SLC-073 | Berater-Review-UI: `/admin/walkthroughs` + `/admin/tenants/[id]/walkthroughs` + `/admin/walkthroughs/[id]` mit HTML5-video + Transkript-Anzeige + Pflicht-Checkbox + Server Action `approveOrRejectWalkthrough` + Audit-Log + Cockpit-Card "Pending Walkthroughs" | ~5-6 MTs |
| SLC-074 | Capture-Mode-Registry-Update (`walkthrough` als produktiver Eintrag, `walkthrough_stub` aus UI entfernt) + 4-Rollen-RLS-Test-Matrix (16 Faelle, SAVEPOINT-Pattern) + Cleanup-Job (Coolify-Scheduled-Task) + Lint/Build/Test gruen | ~4-5 MTs |

**Gesamt:** 4 Slices, ~20-25 MTs, geschaetzt **~2 Wochen Implementation** (entspricht PRD-Skizze).

#### Sequencing

1. **SLC-071 zuerst** — Migration + Capture-UI + Upload-Pfad. Voraussetzung fuer SLC-072 (sonst nichts zum Transkribieren).
2. **SLC-072** — Worker-Pfad. Voraussetzung fuer SLC-073 (sonst nichts zum Reviewen).
3. **SLC-073** — Review-UI. Voraussetzung fuer Gesamt-QA.
4. **SLC-074** — Integration + RLS-Test-Matrix + Cleanup. Vor /final-check.

#### Pflicht-Gates fuer V5-Release

- **SC-V5-4 RLS-Matrix gruen** (16 Faelle Vitest gegen Coolify-DB).
- **SC-V5-1 Mitarbeiter-Self-Test**: Nicht-Tech-User-Smoke (User selbst) ueber gesamten Capture-Pfad (Permission-Prompts → Recording → Stopp → Upload → Status-Polling → Transkript sichtbar).
- **SC-V5-3 Berater-Review-Smoke** ueber alle 3 Routen (cross-tenant, per-tenant, detail) inkl. Approve/Reject mit + ohne Checkbox.
- **SC-V5-5 Code-Quality**: 0 Lint-Errors, 0 Lint-Warnings, alle Vitest gruen, `npm audit --omit=dev` = 0 Vulns.

### Naechster Schritt V5

`/slice-planning V5` — die 4 Slice-Empfehlungen oben in finale SLC-071..074-Files zerlegen, MTs nummerieren, Slice-INDEX.md updaten, BL-077..080 → `in_progress` setzen.

V5.1 (`/requirements V5.1` ist bereits done, `/architecture V5.1` offen) wird nach V5-Release angegangen.

---

## V5 Option 2 Architecture Addendum — Methodik-Schicht (PII-Redaction + Schritt-Extraktion + Auto-Mapping + Methodik-Review-UI)

### Status

Architecture done 2026-05-06 nach `/architecture V5 Option 2` mit Re-Plan auf Basis DEC-079 (Strategaize-Dev-System) + RPT-170 (Requirements V5 Option 2). Diese Sektion **erweitert** die V5-Architecture (oben) um die Methodik-Schicht (PII-Redaction, Schritt-Extraktion, Auto-Mapping zu Subtopics) und ersetzt das urspruengliche manuelle Berater-Roh-Video-Review (FEAT-036, deferred) durch ein Methodik-Review-UI (FEAT-040).

DEC-074..078 (V5-Foundation: walkthrough_session-Tabelle, WebM/VP9-Codec, 30min-Hard-Cap, Direct-Upload+Privacy-Checkbox, Mic-only) bleiben **alle accepted**, kein supersede — ihre Begruendung ist Capture-/Storage-spezifisch und Option-2-orthogonal. DEC-077 Privacy-Checkbox-Pflicht wandert architektonisch vom Roh-Video-Approve zum Methodik-Review-Approve (Re-Validation in DEC-090).

### Architektur-Zusammenfassung Option 2

V5 Option 2 fuegt der V5-Foundation eine **3-stufige asynchrone AI-Pipeline** zwischen Whisper-Transkription und Berater-Review ein. Die Pipeline laeuft im bestehenden Worker-Container ueber `ai_jobs`-Queueing (Pattern wie SLC-008 / FEAT-005, FEAT-010, FEAT-016, FEAT-023). Bedrock-Claude-Sonnet (eu-central-1) verarbeitet drei sequentielle Schritte:

1. **PII-Redaction** — Original-Transkript → redacted-Transkript (Platzhalter-basiert)
2. **Schritt-Extraktion** — redacted-Transkript → strukturierte SOP-Schritt-Liste (`walkthrough_step` Tabelle)
3. **Auto-Mapping** — SOP-Schritt-Liste + Template-Subtopic-Tree → `walkthrough_step → subtopic_id` Zuordnung (`walkthrough_review_mapping` Tabelle, Bridge-Engine-Pattern in Reverse-Direction)

Der Berater sieht im Methodik-Review-UI (FEAT-040) den Subtopic-Tree mit zugeordneten Schritten + Unmapped-Bucket, korrigiert Mapping per Select-Move, bestaetigt Pflicht-Checkbox, approved/rejected. **Kein Roh-Video im Berater-UI**. Die Roh-WebM-Datei bleibt im Storage als Audit-/Re-Processing-Quelle, aber nicht als Berater-Review-Material (R-V5-3 + DSGVO-Plus).

V5 Option 2 ist die erste Strategaize-Onboarding-Pipeline, die Bedrock produktiv im Onboarding-Repo nutzt (V1-V4 hatten Bedrock fuer Verdichtung/Diagnose/Bridge im selben Worker; V5 Option 2 erweitert um drei walkthrough-spezifische Job-Types — kein neuer Service, keine neue Auth, keine neue Container).

### Service-Topologie Option 2

| Service | Aenderung in Option 2 (gegenueber V5-Foundation) |
|---------|---------------------------------------------------|
| Web App (Next.js) | **Neue Routen ersetzen** alte FEAT-036-Routen: `/admin/walkthroughs` (Methodik-Review-Liste, cross-tenant), `/admin/tenants/[id]/walkthroughs` (per Tenant), `/admin/walkthroughs/[id]` (Methodik-Review-Detail mit Subtopic-Tree). **Neue Server Actions**: `startWalkthroughSession` (Self-Spawn-Pattern, DEC-080), `editWalkthroughStep`, `moveWalkthroughStepMapping`, `approveOrRejectWalkthroughMethodology`. `approveOrRejectWalkthrough` aus V5-Foundation wird umbenannt/ersetzt. **Neue Hilfs-API-Route**: `/api/cron/walkthrough-cleanup` (Lifecycle aus V5-Foundation bleibt bestehen, Cleanup-Cron erweitert um stale-pipeline-Recovery). |
| Worker Container | **Drei neue Job-Handler** im bestehenden Worker (kein neuer Container): `walkthrough_redact_pii`, `walkthrough_extract_steps`, `walkthrough_map_subtopics`. Pattern-Reuse: `bedrock-client.ts` (DEC-006), `ai_jobs`-Queueing (DEC-007), Cost-Logging (`ai_cost_ledger`). |
| Supabase Postgres | **Zwei neue Tabellen**: `walkthrough_step`, `walkthrough_review_mapping` (siehe Datenmodell). **CHECK-Erweiterungen**: `walkthrough_session.status` um `redacting`, `extracting`, `mapping`. `knowledge_unit.source` um `walkthrough_transcript_redacted`. |
| AWS Bedrock | **Erste produktive Nutzung im Onboarding-Worker** (aus V5-Foundation-Sicht; war in V1-V4 schon aktiv via condensation/diagnosis/bridge). Drei neue Prompt-Templates unter `src/lib/ai/prompts/walkthrough/` (`pii_redact.ts`, `step_extract.ts`, `subtopic_map.ts`). Modell `anthropic.claude-sonnet-4-20250514-v1:0` fuer alle drei Stufen (DEC-081). |
| Self-hosted Whisper | Unveraendert. Whisper-Output ist Pipeline-Input fuer Stufe 1. |
| Supabase Storage | Bucket `walkthroughs` unveraendert (V5-Foundation). Roh-WebM bleibt fuer Audit, kein neuer Bucket. |

### Datenmodell Option 2

#### `walkthrough_step` (NEU) — Stufe 2 Output

Strukturierte SOP-Schritt-Repraesentation aus dem redacted-Transkript. Eine Zeile pro extrahiertem Schritt. Spaltenpattern an V2 SOP-Tabelle (FEAT-012) angelehnt, aber walkthrough-eigenstaendig — keine Spalten-Duplizierung.

```sql
CREATE TABLE walkthrough_step (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  walkthrough_session_id      uuid        NOT NULL REFERENCES walkthrough_session ON DELETE CASCADE,

  -- Sortierung (1-basiert, Worker setzt initial)
  step_number                 integer     NOT NULL,

  -- Extrahierte SOP-Inhalte (Stage 2 Output)
  action                      text        NOT NULL,                       -- Was passiert in dem Schritt
  responsible                 text,                                        -- Wer macht es ("Mitarbeiter", "GF", "System")
  timeframe                   text,                                        -- Wann/wie lange ("nach Auftragseingang", "5min")
  success_criterion           text,                                        -- Wie erkennbar dass Schritt fertig
  dependencies                text,                                        -- Freitext "Schritt 1, Schritt 3"

  -- Source-Referenz (welcher redacted-Transkript-Snippet hat diesen Schritt erzeugt)
  transcript_snippet          text,                                        -- redacted Snippet (PII-frei)
  transcript_offset_start     integer,                                     -- char-Offset im redacted-Transkript-KU
  transcript_offset_end       integer,

  -- Berater-Edit-Spur (V5: Berater darf Schritt-Felder editieren)
  edited_by_user_id           uuid        REFERENCES auth.users,
  edited_at                   timestamptz,
  deleted_at                  timestamptz,                                 -- soft-delete (Berater entfernt unsinnigen Schritt)

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (walkthrough_session_id, step_number)
);

CREATE INDEX idx_walkthrough_step_session ON walkthrough_step(walkthrough_session_id, step_number)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_walkthrough_step_tenant ON walkthrough_step(tenant_id);
```

**Constraints:**
- `step_number >= 1` (NUMERIC CHECK).
- Soft-Delete via `deleted_at` (Audit-Spur erhalten — Schritt war im Output, Berater hat ihn entfernt).

#### `walkthrough_review_mapping` (NEU) — Stufe 3 Output + Berater-Korrektur

Eine Zeile pro `walkthrough_step` mit der Subtopic-Zuordnung. `subtopic_id IS NULL` bedeutet **Unmapped-Bucket** (DEC-085: kein separater Tabelle, einheitliches Datenmodell). Subtopic-Referenz ist `template_id` + `subtopic_id text` als logische String-Referenz auf den `unterbereich`-Wert einer Template-Frage (z.B. "Block A / A1 Grundverständnis"). **DEC-092 Drift-Korrektur (in /backend SLC-078):** Architecture-Doc nahm urspruenglich `template.blocks[].subtopics[]` an — diese Struktur existiert im realen Template-Schema NICHT. Effektive Subtopic-Schicht lebt in `blocks[].questions[].unterbereich`. Migration 086 (`subtopic_id text`) ist von der Korrektur unabhaengig kompatibel.

```sql
CREATE TABLE walkthrough_review_mapping (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  walkthrough_step_id         uuid        NOT NULL UNIQUE REFERENCES walkthrough_step ON DELETE CASCADE,

  -- Subtopic-Zuordnung
  template_id                 uuid        NOT NULL REFERENCES template,    -- Welches Template
  template_version            text        NOT NULL,                        -- Eingefroren beim Mapping
  subtopic_id                 text,                                        -- NULL = Unmapped-Bucket (DEC-085)

  -- Auto-Mapping-Output (Stufe 3)
  confidence_score            numeric(3,2),                                -- 0.00 - 1.00
  confidence_band             text        GENERATED ALWAYS AS (            -- Ampel (DEC-087)
                                CASE
                                  WHEN subtopic_id IS NULL THEN 'red'      -- Unmapped
                                  WHEN confidence_score >= 0.85 THEN 'green'
                                  WHEN confidence_score >= 0.70 THEN 'yellow'
                                  ELSE 'red'
                                END
                              ) STORED,
  mapping_model               text,                                        -- z.B. 'claude-sonnet-4-20250514-v1:0'
  mapping_reasoning           text,                                        -- LLM-Begruendung (debug + audit)

  -- Berater-Korrektur
  reviewer_corrected          boolean     NOT NULL DEFAULT false,
  reviewer_user_id            uuid        REFERENCES auth.users,
  reviewed_at                 timestamptz,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wkrm_session_subtopic
  ON walkthrough_review_mapping(walkthrough_step_id, subtopic_id);

CREATE INDEX idx_wkrm_unmapped
  ON walkthrough_review_mapping(tenant_id, walkthrough_step_id)
  WHERE subtopic_id IS NULL;
```

**Constraints:**
- `confidence_score BETWEEN 0 AND 1`.
- Wenn `subtopic_id IS NOT NULL`, dann `confidence_score IS NOT NULL` (Stufe 3 setzt immer beides bei Auto-Mapping; Berater-Korrektur via `reviewer_corrected=true` haelt Score auf `1.00`).
- `reviewer_corrected=true` impliziert `reviewer_user_id IS NOT NULL AND reviewed_at IS NOT NULL`.

#### Status-Maschine `walkthrough_session.status` (erweitert)

Bestehende Werte (V5-Foundation) bleiben. Neue Werte fuer Pipeline-Stufen:

```sql
status text NOT NULL DEFAULT 'recording'
  CHECK (status IN (
    'recording',
    'uploading',
    'uploaded',
    'transcribing',
    -- NEU Option 2: Pipeline-Stufen
    'redacting',         -- Stufe 1 PII-Redaction laeuft
    'extracting',        -- Stufe 2 Schritt-Extraktion laeuft
    'mapping',           -- Stufe 3 Auto-Mapping laeuft
    -- gleicher Endstand:
    'pending_review',    -- Methodik-Review wartet auf Berater
    'approved',
    'rejected',
    'failed'
  ))
```

**Pipeline-Trigger-Sequenz:**
- `transcribed` (V5-Foundation Endstand) wird automatisch durch ai_jobs-Enqueue zu `redacting`. Wenn `redact_pii_job` fertig: `extracting`. Wenn fertig: `mapping`. Wenn fertig: `pending_review`.
- Fehlt eine Stufe (Bedrock-Outage, Parse-Fehler, etc.): `failed`. Cleanup-Cron erkennt `redacting/extracting/mapping > 1h alt` und markiert ebenfalls `failed` (Recovery, kein automatischer Retry in V5).

#### `knowledge_unit.source` Erweiterung

```sql
ALTER TABLE knowledge_unit
  DROP CONSTRAINT knowledge_unit_source_check;
ALTER TABLE knowledge_unit
  ADD CONSTRAINT knowledge_unit_source_check
  CHECK (source IN (
    -- bestehend:
    'questionnaire', 'exception', 'ai_draft', 'meeting_final', 'manual',
    'evidence', 'dialogue',
    'employee_questionnaire',
    'walkthrough_transcript',                -- V5-Foundation
    -- NEU Option 2:
    'walkthrough_transcript_redacted'        -- Stufe 1 Output
  ));
```

`walkthrough_transcript_redacted` lebt als separater knowledge_unit-Eintrag mit Verweis auf das Original via `evidence_refs={ original_kuId, walkthrough_session_id }` (DEC-084). RLS und Policies sind identisch zur `walkthrough_transcript`-Source — keine erweiterte Sichtbarkeit.

**KU-Sichtbarkeit von approved walkthrough_step (DEC-090):** V5 Option 2 produziert approved Schritte in `walkthrough_step`, **erstellt aber keine `knowledge_unit`-Eintraege fuer SOPs**. Die KU-Bruecke (Schritte → knowledge_unit-Source `walkthrough` → Handbuch-Snapshot) ist V5.1-Scope (FEAT-038). In V5 Option 2 sind approved walkthrough-Schritte standalone in `walkthrough_step` und nirgendwo sonst sichtbar — bewusster Scope-Schnitt, hindert keine V5.1-Erweiterung.

### Capture-Entry-Point: Self-Spawn-Pattern (Q-V5-F gefixt) — DEC-080

#### Problem (aus SLC-071-Browser-Smoke-Versuch 2026-05-06)

richard@bellaerts.de (employee, Demo-Tenant) navigierte zu `/employee/capture/walkthrough/<capture_session_id>` und erhielt **HTTP 404**. Diagnose: capture_session-RLS fuer `employee`-Rolle ist auf zugewiesene Sessions (employee_questionnaire-Pattern) restriktiert — eine beliebige Tenant-walkthrough-Session ohne Assignment ist fuer den employee unsichtbar.

#### Architektur-Entscheidung

**Self-Spawn-Pattern** (Adaption von Bridge-Engine FEAT-023): Beim Capture-Start spawnt der employee per Server Action **selbst** eine eigene capture_session mit `capture_mode='walkthrough'` und `owner_user_id=auth.uid()`. RLS-Sichtbarkeit ist trivial via Owner-Match gegeben — keine RLS-Aenderung, keine spezielle Branch-Logik im capture_session-Pfad, kein Drift zur V4-Bridge-Engine.

#### Neuer Entry-Point-Flow

```
/employee/walkthroughs (Liste eigener Walkthroughs + Button "Neuen Walkthrough starten")
       → Klick "Neuen Walkthrough starten"
            → Server Action startWalkthroughSession()
                 → INSERT capture_session (capture_mode='walkthrough', owner_user_id=user.id, tenant_id=user.tenantId, status='in_progress')
                 → INSERT walkthrough_session (recorded_by_user_id=user.id, capture_session_id=neuId, tenant_id, status='recording')
                 → Returns walkthroughSessionId
       → Redirect /employee/walkthroughs/[walkthroughSessionId]/record
            → Recording-UI (siehe V5-Foundation Flow 1, MediaRecorder + Direct-Upload)
       → Nach Stopp + Upload → Redirect /employee/walkthroughs/[walkthroughSessionId]
            → Status-Polling-Page (Pipeline-Progress)
```

**Konsequenz fuer SLC-071-Code:**
- Bestehender `/employee/capture/walkthrough/[capture_session_id]`-Pfad wird durch `/employee/walkthroughs/[walkthroughSessionId]/record` ersetzt.
- `requestWalkthroughUpload(captureSessionId)` wird zu `requestWalkthroughUpload(walkthroughSessionId)` (capture_session existiert intern, ist nicht UI-User-facing).
- `WalkthroughCapture.tsx` Komponente bleibt unveraendert in Funktionalitaet (MediaRecorder + Upload), nur Routing-Wrapping aendert sich.
- AC-10/11/12 Browser-Smoke wird nach dem Routing-Fix durchziehbar — **unblock fuer SLC-071-Slice-Closing**.

#### BL-086 Q-V5-F-Fix (Pflicht-Output)

Status: open → bekommt durch dieses /architecture die Architektur-Entscheidung (`status='approved'` in DEC-Form + Code-Pfad-Skizze). Implementation gehoert in den ersten Option-2-Slice (`/slice-planning V5 Option 2` entscheidet final, ob das in einen re-scoped SLC-071 oder einen neuen SLC-PII-Foundation-Block gefasst wird). Bis Implementation bleibt SLC-071 Browser-Smoke pending.

### AI-Pipeline Architektur

#### Job-Handler-Struktur (Worker)

Neue Files unter `src/workers/ai/`:

- `walkthrough-redact-pii-worker.ts` — Job-Type `walkthrough_redact_pii`
- `walkthrough-extract-steps-worker.ts` — Job-Type `walkthrough_extract_steps`
- `walkthrough-map-subtopics-worker.ts` — Job-Type `walkthrough_map_subtopics`

Alle drei Worker nutzen das bestehende Pattern (Polling-Loop, claim, run, mark complete/failed) und teilen sich Bedrock-Client + Cost-Ledger-Schreiben + error_log-Audit.

Pipeline-Trigger-Logik in `confirm-walkthrough-pipeline-step.ts`:

```typescript
// Pseudocode — Worker-internal nach erfolgreichem Stufen-Abschluss
async function advancePipeline(walkthroughSessionId: string) {
  const ws = await getWalkthroughSession(walkthroughSessionId);
  switch (ws.status) {
    case 'transcribing':       // Whisper just finished
      await setStatus(ws.id, 'redacting');
      await enqueueAiJob('walkthrough_redact_pii', { walkthroughSessionId: ws.id });
      break;
    case 'redacting':
      await setStatus(ws.id, 'extracting');
      await enqueueAiJob('walkthrough_extract_steps', { walkthroughSessionId: ws.id });
      break;
    case 'extracting':
      await setStatus(ws.id, 'mapping');
      await enqueueAiJob('walkthrough_map_subtopics', { walkthroughSessionId: ws.id });
      break;
    case 'mapping':
      await setStatus(ws.id, 'pending_review');
      break;
  }
}
```

#### Stufe 1 — PII-Redaction (`walkthrough_redact_pii`)

- **Input**: knowledge_unit mit source='walkthrough_transcript' und walkthrough_session_id.
- **Prompt**: System-Prompt aus `src/lib/ai/prompts/walkthrough/pii_redact.ts` mit konservativen Pattern-Regeln (PII-Pattern-Library = system-wide constant in `src/lib/ai/pii-patterns/`, DEC-082).
- **Output**: redacted-Text als neuer knowledge_unit mit source='walkthrough_transcript_redacted', evidence_refs={ original_kuId, walkthrough_session_id }, confidence='medium'.
- **Audit**: Bedrock-Region eu-central-1, Modell-ID, Token-Count, Timestamp pro Run via existing ai_cost_ledger.

#### Stufe 2 — Schritt-Extraktion (`walkthrough_extract_steps`)

- **Input**: redacted-knowledge_unit + walkthrough_session-Metadaten.
- **Prompt**: `src/lib/ai/prompts/walkthrough/step_extract.ts` mit Schritt-Strukturierungs-Schema (analog V2 SOP-Generation Pattern, FEAT-012).
- **Output**: N walkthrough_step-Rows (action, responsible, timeframe, success_criterion, dependencies, transcript_snippet, transcript_offset_start/end). Worker setzt step_number=1..N in Reihenfolge der Extraction.
- **Edge-Case**: Wenn N=0 (Walkthrough zu unstrukturiert): walkthrough_step bleibt leer, Pipeline geht trotzdem zu `mapping` → `pending_review` mit leerem Tree und Hinweis im UI.

#### Stufe 3 — Auto-Mapping (`walkthrough_map_subtopics`) — Bridge-Engine-Pattern Reverse-Direction

- **Input**: Alle walkthrough_step der Session + aktiver Template-JSON (Subtopic-Tree des Tenants).
- **Subtopic-Tree-Quelle (DEC-092)**: Tree wird aus `template.blocks[].questions[].unterbereich`-Werten gebildet. Default-Filter: nur unterbereich-Werte, in denen mind. 1 Frage `sop_trigger=true` ist (Prozess-Subtopics, reduziert Prompt-Laenge bei Templates mit ~50 unterbereich-Werten). Fallback: alle unterbereich-Werte wenn nach Filter kein Subtopic uebrig bleibt. Helper-Funktion `buildSubtopicTree(blocks)` in `src/workers/walkthrough/handle-map-subtopics-job.ts`.
- **Pattern-Reuse FEAT-023 Bridge-Engine**: Bridge-Engine in V4 spawnt **vom Subtopic** ausgehend `capture_session`-Vorschlaege. V5 Option 2 invertiert: **vom walkthrough_step** ausgehend wird der passende Subtopic gemappt.
- **Prompt**: `src/lib/ai/prompts/walkthrough/subtopic_map.ts` — Liste der Schritte + Subtopic-Tree als JSON, Aufgabe: pro Schritt einen Subtopic zuordnen oder "unmapped" markieren mit Confidence-Score 0..1.
- **Output**: N walkthrough_review_mapping-Rows. Wenn Confidence >= `WALKTHROUGH_MAPPING_CONFIDENCE_THRESHOLD` (Default 0.7, ENV-Override DEC-084) UND subtopic_id im Tree liegt: subtopic_id gesetzt. Sonst: subtopic_id=NULL (Unmapped-Bucket). Worker-Validierung: LLM-erfundene subtopic_id-Strings (nicht im Tree) werden auf NULL gekippt — verhindert Halluzinations-Drift.
- **Audit**: confidence_score + mapping_reasoning persistiert pro Mapping.

#### Pipeline-Failure-Handling

- Pro Stufe: try/catch, bei Fehler `setStatus(ws.id, 'failed')` + error_log-Eintrag mit category='walkthrough_pipeline_failure', stage='redact_pii|extract_steps|map_subtopics'.
- Cleanup-Cron `walkthrough-cleanup-daily` (V5-Foundation, erweitert): erkennt `status IN ('redacting','extracting','mapping') AND updated_at < NOW() - INTERVAL '1 hour'` und setzt `failed` (Recovery von Worker-Crash). Pattern aus IMP-156 Stale-Status-Recovery (Business-System).
- Kein automatischer Retry in V5 Option 2 (DEC: Retry kommt in V5.x). Manueller Re-Trigger via Cron-Heuristik oder spaeter via Berater-UI.

### Methodik-Review-UI Architektur (FEAT-040)

#### Routen

| Route | Rollen | Zweck |
|-------|--------|-------|
| `/admin/walkthroughs` | strategaize_admin | Cross-Tenant Pending-Liste (status='pending_review'), oldest-first, mit Subtopic-Mapping-Stats (mapped/unmapped Counts). |
| `/admin/tenants/[id]/walkthroughs` | strategaize_admin + tenant_admin (own tenant) | Per-Tenant Pending-Liste. |
| `/admin/walkthroughs/[id]` | strategaize_admin + tenant_admin (own tenant) | Methodik-Review-Detail: Subtopic-Tree + Unmapped-Bucket + Pflicht-Checkbox + Approve/Reject. |
| `/employee/walkthroughs` | tenant_member, employee | Eigene Walkthroughs (Status sichtbar, kein Mapping-Edit). |
| `/employee/walkthroughs/[id]` | tenant_member, employee | Eigener Walkthrough Status-Polling-Page. |

#### Methodik-Review-View Komponenten

```
/admin/walkthroughs/[id] (page.tsx, Server Component)
  ├─ <WalkthroughHeader walkthroughSession={ws} />              -- Metadaten (Aufnehmer, Dauer, Datum, Status)
  ├─ <SubtopicTreeReview                                        -- Pattern-Reuse FEAT-023 BridgeReviewTree
  │     template={template}
  │     mappings={reviewMappings}
  │     steps={walkthroughSteps}
  │     onMove={moveStepMapping}
  │     onEdit={editStep}
  │     onDelete={softDeleteStep}
  │   />
  ├─ <UnmappedBucket                                            -- Schritte mit subtopic_id=NULL, Select-Move-Aktionen
  │     steps={unmappedSteps}
  │     mappings={unmappedMappings}
  │     subtopicOptions={subtopicTreeFlat}
  │     onMoveTo={moveStepMapping}
  │   />
  ├─ <RawTranscriptToggle                                       -- Optional Audit-Toggle (DEC-088)
  │     walkthroughSessionId={ws.id}
  │     onToggle={logRawTranscriptView}                         -- 1 error_log-Entry pro Toggle-Aktivierung
  │   />
  └─ <ApprovalForm                                              -- Pflicht-Checkbox + Approve/Reject + Note
        onSubmit={approveOrRejectWalkthroughMethodology}
      />
```

#### Move-Pattern (DEC-086 Select-Move)

UI: pro Schritt Button "Verschieben" → Inline-Dropdown mit Subtopic-Liste (flat-tree). Klick = Server Action `moveWalkthroughStepMapping({ stepId, newSubtopicId | null })` → UPDATE walkthrough_review_mapping SET subtopic_id, reviewer_corrected=true, reviewer_user_id, reviewed_at, confidence_band recompute (GENERATED column macht das in DB).

Keine HTML5 Drag-Drop in V5 — niedrigerer JS-Komplexitaets-Footprint, einfacher zu testen, Tastatur-tauglich.

#### Confidence-Anzeige (DEC-087 Ampel)

UI rendert pro Schritt eine farbige Pille:
- gruen (`confidence_band='green'`, score >= 0.85): "hohe Konfidenz"
- gelb (`confidence_band='yellow'`, 0.7 <= score < 0.85): "mittlere Konfidenz"
- rot (`confidence_band='red'`, score < 0.7 oder unmapped): "Unmapped" / "niedrige Konfidenz"

Numerischer Score sichtbar in Tooltip on-hover (debug + audit, kein primaerer UI-Pfad).

#### Pflicht-Checkbox-Gate (Re-Validation DEC-077 → DEC-090)

Approve-Form hat Checkbox: "Ich habe geprueft: keine kundenspezifischen oder sensitiven Inhalte in den extrahierten SOPs sichtbar". Approve-Button bleibt disabled bis Checkbox aktiv.

Server Action `approveOrRejectWalkthroughMethodology({ walkthroughSessionId, decision, privacyCheckboxConfirmed, reviewerNote, rejectionReason })`:
- decision='approved' verlangt privacyCheckboxConfirmed=true (HTTP 422 sonst).
- decision='approved' verlangt walkthroughSession.status='pending_review'.
- UPDATE walkthrough_session SET status='approved', reviewer_user_id, reviewed_at, privacy_checkbox_confirmed=true, reviewer_note.
- decision='rejected': UPDATE walkthrough_session SET status='rejected', reviewer_user_id, reviewed_at, rejection_reason.
- Audit-Log via error_log mit category='walkthrough_methodology_review'.

#### Cockpit-Card "Pending Walkthroughs"

Pattern-Reuse aus V4.1 SLC-042 block_review-Cockpit-Card. Zeigt Anzahl pending_review Walkthroughs pro Tenant + globaler Berater-Cross-Tenant-Sicht. Page-Refresh-only (kein Polling, DEC-060-Konsistenz).

#### Roh-Transkript-Toggle (DEC-088 Audit)

Optional fuer Edge-Cases (Berater zweifelt an Schritt-Extraktion, will Original-Transkript-Snippet sehen):
- Toggle-Click setzt session-state "raw transcript visible" + sendet Server Action `logRawTranscriptView(walkthroughSessionId)` → INSERT error_log (category='walkthrough_raw_transcript_view', user_id, walkthrough_session_id, timestamp).
- **Ein** Audit-Eintrag pro Toggle-Aktivierung, kein per-Snippet-Logging (DEC-088 erklaert: hinreichend fuer "wer hat wann was eingesehen", vermeidet Audit-Log-Spam).
- Kein Toggle "Roh-Video anzeigen" in V5 — Roh-Video bleibt im Storage als Audit, kein UI-Pfad in V5 Option 2.

### RLS-Modell Option 2

#### `walkthrough_step` 4-Rollen-Matrix (3 Policies)

| Rolle | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `strategaize_admin` | alle Tenants | service_role only | alle Tenants | service_role only |
| `tenant_admin` | nur eigener Tenant | service_role only | nur eigener Tenant (Edit + soft-delete via deleted_at) | service_role only |
| `tenant_member` | nur eigene walkthrough_session | service_role only | nein | nein |
| `employee` | nur eigene walkthrough_session | service_role only | nein | nein |

```sql
CREATE POLICY "walkthrough_step_select" ON walkthrough_step
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'strategaize_admin'
    OR (
      auth.user_role() = 'tenant_admin'
      AND tenant_id = auth.user_tenant_id()
    )
    OR EXISTS (
      SELECT 1 FROM walkthrough_session ws
      WHERE ws.id = walkthrough_step.walkthrough_session_id
        AND ws.recorded_by_user_id = auth.uid()
    )
  );

-- INSERT: nur service_role (Worker schreibt). Keine Authenticated-Policy.
-- UPDATE: tenant_admin (eigener Tenant) + strategaize_admin
CREATE POLICY "walkthrough_step_update" ON walkthrough_step
  FOR UPDATE TO authenticated
  USING (
    auth.user_role() = 'strategaize_admin'
    OR (
      auth.user_role() = 'tenant_admin'
      AND tenant_id = auth.user_tenant_id()
    )
  )
  WITH CHECK (
    auth.user_role() = 'strategaize_admin'
    OR (
      auth.user_role() = 'tenant_admin'
      AND tenant_id = auth.user_tenant_id()
    )
  );
```

#### `walkthrough_review_mapping` 4-Rollen-Matrix (3 Policies)

| Rolle | SELECT | INSERT | UPDATE (Move) | DELETE |
|-------|--------|--------|---------------|--------|
| `strategaize_admin` | alle Tenants | service_role only | alle Tenants | service_role only |
| `tenant_admin` | nur eigener Tenant | service_role only | nur eigener Tenant | service_role only |
| `tenant_member` | nur eigene walkthrough_session | service_role only | nein | nein |
| `employee` | nur eigene walkthrough_session | service_role only | nein | nein |

Policy-Struktur identisch zu `walkthrough_step`, nur `tenant_id`-Filter angepasst.

#### Test-Matrix Pflicht (Erweiterung SC-V5-5)

Vitest-Integration-Test gegen Coolify-DB. **Neue 8 Faelle pro Tabelle** = 16 zusaetzliche Faelle:
- 4 Rollen × (SELECT own / SELECT other / UPDATE own / UPDATE other) = 16 Faelle pro Tabelle.
- Plus walkthrough_session bestehende 16 Faelle (V5-Foundation) = **48 RLS-Test-Faelle** insgesamt fuer V5 Option 2.
- SAVEPOINT-Pattern fuer expected Permission-Denials (per `coolify-test-setup.md`).

### Capture-Session-Modus-Registry-Update

Bestehende Annahme V5-Foundation: Walkthrough wird als produktiver `capture_mode='walkthrough'` registriert, `walkthrough_stub` aus UI entfernt. Option 2 unveraendert — der Self-Spawn-Pattern (DEC-080) erzeugt capture_session-Rows mit demselben Mode.

### Migrations-Plan Option 2 — MIG-032 (NEU, geplant)

**MIG-032** buendelt drei additive Migrations zu V5 Option 2 (Detail in MIGRATIONS.md):

- Migration 085 — `085_v5opt2_walkthrough_step.sql`: CREATE TABLE walkthrough_step + Indizes + RLS-Policies (3 Policies, 4-Rollen-Matrix).
- Migration 086 — `086_v5opt2_walkthrough_review_mapping.sql`: CREATE TABLE walkthrough_review_mapping (mit GENERATED confidence_band Column) + Indizes + RLS-Policies.
- Migration 087 — `087_v5opt2_status_and_source_extension.sql`: CHECK-Erweiterung walkthrough_session.status um 'redacting','extracting','mapping' + knowledge_unit.source um 'walkthrough_transcript_redacted'. Beide rein additive Werte, rueckwaerts-kompatibel.

Alle 3 Migrations idempotent (CREATE TABLE IF NOT EXISTS / DROP CONSTRAINT IF EXISTS / CREATE POLICY IF NOT EXISTS).

Apply per `sql-migration-hetzner.md` (base64-Pipe + `psql -U postgres` ueber Coolify-Container `supabase-db-bwkg80w04wgccos48gcws8cs-...`). MIG-032 wird im ersten Option-2-Backend-Slice deployed (final in /slice-planning).

### V5 Option 2 Decisions (Cross-Reference)

V5-Foundation bleibt:
- **DEC-074..078** unveraendert accepted (kein supersede).
- **DEC-077 Privacy-Checkbox** wandert vom Roh-Video-Approve-Pfad zum Methodik-Review-Approve-Pfad — Re-Validation in DEC-090.

V5 Option 2 neu:
- **DEC-080** — Capture-Entry-Point Self-Spawn-Pattern (Q-V5-F kritisch).
- **DEC-081** — Bedrock Sonnet fuer alle 3 AI-Pipeline-Stufen, Haiku-Optimization deferred (Q-V5-G).
- **DEC-082** — PII-Pattern-Library system-wide in `src/lib/ai/pii-patterns/`, kein per-Tenant in V5 (Q-V5-H).
- **DEC-083** — Original + Redacted-Transkript beide als knowledge_unit-Eintrag (Q-V5-I).
- **DEC-084** — Auto-Mapping-Confidence-Schwelle 0.7 als ENV-Default `WALKTHROUGH_MAPPING_CONFIDENCE_THRESHOLD` (Q-V5-J).
- **DEC-085** — Unmapped-Bucket via `walkthrough_review_mapping.subtopic_id IS NULL`, kein separater Tabellen-Bucket (Q-V5-K).
- **DEC-086** — Select-Move-Pattern fuer Mapping-Korrektur, kein Drag-Drop (Q-V5-L).
- **DEC-087** — Confidence-Anzeige als Ampel (gruen/gelb/rot), numerisch nur in Tooltip (Q-V5-M).
- **DEC-088** — Roh-Transkript-Toggle Audit nur Aktivierung loggen, kein per-Snippet (Q-V5-N).
- **DEC-089** — Inherited-DEC-V5OPT2: V5-Scope-Aenderung anchored auf Strategaize-Dev-System DEC-079.
- **DEC-090** — V5 Option 2 produziert approved walkthrough_step standalone, KU-Sichtbarkeit + Handbuch-Integration erst V5.1 (FEAT-038).
- **DEC-091** — DEC-074..078 Re-Validation: alle accepted, DEC-077 Privacy-Checkbox-Pflicht wandert zum Methodik-Review-Approve.

### Bridge-Engine-Pattern-Konsistenz (FEAT-023 Reverse-Direction)

Stufe 3 Auto-Mapping nutzt das **Bridge-Engine-Pattern aus V4 FEAT-023 in Reverse-Direction**:

| Aspekt | FEAT-023 Bridge-Engine (V4) | V5 Option 2 Auto-Mapping (Stufe 3) |
|--------|------------------------------|-------------------------------------|
| Richtung | Subtopic → spawn capture_session-Vorschlag | walkthrough_step → ordne Subtopic zu |
| Input | GF-Blueprint-Output (KUs + Diagnose) + Template | walkthrough_step-Liste + Template-Subtopic-Tree |
| Output | Liste vorgeschlagener Mitarbeiter-Aufgaben | walkthrough_review_mapping (step → subtopic_id mit Confidence) |
| Berater-Gate | Review-UI (FEAT-023 Approve/Reject) | Methodik-Review-UI (FEAT-040 Move + Approve) |
| Bedrock-Adapter | bedrock-client.ts | bedrock-client.ts (gleicher) |
| Cost-Logging | ai_cost_ledger | ai_cost_ledger (gleicher) |

**Kein Code-Drift erlaubt** (Pflicht-Constraint per RPT-170 + Memory-Anker): das Mapping-Worker muss dieselbe Bedrock-Adapter-Aufruf-Konvention, dieselben Audit-Felder, denselben Cost-Logging-Pfad nutzen wie die Bridge-Engine — nur die Prompt-Direction kehrt sich um.

### Security / Privacy Option 2

#### Pre-Approve-Sicht (R-V5-3 Privacy-Leak Mitigation, verstaerkt)

- Roh-WebM ist NUR fuer `recorded_by_user_id` + `tenant_admin` (eigener Tenant) + `strategaize_admin` lesbar (V5-Foundation, unveraendert).
- **Roh-Transkript** (knowledge_unit `source='walkthrough_transcript'`) folgt derselben RLS und ist im Berater-UI nur via expliziten Roh-Transkript-Toggle sichtbar (DEC-088 mit Audit-Log).
- **Redacted-Transkript** (`source='walkthrough_transcript_redacted'`) ist die primaere Berater-Sicht — PII bereits Bedrock-redacted via Pattern-Library.
- **walkthrough_step + walkthrough_review_mapping** sind die **eigentliche Berater-Sicht**: PII-frei, strukturiert, methodisch.
- Kein Public-URL, kein Embed-Code, keine Cross-Tenant-Sichtbarkeit.

#### PII-Pattern-Library (DEC-082)

System-wide constant unter `src/lib/ai/pii-patterns/index.ts`:

```typescript
export const PII_PATTERNS = {
  KUNDENNAME:    { placeholder: '[KUNDE]',  description: '...' },
  EMAIL:         { placeholder: '[EMAIL]',  description: '...' },
  IBAN:          { placeholder: '[IBAN]',   description: '...' },
  TELEFON:       { placeholder: '[TEL]',    description: '...' },
  PREIS_BETRAG:  { placeholder: '[BETRAG]', description: '...' },
  INTERNE_ID:    { placeholder: '[ID]',     description: '...' },
  INTERN_KOMM:   { placeholder: '[INTERN]', description: '...' },
};
```

Pattern werden im Bedrock-Prompt als Beispiel-Liste mitgegeben, plus konservative Guidance "im Zweifel maskieren". Synthetische Test-Suite (90% Recall-Soll, SC-V5-6) lebt unter `src/lib/ai/pii-patterns/__tests__/`.

#### DSGVO-Posture Option 2

- Bedrock-Region `eu-central-1` (Frankfurt) fuer alle 3 AI-Stufen — DSGVO-konform.
- Whisper unveraendert self-hosted (V2-Etabliertes-Pattern).
- PII-Redaction reduziert sensitive Daten **vor** Berater-Sicht — Methodik-Output ist ohne Personenbezug nutzbar.
- Pre-Production-Compliance-Gate (Anwaltspruefung + Azure-EU + ISSUE-042) bleibt aufgeschoben (Memory feedback_compliance_gate_later) — V5 Option 2 bleibt Internal-Test-Mode.

### Constraints und Tradeoffs Option 2

#### Constraint — Sequenzielle Pipeline (3 Failure-Points)

3 Bedrock-Calls pro Walkthrough = 3 potentielle Failure-Points (R-V5-9). Mitigation: Cleanup-Cron mit Stale-Detection (>1h in `redacting/extracting/mapping` → `failed`), error_log pro Stufe, manueller Re-Trigger via Cron-Recovery. **Tradeoff bewusst**: Sequenz ist klarer als Parallelisierung (jeder Schritt baut auf dem Output des vorherigen auf — Stufe 2 braucht redacted-Text aus Stufe 1, Stufe 3 braucht walkthrough_step aus Stufe 2). Parallelisierung ist nicht moeglich.

#### Constraint — Auto-Mapping-Qualitaet (R-V5-7)

Bei unstrukturierten Walkthroughs koennten viele Schritte im Unmapped-Bucket landen. Mitigation: Confidence-Schwelle 0.7 (DEC-084) ist konservativ; Berater-Move-UI als Sicherheitsnetz; Test-Suite mit echten Walkthroughs vor V5-Release; ENV-Override erlaubt Tuning ohne Re-Deploy. **Tradeoff bewusst**: lieber zu viel Unmapped als falsch zugeordnet — Berater korrigiert Unmapped-Bucket schneller als Mis-Mapping erkennen.

#### Constraint — Bedrock-Kosten (R-V5-8)

~$0.045 pro Walkthrough (3 Sonnet-Passes a ~5k Tokens) × 100/Monat = $4.50. **Bagatelle.** Haiku-Optimization (DEC-081) deferred bis Volumen oder Latenz ein realer Faktor wird.

#### Constraint — Kein Re-Processing

V5 Option 2 produziert pro Walkthrough genau einen Pipeline-Run. Re-Processing (z.B. nach PII-Pattern-Update oder Subtopic-Tree-Aenderung) ist V5.x-Scope. **Tradeoff bewusst**: einfache Status-Maschine, keine Versionierung von Schritten/Mappings in V5.

### Open Technical Questions Option 2

Alle 9 Q-V5-F..N sind durch DEC-080..088 geklaert. **Keine offenen technischen Fragen** zur V5-Option-2-Architektur.

### Recommended Implementation Direction

#### Slice-Empfehlung (an /slice-planning V5 Option 2)

PRD-Skizze (RPT-170 Tabelle, 7 Slices) bleibt nach Architektur-Pruefung tragfaehig. Architektur-bedingte Verfeinerung:

| Slice | Scope (architektur-praezisiert) | Geschaetzt |
|-------|----------------------------------|------------|
| SLC-071 (re-validate) | Bestehender Code @ ebb3eaf bleibt verwertbar; **Self-Spawn-Pattern-Routing** (`/employee/walkthroughs` + `startWalkthroughSession` + Redirect) hinzu; AC-10/11/12 Browser-Smoke nachholen. **Slice-Status-Entscheidung in /slice-planning**: als-ist akzeptieren + Routing-Patch in Folge-Slice ODER als Sub-Task in re-scoped SLC-071-Foundation. | ~2-3 MTs (nur Routing-Patch + Smoke) |
| SLC-072 (unveraendert) | Whisper-Worker `walkthrough_transcribe` aus V5-Foundation-Plan. Pipeline-Trigger erweitert: nach erfolgreichem Whisper auto-enqueue Stufe 1 (`walkthrough_redact_pii`). | ~5 MTs |
| SLC-PII | Migration 087 (status+source-Erweiterung) + walkthrough_redact_pii Worker + PII-Pattern-Library + synthetische Test-Suite (≥90% Recall) + KU-Persistierung redacted | ~4-5 MTs |
| SLC-EXT | Migration 085 (walkthrough_step) + walkthrough_extract_steps Worker + Schritt-Extraction-Prompt + walkthrough_step-Persistierung + Test mit ≥5 Test-Walkthroughs | ~4-5 MTs |
| SLC-MAP | Migration 086 (walkthrough_review_mapping) + walkthrough_map_subtopics Worker + Mapping-Prompt + Bridge-Engine-Pattern-Reuse-Test (≥70% Schritte mit Confidence ≥0.7) | ~3-4 MTs |
| SLC-REV | Methodik-Review-UI: 3 Routen + SubtopicTreeReview + UnmappedBucket + Move-Action + Approve-Form mit Pflicht-Checkbox + Cockpit-Card + RawTranscriptToggle mit Audit | ~6-7 MTs |
| SLC-CLN | Capture-Mode-Registry-Update (`walkthrough` produktiv, `walkthrough_stub` aus UI) + 48-Faelle-RLS-Matrix (walkthrough_session 16 + walkthrough_step 16 + walkthrough_review_mapping 16) + Cleanup-Cron erweitert um Stale-Pipeline-Recovery + Lint/Build/Test-Gate | ~4-5 MTs |

**Gesamt:** 7 Slices, ~28-34 MTs, geschaetzt **~5-6.5 Tage Implementation** (entspricht DEC-079-Aufwand).

#### Sequencing

1. **SLC-071-Routing-Patch zuerst** — Self-Spawn-Pattern + Browser-Smoke. Voraussetzung fuer alles weitere (sonst kein Capture-Eintritt fuer Mitarbeiter).
2. **SLC-072 Whisper-Worker** — produziert Pipeline-Input. Voraussetzung fuer SLC-PII.
3. **SLC-PII → SLC-EXT → SLC-MAP** strikt sequentiell — jede Stufe braucht Output der Vorherigen.
4. **SLC-REV** kann parallel zu SLC-MAP laufen, sobald walkthrough_step + walkthrough_review_mapping-Schemas live (also nach SLC-EXT-Migration 085 + SLC-MAP-Migration 086).
5. **SLC-CLN** als Letzter — Registry, Test-Matrix-Vollstaendigkeit, Cleanup-Erweiterung. Vor /final-check.

#### Pflicht-Gates fuer V5 Option 2 Release

- **SC-V5-5 RLS-Matrix gruen** (48 Faelle Vitest gegen Coolify-DB).
- **SC-V5-6 PII-Redaction-Recall ≥90%** auf synthetischer Test-Suite.
- **SC-V5-7 Auto-Mapping ≥70% Schritte** mit Confidence ≥0.7 zugeordnet (Test-Walkthroughs).
- **SC-V5-1 Mitarbeiter-Self-Test**: Nicht-Tech-User-Smoke ueber gesamten Capture+Pipeline-Pfad (Permissions → Recording → Stopp → Upload → Pipeline-Wartezeit → Status pending_review erscheint im Berater-UI).
- **SC-V5-4 Berater-Methodik-Review-Smoke** ueber alle 3 Admin-Routen (cross-tenant, per-tenant, detail) inkl. Move-Between-Subtopics + Approve mit/ohne Checkbox.
- **SC-V5-8 Code-Quality**: 0 Lint-Errors, 0 Lint-Warnings, alle Vitest gruen, `npm audit --omit=dev` = 0 Vulns.

### Naechster Schritt V5 Option 2

`/slice-planning V5 Option 2` — die 7 Slice-Empfehlungen oben in finale Slice-Files zerlegen, MTs nummerieren, slices/INDEX.md updaten, Sequenz-Reihenfolge final festlegen, BL-085+086 + Status setzen. SLC-071-Slice-Closing-Entscheidung: als-ist akzeptieren mit nachgelagerten Routing-Patch als ersten Option-2-Slice ODER neu schneiden.

V5.1 (`/architecture V5.1` offen, `/requirements V5.1` done und auf FEAT-038 geshrinkt) wird **nach** V5-Option-2-Release angegangen — V5.1 nutzt approved walkthrough_step als Input fuer Handbuch-Integration (DEC-090).

---

## V5.1 Architektur — Walkthrough Handbuch-Integration (FEAT-038)

Architecture done 2026-05-08 nach `/architecture V5.1`. V5.1 ist auf FEAT-038 geshrinkt (DEC-079 / DEC-090). V5-Methodik-Schicht (PII + Schritt-Extraktion + Auto-Mapping + Berater-Review) ist live (REL-013, 2026-05-08); V5.1 schliesst den Output-Loop: approved `walkthrough_step` + `walkthrough_review_mapping` fliessen in den Unternehmerhandbuch-Snapshot als neuer Section-Source-Typ `walkthrough` mit inline HTML5-`<video>`-Embed.

### V5.1 Architektur-Summary

V5.1 erweitert die V4-Handbuch-Foundation (FEAT-026 + FEAT-028) um einen neuen Section-Source-Typ. Der bestehende deterministische Snapshot-Worker (`src/workers/handbook/handle-snapshot-job.ts`) bekommt einen zusaetzlichen Loader fuer approved Walkthroughs und einen neuen Renderer-Pfad. Pro approved Walkthrough rendert der Worker Markdown mit Schritt-Liste (gruppiert nach Subtopic-ID aus `walkthrough_review_mapping`) und einem inline `<video src="/api/walkthrough/{sessionId}/embed">`-Tag. Der Embed-Endpoint ist ein Storage-Proxy nach dem ISSUE-025-Resolution-Pattern (Range-faehig fuer Browser-Seek). Der Reader rendert das Video via existing `rehype-raw`-Plugin direkt im Markdown — keine UI-Zusatzkomponente noetig.

### V5.1 Main Components

| Komponente | Pfad | Aenderung |
|---|---|---|
| Snapshot-Worker | `src/workers/handbook/handle-snapshot-job.ts` | +Loader `loadApprovedWalkthroughs(adminClient, tenantId)` + Walkthroughs-Pass-Through an Renderer |
| Schema-Validator | `src/workers/handbook/validate-schema.ts` | +`SectionSourceType = "walkthrough"` (validate `min_status='approved'`, optional `subtopic_keys[]`) |
| Section-Renderer | `src/workers/handbook/sections.ts` | +`renderWalkthroughsSection(section, walkthroughs)` Markdown mit `<video>`+Schritt-Liste pro Subtopic |
| Worker-Types | `src/workers/handbook/types.ts` | +`WalkthroughRow` + Source-Type-Erweiterung |
| Storage-Proxy | `src/app/api/walkthrough/[sessionId]/embed/route.ts` (NEU) | Range-faehiger HTTP-Proxy auf `walkthroughs`-Bucket; RPC-RLS-Check; Audit-Log einmalig pro Reader-Page-Load |
| RPC | `rpc_get_walkthrough_video_path` (NEU, Migration 089) | Tenant+Rolle+Status='approved'-Check; gibt `storage_path` oder `error` zurueck |
| Reader-Stale-Check | `src/lib/handbook/load-snapshot-content.ts` (oder `src/app/dashboard/handbook/[snapshotId]/page.tsx`) | Stale-Signal erweitert: `latest_approved_walkthrough.created_at > snapshot.created_at` triggert Banner |
| Cockpit-Card | existing "Walkthroughs zur Review" (V5 Hotfix) | +Sub-Hint "Snapshot empfehlbar" wenn approved Walkthroughs nach letztem Snapshot |
| Default-Template | `template.handbook_schema` (Migration 089 DML) | Walkthroughs-Section idempotent in Demo-Templates einfuegen (Position nach SOPs) |

### V5.1 Datenmodell — keine neuen Tabellen

V5.1 fuegt **keine neue Tabelle** hinzu. Alle benoetigten Daten existieren bereits aus V5 Option 2:

- `walkthrough_session` (Migration 083) — Status `approved`, `tenant_id`, `recorded_by_user_id`, `created_at`, `duration_ms`
- `walkthrough_step` (Migration 085) — Schritt-Liste mit `step_number`, `action`, `responsible`, `timeframe`, `success_criterion`, `transcript_snippet`
- `walkthrough_review_mapping` (Migration 086) — `subtopic_id` (nullable), `confidence_band`, `reviewer_corrected`
- `walkthroughs` Storage-Bucket (Migration 084) — Roh-Video als `{tenant_id}/{session_id}.webm`

Schema-Erweiterung **JSONB-only** in `template.handbook_schema`:

```json
{
  "sections": [
    {
      "key": "walkthroughs",
      "title": "Walkthroughs",
      "order": 15,
      "sources": [
        { "type": "walkthrough", "filter": { "min_status": "approved" } }
      ],
      "render": { "subsections_by": "subtopic", "intro_template": null }
    }
  ]
}
```

### V5.1 Data Flow

```
GENERATE-PHASE (Worker, on-demand via Berater "Snapshot generieren")
  [tenant_admin/strategaize_admin loest Trigger]
       ↓
  [handle-snapshot-job.ts]
    ├─ loadKnowledgeUnits + loadDiagnoses + loadSops (V4, unveraendert)
    └─ NEU: loadApprovedWalkthroughs(adminClient, tenant_id)
            -> walkthrough_session.status='approved'
            -> JOIN walkthrough_step (deleted_at IS NULL, ORDER BY step_number)
            -> JOIN walkthrough_review_mapping (subtopic_id, confidence_band)
       ↓
  [renderHandbook(schema, kus, diagnoses, sops, walkthroughs)]
    └─ Pro Section mit type='walkthrough':
       renderWalkthroughsSection(section, walkthroughs)
       -> H1 Section-Title + <a id="section-walkthroughs">
       -> Pro approved Walkthrough:
          - H2 "{Recorder-Name} — {Datum} ({Dauer})"
          - <video src="/api/walkthrough/{session_id}/embed" controls preload="metadata">
          - Subtopic-Gruppen via walkthrough_review_mapping.subtopic_id
            -> H3 "{subtopic_id}" (oder "Unzugeordnete Schritte" fuer NULL)
            -> Schritt-Liste mit action/responsible/timeframe/success_criterion
       ↓
  [zip-builder.ts]
    └─ XX_walkthroughs.md neben anderen Section-Files
       ↓
  [handbook Storage-Bucket: {tenant_id}/{snapshot_id}.zip]


READ-PHASE (Reader, GET /dashboard/handbook/[snapshotId])
  [Reader-Page server-side]
    └─ loadSnapshotContent entpackt ZIP -> SectionFile[]
       ↓
  [HandbookReader.tsx Client]
    └─ react-markdown + rehype-raw rendert Markdown inkl. <video>-Tag
       ↓
  [Browser HTML5 Player]
    └─ GET /api/walkthrough/{session_id}/embed (mit Range: bytes=0-)
       ↓
  [Storage-Proxy /api/walkthrough/[sessionId]/embed/route.ts]
    1. createClient() + getUser()  -> 401 wenn unauth
    2. supabase.rpc('rpc_get_walkthrough_video_path', { p_walkthrough_session_id })
       -> tenant_id-Check + role-Check + status='approved'-Check
       -> liefert { storage_path } oder { error: 'forbidden' | 'not_found' | 'not_approved' }
    3. EINMAL pro Reader-Page-Load: captureInfo (audit_log, category='walkthrough_video_embed')
       -> Range-Request-Storm dedupliziert via session-cookie / first-byte-only
    4. adminClient.storage.from('walkthroughs').download(storage_path) -> Blob
    5. Range-Header parsen:
       - Kein Range: 200 OK + Full Body
       - Range: bytes=N-M: 206 Partial Content + slice(N, M+1) + Content-Range
    6. Response Headers:
       - Content-Type: video/webm
       - Accept-Ranges: bytes
       - Cache-Control: private, no-store
```

### V5.1 Range-Request-Pattern (Pflicht)

HTML5 `<video>` startet Wiedergabe mit `Range: bytes=0-` (Initial-Probe), springt dann via Range-Header beim Seeking. Ohne 206-Support laedt der Browser entweder die ganze Datei (~50-100 MB bei 30min Walkthrough) vor erster Frame-Anzeige oder Seek funktioniert garnicht. Implementation:

```typescript
const range = request.headers.get('range');
if (range) {
  const [, start, end] = range.match(/bytes=(\d+)-(\d*)/) ?? [];
  const startByte = Number(start);
  const endByte = end ? Number(end) : arrayBuffer.byteLength - 1;
  const slice = arrayBuffer.slice(startByte, endByte + 1);
  return new NextResponse(slice, {
    status: 206,
    headers: {
      'Content-Type': 'video/webm',
      'Content-Range': `bytes ${startByte}-${endByte}/${arrayBuffer.byteLength}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(slice.byteLength),
      'Cache-Control': 'private, no-store',
    },
  });
}
return new NextResponse(arrayBuffer, { status: 200, headers: { /* ... */ } });
```

**Tradeoff bewusst (V5.1 Internal-Test-Mode):** Storage-Proxy laedt das ganze Blob via `adminClient.storage.download()` und sliced in-memory. Bei 100 MB Video × N Range-Requests pro Session belastet das den App-Container-RAM und den internen Kong-Bandwidth-Pfad. Akzeptabel fuer Internal-Test-Mode (max ~5 gleichzeitige Reader). **Pre-Production-Alternative (deferred):** Range-Header an Storage-Backend durchreichen via Stream/Pipe — komplexer, aber bandwidth-effizient. Wird Re-Eval in V5.2+ falls Reader-Last sichtbar steigt.

### V5.1 External Dependencies — keine neuen

- KEINE neuen npm-Pakete (`react-markdown` + `rehype-raw` aus V4.1 reichen aus; `<video>` rendert direkt durch)
- KEINE neuen Worker-Job-Typen (Snapshot-Generation ist existing `handbook_snapshot_generation` — kein Re-Wiring)
- KEINE neuen Storage-Buckets (`walkthroughs` aus V5 wird wiederverwendet)
- KEINE neuen Bedrock-Calls (Snapshot-Generation ist deterministisch, kostenfrei)

### V5.1 Security / Privacy

- **Storage-Proxy haelt `walkthroughs`-Bucket privat** — kein Public-Read, keine Signed-URLs an Browser ausgeliefert (ISSUE-025-Resolution-Pattern).
- **RPC-basierter RLS-Check** in `rpc_get_walkthrough_video_path` prueft drei Bedingungen vor jedem Embed: (a) `walkthrough_session.tenant_id = current_tenant_via_jwt`, (b) `current_role IN ('tenant_admin','strategaize_admin')`, (c) `walkthrough_session.status = 'approved'`. Der Embed liefert KEIN Roh-Video fuer pending_review, rejected oder failed Sessions.
- **Audit-Log einmalig pro Reader-Page-Load**, nicht pro Range-Request — Range-Storm wuerde sonst hunderte Audit-Eintraege pro Reader-Session erzeugen. Implementierung: Server-side Audit-Insert beim Reader-Page-Load (existing `loadSnapshotContent` als Hook), nicht im Storage-Proxy. Audit-Category `walkthrough_video_embed` analog DEC-088 (`walkthrough_raw_transcript_view`).
- **DSGVO-Posture unveraendert**: Roh-Video bleibt im `walkthroughs`-Bucket, Video-Level-PII-Redaction ist Pre-Production-Compliance-Gate-Pflicht (per `feedback_compliance_gate_later`). V5.1 setzt Internal-Test-Mode fort.
- **Snapshot-Stabilitaet**: Cleanup-Cron (SLC-074) loescht nur `rejected>30d` und `failed>7d`. **Approved Walkthroughs bleiben dauerhaft** — Snapshots referenzieren `walkthrough_session.id` direkt; bei Loeschung waere `<video>`-URL tot. Pre-Existing Cleanup-Logik passt zu V5.1-Snapshot-Anforderung ohne Aenderung.

### V5.1 Constraints und Tradeoffs

- **Globale "Walkthroughs"-Section** statt inline-Verteilung pro Subtopic in bestehende Sections. Begruendung: Inline-Verteilung wuerde Section-Renderer-Drift erzeugen (KU + Diagnose + SOP + Walkthrough mischen pro Subtopic), fragmentiert das Reader-Erlebnis. Globale Section gibt Walkthroughs eine eigene Lese-Stelle. Inline-Verteilung kommt in V5.2+ falls User-Feedback es fordert.
- **Walkthroughs-Section-Position** Default `order=15` (zwischen SOPs und Validation-Layer). Pro Template via `handbook_schema.sections[].order` anpassbar — kein DDL noetig.
- **Manuelles Re-Generation-Trigger** statt Auto-Trigger pro approved Walkthrough. Begruendung: Auto-Trigger wuerde bei vielen Walkthroughs Worker-Storm produzieren; Berater-Trigger ist Quality-Gate-konform (FEAT-029-Pattern).
- **Range-Support Pflicht** im Storage-Proxy — Browser-Seek ohne Range = unbrauchbar bei 30min-Videos.
- **Cross-Snapshot-Suche kostenfrei dazu**: existing client-side Volltext-Suche (V4.3 SLC-054) umfasst Walkthroughs-Markdown automatisch — kein Code-Touch.
- **Stale-Snapshot-Marker erweitert**: existing Pattern (`block_checkpoint.created_at > snapshot.created_at`) wird um `walkthrough_session.status='approved' AND approved_at > snapshot.created_at` erweitert. Reader-Banner zeigt einheitlichen Hinweis "Es gibt neuere Daten — neuen Snapshot generieren".

### V5.1 Open Questions resolved

- **Q-V5.1-A** Section-Position-Default → **DEC-095**: eigene Section "Walkthroughs", Default `order=15`, pro Template via `handbook_schema.sections[].order` anpassbar.
- **Q-V5.1-B** Embed-Player → **DEC-096**: HTML5 native `<video>` + Range-faehiger Storage-Proxy. Kein iframe, kein Signed-URL, kein adaptive Streaming.
- **Q-V5.1-C** Snapshot-Re-Generation-Trigger → **DEC-097**: manuell ueber existing Trigger-Workflow (V4.1 SLC-042-Pattern). Stale-Banner via approved_at vs. snapshot.created_at.

### V5.1 Technische DECs (akkommodiert in `/docs/DECISIONS.md`)

- **DEC-095** Walkthroughs als eigener Section-Source-Typ in `handbook_schema` (nicht inline in andere Sections, nicht eigene Route).
- **DEC-096** HTML5 `<video>` mit Range-faehigem Storage-Proxy (`/api/walkthrough/[sessionId]/embed`) — ISSUE-025-Resolution-Pattern-Reuse, kein iframe, kein Signed-URL, kein HLS.
- **DEC-097** Manuelles Re-Generation-Trigger fuer Walkthrough-Updates (kein Auto-Trigger), Stale-Banner-Logic erweitert.
- **DEC-098** Walkthrough-Embed-Audit nur einmalig pro Reader-Page-Load (server-side bei `loadSnapshotContent`), nicht pro Range-Request — Spam-Prevention.
- **DEC-099** RPC-basierter RLS-Check `rpc_get_walkthrough_video_path` analog `rpc_get_handbook_snapshot_path` — keine direkte Storage-Policy, weil walkthroughs-Bucket per V5-Foundation private bleibt.

### V5.1 Migration-Plan

**MIG-033 (Migration 089) `089_v51_walkthrough_handbook_integration.sql`** (LIVE 2026-05-10):

- DDL: `CREATE OR REPLACE FUNCTION rpc_get_walkthrough_video_path(p_walkthrough_session_id UUID) RETURNS jsonb` — RLS-Check (Tenant + Rolle + Status='approved') + return `storage_path` oder `error`-JSONB
- DML: idempotent `template.handbook_schema` aller Templates **mit `handbook_schema IS NOT NULL`** um Walkthroughs-Section erweitern; Pre-Apply-Backup pflicht; idempotent via `handbook_schema -> 'sections' NOT @> ...`-Check. **Live-Realitaet zum Apply-Zeitpunkt: nur 1 Template (`Exit-Readiness`) hatte ein `handbook_schema`** — Sections 8 → 9. `mitarbeiter_wissenserhebung` hat `handbook_schema IS NULL` und wurde korrekt ausgelassen. V5.1-Doku sprach urspruenglich von "2 produktiven Templates", was die Live-Schema-Realitaet uebersah; siehe RPT-200 fuer Live-Drift-Doku.
- Apply-Pattern: `sql-migration-hetzner.md` (base64-Pipe + `psql -U postgres`)
- Rollback: `DROP FUNCTION IF EXISTS rpc_get_walkthrough_video_path` + DML-Reverse via Pre-Apply-Backup-Restore

### V5.1 Slice-Empfehlung (final in `/slice-planning V5.1`)

**SLC-091 V5.1 Backend (Renderer + Storage-Proxy + RPC + MIG-033)** — ~5-7 MTs, ~1.5 Tage:
- MT-1 `validate-schema.ts` + `types.ts` erweitern um `SectionSourceType="walkthrough"` + `WalkthroughRow`
- MT-2 Loader `loadApprovedWalkthroughs(adminClient, tenantId)` mit JOIN walkthrough_session+step+mapping
- MT-3 Renderer `renderWalkthroughsSection` mit inline `<video>` + Subtopic-gruppierter Schritt-Liste
- MT-4 RPC `rpc_get_walkthrough_video_path` (Migration 089 DDL) + Migration 089 DML idempotent fuer Demo-Templates
- MT-5 Storage-Proxy `/api/walkthrough/[sessionId]/embed/route.ts` mit Range-Support
- MT-6 Vitest fuer Loader, Renderer, Endpoint, RPC (~10 Tests)
- MT-7 Live-Apply Migration 089 + Verifikation

**SLC-092 V5.1 Frontend (Reader-Integration + Stale-Marker + Audit + RLS-Matrix)** — ~3-5 MTs, ~1-1.5 Tage:
- MT-1 React-markdown allowedElements pruefen (`video` zulassen falls disallowedElements aktiv) + CSS fuer `<video>` (`max-w-full`, `rounded`, `shadow`)
- MT-2 Stale-Banner-Logic erweitern um `latest_approved_walkthrough vs. snapshot.created_at`
- MT-3 Audit-Log `walkthrough_video_embed` einmalig pro Reader-Page-Load (in `loadSnapshotContent`)
- MT-4 RLS-Test `walkthrough-embed-rls.test.ts` (4-Rollen-Matrix gegen Coolify-DB, SAVEPOINT-Pattern)
- MT-5 Browser-Smoke (User-Pflicht: Reader oeffnen, Snapshot mit Walkthroughs anzeigen, Video abspielen, Seek testen, Cross-Tenant 404 verifizieren)

**Total V5.1: 2 Slices, ~10-13 MTs, ~3-4 Tage** (konsistent mit RPT-170-Schaetzung).

### V5.1 Sequenz und Pflicht-Gates

1. **SLC-091 zuerst** — Backend-Foundation (Renderer + Endpoint + RPC). Vor SLC-092 abschliessen, weil Frontend Backend testen muss.
2. **SLC-092 danach** — Reader-Integration + RLS-Matrix + Browser-Smoke.

#### Pflicht-Gates fuer V5.1 Release

- **SC-V5.1-1 Snapshot rendert Walkthroughs**: nach Snapshot-Generation enthaelt das ZIP `XX_walkthroughs.md` mit Markdown-Section pro approved Walkthrough.
- **SC-V5.1-2 Embed-Player spielt Video ab + Seek funktioniert**: HTML5 `<video>` laedt via Storage-Proxy, Browser kann seek-en (Range-Requests 206).
- **SC-V5.1-3 Cross-Tenant-Schutz**: tenant_admin von Tenant B bekommt 403/404 fuer `/api/walkthrough/[sessionId]/embed` mit Tenant-A-Session.
- **SC-V5.1-4 Stale-Banner triggert** wenn approved Walkthrough nach letztem Snapshot existiert.
- **RLS-Matrix walkthrough-embed**: 4 Rollen × 3 Status (approved/pending_review/rejected) × 2 Tenant-Konstellationen = 24 Faelle gruen.
- **Browser-Smoke User-Pflicht**: Reader-Page mit echtem Walkthrough-Snapshot — Video abspielen, Seek testen, Stale-Banner verifizieren.

### Naechster Schritt V5.1

`/slice-planning V5.1` — die 2 Slice-Empfehlungen (SLC-091 + SLC-092) in finale Slice-Files zerlegen, MTs final nummerieren, slices/INDEX.md updaten, BL-082 + Migration 089 + Migration-Apply-Slice festlegen, Sequenz-Reihenfolge final festlegen.

V5.1-Pre-Conditions: V5 Option 2 STABLE (Cron-Run-Verifikation 2026-05-09 03:00 ausstehend) + `/post-launch` V5 PASS (~14:00 Europe/Berlin). V5.1-`/slice-planning` kann parallel laufen — V5.1-`/backend SLC-091` startet erst nach V5-STABLE.

## V6 Architektur — Multiplikator-Foundation (Steuerberater-Partner-Erweiterung)

Architecture done 2026-05-11 nach `/architecture V6`. Eingang: RPT-208 Discovery + RPT-209 Requirements + MULTIPLIER_MODEL.md (Konzept entschieden 2026-05-07) + STRATEGY_NOTES_2026-05.md Abschnitt 7 (Architektur-Richtung Option A: Multi-Tenant in Onboarding-Plattform). V6 baut den **Multiplikator-Layer** in die bestehende Plattform: Tenant-Hierarchie mit Partner/Client-Beziehung, neue Rolle `partner_admin`, Co-Branding-Mechanik, Self-Service-Diagnose-Werkzeug mit Auto-Finalize, Lead-Push opt-in an Business-System Lead-Intake.

### V6 Architektur-Summary

V6 ergaenzt die bestehende Onboarding-Plattform um **5 neue Tabellen + 2 Tenant-Spalten + 1 neue RLS-Rolle + 1 neuer Worker-Job-Typ + 1 outbound HTTP-Adapter**. Kein neuer Container, kein neuer Service. Diagnose-Werkzeug ist eine Template-Variante des bestehenden `questionnaire`-Modes (kein neuer Capture-Mode — Discovery-Korrektur gegenueber STRATEGY_NOTES-Skizze, siehe DEC-104). Light-Condensation-Pipeline ist ein Mode-Flag des bestehenden `knowledge_unit_condensation`-Worker-Pfades (kein neuer Job-Typ — DEC-105). Auto-Finalize DGN-A (DEC-100) schreibt KU direkt als `accepted` mit `validation_layer.reviewer_role='system_auto'` und `block_checkpoint.checkpoint_type='auto_final'`. Outbound HTTP-Adapter telefoniert synchron mit dem Business-System Lead-Intake; bei Fail laeuft retry-Job ueber bestehende `ai_jobs`-Queue mit neuem `job_type='lead_push_retry'` (DEC-107). CSS-Custom-Properties (erstmals in der Plattform) werden Server-Side im Root-Layout inline emittiert (kein Client-FOUC, kein Theme-Provider — DEC-106). Pflicht-Footer "Powered by Strategaize" ist hardcoded Server-Component, nicht ueber DB-Config aenderbar (DEC-108). Pen-Test-Suite mit 5-Rollen-Matrix ist Pflicht-Bestandteil von SLC-101 (DEC-110).

Reuse-Quote ~60% — V6 setzt auf bestehende Patterns: Capture-Mode-Architektur (FEAT-025), RLS-Defense-in-Depth + SAVEPOINT-Test-Pattern (V4/V5), next-intl mit DE/EN/NL + lokalisierte Bedrock-Prompts, Tenant-Onboarding-Wizard mit Magic-Link (FEAT-031), Business-System Lead-Intake-API mit First-Touch-Lock+UTM, Privacy-Checkbox-Pattern (DEC-091 V5), RPC-basierte RLS-Auth-Function (DEC-099 V5.1), Audit-Log-Pattern via `error_log` (DEC-088 V5).

### V6 Main Components

| Komponente | Pfad | Aenderung |
|---|---|---|
| Web App `app` | `src/app/admin/partners/*` (NEU) | Strategaize-Admin Partner-Verwaltung: Liste, Anlage, Detail, Mandanten-Querblick |
| Web App `app` | `src/app/partner/dashboard/*` (NEU) | Partner-Admin-Dashboard: Mandanten-Liste, Branding, Einladungs-Mechanik |
| Web App `app` | `src/app/dashboard/diagnose/*` (NEU) | Mandanten-Diagnose-Run + Bericht-Renderer + "Ich will mehr"-Modal |
| Web App `app` | `src/app/layout.tsx` + Branding-Resolver | Server-Side Inline-Style mit `--brand-primary/-accent/-logo-url` (DEC-106), Pflicht-Footer-Komponente |
| Worker | `src/workers/condensation/run.ts` | +Branch `usage_kind='self_service_partner_diagnostic'` → Light-Pipeline (DEC-105): deterministischer Score-Compute → LLM-Verdichtungs-Kommentar → KU mit `status='accepted'` → `validation_layer.reviewer_role='system_auto'` → `block_checkpoint.checkpoint_type='auto_final'` |
| Worker | `src/workers/lead-push/run.ts` (NEU) | Neuer Job-Handler `lead_push_retry` (DEC-107, DEC-112) — exponentielles Backoff 5min/30min, max. 3 Versuche |
| Outbound Adapter | `src/lib/integrations/business-system/lead-intake.ts` (NEU) | Erster outbound HTTP-Call der Plattform; Bearer-Auth via ENV `BUSINESS_SYSTEM_INTAKE_API_KEY`; UTM-Attribution `utm_source=partner_<tenant_id>` |
| Branding-Resolver | `src/lib/branding/resolve.ts` (NEU) | Server-Side Lookup pro Login-Render: `tenant_kind` → eigene/parent_partner/strategaize-default; Output: `{ logoUrl, primaryColor }` |
| RLS-RPC | `rpc_get_branding_for_tenant` (NEU, MIG-034) | SECURITY DEFINER analog `rpc_get_walkthrough_video_path` (DEC-099); resolved Partner-Tenant-Branding ohne RLS-Bypass im App-Code |
| Server Actions | `src/app/admin/partners/actions.ts` (NEU) | `createPartnerOrganization`, `invitePartnerAdmin` |
| Server Actions | `src/app/partner/dashboard/actions.ts` (NEU) | `inviteMandant`, `acceptMandantInvitation`, `revokeMandantInvitation`, `updateBranding`, `uploadLogo` |
| Server Actions | `src/app/dashboard/diagnose/actions.ts` (NEU) | `submitDiagnoseRun`, `requestLeadPush` (DSGVO-Pflicht-Checkbox-Re-Validation, DEC-091-Pattern) |
| Storage-Bucket | `partner-branding-assets` (NEU, MIG-034) | Logo-Upload, signed-URL-Pattern aus FEAT-034; max. 500KB, PNG/SVG/JPG, RLS: nur `partner_admin` darf in eigenen Tenant-Folder |

### V6 Datenmodell — 5 neue Tabellen + 2 Tenant-Spalten

#### Tenant-Schema-Erweiterung (`tenants`)

- `tenant_kind text NOT NULL DEFAULT 'direct_client'` mit CHECK IN `('direct_client', 'partner_organization', 'partner_client')`
- `parent_partner_tenant_id uuid NULL REFERENCES tenants(id) ON DELETE RESTRICT`
- CHECK-Constraint: `parent_partner_tenant_id` nur gesetzt wenn `tenant_kind='partner_client'`, sonst MUSS NULL
- Daten-Migration: alle Bestands-Tenants → `tenant_kind='direct_client'`, `parent_partner_tenant_id=NULL`

#### `partner_organization` (Stammdaten Steuerberater-Kanzlei)

- `id uuid PK`, `tenant_id uuid FK UNIQUE` (1:1 mit Partner-Tenant, ON DELETE CASCADE)
- `legal_name text NOT NULL`, `display_name text NOT NULL`
- `partner_kind text NOT NULL DEFAULT 'tax_advisor'` CHECK IN `('tax_advisor')` — V8 erweiterbar auf `'ma_advisor'` ohne Schema-Migration (DEC-111)
- `tier text NULL` — V3+ Tier-System, V6 immer NULL (DEC-111)
- `contact_email text NOT NULL`, `contact_phone text NULL`
- `country text NOT NULL` CHECK IN `('DE', 'NL')`
- `created_by_admin_user_id uuid FK auth.users(id)`
- `created_at`, `updated_at`

#### `partner_client_mapping` (Sichtbarkeits-Layer)

- `id uuid PK`
- `partner_tenant_id uuid FK tenants(id) ON DELETE CASCADE`
- `client_tenant_id uuid FK tenants(id) ON DELETE CASCADE`
- UNIQUE `(partner_tenant_id, client_tenant_id)` — kein Doppel-Mapping
- `invited_by_user_id uuid FK auth.users(id)`
- `invitation_status text NOT NULL` CHECK IN `('invited', 'accepted', 'revoked')`
- `invited_at`, `accepted_at NULL`, `revoked_at NULL`
- CHECK via Trigger: `partner_tenant_id.tenant_kind='partner_organization'` AND `client_tenant_id.tenant_kind='partner_client'`

#### `partner_branding_config` (Co-Branding)

- `id uuid PK`, `partner_tenant_id uuid FK UNIQUE` (1:1, ON DELETE CASCADE)
- `logo_url text NULL` — Storage-Pfad (signed via Proxy, nicht direct), Bucket `partner-branding-assets`
- `primary_color text NOT NULL DEFAULT '#2563eb'` (Strategaize-Default-Blau), Hex-Format-CHECK
- `secondary_color text NULL` (optional V6, V6.1 falls Pilot-Feedback)
- `display_name text NULL` (optional alternativ zu `partner_organization.display_name`)
- `created_at`, `updated_at`

#### `lead_push_consent` (DSGVO-Audit)

- `id uuid PK`
- `capture_session_id uuid FK capture_session(id) ON DELETE CASCADE`
- `mandant_user_id uuid FK auth.users(id)`, `mandant_tenant_id uuid FK tenants(id)`, `partner_tenant_id uuid FK tenants(id)`
- `consent_given_at timestamptz NOT NULL DEFAULT now()`
- `consent_text_version text NOT NULL` — z.B. `'v1-2026-05'`, Versionierung des angezeigten Einwilligungs-Texts
- `consent_ip inet NULL`, `consent_user_agent text NULL`
- `withdrawal_at timestamptz NULL` — V6 immer NULL, V7+ Rueckruf-Feature

#### `lead_push_audit` (Send-History)

- `id uuid PK`, `consent_id uuid FK lead_push_consent(id) ON DELETE RESTRICT`
- `attempted_at timestamptz NOT NULL DEFAULT now()`
- `attempt_number int NOT NULL DEFAULT 1` (1..3)
- `status text NOT NULL` CHECK IN `('pending', 'success', 'failed')`
- `business_system_response_status int NULL`, `business_system_contact_id uuid NULL`, `business_system_was_new boolean NULL`
- `error_message text NULL`
- `attribution_utm_source text NOT NULL` (z.B. `partner_<tenant_id>`)
- `attribution_utm_campaign text NOT NULL` (z.B. `partner_diagnostic_v1`)
- `attribution_utm_medium text NOT NULL DEFAULT 'referral'`

#### Bestehende Tabellen — CHECK-Constraint-Erweiterungen

- `validation_layer.reviewer_role` CHECK erweitert um `'system_auto'`
- `block_checkpoint.checkpoint_type` CHECK erweitert um `'auto_final'`
- `template.metadata` JSONB — neuer optionaler Schluessel `usage_kind` mit Wert `'self_service_partner_diagnostic'` (Worker-Branch-Trigger fuer DGN-A-Pipeline)
- `capture_session.capture_mode` bleibt unveraendert (Diagnose ist `questionnaire` mit Template-Variante, nicht eigener Mode — DEC-104)
- `knowledge_unit.source` bleibt unveraendert (`questionnaire` ist die Quelle, deterministischer Score landet in `metadata` der KU)
- `ai_jobs.job_type` CHECK erweitert um `'lead_push_retry'`

### V6 Neue RLS-Rolle: `partner_admin`

**Defense-in-Depth-Pattern** wie V4/V5: jede Policy prueft Rolle UND Tenant-Bindung explizit.

| Tabelle | partner_admin SELECT | partner_admin INSERT/UPDATE | partner_admin DELETE |
|---|---|---|---|
| `tenants` (eigener Partner) | `id = auth.user_tenant_id()` | UPDATE `display_name` o.ae. nur eigene Row | nie |
| `tenants` (eigene Mandanten) | `parent_partner_tenant_id = auth.user_tenant_id()` | nie (Anlage via Server Action, RPC) | nie |
| `partner_organization` (eigene) | `tenant_id = auth.user_tenant_id()` | UPDATE eigene Stammdaten | nie |
| `partner_client_mapping` (eigene) | `partner_tenant_id = auth.user_tenant_id()` | INSERT/UPDATE eigene Mappings | nie |
| `partner_branding_config` (eigene) | `partner_tenant_id = auth.user_tenant_id()` | INSERT/UPDATE eigene | nie |
| `capture_session` (Mandanten) | EXISTS `partner_client_mapping` mit `client_tenant_id=capture_session.tenant_id` AND `partner_tenant_id=auth.user_tenant_id()` AND `invitation_status='accepted'` | nie (Mandant erstellt selbst) | nie |
| `knowledge_unit` (Mandanten) | analog via `capture_session.tenant_id` Lookup | nie | nie |
| `block_checkpoint` (Mandanten) | analog | nie | nie |
| `lead_push_consent` (eigene Mandanten) | `partner_tenant_id = auth.user_tenant_id()` | nie (Mandant submittet selbst) | nie |
| `lead_push_audit` (eigene) | via `consent_id → lead_push_consent.partner_tenant_id` | nie | nie |
| `template` | SELECT (system-weit lesbar) | nie | nie |

**Explizit verboten**: `partner_admin` SELECT auf andere Partner-Tenants, deren Mandanten, deren Daten. Cross-Partner-Read-Isolation ist Pflicht-Test-Bestandteil von SLC-101 (DEC-110).

### V6 Pen-Test-Suite-Plan (SLC-101 Pflicht-Bestandteil)

5 Rollen × 7 V6-Tabellen × 4 Operationen (SELECT/INSERT/UPDATE/DELETE) als Matrix-Baseline. Pflicht-Faelle:

| Faelle-Block | Anzahl | Begruendung |
|---|---|---|
| `partner_admin` Cross-Partner-Read-Isolation | 16 | Pro V6-Tabelle: Partner A liest Daten von Partner B → erwarten 0 Rows oder permission denied |
| `partner_admin` Cross-Client-Read-Isolation | 8 | Partner A liest `capture_session/knowledge_unit/block_checkpoint/lead_push_*` von Mandant unter Partner B |
| `partner_admin` INSERT/UPDATE/DELETE-Block | 12 | Schreibversuche auf fremde Daten → permission denied (SAVEPOINT-Pattern fuer expected Rejections) |
| `tenant_admin` (Mandant) Cross-Mandant-Isolation | 8 | Mandant A unter Partner X liest Mandant B unter Partner Y |
| `tenant_admin` (Mandant) Sicht auf Partner-Daten | 4 | Mandant darf NICHT in `partner_organization`/`partner_client_mapping`/`partner_branding_config` schreiben oder INSERTen |
| Regression bestehende V5.1-Matrix | 48 | walkthrough-Faelle bleiben gruen — keine V6-RLS-Drift |
| Regression bestehende V4-Matrix | 46 | Knowledge-Schema bleibt gruen — keine V6-RLS-Drift |
| Regression neue rolle vs bestehende Direkt-Kunden | 4 | Direkt-Kunde sieht weiterhin nur eigene Tenant — `partner_admin` darf NICHT in Direkt-Kunden-Tenants gucken |

**Mindestens 96 V6-spezifische Faelle + 94 Regression = 190 Test-Faelle.** SAVEPOINT-Pattern fuer expected permission-denied Rejections (sql-migration-hetzner.md Rule). Ausfuehrung im `node:20`-Container gegen Coolify-DB (coolify-test-setup.md Rule).

### V6 Data Flow — End-to-End

#### A. Partner-Onboarding-Flow

```
Strategaize-Admin (UI /admin/partners)
  → Server Action createPartnerOrganization()
    → BEGIN TX
       INSERT INTO tenants (tenant_kind='partner_organization', ...)
       INSERT INTO partner_organization (...)
       INSERT INTO partner_branding_config (primary_color='#2563eb', logo_url=NULL)
       error_log INSERT (category='partner_organization_created')
       COMMIT
  → Server Action invitePartnerAdmin(email, partner_tenant_id)
    → Magic-Link generieren (FEAT-031-Pattern)
    → E-Mail an Partner-Owner (next-intl DE-Template)
Partner-Owner klickt Magic-Link
  → /accept-invitation?token=... (FEAT-031-Reuse)
  → INSERT auth.users mit role='partner_admin' + tenant_id=partner_tenant_id
  → Redirect /partner/dashboard
```

#### B. Mandanten-Einladungs-Flow

```
partner_admin (UI /partner/dashboard/clients/new)
  → Server Action inviteMandant(email, company_name, first_name, last_name)
    → BEGIN TX
       INSERT INTO tenants (tenant_kind='partner_client', parent_partner_tenant_id=<partner_tenant_id>, name=company_name)
       INSERT INTO partner_client_mapping (invitation_status='invited', invited_by_user_id=...)
       error_log INSERT (category='partner_mandant_invited')
       COMMIT
    → Magic-Link generieren
    → E-Mail an Mandant (next-intl)
Mandant klickt Link
  → /accept-invitation?token=...
  → INSERT auth.users mit role='tenant_admin' + tenant_id=mandant_tenant_id
  → UPDATE partner_client_mapping SET invitation_status='accepted', accepted_at=now()
  → Redirect /dashboard
Mandant sieht Mandanten-Dashboard unter Partner-Branding (siehe C)
```

#### C. Branding-Resolution beim Mandanten-Login

```
Mandant authentifiziert → Next.js Root-Layout server-side rendert
  → resolveBrandingForUser(user_id, tenant_id) (src/lib/branding/resolve.ts)
    → SELECT rpc_get_branding_for_tenant(<tenant_id>)  // SECURITY DEFINER, kein RLS-Bypass im App-Code
      → IF tenant_kind='partner_client' THEN
          SELECT FROM partner_branding_config WHERE partner_tenant_id = parent_partner_tenant_id
         ELSE IF tenant_kind='partner_organization' THEN
          SELECT FROM partner_branding_config WHERE partner_tenant_id = tenant_id
         ELSE
          RETURN strategaize-default
  → Root-Layout emittiert <style>:root{--brand-primary:...;--brand-accent:...;--brand-logo-url:url(...);}</style>
  → Pflicht-Footer-Komponente rendert "Powered by Strategaize" (hardcoded, nicht ueber Branding-Config aenderbar — DEC-108)
  → Browser zeigt branded UI ohne Client-FOUC
```

#### D. Diagnose-Werkzeug Light-Condensation-Pipeline (Auto-Finalize DGN-A)

```
Mandant /dashboard/diagnose/start
  → Begruessungs-Block (Partner-Branding)
  → Sequenzieller Frage-Flow (15-25 Fragen aus template.blocks)
  → Submit aller Antworten
    → INSERT INTO capture_session (capture_mode='questionnaire', template_id=<partner_diagnostic>)
    → INSERT INTO ai_jobs (job_type='knowledge_unit_condensation', metadata={ usage_kind: 'self_service_partner_diagnostic', session_id })
  → Mandant sieht Lade-Screen mit Progress ("Verdichtung laeuft, ~30 Sekunden")
Worker pickt Job
  → Branch in src/workers/condensation/run.ts erkennt usage_kind='self_service_partner_diagnostic' (DEC-105)
  → Score-Compute deterministisch aus template.blocks[].score_rule (KEIN Bedrock-Call)
  → Bedrock-Call mit Verdichtungs-Prompt (kommentierend, nicht score-generierend) — eu-central-1, Claude Sonnet
  → BEGIN TX
     INSERT INTO knowledge_unit (status='accepted', source='questionnaire', metadata={ score: <num>, comment: <text>, score_rule_version }) per Block
     INSERT INTO validation_layer (reviewer_role='system_auto', action='accept', note='Auto-Finalize per DGN-A')
     INSERT INTO block_checkpoint (checkpoint_type='auto_final')
     UPDATE capture_session SET status='finalized'
     INSERT INTO ai_cost_ledger (tenant_id, tokens_in, tokens_out, usd)
     COMMIT
Mandant Polling-Detection → Redirect /dashboard/diagnose/<session_id>/bericht
Bericht-Renderer (Server-Component):
  - Header: Score-Visual (6 Blocks)
  - Pro Block: deterministischer Score + KI-Kommentar
  - Footer: Pflicht-Output-Aussage aus template.metadata.required_closing_statement
  - Sub-Karte "Ich will mehr von Strategaize" (FEAT-046 Eingang)
```

#### E. Lead-Push opt-in End-to-End

```
Mandant klickt "Ich will mehr" auf Bericht-Page
  → Modal mit Einwilligungs-Text + Pflicht-Checkbox
  → Submit (Server Action requestLeadPush) — Pflicht-Re-Validation (DEC-091-Pattern):
    IF !consent_checkbox THEN return { error: 'privacy_checkbox_required' }
    IF capture_session.tenant_kind != 'partner_client' THEN return error
    IF !capture_session_has_finalized_report THEN return error
  → BEGIN TX
     INSERT INTO lead_push_consent (consent_given_at, consent_text_version, consent_ip, ...)
     INSERT INTO lead_push_audit (status='pending', attempt_number=1, attribution_utm_source=partner_<partner_tenant_id>, attribution_utm_campaign=partner_diagnostic_v1)
     COMMIT
  → Synchroner HTTP-Call lead-intake.ts → Business-System POST /api/leads/intake (Bearer-Auth)
    Payload: { first_name, last_name, email, notes: <kompakter Strukturtext aus Diagnose>, utm_source, utm_campaign, utm_medium='referral' }
    Timeout 10s
  → IF Success (HTTP 2xx):
     UPDATE lead_push_audit SET status='success', business_system_response_status=200, business_system_contact_id=<resp.contact_id>, business_system_was_new=<resp.was_new>
     Confirmation-Block fuer Mandant
  → IF Fail (HTTP != 2xx OR Timeout):
     UPDATE lead_push_audit SET status='failed', error_message=<details>
     INSERT INTO ai_jobs (job_type='lead_push_retry', metadata={ audit_id, attempt: 2 }, scheduled_at=now()+5min)
     Generischer Fehler-Block fuer Mandant ("Wir kuemmern uns")
Worker pickt lead_push_retry Job
  → Erneuter HTTP-Call mit attempt_number=2 (5min nach Fail) bzw. 3 (30min nach 2nd Fail)
  → Max. 3 Versuche, danach finaler error_log-Eintrag mit category='lead_push_failure' → manueller Strategaize-Admin-Eingriff
```

### V6 Constraints und Tradeoffs

- **Diagnose ist Template-Variante, kein neuer Capture-Mode (DEC-104).** Reduziert Bauaufwand erheblich (kein neuer Mode-Pipeline, kein neuer Worker-Job-Typ, kein neues UI-Routing-Pattern). Tradeoff: Light-Pipeline ist Branch innerhalb bestehender Worker-Function, nicht eigenstaendiger Worker — Code-Lokalitaet leidet leicht, dafuer Reuse maximal.
- **Auto-Finalize DGN-A (DEC-100) statt Strategaize-Quick-Review (DGN-B) oder Hybrid (DGN-C).** Skaliert mit Solo-Founder-Kapazitaet ueber V2 hinaus. Quality-Annahme: deterministische Score-Logik aus Template + KI nur kommentierend. **Stop-Gate: Inhalts-Workshop (BL-095) muss Score-Logik liefern, sonst Fallback auf DGN-C.**
- **CSS-Custom-Properties Server-Side Inline-Style (DEC-106) statt Theme-Provider-Component oder dynamischem `<style>`-Tag client-side.** Kein Client-FOUC, keine Hydration-Drift. Tradeoff: Themable nur via Server-Re-Render (kein Live-Switch im Browser ohne Page-Reload — fuer V6-Scope irrelevant, Pilot-Branding aendert sich nicht waehrend einer Mandanten-Session).
- **Outbound HTTP synchron + retry-Job-Fallback (DEC-107) statt async-only mit Webhook-Inbound.** Synchron erlaubt sofort sichtbares Bestaetigungs-Feedback an Mandant bei Success. Bei Fail kein verlorener Klick (Audit-Eintrag bleibt). Tradeoff: Synchroner Call blockt User-Submit fuer max. 10s — akzeptabel bei einmaligem Klick mit Erwartung "Anfrage geht raus".
- **Pflicht-Footer hardcoded Server-Component (DEC-108) statt ueber Branding-Config aenderbar.** Niemand kann den Strategaize-Hinweis entfernen, auch nicht via DB-Manipulation. MULTIPLIER_MODEL Achse 2 T5: Whitelabel ausdruecklich niemals.
- **`partner_kind` Spalte mit CHECK IN `('tax_advisor')` heute, V8 erweiterbar (DEC-111).** Schema-Spalte heute mitanlegen vermeidet V8-Migration. `tier` Spalte analog — V3+ Tier-System.
- **Voll-Restore-Limit fuer V6 (DEC-103).** Bei Mandanten-Datenverlust ist nur globales Coolify-DB-Restore moeglich, kein selektiver Tenant-Restore. Operativ pragmatisch — V6 hat keinen Live-Druck fuer Tenant-Restore-Feature. Slice `Tenant-Restore-Faehigkeit` ist V7+ Backlog.
- **Diary-Mode nach V8 verschoben (DEC-101).** Multiplikator-Foundation hat NL-Investor-Substanz-Prioritaet ueber Diary-Mode (kein Investor-Hebel).
- **NL-Variante in V6.1 (DEC-102) statt V6 oder V7.** Architektonisch quasi kostenlos (next-intl + lokalisierte Bedrock-Prompts existieren), Aufwand ist Inhalt — V6.1 als kurze Polish-Welle nach V6-Release konsistent.

### V6 Open Technical Questions — alle in DECs entschieden

Die 4 Open Questions aus RPT-209 sind in DEC-100..103 entschieden:
- Q-V6-A Auto-Finalize → DEC-100 DGN-A
- Q-V6-B Versions-Re-Numerierung → DEC-101 V6=Multiplikator, V8=Diary
- Q-V6-C NL-Variante → DEC-102 V6.1
- Q-V6-D Tenant-Restore → DEC-103 Voll-Restore-Limit fuer V6, Slice V7+

Keine offenen Architektur-Fragen blockieren `/slice-planning V6`.

### V6 Migration MIG-034

Siehe `/docs/MIGRATIONS.md` MIG-034 fuer SQL-Details. Plan: **3 sequenzielle Migration-Files (090-092)**:

1. **090_v6_partner_tenant_foundation.sql** — `tenants` ALTER (tenant_kind + parent_partner_tenant_id + CHECK), neue Rolle `partner_admin`, `partner_organization`-Tabelle + RLS, `partner_client_mapping`-Tabelle + RLS, RLS-Policy-Updates auf bestehende Tabellen fuer neue Rolle.
2. **091_v6_partner_branding_and_template_metadata.sql** — `partner_branding_config`-Tabelle + RLS, RPC `rpc_get_branding_for_tenant`, `template.metadata.usage_kind` JSONB-Schema-Doku (kein DDL-Aenderung), `validation_layer.reviewer_role` + `block_checkpoint.checkpoint_type` CHECK-Erweiterungen, Storage-Bucket `partner-branding-assets`.
3. **092_v6_lead_push_audit.sql** — `lead_push_consent`-Tabelle + RLS, `lead_push_audit`-Tabelle + RLS, `ai_jobs.job_type` CHECK-Erweiterung um `'lead_push_retry'`.

Apply-Reihenfolge: 090 → 091 → 092 (mit Pre-Apply-Backup vor jedem Step, sql-migration-hetzner.md Rule). 090 ist Pflicht-Foundation; 091 und 092 koennen in Folge-Slices erst applied werden.

### V6 Naechster Schritt

`/slice-planning V6` — die 6 V6-Slice-Themen (FEAT-041..046) in finale Slice-Files SLC-101..106 zerlegen, MTs final nummerieren, slices/INDEX.md updaten. Pflicht-Reihenfolge:

1. **SLC-101** FEAT-041 Foundation + RLS + Pen-Test-Suite (Migration 090) — **Pflicht-Vorgaenger fuer alle anderen**
2. **SLC-102** FEAT-042 Partner-Organisation + Admin-Dashboard
3. **SLC-103** FEAT-043 Partner-Client-Mapping + Mandanten-Einladung
4. **SLC-104** FEAT-044 Partner-Branding + CSS-Custom-Properties (Migration 091)
5. **SLC-105** FEAT-045 Diagnose-Werkzeug + Light-Pipeline + Renderer — **Stop-Gate Inhalts-Workshop (BL-095)**, kann erst nach Score-Logik-Vorgabe starten; andere Slices parallel ungeblockt
6. **SLC-106** FEAT-046 Lead-Push opt-in + outbound Webhook (Migration 092)

V6-Pflicht-Vorbereitung parallel zum Code (KEIN Code-Block): BL-094 AVV-Standard-Template DE+NL, BL-095 Inhalts-Workshop Diagnose-Werkzeug, BL-096 GTM-Akquise-Pitch (Achse 9).

---

## V6.2 Architektur — Compliance-Sprint (Pre-Production-Compliance-Gate)

Status: Architektur entschieden 2026-05-15 (RPT-266). Implementation startet mit /slice-planning V6.2.

### V6.2 Architektur-Summary

V6.2 ist ein **rein code-leichter Compliance-Sprint** ohne neue Backend-Komponenten, ohne neue DB-Tabellen, ohne neue Migrations und ohne neue Worker-Logik. Drei Liefergegenstaende: (1) zwei oeffentliche DE-Pages `/datenschutz` + `/impressum`, (2) zwei Vertragsvorlagen `docs/legal/AVV-DE.md` + `docs/legal/AVV-NL.md`, (3) eine technische Compliance-Dokumentation `docs/COMPLIANCE.md`.

Die einzige nicht-triviale Code-Aenderung ist die Erweiterung des existierenden `StrategaizePoweredFooter` um zwei Next-Link-Verweise. Die Pages selbst sind reine Server-Components, die Markdown-Files aus `src/content/legal/` per `react-markdown` rendern (Pattern-Reuse aus HandbookReader / DEC-049). Impressum-Stammdaten kommen ueber 9 granulare ENV-Variablen (DEC-116) — keine PII im Code-Repo.

V6.2 etabliert KEINE neue Architektur-Schicht. Es macht die bestehende V6+V6.1-Architektur release-fest fuer den ersten echten Live-Pilot-Steuerberater, vorbehaltlich Anwalts-Review-Pass (BL-104 = User-Pflicht).

### V6.2 Main Components

| Component | Status | Aenderung |
|-----------|--------|-----------|
| Next.js App | bestehend | 3 neue Public-Routes (`/datenschutz`, `/impressum`), Footer-Erweiterung |
| Worker | bestehend | unangetastet |
| Supabase DB | bestehend | unangetastet (0 Migrations) |
| Bedrock | bestehend | unangetastet |
| Coolify-Secrets | bestehend | 9 neue ENV-Variablen (Impressum-Stammdaten) |
| `src/content/legal/` | NEU | 1 Markdown-File `datenschutz.de.md` (V6.2-Scope DE) |
| `docs/legal/` | NEU | 2 Markdown-Files `AVV-DE.md` + `AVV-NL.md` |
| `docs/COMPLIANCE.md` | NEU | 8-Sektionen-Doku analog Business-System V5.2 |

### V6.2 Public-Routes

#### `/datenschutz` (Server Component, public, pre-auth)
- Liest `src/content/legal/datenschutz.de.md` zur Build-Zeit (`fs.readFileSync` via `path.join(process.cwd(), ...)`)
- Rendert ueber `react-markdown` mit Plugins `remark-gfm + rehype-slug + rehype-autolink-headings` (DEC-117, Subset des HandbookReader-Stacks)
- Prose-Styling via `prose prose-slate max-w-none` (Tailwind-Typography)
- Default-Locale DE, kein Locale-Prefix in V6.2 (DEC-119). V6.3 verschiebt nach `/[locale]/datenschutz` mit 301-Redirect.

#### `/impressum` (Server Component, public, pre-auth)
- Liest 9 ENV-Variablen (Impressum-Stammdaten, DEC-116):
  - `IMPRESSUM_COMPANY` — "Strategaize Transition BV"
  - `IMPRESSUM_STREET` — Strasse + Hausnummer
  - `IMPRESSUM_ZIP` — Postleitzahl
  - `IMPRESSUM_CITY` — Stadt
  - `IMPRESSUM_COUNTRY` — Default "Niederlande"
  - `IMPRESSUM_KVK` — NL-KvK-Nummer
  - `IMPRESSUM_VAT` — USt-IdNr (VAT)
  - `IMPRESSUM_DIRECTOR` — Vertretungsberechtigter
  - `IMPRESSUM_EMAIL` — Kontakt-E-Mail
- Server-Component wirft `throw new Error()` mit klarem Hinweis wenn Pflicht-ENV fehlt (kein silent default-Wert)
- Setzt die Werte in eine i18n-Template-Struktur (DE), gestyltet ueber `prose prose-slate max-w-none`

#### Footer (`StrategaizePoweredFooter.tsx`, bestehend, erweitert)
- 2 neue Next-Link-Komponenten zu `/datenschutz` und `/impressum`, gerendert links neben dem bestehenden "Powered by Strategaize"-Link
- Layout: `[Datenschutz] · [Impressum] · [Powered by Strategaize ↗]`
- i18n-Keys `footer.privacyPolicy` + `footer.imprint` in `src/messages/de.json` (DE-Only in V6.2)
- Footer-Component bleibt Server-Component (`getTranslations` statt `useTranslations`)
- Sichtbar auf allen Routes (auth + non-auth) ueber bestehende Layout-Einbindung

### V6.2 AVV-Vorlagen (`docs/legal/`)

Reine Markdown-Vertragsvorlagen, NICHT als Code-Route gerendert (DEC-120):

- `docs/legal/AVV-DE.md` — Standard-Auftragsverarbeitungsvertrag nach DSGVO Art. 28 (11 Klausel-Bausteine: Praeambel, Gegenstand, Art+Zweck, Daten-Kategorien, Weisungsrecht, TOMs, Subunternehmer, Unterstuetzungspflichten, Meldepflichten, Audit, Rueckgabe+Loeschung, Haftung+Vertragsdauer, Unterschriftsfelder)
- `docs/legal/AVV-NL.md` — analoge NL-Variante (Verwerkersovereenkomst nach AVG Art. 28)
- Beide Files enthalten Disclaimer "keine Rechtsberatung — Anwalts-Review pending" prominent oben
- Beide Files enthalten Platzhalter `[Verantwortlicher: ...]` und `[Auftragsverarbeiter: ...]` — Anwalts-Review klaert finale Rollen-Zuordnung (Strategaize-Diagnose-Funnel-Direkt-Mandant vs. Partner-Kanzlei-vermittelter-Mandant)
- TOMs/Subunternehmer-Sektion referenziert `docs/COMPLIANCE.md` (FEAT-050) statt Doppelung
- Distribution: manueller Mail/Cloud-Link-Versand durch Strategaize-Inhaberin (kein Admin-UI in V6.2 — DEC-120, V7+ Backlog falls Volume waechst)

### V6.2 Compliance-Dokumentation (`docs/COMPLIANCE.md`)

Strukturierte technische Compliance-Doku analog Business-System V5.2-Pattern. 8 Standardsektionen + 1 V6.2-spezifische DPO-Klausel:

1. **Erhobene personenbezogene Daten** — pro Tenant-Klasse (`direct_client` V1-V4-Pfad, `partner_organization` V6, `partner_client` V6); Cross-Cutting (Auth-User, Walkthrough-Aufzeichnungen, AI-Job-Audit)
2. **Datenfluesse pro Quelle** — Self-Signup (V7+), Magic-Link-Invite (V4.2), Capture-Session-Submit, Walkthrough-Upload-Pipeline (V5), Lead-Push opt-in (V6 FEAT-046), Onboarding-Tenant-Reminder-Cron (V4.2)
3. **Speicherorte + Regionen** — alles EU per `data-residency.md` Rule (Hetzner Frankfurt 159.69.207.29 + AWS Bedrock eu-central-1 + Azure Whisper EU + IONOS SMTP)
4. **Retention-Policies** — Walkthrough 30-Tage-Cleanup-Cron (V5), capture_session tenant-lifecycle, ai_jobs Standard-Retention, lead_push_audit unbegrenzt
5. **Drittanbieter-Liste mit DPA-Status** — AWS, Azure, IONOS, Hetzner, ggf. Cal.com (V4.1)
6. **Auftragsverarbeitungsvertraege (DPA-Status)** — Strategaize↔Drittanbieter (Standard-DPAs), Strategaize↔Partner-Kanzleien (FEAT-049 Template)
7. **Loeschkonzept** — Tenant-Delete-Kaskade ueber FK-CASCADE (`tenants` → `capture_session` → `block_session` etc.), RLS-isoliert, Walkthrough-Storage-Cleanup parallel
8. **Datenschutzkonforme Defaults** — RLS by Default (Defense-in-Depth), keine PII in Logs, SECURITY DEFINER mit explicit search_path (IMP-507), Privacy-Pflicht-Checkbox (DEC-091)
9. **DPO-Bewertung (V6.2-Klausel, DEC-121)** — Strategaize Transition BV bestellt aktuell keinen DPO. Begruendung: keine umfangreiche Verarbeitung i.S.v. Art. 37(1)(b), keine besonderen Kategorien Art. 9, keine systematische Verhaltensbeobachtung. Anwalts-Review prueft Einschaetzung final.

### V6.2 Data Flow — End-to-End

V6.2 hat KEINE neuen Data Flows. Nur Public-Page-Render:

```
Browser → GET /datenschutz
   → Next.js Server-Component liest src/content/legal/datenschutz.de.md (fs.readFileSync zur Build-Zeit)
   → react-markdown rendert mit remark-gfm + rehype-slug + rehype-autolink-headings
   → HTML-Response

Browser → GET /impressum
   → Next.js Server-Component liest 9 ENV-Variablen (IMPRESSUM_*)
   → Werft Error wenn Pflicht-ENV fehlt
   → Rendert i18n-Template-Struktur mit ENV-Werten
   → HTML-Response

Browser → Footer auf jeder Route
   → StrategaizePoweredFooter Server-Component
   → 3 Links: /datenschutz, /impressum, https://strategaize.com (extern)
```

### V6.2 Constraints und Tradeoffs

- **Granulare ENVs statt monolithischer HTML-Block (DEC-116).** 9 ENVs sind mehr Setup-Aufwand als 1 ENV, dafuer ohne Layout-Risiko aenderbar und V6.3-NL-vorbereitet.
- **`react-markdown`-Reuse statt MDX oder statisches JSX (DEC-117).** Pattern-Reuse aus HandbookReader. Anwalts-freundliches Edit-Format.
- **Footer-Minimal-Scope (DEC-118).** Footer bleibt clean, AVV gehoert nicht in den Mandanten-Footer. Cookie-Hinweis wird NICHT gebraucht, weil kein non-essentielles Tracking aktiv.
- **Keine Locale-Prefix-Routen in V6.2 (DEC-119).** Pragmatischer DE-Scope. V6.3-Refactor mit 301-Redirect ist ~30-60 Min, nicht V6.2-blockierend.
- **AVV ohne Admin-UI (DEC-120).** Manueller Versand fuer <5 Partner-Onboardings pragmatisch. V7+ Backlog falls Volume waechst.
- **Keine DPO-Bestellung (DEC-121).** Begruendung klar dokumentiert, Anwalts-Review klaert final.
- **Anwalts-Review als User-Pflicht-Stop-Gate.** V6.2-Release-Marker wird "ready pending legal review". Erster echter Live-Partner blockiert auf Review-Pass.

### V6.2 Open Technical Questions — alle in DECs entschieden

Die 6 Open Questions aus RPT-265 sind in DEC-116..121 entschieden:

- Q1 ENV-Var-Layout fuer Impressum → DEC-116 granular (9 ENVs)
- Q2 Markdown-Render-Pattern → DEC-117 react-markdown-Reuse aus HandbookReader
- Q3 Footer-Link-Scope → DEC-118 nur Datenschutz + Impressum
- Q4 Sprach-Switch-Vorbereitung → DEC-119 ohne Locale-Prefix in V6.2, V6.3-Refactor deferred
- Q5 AVV-Distribution-Mechanik → DEC-120 nur `docs/legal/`, kein Admin-UI in V6.2
- Q6 DPO-Pflicht-Check → DEC-121 keine DPO, Klausel deklariert + Anwalts-Review-Pflicht

Keine offenen Architektur-Fragen blockieren `/slice-planning V6.2`.

### V6.2 Migrations: KEINE

V6.2 hat 0 DB-Migrations. Keine neuen Tabellen, keine RLS-Aenderungen, keine RPC-Aenderungen. Nur Frontend + Doku.

### V6.2 Risks / Open Points

- **User-Lieferung Impressum-Stammdaten verspaetet** — KvK, Adresse, Vertretungsberechtigter fuer Strategaize Transition BV werden vom User waehrend /backend nachgeliefert. Implementation kann mit `.env.example`-Platzhaltern starten; ENVs werden vor /deploy in Coolify-Secrets gesetzt.
- **AVV-Rollen-Zuordnung pending Anwalts-Review** — Strategaize-als-Verantwortlicher vs. Partner-Kanzlei-als-Verantwortlicher ist DSGVO-Art-4-7-Frage. V6.2-Vorlage enthaelt Platzhalter, Anwalts-Review setzt finale Variante.
- **NL-AVV-Anwalts-Verfuegbarkeit** — fuer NL-Pilot Q4 2026 muss ein NL-Datenschutzbeauftragter den NL-AVV reviewen. Falls nicht verfuegbar: NL-Pilot verschiebt sich, DE-Pilot bleibt unbeeinflusst.

### V6.2 Naechster Schritt

`/slice-planning V6.2` — die 3 V6.2-Features (FEAT-048 Pages, FEAT-049 AVV-Templates, FEAT-050 COMPLIANCE.md) in finale Slices zerlegen. Erwartete Slice-Struktur:

1. **SLC-120** FEAT-048 Datenschutz + Impressum Pages DE (Frontend-only, 5-7 MTs: Markdown-File anlegen, Pages-Routes, Footer-Erweiterung, ENV-Setup, i18n-Keys, Build-Smoke)
2. **SLC-121** FEAT-049 AVV-Templates DE + NL (reine Markdown-Files, 2-3 MTs: AVV-DE, AVV-NL, Cross-Link zu COMPLIANCE.md)
3. **SLC-122** FEAT-050 docs/COMPLIANCE.md Onboarding-Plattform (Pattern-Reuse aus BS V5.2, 1-2 MTs: Struktur portieren + Inhalt neu)

Slice-Reihenfolge: SLC-122 (COMPLIANCE.md) zuerst, weil FEAT-049 AVV-Templates auf COMPLIANCE.md-TOMs verweisen. Dann SLC-121 (AVV). SLC-120 (Pages) parallel-faehig zu beiden.

V6.2-Pflicht-Vorbereitung parallel zum Code: BL-104 Anwalts-Review-Vorbereitung (User-Pflicht — Anwalt suchen, Texte versenden, Review einholen). Anwalts-Review erfolgt NACH /deploy V6.2 als "ready pending legal review".

---

## V6.3 — Diagnose-Werkzeug Live-Schaltung (SLC-105 / FEAT-045)

### V6.3 Architecture Summary

V6.3 schaltet das **Strategaize-Diagnose-Werkzeug** als Mandanten-Self-Service-Erlebnis live: 24 Fragen entlang 6 MULTIPLIER_MODEL-Bausteine, deterministischer Score 0-100 pro Baustein, KI-kommentierende Verdichtung pro Block, Pflicht-Output-Aussage. Keine Berater-Review (Auto-Finalize DGN-A, DEC-100). 0 neue Tabellen — Reuse `template` / `capture_session` / `knowledge_unit` / `validation_layer` / `block_checkpoint`. 1 neue Migration (093) mit 2 neuen JSONB-Spalten + idempotentem Template-Seed.

V6.3 ist single-Slice: SLC-105 implementiert Migration + Worker-Branch + Mandanten-Run-Flow + Bericht-Renderer in einem Slice. Stop-Gate BL-095 (Inhalts-Workshop) ist resolved — `docs/DIAGNOSE_WERKZEUG_INHALT.md` liefert 24 Fragen + 3 Antwort-Typen + diskrete Score-Mappings + 18 Stil-Anker-Templates + Pflicht-Output-Aussage.

### V6.3 Main Components

1. **Migration 093** — `template.metadata JSONB` + `knowledge_unit.metadata JSONB` Spalten + idempotenter `partner_diagnostic_v1` Template-Seed (24 Fragen aus `DIAGNOSE_WERKZEUG_INHALT.md`).
2. **Worker-Branch in `knowledge_unit_condensation`-Handler** — `runLightPipeline` (NEU `src/workers/condensation/light-pipeline.ts`) wird dispatched wenn `template.metadata.usage_kind = 'self_service_partner_diagnostic'`. KEIN neuer `job_type`. Re-bestaetigt DEC-105.
3. **Pure-Function `computeBlockScores`** — Deterministische Score-Berechnung pro Block per Lookup auf `score_mapping`-Array, Vitest-tauglich, kein Bedrock-Call.
4. **Bedrock-Verdichtungs-Loop** — Pro Block 1 Bedrock-Sonnet-Call mit Block-Score + Antworten + Stil-Anker-Template als Prompt. Promise.all-Parallelisierung. Output landet in `knowledge_unit.metadata.comment`.
5. **Mandanten-Run-Flow** — `/dashboard/diagnose/start` + `/run/[capture_session_id]` + `/bericht-pending/[id]` + `/bericht/[id]`. Auth-Gate `tenant_admin` + `tenant_kind='partner_client'` (Direkt-Kunden-Hinweis-Page).
6. **Bericht-Renderer** — Server-Component-Familie mit `ScoreVisual` (6 horizontale Tailwind-Bars), `BlockSection` (Title + Score + KI-Kommentar), Pflicht-Output-Aussage-Footer, Partner-Branding-Resolver (FEAT-044 Reuse). Sub-Karte "Ich will mehr" als Stub (echter Lead-Push lebt in SLC-106 V6).

### V6.3 Data Model (no new tables)

#### template — 1 neue Spalte

```sql
ALTER TABLE template ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
```

`template.metadata` haelt:
- `usage_kind: 'self_service_partner_diagnostic'` (DGN-A-Branch-Trigger im Worker)
- `required_closing_statement: text` (Markdown-Footer-Snippet aus Workshop-Output)

Existierende Templates (exit_readiness, demo) erhalten `'{}'` Default und laufen weiter durch Standard-Pipeline.

#### template.blocks JSONB — Schema-Erweiterung pro Question

```json
{
  "key": "ki_reife",
  "title": "Strukturelle KI-Reife",
  "intro": "Dieser Baustein misst, ob Ihre Firma...",
  "order": 1,
  "questions": [
    {
      "key": "ki_reife.q1",
      "text": "Wie viele zentrale Systeme...",
      "question_type": "multiple_choice",
      "scale_direction": "negative",
      "score_mapping": [
        {"label": "Mehr als 10 Systeme...", "score": 0},
        {"label": "6-10 Systeme...", "score": 25},
        {"label": "4-5 zentrale Systeme...", "score": 50},
        {"label": "2-3 zentrale Systeme...", "score": 75},
        {"label": "1 klares Hauptsystem...", "score": 100}
      ]
    }
  ],
  "comment_anchors": {
    "low": "Ihre strukturelle Basis ist aktuell nicht KI-tauglich...",
    "mid": "Es gibt erste Strukturen...",
    "high": "Die Firma hat eine brauchbare strukturelle Grundlage..."
  }
}
```

Drei `question_type`-Werte: `multiple_choice` | `likert_5` | `numeric_bucket`. Kein DB-CHECK-Constraint auf einer JSONB-Property — Forward-Compat fuer kuenftige Frage-Typen (DEC-123). Runtime-Validation in `computeBlockScores` wirft auf unbekanntem `question_type`.

#### knowledge_unit — 1 neue Spalte

```sql
ALTER TABLE knowledge_unit ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
```

`knowledge_unit.metadata` haelt pro Diagnose-Block (DEC-124):
- `score: number` (0-100, deterministisch berechnet)
- `comment: string` (Bedrock-Verdichtungs-Output, 2-3 Saetze)
- `score_rule_version: string` (Template-Version-Identifier `partner_diagnostic_v1`)
- `block_intro: string` (kopiert aus Template fuer Renderer-Stabilitaet)

Standard-Pipeline-KUs (questionnaire/walkthrough/meeting) bekommen `metadata='{}'` Default und sind nicht betroffen.

#### capture_session.answers (existing JSONB)

Antworten landen als Objekt `{ "ki_reife.q1": "<gewaehlte Option (text)>", "ki_reife.q2": "...", ... }`. Pro Question ein Key. `computeBlockScores` matched die Option-Texte gegen `score_mapping[].label` und liefert den Score. **String-Match exakt** — Reihenfolge der Optionen im Schema ist sicher gegen Drift (Workshop-Output ist eingefroren mit Template-Version `v1`).

#### Keine CHECK-Erweiterungen in Migration 093

Migration 091 hat bereits gesetzt:
- `validation_layer.reviewer_role` akzeptiert `'system_auto'` (DGN-A-Audit-Trail)
- `block_checkpoint.checkpoint_type` akzeptiert `'auto_final'` (Auto-Finalize-Marker)

`ai_jobs.job_type` enthaelt schon `'knowledge_unit_condensation'`. Worker-Branch nutzt diesen Wert — kein neuer Job-Typ noetig (DEC-105 / DEC-126).

### V6.3 Data Flow — End-to-End

```
1. Mandant → /dashboard/diagnose/start (Server-Component)
   → Auth-Gate: tenant_admin + tenant_kind='partner_client'
   → falls direct_client: Hinweis-Page "Diagnose nur ueber Partner verfuegbar"
   → Server-Action startDiagnoseRun:
        INSERT capture_session (template_id=partner_diagnostic_v1, status='open',
                                capture_mode='questionnaire', owner_user_id, tenant_id)
   → Redirect /dashboard/diagnose/run/[capture_session_id]

2. Mandant → /run/[id] (Client-Component QuestionFlow)
   → Sequenzieller Frage-Flow ueber 6 Bloecke × 4 Fragen = 24 Fragen
   → Save-Draft (UPDATE capture_session.answers JSONB) optional
   → Submit-Button am Run-Ende → submitDiagnoseRun:
        UPDATE capture_session SET status='submitted', answers=<full JSON>
        INSERT ai_jobs (job_type='knowledge_unit_condensation',
                        payload={ capture_session_id, source_kind: 'diagnose' })
   → Redirect /dashboard/diagnose/[id]/bericht-pending

3. Worker (existing claim-loop, 5s poll)
   → claim job (rpc_claim_next_ai_job_for_type), dispatch via handle-job
   → loadCaptureSession + loadTemplate
   → if template.metadata.usage_kind === 'self_service_partner_diagnostic':
        runLightPipeline()
      else:
        runStandardPipeline()  // proposed→review-loop, unchanged

4. runLightPipeline (NEU src/workers/condensation/light-pipeline.ts)
   a. scores = computeBlockScores(template.blocks, session.answers)
        // Pure Function, deterministisch, Vitest-tauglich
   b. comments = await Promise.all(template.blocks.map(block =>
        bedrock.complete({
          prompt: buildLightPipelinePrompt({ block, answers, score: scores[block.key] }),
          model: 'claude-sonnet-4-6 (eu-central-1)',
          maxTokens: 200
        })
      ))
        // 6 parallele Bedrock-Calls, ~5-10s pro Block, ~15s total
        // Cost-Ledger pro Call (ai_cost_ledger)
   c. BEGIN TRANSACTION:
        FOR EACH block IN template.blocks:
          INSERT block_checkpoint (capture_session_id, block_key, checkpoint_type='auto_final',
                                   content=<answers-snapshot>, content_hash=<sha256>,
                                   created_by=system_user_id)
          INSERT knowledge_unit (capture_session_id, block_checkpoint_id, block_key,
                                 unit_type='finding', source='questionnaire',
                                 title=block.title, body=<comment>, confidence='medium',
                                 status='accepted',
                                 metadata={ score, comment, score_rule_version: 'partner_diagnostic_v1',
                                            block_intro: block.intro })
          INSERT validation_layer (knowledge_unit_id, reviewer_role='system_auto',
                                   action='accept', note='Auto-Finalize per DGN-A')
        UPDATE capture_session SET status='finalized'
      COMMIT
   d. INSERT error_log (category='partner_diagnostic_finalized',
                        metadata={ session_id, block_count: 6,
                                   total_score_avg, duration_ms, cost_usd })

5. Bericht-pending Page polls capture_session.status every 3s
   → status='finalized' → redirect /dashboard/diagnose/[id]/bericht

6. Bericht-Page (Server-Component)
   → Auth-Gate: tenant_member-Selbstzugriff ODER partner_admin via parent_partner_tenant_id
                ODER strategaize_admin
   → SELECT knowledge_unit + validation_layer + block_checkpoint
            WHERE capture_session_id=... ORDER BY block_checkpoint.created_at
   → Branding-Resolver (SLC-104 rpc_get_branding_for_tenant)
   → Render:
        Header: Strategaize-Logo + Partner-DisplayName + Datum + Mandant-Tenant-Name
        ScoreVisual: 6 horizontale Tailwind-Bars (DEC-128), je Block-Score 0-100
        Pro Block: BlockSection (Title + Score-Bar + ku.metadata.comment 2-3 Saetze)
        Footer: required_closing_statement (react-markdown)
        Sub-Karte: "Ich will mehr von Strategaize" als Stub (Coming-Soon-Disabled, SLC-106)
        Print-Button: window.print() mit print-friendly CSS
```

### V6.3 Worker-Branch — Dispatch-Detail

```typescript
// src/workers/condensation/run.ts (vorhandener Eintrag, erweitert)
import { runLightPipeline } from "./light-pipeline";

async function handleKnowledgeUnitCondensation(job: AiJob) {
  const { capture_session_id } = job.payload;
  const session = await loadCaptureSession(capture_session_id);
  const template = await loadTemplate(session.template_id);

  // V6.3 NEU: Worker-Branch ueber template.metadata.usage_kind
  if (template.metadata?.usage_kind === "self_service_partner_diagnostic") {
    await runLightPipeline({ session, template, adminClient, bedrock, costLedger });
    return;
  }

  // Standard-Pipeline unveraendert (proposed → review-loop)
  await runStandardPipeline({ session, template, adminClient, bedrock, costLedger });
}
```

Standard-Pipeline-Regression-Risk: Branch greift NUR wenn das neue Flag im Template gesetzt ist. Bestehende Templates (exit_readiness, demo, walkthrough) haben `metadata='{}'` und laufen unveraendert weiter. Pflicht-Vitest in MT-5 (`run-branch.test.ts`) validiert beide Branches.

### V6.3 Score-Berechnung — Pure-Function-Signatur

```typescript
// src/workers/condensation/light-pipeline.ts
type QuestionType = "multiple_choice" | "likert_5" | "numeric_bucket";

type ScoreMappingEntry = { label: string; score: number };

type TemplateQuestion = {
  key: string;
  text: string;
  question_type: QuestionType;
  scale_direction: "positive" | "negative";
  score_mapping: ScoreMappingEntry[];
};

type TemplateBlock = {
  key: string;
  title: string;
  intro: string;
  order: number;
  questions: TemplateQuestion[];
  comment_anchors: { low: string; mid: string; high: string };
};

export function computeBlockScores(
  blocks: TemplateBlock[],
  answers: Record<string, string>
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const block of blocks) {
    const scores: number[] = [];
    for (const q of block.questions) {
      const answer = answers[q.key];
      if (answer === undefined || answer === null || answer === "") {
        throw new Error(`Missing answer for question ${q.key}`);
      }
      const mapping = q.score_mapping.find((m) => m.label === answer);
      if (!mapping) {
        throw new Error(
          `No score mapping for question ${q.key}, answer="${answer.slice(0, 40)}..."`
        );
      }
      scores.push(mapping.score);
    }
    // Block-Score = Durchschnitt der Fragen-Scores (4 Fragen pro Block)
    result[block.key] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }
  return result;
}
```

Pure Function — keine I/O, keine Side-Effects, keine Zufalls-Werte. 12+ Vitest in MT-3 (`light-pipeline-score.test.ts`).

### V6.3 Bedrock-Prompt-Struktur

```
System: Du bist ein nuechterner Berater, der Diagnose-Antworten zu Strukturreife und KI-Tauglichkeit
        kommentiert. Antworte in 2-3 Saetzen pro Block, deutsch, prosaisch (keine Bullet-Listen,
        keine Empfehlungen, keine Aufzaehlungen). Stil: ehrlich, direkt, nicht beratungs-floskelhaft.

User:   Bewerteter Baustein: {block.title}
        Block-Beschreibung: {block.intro}
        Berechneter Score: {scores[block.key]} (Skala 0-100, 100 = beste Strukturreife)
        Stil-Anker fuer Score-Bereich {low|mid|high}: "{comment_anchor}"

        Antworten des Mandanten:
        - {q1.text}: {answer1}
        - {q2.text}: {answer2}
        - {q3.text}: {answer3}
        - {q4.text}: {answer4}

        Schreibe einen kommentierenden Absatz im Stil des Stil-Ankers, der die konkreten Antworten
        des Mandanten aufgreift. Erwaehne KEINE Score-Zahlen, KEINE konkreten Fragen-Texte.
```

Stil-Anker-Pattern stabilisiert Tonalitaet ueber alle Diagnose-Runs (DEC-128 reconfirms feedback_blueprint_look_feel_mandatory-Geist: Konsistenz vor Improvisation).

### V6.3 Bericht-Renderer — Visual-Variante

V6.3 nutzt **6 horizontale Tailwind-Bars** (DEC-128), NICHT Radar-Chart. Begruendung:

- 0 neue npm-Dependencies (Radar-Chart braucht Chart.js / Recharts → ~50KB bundle-impact)
- Print-friendly (Radar-SVG in `window.print()` zerlaeuft, Tailwind-Bars rendern stabil)
- Linear lesbar (Score 0-100 ist 1D, Radar-Polygon-Form invertiert intuitiv)
- Accessibility: Tailwind-Bars sind Text-decodable (ScreenReader liest `aria-valuenow`)

Optisch Hex-Codes aus Style-Guide V2 (#4454b8 primary), Score-Farben:
- 0-30: red-500 (Strukturluecke)
- 31-55: amber-500 (Teil-Reife)
- 56-100: emerald-500 (Tragbar)

### V6.3 External Dependencies — unveraendert

- AWS Bedrock Claude Sonnet eu-central-1 (existing `src/lib/llm.ts`)
- Supabase Self-hosted Postgres + Storage (existing)
- next-intl (NUR Deutsch in V6.3 — NL kommt mit V6.4+ wenn NL-Pilot aktiviert wird, DEC-102)
- Keine neuen Adapter, keine neuen APIs

### V6.3 Security / Privacy

- **Tenant-Isolation:** Mandant von Partner A sieht NICHT Bericht von Mandant von Partner B (RLS-Matrix aus SLC-101 deckt knowledge_unit + validation_layer + block_checkpoint via tenant_id-Filter). Kein neuer Pen-Test-Fall noetig.
- **Cross-Tenant-Read fuer partner_admin:** existing RLS (parent_partner_tenant_id-Mapping). Bericht-Renderer respektiert.
- **Strategaize-Admin Cross-Tenant:** existing `strategaize_admin`-Role-Policy.
- **Mandanten-Antworten in `capture_session.answers`:** keine zusaetzlichen Pflicht-PII-Felder (Antworten sind Selbsteinschaetzung der eigenen Firma — Verarbeitungszweck = berechtigtes Interesse, DSGVO Art. 6(1)(f)).
- **Bedrock-Region eu-central-1:** unveraendert per data-residency.md (Frankfurt-EU).
- **ai_cost_ledger:** Light-Pipeline-Cost-Audit pro Block (6 Eintraege pro Diagnose). V6-Erfolgsmessung.

### V6.3 Constraints / Tradeoffs

- **0 neue Tabellen** — JSONB-Erweiterung statt dediziertem `block_response`-Schema. Vorteil: keine RLS-Doppelung, keine Index-Migration. Nachteil: Score-Queries gehen ueber JSON-Path-Op (`metadata->>'score'`). Akzeptabel weil Score-Reads pro Bericht 6 Rows max sind.
- **Diskrete Score-Mappings statt Formel-Logik** — Workshop-Output ist fest 5-stufige Optionen pro Frage mit explizitem Score (0/25/50/75/100). Vorteil: deterministisch, lesbar, ohne Floating-Point-Risiko. Nachteil: Mandant kann nicht "irgendwo dazwischen" antworten — bewusst (zwingt zur ehrlichen Selbsteinschaetzung).
- **Bedrock parallel via Promise.all** — Latency-Optimierung von ~60s sequenziell auf ~15s parallel. Risk: Bedrock-Rate-Limit bei 6 parallelen Calls aus einem Job. Mitigation: bestehender `bedrock-client.ts` hat Retry-Backoff; fallback-tauglich.
- **Worker-Branch statt neuer Job-Type** — re-bestaetigt DEC-105. Kein neuer `ai_jobs.job_type`-CHECK-Eintrag. Vorteil: 1 Code-Change-Punkt (Handler), nicht 3 (CHECK + claim-loop + run.ts).
- **6 Tailwind-Bars statt Radar-Chart** — Verzicht auf visuelle Komplexitaet zugunsten Print-Stabilitaet + 0-Dependency.
- **Kein PDF-Export in V6.3** — V6.3 nutzt `window.print()` als Browser-native Variante. Echter PDF-Export ist V6.5+ Backlog falls Mandanten-Feedback es priorisiert.
- **Stub fuer "Ich will mehr"-Sub-Karte** — Echter Lead-Push lebt in SLC-106 V6 (bereits implementiert, MT-12 RPT-252 live verifiziert). V6.3-Bericht zeigt aktive Sub-Karte mit Klick-Handler auf SLC-106-`/api/lead-push`-Endpoint.

### V6.3 Open Technical Questions — alle entschieden

| # | Frage | Entscheidung |
|---|-------|-------------|
| Q1 | `question_type`-Storage: Spalte + CHECK oder JSONB-Property | **JSONB** in `template.blocks[].questions[].question_type`, kein DB-Constraint (DEC-123) |
| Q2 | Score-Storage: dedizierte Spalte `block_response.score` oder JSONB | **JSONB** `knowledge_unit.metadata.score` (DEC-124) |
| Q3 | Score-Function: pure TypeScript oder DB-Function | **Pure TS** `computeBlockScores`, Vitest-tauglich (DEC-125) |
| Q4 | Worker-Branch: neuer Job-Typ oder Branch im Handler | **Branch im `knowledge_unit_condensation`-Handler** (DEC-126, re-bestaetigt DEC-105) |
| Q5 | Migration-Nummer: 093 oder 091c | **093** — sauberer V6.3-Slot, kein 091-Hotfix (DEC-127) |
| Q6 | Bericht-Visual: Radar-Chart oder horizontale Bars | **6 horizontale Tailwind-Bars** (DEC-128) |
| Q7 | `auto_final` + `system_auto` CHECK-Erweiterung | **NICHT NOETIG** — Migration 091 hat beide CHECKs bereits erweitert |
| Q8 | NL-Sprach-Variante in V6.3 | **NICHT IN SCOPE** — V6.4+ wenn NL-Pilot aktiviert (DEC-102 reconfirms) |

### V6.3 Risks

- **R-V63-1 Bedrock-Rate-Limit bei Promise.all** — 6 parallele Sonnet-Calls aus einem Job-Run. Mitigation: bestehender Bedrock-Client retry-Backoff. Worst-Case: Promise.all faellt auf Sequential, Run-Dauer steigt von ~15s auf ~60s. Mandant sieht "Verdichtung laeuft" Lade-Screen — akzeptabel.
- **R-V63-2 Antwort-String-Drift** — `score_mapping[].label`-Match gegen `capture_session.answers[questionKey]` ist exakter String-Vergleich. Wenn UI nicht 1:1 die `label`-Texte aus Template uebergibt, fehlt das Score-Mapping. Mitigation: Question-Flow-UI rendert direkt aus `template.blocks` (kein Re-Wording in Component); MT-3 Vitest erzwingt 1:1-Konsistenz; pre-deploy Smoke-Test mit allen 24 Antworten.
- **R-V63-3 Template-Seed-Drift** — Migration 093 enthaelt 24-Fragen-Seed mit ~5KB JSONB-Payload. Bei spaeterem Workshop-Output-Update (Workshop v2): Template-Seed-Migration 094 erforderlich, Migration 093 NIE editieren post-Apply (Idempotenz-Bruch). Mitigation: `template.version='v1'` markiert Workshop-Output-Version; v2 wuerde `slug='partner_diagnostic'` + `version='v2'` als neue Row anlegen, nicht alte ueberschreiben.
- **R-V63-4 Cost-Spike** — Erwartete Kosten: 6 Bloecke × ~500 input-tokens × $0.003/1k = ~$0.009 pro Diagnose. Bei 50 Diagnosen/Woche = ~$0.45/Woche. Vernachlaessigbar fuer V6.3-Pilot-Phase. Cost-Ledger-Audit in MT-11 verifiziert.
- **R-V63-5 Auto-Finalize-Quality-Risk** — Kein Berater-Loop, KI-Kommentar kann inhaltlich daneben liegen. Mitigation: Stil-Anker-Templates aus Workshop-Output (3 pro Block × 6 Bloecke = 18 Anker) stabilisieren Tonalitaet; deterministischer Score traegt Kern-Aussage, KI kommentiert nur drumherum.

### V6.3 Migrations: Migration 093

**Datei:** `sql/migrations/093_v63_partner_diagnostic_seed.sql`

**Inhalt:**
1. `ALTER TABLE template ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;`
2. `ALTER TABLE knowledge_unit ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;`
3. `INSERT INTO template (slug, version, name, description, blocks, metadata, sop_prompt, owner_fields, diagnosis_schema, diagnosis_prompt) VALUES ('partner_diagnostic', 'v1', 'Strategaize-Diagnose-Werkzeug', '24 Fragen ueber 6 MULTIPLIER_MODEL-Bausteine', '<24-Frage-JSON-Payload aus DIAGNOSE_WERKZEUG_INHALT.md>', '{"usage_kind": "self_service_partner_diagnostic", "required_closing_statement": "<Pflicht-Output-Aussage>"}', NULL, NULL, NULL, NULL) ON CONFLICT (slug, version) DO UPDATE SET blocks=EXCLUDED.blocks, metadata=EXCLUDED.metadata, description=EXCLUDED.description, updated_at=now();`

Idempotenz via `ON CONFLICT (slug, version) DO UPDATE` — Migration 093 darf zweimal angewendet werden ohne Schaden. Existierende Templates (exit_readiness, demo, walkthrough) sind nicht betroffen.

**Apply-Pattern** per `sql-migration-hetzner.md`:
```bash
base64 -w 0 sql/migrations/093_v63_partner_diagnostic_seed.sql
ssh root@159.69.207.29 "echo '<BASE64>' | base64 -d > /tmp/093_v63.sql && \
  docker exec -i <db-container> psql -U postgres -d postgres < /tmp/093_v63.sql"
```

**Pre-Apply-Backup-Pflicht:** `pg_dump --schema-only --table=template --table=knowledge_unit` als Sicherung.

**Verifikation:**
```sql
SELECT column_name FROM information_schema.columns
  WHERE table_name='template' AND column_name='metadata';
-- erwartet: 1 Row

SELECT column_name FROM information_schema.columns
  WHERE table_name='knowledge_unit' AND column_name='metadata';
-- erwartet: 1 Row

SELECT slug, version, metadata->>'usage_kind',
       jsonb_array_length(blocks) AS block_count,
       (SELECT COUNT(*) FROM jsonb_array_elements(blocks) b,
                              jsonb_array_elements(b->'questions') q)
         AS question_count
  FROM template WHERE slug='partner_diagnostic';
-- erwartet: 1 Row, usage_kind='self_service_partner_diagnostic',
--           block_count=6, question_count=24
```

### V6.3 Implementation Direction — naechster Schritt

`/backend SLC-105` mit MT-Reihenfolge aus dem bestehenden Slice-File (MT-1 Migration 093 anlegen → MT-2 Migration LIVE auf Hetzner → MT-3 computeBlockScores + Vitest → MT-4 runLightPipeline + Worker-Tests → MT-5 Worker-Branch + run-branch-Tests). Danach `/frontend SLC-105` (MT-6..MT-8 Run-Flow + Bericht-Renderer). MT-9..MT-12 sind QA + Browser-Smoke.

V6.3-Reihenfolge: SLC-105 ist Single-Slice — kein paralleler V6.3-Slice anderswo. Stop-Gate BL-095 ist resolved, Implementation kann starten.

## V7 Architektur — Mandanten-Self-Signup-Backend (Pull-Model)

V7 ergaenzt die V6-Multiplikator-Foundation um die Backend-Aufnahme-Mechanik fuer das **Pull-Model**: Mandanten signupen sich selbst via partner-spezifische Landing-Page (gehostet im Intelligence-Plattform-Repo `strategaize-intelligence-studio`, ausserhalb dieses Repos). Onboarding-Plattform-V7 liefert nur die Backend-API + Email-Verify-Mechanik + Auto-Tenant-Provisioning. Landing-Page-UI selbst ist Out-of-Scope dieses Repos.

Die zentrale Entscheidung (DEC-129) ist die **Email-Verify-Token-Mechanik via Custom `pending_signup`-Tabelle**: Token-Hash wird vor `auth.users`-Anlage in eigener Tabelle gehalten, echte `auth.users`/`tenant`/`profile`/`partner_client_mapping`-Rows werden erst nach Verify-Klick transaktional provisioniert. Das vermeidet `auth.users`-Polution bei Spam-Wellen und gibt Strategaize volle Kontrolle ueber TTL + Cleanup + DSGVO-Datensparsamkeit.

### V7 Architecture Summary

- **Pull-Model statt V6-Push-Model**: V6 Admin-Invite-Pattern (`POST /api/admin/tenants/[tenantId]/invite`) bleibt aktiv und unveraendert; V7 ergaenzt einen parallelen Public-Pfad fuer Self-Signup ohne Berater-Initiative.
- **Cross-System-Auth via Service-Key**: Intelligence-Plattform-API ruft Onboarding-Plattform `POST /api/public/signup` mit `x-strategaize-service-key`-Header auf. Service-Key-Compare timing-safe (analog DEC-107, Caller-Sinn umgedreht).
- **3 neue Public-Endpoints (anonymer Zugriff)**:
  - `GET  /api/public/partner/:slug`  — Branding-Resolve fuer Landing-Page, KEIN Service-Key, light Rate-Limit 60/h/IP, Cache-Control 60s.
  - `POST /api/public/signup`         — Signup-POST mit Service-Key + 3/h/IP Rate-Limit.
  - `GET  /auth/verify-signup?token=` — Verify-Klick aus Email, Token aus URL, transaktionales Auto-Provisioning.
- **2 neue Migrations**: 097 fuegt `partner_organization.slug UNIQUE` hinzu + Backfill. 098 legt `pending_signup`-Tabelle an + erweitert `partner_client_mapping` um 3 Spalten (`invitation_source`, `dsgvo_consent_text_version`, `dsgvo_consent_accepted_at`).
- **1 neuer Cron-Job**: `pending-signup-cleanup-hourly` (`0 * * * *`) markiert expired Pending-Eintraege und loescht > 7 Tage alte expired-Rows (DSGVO-Datensparsamkeit).
- **0 neue npm-Packages**: rate-limit.ts (V4.2), github-slugger (schon installed fuer Handbook-Anchors), supabase-server-client, IONOS-SMTP-Adapter `src/lib/email.ts` (V4.2 Reminders) — alles Reuse.

### Cross-System-Topologie

```
                 ┌──────────────────────────────────────────┐
                 │ Mandant (Browser)                        │
                 │ Browser-Side, anonym, kein Service-Key   │
                 └──────────────┬───────────────────────────┘
                                │ (1) GET intelligence.strategaize.com/p/<slug>
                                │
                ┌───────────────▼──────────────────────────────────────────┐
                │ Intelligence-Plattform (strategaize-intelligence-studio) │
                │  - Landing-Page-Server-Component                         │
                │  - Server-Side-API `POST /api/landing/signup`            │
                │  - haelt Service-Key in IS-eigener ENV                   │
                └──┬────────────────────────────────────┬──────────────────┘
                   │ (2) GET                            │ (4) POST signup
                   │ /api/public/partner/<slug>         │ + x-strategaize-service-key
                   │ (Browser → onboarding direkt)      │ (Server → onboarding)
                   ▼                                    ▼
                ┌────────────────────────────────────────────────────────────┐
                │ Onboarding-Plattform (strategaize-onboarding-plattform)    │
                │  V7 Public-Endpoints:                                      │
                │  - GET  /api/public/partner/:slug   (FEAT-052)             │
                │  - POST /api/public/signup          (FEAT-051)             │
                │  - GET  /auth/verify-signup?token=  (FEAT-053)             │
                │  V7 Cron:                                                  │
                │  - pending-signup-cleanup-hourly                           │
                │  V7 Tables:                                                │
                │  - pending_signup (NEU, Migration 098)                     │
                │  - partner_organization.slug (NEU, Migration 097)          │
                │  - partner_client_mapping.invitation_source / dsgvo_*      │
                └──┬─────────────────────────────────────────────────────────┘
                   │ (5) SMTP via IONOS DKIM (existing)
                   │ (6) auth.admin.createUser (Supabase GoTrue)
                   ▼
                ┌───────────────────────────────────────┐
                │ Mandant-Inbox + Coolify-Postgres       │
                │  - Verify-Mail mit Klartext-Token-URL  │
                │  - auth.users (erst nach Verify-Klick) │
                └────────────────────────────────────────┘
```

Wichtig: Schritt (2) ist Browser-direkt an Onboarding-Plattform (kein Service-Key noetig, Public-Resolve liefert nur Branding-Daten ohne PII). Schritt (4) ist IS-Server-Side an Onboarding-Plattform (Service-Key in IS-Container-ENV, NIE im Browser exposed).

### V7 Main Components

| # | Component | Layer | Files (geplant) | FEAT |
|---|---|---|---|---|
| 1 | Public-Resolve-Endpoint | API | `src/app/api/public/partner/[slug]/route.ts` | FEAT-052 |
| 2 | Partner-Slug-Helper | Lib | `src/lib/partner/slug.ts`, `src/lib/partner/reserved-slugs.ts` | FEAT-052 |
| 3 | Public-Signup-Endpoint | API | `src/app/api/public/signup/route.ts` | FEAT-051 |
| 4 | Service-Key-Verifier | Lib | `src/lib/auth/service-key.ts` (timing-safe-equal Helper) | FEAT-051 |
| 5 | V7-Rate-Limiter-Instances | Lib | Erweiterung in `src/lib/rate-limit.ts` (zwei neue Pre-configured Limiters: `signupLimiter` 3/h, `partnerResolveLimiter` 60/h) | FEAT-051+052 |
| 6 | Pending-Signup-Storage | DB | Migration 098 + `src/lib/signup/pending-signup-repo.ts` | FEAT-053 |
| 7 | Email-Verify-Endpoint | API/Page | `src/app/auth/verify-signup/page.tsx` (Server-Component) + `src/app/auth/verify-signup/actions.ts` | FEAT-053 |
| 8 | Auto-Provisioning | Lib | `src/lib/signup/auto-provision.ts` (transactional createTenant + createUser + insertProfile + insertMapping) | FEAT-053 |
| 9 | Signup-Verify-Email-Template | Lib | `src/lib/email/templates/signup-verify.ts` (kann auch in `src/lib/email.ts` als render-Helper landen) | FEAT-053 |
| 10 | Pending-Cleanup-Cron | API/Route | `src/app/api/cron/pending-signup-cleanup/route.ts` (Coolify-Scheduled-Task) | FEAT-053 |
| 11 | Public-Signup-Pen-Test | Tests | `__tests__/pen-test/public-signup-pen-test.test.ts` | FEAT-054 |

Alle Komponenten folgen Reuse-Pflicht aus `.claude/rules/strategaize-pattern-reuse.md`: Service-Key-Compare aus DEC-107 portiert, Rate-Limit aus V4.2, Accept-Invitation als Auto-Provisioning-Vorlage, IONOS-SMTP wiederverwendet, V6 Pen-Test-Suite-Architektur als Vorlage.

### V7 Data Model — Migration-Plan

#### Migration 097 — `partner_organization.slug` + Backfill (FEAT-052)

```sql
-- 097_v7_partner_organization_slug.sql
-- Idempotent (mehrfaches Apply ohne Schaden)

BEGIN;

-- 1. Spalte hinzufuegen (nullable initial fuer Backfill)
ALTER TABLE public.partner_organization
  ADD COLUMN IF NOT EXISTS slug text;

-- 2. Backfill via SQL-Function (idempotent)
DO $$
DECLARE
  r record;
  base_slug text;
  candidate text;
  suffix int;
BEGIN
  FOR r IN
    SELECT id, display_name FROM public.partner_organization
    WHERE slug IS NULL
    ORDER BY created_at ASC  -- aelteste zuerst gewinnen ohne Suffix
  LOOP
    -- Naive ASCII-Transliteration via translate + lower + regex-ersatz.
    -- Echte Umlaut-Behandlung (ae/oe/ue/ss) macht der TS-Slug-Generator in
    -- src/lib/partner/slug.ts spaeter beim Neu-Anlegen — Backfill ist
    -- best-effort und Strategaize-Admin kann manuell korrigieren falls
    -- noetig. Reserve-Liste-Check macht Application-Layer.
    base_slug := lower(translate(r.display_name,
      'äöüÄÖÜßéèêàâîïôûñç ',
      'aouAOUseeeaaiiouna-'));
    base_slug := regexp_replace(base_slug, '[^a-z0-9-]+', '-', 'g');
    base_slug := regexp_replace(base_slug, '-+', '-', 'g');
    base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
    base_slug := left(base_slug, 60);

    candidate := base_slug;
    suffix := 2;
    WHILE EXISTS (SELECT 1 FROM public.partner_organization WHERE slug = candidate) LOOP
      candidate := base_slug || '-' || suffix;
      suffix := suffix + 1;
    END LOOP;

    UPDATE public.partner_organization SET slug = candidate WHERE id = r.id;
  END LOOP;
END$$;

-- 3. NOT NULL + UNIQUE-Index nach Backfill
ALTER TABLE public.partner_organization ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS partner_organization_slug_lower_unique
  ON public.partner_organization (lower(slug));

COMMIT;
```

Re-Apply ist No-Op: ADD COLUMN IF NOT EXISTS + WHERE slug IS NULL + CREATE UNIQUE INDEX IF NOT EXISTS.

#### Migration 098 — `pending_signup` + `partner_client_mapping`-Erweiterung (FEAT-053)

```sql
-- 098_v7_pending_signup_and_mapping_source.sql
-- Idempotent

BEGIN;

-- 1. pending_signup-Tabelle anlegen
CREATE TABLE IF NOT EXISTS public.pending_signup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email_lower text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  company_name text NULL,
  dsgvo_consent_text_version text NOT NULL,
  dsgvo_consent_accepted_at timestamptz NOT NULL DEFAULT now(),
  verify_token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  verified_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pending_signup_status_check CHECK (status IN ('pending','verified','expired'))
);

-- 2. UNIQUE: kein doppeltes Pending pro Email+Partner (Re-Signup nach Expiry erlaubt)
CREATE UNIQUE INDEX IF NOT EXISTS pending_signup_partner_email_unique_pending
  ON public.pending_signup (partner_tenant_id, email_lower)
  WHERE status = 'pending';

-- 3. Lookup-Index fuer Verify-Endpoint (Hash + Status)
CREATE INDEX IF NOT EXISTS pending_signup_token_hash_lookup
  ON public.pending_signup (verify_token_hash)
  WHERE status = 'pending';

-- 4. Lookup-Index fuer Cleanup-Cron
CREATE INDEX IF NOT EXISTS pending_signup_expires_status
  ON public.pending_signup (expires_at, status);

-- 5. RLS: Public-Endpoints nutzen Service-Role, daher pending_signup hat KEINE
--    public-Policies. Nur Service-Role darf SELECT/INSERT/UPDATE/DELETE.
ALTER TABLE public.pending_signup ENABLE ROW LEVEL SECURITY;
-- (keine Policies → default deny; service_role bypasses RLS)

-- 6. partner_client_mapping um invitation_source + DSGVO-Consent-Spalten erweitern
ALTER TABLE public.partner_client_mapping
  ADD COLUMN IF NOT EXISTS invitation_source text NOT NULL DEFAULT 'partner_invite',
  ADD COLUMN IF NOT EXISTS dsgvo_consent_text_version text NULL,
  ADD COLUMN IF NOT EXISTS dsgvo_consent_accepted_at timestamptz NULL;

-- 7. CHECK auf invitation_source (additive)
ALTER TABLE public.partner_client_mapping
  DROP CONSTRAINT IF EXISTS partner_client_mapping_invitation_source_check;
ALTER TABLE public.partner_client_mapping
  ADD CONSTRAINT partner_client_mapping_invitation_source_check
    CHECK (invitation_source IN ('partner_invite','self_signup'));

COMMIT;
```

Existierende V6-Mappings bekommen DEFAULT `'partner_invite'` — keine Daten-Migration noetig. Re-Apply ist No-Op via IF NOT EXISTS + DROP CONSTRAINT IF EXISTS pattern.

### V7 Data Flow

#### Signup-Flow (FEAT-051 + FEAT-052 + FEAT-053-Pending-Anlage)

```
1. Mandant oeffnet intelligence.strategaize.com/p/<partner-slug>
                |
                ▼
2. IS-Landing-Page-Server-Component fetcht:
   GET https://onboarding.strategaizetransition.com/api/public/partner/<slug>
                |
                ▼
3. Onboarding-Plattform:
   - partnerResolveLimiter.check(ip) → 60/h-Window
   - SELECT display_name, logo_url, accent_color FROM partner_organization
     WHERE lower(slug) = lower($1)
   - 404 wenn unknown_partner ODER Reserve-Liste-Treffer (admin/api/p/...)
   - 200 mit { display_name, logo_url, accent_color, has_active_diagnostic_template }
                |
                ▼
4. IS rendert Landing-Page mit Co-Branding + Formular.
   Mandant fuellt aus: email, first_name, last_name, [company_name], DSGVO-Consent-Checkbox.
                |
                ▼
5. IS-Server-Side `POST /api/landing/signup`:
   POST https://onboarding.strategaizetransition.com/api/public/signup
   Header: x-strategaize-service-key: <key aus IS-ENV>
   Body:   { partner_slug, email, first_name, last_name, company_name?,
             dsgvo_consent_accepted: true, dsgvo_consent_text_version: "v1-2026-05" }
                |
                ▼
6. Onboarding-Plattform `/api/public/signup`:
   a) timing-safe-equal: x-strategaize-service-key === ENV.PUBLIC_SIGNUP_SERVICE_KEY
      → false: 401 invalid_service_key
   b) signupLimiter.check(ip = x-forwarded-for[0]) → 3/h-Window
      → false: 429 rate_limit_exceeded + Retry-After
   c) zod-Validation Body
      → fail: 422 validation_failed
   d) Email-Domain-Block-Check (ENV.PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS)
      → block: 422 disposable_email_domain
   e) SELECT id, slug FROM partner_organization WHERE lower(slug) = lower(partner_slug)
      → null: 404 unknown_partner
   f) SELECT 1 FROM pending_signup WHERE partner_tenant_id=$1 AND email_lower=$2
                                     AND status='pending' AND expires_at > now()
      → row: 409 email_already_signed_up (strikter 409 per DEC-135)
   g) SELECT 1 FROM partner_client_mapping pcm JOIN profiles p ON ...
        WHERE pcm.partner_tenant_id=$1 AND p.email=$2
      → row: 409 email_already_signed_up
   h) crypto.randomBytes(32).toString('hex') → token (Klartext)
      sha256(token) → token_hash
   i) INSERT INTO pending_signup (...) VALUES (..., token_hash, now() + interval '24 hours', ...)
   j) sendMail({ to: email, from: 'onboarding@strategaize.de',
                 reply_to: partner_contact_email,
                 template: 'signup-verify',
                 data: { partner_display_name, verify_url: https://onboarding...
                         /auth/verify-signup?token=<token>, expires_at } })
   k) INSERT INTO error_log (category='public_signup', level='info',
                              metadata={ partner_slug, email_hash, ip_hash, status=202 })
   l) Response 202 { status: 'pending_email_verify', expires_at: ISO8601 }
                |
                ▼
7. IS antwortet Browser mit Bestaetigungs-Page "Bitte E-Mail-Postfach pruefen".
                |
                ▼
8. Mandant erhaelt Verify-Mail im Postfach.
```

#### Verify-Flow + Auto-Provisioning (FEAT-053-Kern)

```
1. Mandant klickt Verify-Link in Email:
   GET https://onboarding.strategaizetransition.com/auth/verify-signup?token=<token>
                |
                ▼
2. /auth/verify-signup/page.tsx (Server-Component):
   a) sha256(req.query.token) → token_hash
   b) SELECT * FROM pending_signup WHERE verify_token_hash = $1
      → null: 401 invalid_token (Page: "Link ungueltig / abgelaufen")
   c) WHERE status='verified' → Idempotent-Branch: redirect /auth/set-password?session=<onetime>
   d) WHERE status='expired' OR expires_at < now() → 410 (Page: "Bestaetigungslink
      abgelaufen, bitte Signup wiederholen")
   e) WHERE status='pending' AND expires_at >= now():
                |
                ▼
3. auto-provision.ts BEGIN TRANSACTION:
   a) INSERT INTO tenant (kind='partner_client', parent_tenant_id=partner_tenant_id)
      → new_tenant_id
   b) auth.admin.createUser({ email, password: crypto.randomBytes(24), email_confirm: true })
      → new_user_id  (Email-Konflikt cross-Partner → ROLLBACK + 409)
   c) profiles-Row wird automatisch vom handle_new_user-Trigger angelegt
      (id, tenant_id, email, role aus auth.users + user_metadata). first_name/last_name
      leben in auth.users.raw_user_meta_data (in Schritt b via user_metadata uebergeben) —
      siehe ISSUE-051 V7-Sektion. KEIN explizites profile-INSERT.
   d) INSERT INTO partner_client_mapping (
        partner_tenant_id=pending.partner_tenant_id,
        client_tenant_id=new_tenant_id,
        invitation_status='accepted',
        invitation_source='self_signup',
        accepted_at=now(),
        dsgvo_consent_text_version=pending.dsgvo_consent_text_version,
        dsgvo_consent_accepted_at=pending.dsgvo_consent_accepted_at)
   e) UPDATE pending_signup SET status='verified', verified_at=now() WHERE id=pending.id
   f) INSERT INTO error_log (category='public_signup_verify', level='info',
                              metadata={ partner_slug, email_hash, new_tenant_id, status=200 })
   g) COMMIT
                |
                ▼
4. Generate onetime-Login-Session (Magic-Link-Style analog V6 Accept-Invitation):
   auth.admin.generateLink({ type: 'magiclink', email })
   Redirect → /auth/set-password?session=<onetime-token>
                |
                ▼
5. Mandant setzt Passwort, lands auf /dashboard.
6. Mandant kann sofort /dashboard/diagnose/start aufrufen (FEAT-045 V6.3 live).
```

Transactional Properties:
- Race-Condition Doppel-Klick: zweiter parallel-Klick sieht status='verified' nach erstem COMMIT → idempotenter Redirect ohne Re-Provisioning.
- Fail in Schritt 3b (Email-Konflikt): ROLLBACK → pending_signup bleibt `pending` (Re-Try moeglich), Mandant sieht 409 mit Hinweis "Email bereits bei anderem Partner registriert".
- Fail in Schritt 3d (`partner_client_mapping` UNIQUE-Violation): ROLLBACK + 409.
- Fail in Schritt 4 (Magic-Link-Generation): COMMIT trotzdem (Verifikation gilt als erfolgreich), Page zeigt Hinweis "Bitte erneut einloggen via Passwort-Vergessen-Link" — Tenant ist bereits erstellt, Magic-Link kann via `/login` getriggert werden.

### V7 ENV-Variables

| Variable | Wert/Beispiel | Setzung | Zweck |
|---|---|---|---|
| `PUBLIC_SIGNUP_SERVICE_KEY` | `f47ac10b...` (32-byte hex random) | Coolify-ENV beider Repos (Onboarding + IS) | Cross-System-Auth Service-Key-Compare |
| `PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS` | `mailinator.com,guerrillamail.com,tempmail.io` | Coolify-ENV nur Onboarding | Static Wegwerf-Domain-Block-Liste |
| `PUBLIC_APP_URL` | `https://onboarding.strategaizetransition.com` | bereits gesetzt (V6) | Verify-Link-Domain in Signup-Mail (DEC-133) |
| `IONOS_SMTP_*` | bereits gesetzt (V4.2) | bereits gesetzt | Email-Versand `onboarding@strategaize.de` |

Generierung Service-Key (per `feedback_env_value_not_command` — Wert direkt liefern):
- Strategaize-Admin laesst sich pro Environment einmalig einen Random-Key generieren (z.B. `openssl rand -hex 32` lokal) und setzt ihn in BEIDEN Coolify-Resources (Onboarding-Plattform-app + Intelligence-Studio-app).
- Service-Key-Rotation-Policy: alle 6 Monate, koordiniert manuell zwischen beiden Repos (kurzer Zero-Downtime-Window via Dual-Key-Support waere V8+ Erweiterung — V7 akzeptiert kurze Downtime beim Rotate).
- Service-Key NIE im Browser, NIE in NEXT_PUBLIC_*, NIE in client-bundles.

### V7 Cron-Schedule

| Job | Cron | Container | Endpoint | Zweck |
|---|---|---|---|---|
| `pending-signup-cleanup-hourly` | `0 * * * *` | `app` | `GET /api/cron/pending-signup-cleanup` | (1) UPDATE pending_signup SET status='expired' WHERE status='pending' AND expires_at < now(); (2) DELETE FROM pending_signup WHERE status='expired' AND verified_at IS NULL AND created_at < now() - interval '7 days'; |

Setup per `feedback_coolify_cron_node` + `feedback_cron_job_instructions`-Pattern: Coolify-Scheduled-Task im app-Container, Endpoint mit `CRON_SECRET`-Header-Check (existing `verifyCronSecret`-Pattern, DEC-059 Reuse).

### V7 External Dependencies

- **Intelligence-Plattform-Repo** (`strategaize-intelligence-studio`): muss Landing-Page-UI + Server-Side-Caller bauen. V7-Onboarding-Plattform kann unabhaengig deployen — IS-Repo kann nachgelagert bauen, dann ist Self-Signup-Funnel live. User-Koordinations-Punkt.
- **IONOS-SMTP** (existing V4.2): unveraendert, neuer From-Sender `onboarding@strategaize.de` muss im IONOS-Postfach existieren ODER als Alias auf `noreply@strategaize.de` konfiguriert sein. Reply-To wird pro Email-Send dynamisch gesetzt.
- **Coolify-Postgres** (existing): Migration 097 + 098 per `sql-migration-hetzner.md`-Pattern (base64 + psql -U postgres) deployen.
- **Bedrock**: 0 V7-Touch — Signup-Flow nutzt KEIN LLM, Auto-Provisioning ist deterministisch.

### V7 Security / Privacy Considerations

- **DSGVO-Datensparsamkeit**: Audit-Log `error_log` enthaelt NUR `email_hash` (SHA-256) + `ip_hash` (SHA-256), NIE Klartext. Verifiziert via Pen-Test-AC (FEAT-054).
- **Service-Key**: timing-safe-equal via `crypto.timingSafeEqual` (Node-Built-in), kein `===`-Compare. Pflicht-Test mit 1000-Iter-Statistik (FEAT-054 AC).
- **Verify-Token**: Klartext NIE in DB oder Logs. Nur SHA-256-Hash. Klartext-Lifetime: nur in Email-Body + URL-Parameter beim Verify-Klick. Bei Token-Replay (status='verified'): 401 + Audit-Log-Eintrag fuer SOC-Detection.
- **DSGVO-Consent**: Versions-String + Timestamp pro Signup persistiert in `partner_client_mapping.dsgvo_consent_*`. Volle Audit-Tabelle als V8+-Erweiterung. V7-Consent-Versions-String wird Strategaize-zentral definiert (z.B. `v1-2026-05`), Aenderung erfordert neuen Versions-String.
- **Reserve-Slugs**: System-Slugs (`admin`, `api`, `public`, `p`, `partner`, `strategaize`, `auth`) werden in `src/lib/partner/reserved-slugs.ts` hartcoded geblockt. Bei INSERT in `createPartnerOrganization`-Server-Action sowie bei Migration-097-Backfill-Apply (defensives Re-Check).
- **IP-Trust**: `x-forwarded-for[0]` von Coolify-Traefik-Proxy als trusted Header (Single-Hop, kein Multi-Proxy-Setup). DEC-138 dokumentiert diese Entscheidung explizit.
- **Rate-Limit-Reset bei Container-Restart**: In-Memory-Pattern hat als Tradeoff: nach Container-Restart sind alle IP-Windows weg. Akzeptiert fuer V7 Single-Container-Setup. Coolify-Healthcheck-Restart-Frequenz ist niedrig genug, dass Spam-Welle nicht systematisch via Restart-Race umgangen werden kann.

### V7 Constraints and Tradeoffs

- **Single-Container-Constraint fuer In-Memory-Rate-Limit (DEC-132)**: V7 ist 1-Replica-Setup. Multi-Replica wuerde Rate-Limit-Disagreement zwischen Containern erzeugen. DB-Rate-Limit ist V8+-Erweiterung wenn noetig. Falls vor V8 Multi-Replica-Setup gewuenscht: V7 muss vorher auf DB-basierten Limiter umgestellt werden.
- **Internal-Test-Mode bis Pre-Production-Compliance-Gate**: V7 deployed in Internal-Test-Mode (BL-104 Anwalts-Review extern pending). Erster echter Live-Pilot-Partner wartet auf BL-104-PASS. V7-Code-Arbeit bleibt unblockiert.
- **NL-Markt Out-of-Scope**: Email-Templates + Landing-Page-Texte nur deutsch. NL-Variante ist V8+-Erweiterung. Bei NL-Pilot vor V8 muesste V7.1 nachgezogen werden.
- **Kein Captcha**: Akzeptierter Tradeoff (Risk-Register P-2). Trigger-Schwelle fuer V7.1-Captcha-Sprint per DEC-137: > 50 Pending-Signups innerhalb 24h ohne korrespondierende Verify-Klicks → V7.1-Sprint priorisieren.
- **Auto-Accept ohne Partner-Approve-Workflow**: V7 = jeder Mandant der die richtige Slug-Landing-Page kennt + DSGVO-Consent akzeptiert wird auto-provisioniert. V8+ kann optional Partner-Approve-Modus pro Partner-Tier konfigurierbar machen.
- **Service-Key-Rotation kurze Downtime**: V7 hat keinen Dual-Key-Support. Rotation erfordert Strategaize-Admin koordinierten ENV-Update in beiden Repos + Coolify-Redeploy. Erwartete Downtime: ~30s (Coolify-Health-Window). V8+ Dual-Key-Support waere Polish-Erweiterung.

### V7 Open Technical Questions — Resolved

| ID | Question | Decision | DEC |
|---|---|---|---|
| Q-V7-A | Email-Verify-Mechanik | Custom `pending_signup`-Tabelle (Option A) | DEC-129 |
| Q-V7-B | Partner-Slug-Backfill | Auto idempotent in Migration 097 | DEC-130 |
| Q-V7-C | Pending-TTL | 24h + optionale Reminder-Mail nach 4h (V7-Scope) | DEC-131 |
| Q-V7-D | Rate-Limit-Persistenz | In-Memory (Single-Container-Setup) | DEC-132 |
| Q-V7-E | Verify-Link-Domain | Strategaize-zentral (`onboarding.strategaizetransition.com`) | DEC-133 |
| Q-V7-F | Email-Sender | `onboarding@strategaize.de` From + reply-to partner_contact_email | DEC-134 |
| Q-V7-G | Doppel-Signup-Idempotenz | Strikter 409 mit User-friendly Error | DEC-135 |
| (neu) | Service-Key-Rotation-Policy | Alle 6 Monate manuell-koordiniert, Single-Key-Support | DEC-136 |
| (neu) | Captcha-Trigger-Schwelle | > 50 Pending-Signups/24h ohne Verify → V7.1-Sprint | DEC-137 |
| (neu) | IP-Trust-Pfad | `x-forwarded-for[0]` von Coolify-Traefik, Single-Proxy-Hop | DEC-138 |

### V7 Risks (Architecture-Level)

- **R-V7-1**: Spam-Welle ohne Captcha. Mitigation: 24h TTL + Hourly-Cleanup + Domain-Block-Liste + IP-Rate-Limit + DEC-137 Trigger-Schwelle.
- **R-V7-2**: Email-Verify-Mail wird als Spam markiert. Mitigation: IONOS-DKIM (V4.2 verifiziert), erste 20 Signups manuell beobachten, ggf. Email-Provider-Wechsel zu SES/Resend V8+.
- **R-V7-3**: Service-Key-Leakage in IS-Container. Mitigation: timing-safe-equal, Audit-Log aller Calls, 6-Monats-Rotation per DEC-136.
- **R-V7-4**: `auth.users`-Konflikt cross-Partner (gleiche Email bei Partner-A und Partner-B). Mitigation: Transactional ROLLBACK bei Verify, klare 409-Fehlermeldung. V7 erlaubt 1 Email = 1 globaler `auth.users`-Account. V8+ koennte Email-Aliasing per Partner-Tenant erlauben.
- **R-V7-5**: Pending-Signup-Tabelle wachst unkontrolliert wenn Cleanup-Cron failt. Mitigation: Cleanup-Cron-Failure-Alerting via error_log + monitoring, > 30 Tage alte pending-Rows manuell drop-bar via Strategaize-Admin-SQL.

### V7 Test-Strategy (Architecture-Level)

- **Pen-Test-Suite-Erweiterung (FEAT-054)**: 18 neue Test-Cases gegen Coolify-DB via `.claude/rules/coolify-test-setup.md`-Pattern (node:20 + SAVEPOINT bei expected HTTP-Errors).
- **Unit-Vitest pro Endpoint**: Service-Key-Compare-Statistical-Test 1000 Iters, Slug-Generator-Edge-Cases, Rate-Limit-Window-Slide, Token-Hash-Determinism, Pending-Provisioning-Transactional-ROLLBACK-Smoke.
- **Live-Smoke-Check nach Deploy (SC-V7-5+6)**: Cross-System-Smoke mit Test-Service-Key + Pen-Test-Slug + Test-Email → 202 + Verify-Mail-Eingang + Verify-Klick + neue tenant/auth.users/profiles/mapping-Rows + Lead-Push-Smoke mit korrektem `first_name` (SC-V7-4).

### V7 Implementation Direction — naechster Schritt

`/slice-planning V7` mit 5 Slices wie in PRD-Skizze (informativer Schnitt, finaler Schnitt in /slice-planning):

| Slice | Scope | FEAT | ~Aufwand |
|---|---|---|---|
| SLC-131 | Migration 097 + Slug-Generator + reserved-slugs + Public-Resolve-Endpoint | FEAT-052 | ~1d |
| SLC-132 | Migration 098 + Public-Signup-API + Service-Key-Auth + Rate-Limit + Audit-Log | FEAT-051 | ~1.5d |
| SLC-133 | Verify-Endpoint + Auto-Tenant-Provisioning + Email-Template + ISSUE-051 Fix + F-1 Fix | FEAT-053 | ~2d |
| SLC-134 | Pen-Test-Suite-Erweiterung + Coolify-Test-Setup | FEAT-054 | ~1d |
| SLC-135 | TTL-Cleanup-Cron + Final-Hardening + Live-Smoke | FEAT-053 Operational | ~0.5d |

Reihenfolge: SLC-131 BEFORE SLC-132 (Slug-Lookup ist Signup-Pre-Condition), SLC-132 BEFORE SLC-133 (Pending-Anlage erfolgt im Signup-Endpoint), SLC-133 BEFORE SLC-134 (Pen-Test braucht alle 3 Endpoints), SLC-135 nach Pen-Test-PASS.

Geschaetzt ~5 Code-Side-Tage + Pen-Test-Lauf + Live-Smoke + /post-launch. Architecture-Open-Questions Q-V7-A..G alle entschieden (DEC-129..DEC-138).


## V7.1 Architektur — Inline-Text-Override-Foundation + Funnel-Polish + Telemetrie

V7.1 ergaenzt die V7-Self-Signup-Foundation um eine **generische Text-Override-Mechanik** + **Diagnose-Funnel-Telemetrie** + **Bericht-Email-PDF**, ohne neue externe Services oder Container-Topologie-Aenderungen. Die V7.1-Architektur ist **additiv**: alle bestehenden Komponenten bleiben funktional unveraendert, neue Tabellen + Lib-Module + UI-Komponenten kommen dazu.

Die zentrale Entscheidung (DEC-140) ist die **schlanke generische `text_override`-Tabelle mit Scope-Hierarchie (global -> template -> partner)** + **Resolver-Map mit per-Request-Cache** + **EditableText-React-Komponente mit Pencil-Icon-Inline-Edit**. Bewusster Verzicht auf separate Edit-UIs pro Text-Klasse, externes CMS, oder Page-Builder-Komplexitaet — User-Direktive 2026-05-20 "kein riesiges Template-System".

### V7.1 Architecture Summary

- **3 neue Migrations** (101 text_override + text_override_history, 099 template.questions[].helper_text + examples_md JSONB, 100 diagnose_event), alle additiv zu V7-Bestand.
- **1 neue npm-Dependency**: `@react-pdf/renderer` (FEAT-060, PDF-Generierung server-side ohne Headless-Chrome). 0 weitere externe Dependencies.
- **Resolver-Layer**: `src/lib/text-override/resolver.ts` + `<TextOverrideProvider>`-React-Context. Server-Component-Pre-Load aller Overrides bei jeder Page in einer Single-Query, per-Request-Map-Cache, O(1)-Lookup pro EditableText-Render.
- **Edit-UI**: `<EditableText keyPath defaultText scope multiline markdown />`-React-Komponente. Hybrid-Editor (Inline-Textarea bei Default-Text <= 80 chars, Modal bei multiline=true oder Default-Text > 80 chars, DEC-143).
- **Cache-Invalidation**: Manual `revalidatePath()` + `router.refresh()` nach Save-Action, plus 60s-In-Memory-Map-TTL als Fallback (DEC-145). Coolify-Single-Container-Setup macht Cross-Container-Bust nicht noetig.
- **RLS-Pflicht**: strategaize_admin alle Scopes, partner_admin nur own-partner_org, tenant_admin/tenant_member Read-Only (DEC-148).
- **Telemetrie**: Client-Side-Tracker + 8 Event-Types + 5s-Heartbeat + 100%-Sampling V7.1 (DEC-147) + DSGVO-Schwelle 5 Sessions in Aggregations-Sicht.
- **PDF-Engine**: `@react-pdf/renderer` mit eigenem Stil-Pfad (DEC-141), KEIN Browser-HTML-Print-Parity. A4 + 20mm Margins.
- **Cross-Repo-Schema-Sync mit IS V3**: helper_text + examples_md JSONB-Felder identisch in beiden Repos (DEC-142, Spiegel-DEC-073 in IS-Repo).
- **0 neue Container, 0 neue Cron-Jobs**: alle V7.1-Pfade laufen im bestehenden `app`-Container. 30min-Abandoned-Detector ist on-demand-Query in Analytics-Page (Server-Component), kein eigener Cron noetig.

### V7.1 Topologie

```
                  ┌──────────────────────────────────────────────────┐
                  │ Mandant / strategaize_admin / partner_admin      │
                  │ (Browser)                                        │
                  └──────────┬───────────────────────────────────────┘
                             │
                             │ (1) Server-Render einer Diagnose-Page
                             ▼
                  ┌──────────────────────────────────────────────────┐
                  │ Next.js Server-Component                         │
                  │  - <TextOverrideProvider>                        │
                  │  - loadOverrides(partnerOrgId, locale)           │
                  └──────────┬───────────────────────────────────────┘
                             │ (2) Single-Query
                             ▼
                  ┌──────────────────────────────────────────────────┐
                  │ Coolify-Postgres                                 │
                  │  text_override (scope, scope_id, text_key, ...)  │
                  └──────────┬───────────────────────────────────────┘
                             │ (3) Map<text_key, text_value>
                             │     mit Reihenfolge partner > template > global
                             ▼
                  ┌──────────────────────────────────────────────────┐
                  │ React-Tree Render                                │
                  │  <EditableText keyPath="..." defaultText="..." /> │
                  │  - resolveText(map, key, default)                │
                  │  - Pencil-Icon nur fuer Admin-Rollen             │
                  └──────────┬───────────────────────────────────────┘
                             │ (4) Edit-Klick auf Pencil-Icon
                             ▼
                  ┌──────────────────────────────────────────────────┐
                  │ Inline-Textarea (default <= 80 chars)            │
                  │   ODER                                           │
                  │ Modal-Editor (multiline / > 80 chars)            │
                  └──────────┬───────────────────────────────────────┘
                             │ (5) Save → saveTextOverride-Server-Action
                             ▼
                  ┌──────────────────────────────────────────────────┐
                  │ saveTextOverride(scope, scopeId, key, value)     │
                  │  - RLS-Check                                     │
                  │  - UPSERT text_override                          │
                  │  - INSERT text_override_history (audit)          │
                  │  - revalidatePath() + Cache-Bust                 │
                  └──────────────────────────────────────────────────┘

  Telemetrie-Pfad (parallel zu Diagnose-Render):
                  ┌──────────────────────────────────────────────────┐
                  │ Mandant-Browser (Diagnose-Run-Page)              │
                  │  - trackEvent('question_start', ...)             │
                  │  - 5s-Heartbeat 'session_heartbeat'              │
                  │  - beforeunload 'session_paused'                 │
                  └──────────┬───────────────────────────────────────┘
                             │ POST /api/diagnose-event
                             ▼
                  ┌──────────────────────────────────────────────────┐
                  │ diagnose_event INSERT (Coolify-Postgres)         │
                  └──────────────────────────────────────────────────┘

  PDF-Email-Pfad (FEAT-060):
                  Mandant -> Server-Action sendDiagnoseReportByEmail
                          -> @react-pdf/renderer (in-process)
                          -> IONOS-SMTP (existing)
                          -> Mandant-Inbox + Partner-Inbox + optional-3.-Empfaenger
```

### V7.1 Main Components

| # | Component | Layer | Files (geplant) | FEAT |
|---|---|---|---|---|
| 1 | text_override-Tabelle + history | DB | Migration 101 | FEAT-055 |
| 2 | Resolver-Lib | Lib | `src/lib/text-override/resolver.ts` | FEAT-055 |
| 3 | Save/Reset-Server-Actions | Lib | `src/lib/text-override/actions.ts` | FEAT-055 |
| 4 | Admin-Page Override-Liste | UI | `src/app/admin/text-overrides/page.tsx` + `.../[id]/history/page.tsx` | FEAT-055 |
| 5 | TextOverrideProvider Context | UI | `src/components/text-override/Provider.tsx` | FEAT-056 |
| 6 | EditableText-Komponente | UI | `src/components/text-override/EditableText.tsx` | FEAT-056 |
| 7 | Text-Key-Audit-Skript | Tools | `scripts/audit-editable-text-coverage.mjs` | FEAT-056 |
| 8 | Helper-Text-Schema | DB | Migration 099 (Erweiterung template-JSONB) | FEAT-057 |
| 9 | Helper-Text-Initial-Content | DB | Migration 099a (24 Fragen Initial-Texts) | FEAT-057 |
| 10 | Info-Icon + Modal in Diagnose-Run | UI | `src/app/dashboard/diagnose/run/components/HelperTextModal.tsx` | FEAT-057 |
| 11 | Admin-Helper-Edit-Page | UI | `src/app/admin/templates/partner-diagnostic/questions/[questionKey]/helper/page.tsx` | FEAT-057 |
| 12 | diagnose_event-Tabelle | DB | Migration 100 | FEAT-058 |
| 13 | Telemetry-Tracker-Lib | Lib | `src/lib/telemetry/diagnose.ts` (Client-Side) | FEAT-058 |
| 14 | Diagnose-Event-API | API | `src/app/api/diagnose-event/route.ts` | FEAT-058 |
| 15 | Funnel-Analytics-Page | UI | `src/app/admin/diagnose-funnel-analytics/page.tsx` + `.../actions.ts` | FEAT-058 |
| 16 | Style Guide V2 Polish | UI | `src/app/dashboard/diagnose/start/page.tsx` + `.../run/page.tsx` + `.../bericht/page.tsx` (Refactor) | FEAT-059 |
| 17 | QuickActionRing-Komponente | UI | `src/app/dashboard/diagnose/bericht/components/QuickActionRing.tsx` | FEAT-059 |
| 18 | PDF-Generator | Lib | `src/lib/pdf/diagnose-report.tsx` (@react-pdf/renderer) | FEAT-060 |
| 19 | Send-Report-Email-Action | Lib | `src/app/dashboard/diagnose/bericht/actions.ts` (Erweiterung) | FEAT-060 |
| 20 | Send-Report-Email-Modal | UI | `src/app/dashboard/diagnose/bericht/components/SendReportByEmailModal.tsx` | FEAT-060 |
| 21 | LegalPageHeader-Komponente | UI | `src/components/legal/LegalPageHeader.tsx` | FEAT-061 |
| 22 | Edit-Endpoint-Pen-Test | Tests | `__tests__/pen-test/text-override-pen-test.test.ts` | FEAT-055 |

Alle Komponenten folgen Reuse-Pflicht aus `.claude/rules/strategaize-pattern-reuse.md`: RLS-Pattern aus V6 Migration 090, error_log-Audit-Pattern aus V6, Server-Action-Pattern aus V6.3 Diagnose-Werkzeug, IONOS-SMTP aus V4.2 Reminders, rate-limit.ts aus V4.2, remark@15+remark-html@16-Pipeline aus IS-SLC-201 (siehe `feedback_email_render_remark_pattern.md`).

### V7.1 Data Model

**Migration 101 — `text_override` + `text_override_history`** (FEAT-055):

```sql
-- text_override: Aktueller Wert pro (scope, scope_id, text_key, locale)
CREATE TABLE text_override (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global','template','partner')),
  scope_id uuid NULL,
  text_key text NOT NULL CHECK (text_key ~ '^[a-z0-9._]{1,200}$'),
  text_value text NOT NULL CHECK (length(text_value) <= 8000),
  locale text NOT NULL DEFAULT 'de',
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scope_id_matches_scope CHECK (
    (scope = 'global' AND scope_id IS NULL) OR
    (scope IN ('template','partner') AND scope_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX text_override_unique
  ON text_override (scope, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), text_key, locale);

CREATE INDEX text_override_key_locale ON text_override (text_key, locale);
CREATE INDEX text_override_scope_id ON text_override (scope, scope_id) WHERE scope_id IS NOT NULL;

-- text_override_history: Audit-Log fuer DSGVO-Auskunftspflicht
CREATE TABLE text_override_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text_override_id uuid NULL,  -- NULL bei action='delete' (Row geloescht)
  scope text NOT NULL,
  scope_id uuid NULL,
  text_key text NOT NULL,
  locale text NOT NULL,
  old_value text NULL,         -- NULL bei action='create'
  new_value text NULL,         -- NULL bei action='delete'
  editor_id uuid NOT NULL REFERENCES auth.users(id),
  editor_role text NOT NULL,
  action text NOT NULL CHECK (action IN ('create','update','delete')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX text_override_history_key ON text_override_history (text_key, locale, created_at DESC);
CREATE INDEX text_override_history_editor ON text_override_history (editor_id, created_at DESC);

-- RLS (DEC-148):
ALTER TABLE text_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE text_override_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY text_override_admin_all ON text_override FOR ALL
  USING (is_strategaize_admin(auth.uid()))
  WITH CHECK (is_strategaize_admin(auth.uid()));

CREATE POLICY text_override_partner_read_global_template ON text_override FOR SELECT
  USING (scope IN ('global','template'));

CREATE POLICY text_override_partner_own ON text_override FOR ALL
  USING (
    scope = 'partner' AND
    scope_id IN (SELECT partner_org_id FROM partner_admin_view WHERE user_id = auth.uid())
  )
  WITH CHECK (
    scope = 'partner' AND
    scope_id IN (SELECT partner_org_id FROM partner_admin_view WHERE user_id = auth.uid())
  );

CREATE POLICY text_override_tenant_read ON text_override FOR SELECT
  USING (
    scope IN ('global','template') OR
    (scope = 'partner' AND scope_id = (SELECT partner_org_id FROM tenant_to_partner_view WHERE tenant_id = current_tenant_id()))
  );

-- History-RLS analog
CREATE POLICY text_override_history_admin_all ON text_override_history FOR SELECT
  USING (is_strategaize_admin(auth.uid()));

CREATE POLICY text_override_history_partner_own ON text_override_history FOR SELECT
  USING (
    scope_id IN (SELECT partner_org_id FROM partner_admin_view WHERE user_id = auth.uid())
  );

-- GRANTs Pflicht (siehe feedback_migration_rls_needs_grants.md)
GRANT SELECT, INSERT, UPDATE, DELETE ON text_override TO service_role, authenticated;
GRANT SELECT, INSERT ON text_override_history TO service_role, authenticated;
```

**Migration 099 — `template.blocks[].questions[].helper_text + examples_md`** (FEAT-057):

```sql
-- Schema-Erweiterung ist JSONB-additiv, kein ALTER TABLE noetig
-- Migration prueft nur, dass bestehende Templates valide bleiben.
-- helper_text + examples_md sind optionale Felder im questions[]-JSONB.

-- Validation-Function (idempotent):
CREATE OR REPLACE FUNCTION public.validate_helper_text_schema()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Prueft: jedes question-Objekt darf 'helper_text' (max 300 chars) und
  -- 'examples_md' (max 800 chars) als optionale string-Felder haben.
  -- Cross-Repo-Sync-Pflicht mit IS V3 Questionnaire Builder DEC-063.
  PERFORM 1 FROM template
  WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(blocks) AS block,
                  jsonb_array_elements(block->'questions') AS q
    WHERE (q->>'helper_text' IS NOT NULL AND length(q->>'helper_text') > 300)
       OR (q->>'examples_md' IS NOT NULL AND length(q->>'examples_md') > 800)
  );
  -- Falls Treffer: RAISE EXCEPTION mit Template-ID.
END $$;

-- Migration 099a (separat): Initial-Content fuer partner_diagnostic v1
-- UPDATE template SET blocks = (...)
-- mit 24 question-Objekten, jeweils helper_text + examples_md gesetzt.
-- (Konkrete Inhalte werden in SLC-138 mit User finalisiert.)
```

**Migration 100 — `diagnose_event`** (FEAT-058):

```sql
CREATE TABLE diagnose_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_session_id uuid NOT NULL REFERENCES capture_session(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  partner_org_id uuid NULL REFERENCES partner_organization(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'question_start','question_answer','question_skip','helper_text_open',
    'session_paused','session_resumed','session_abandoned','session_completed',
    'session_heartbeat'
  )),
  question_key text NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX diagnose_event_session ON diagnose_event (capture_session_id, created_at DESC);
CREATE INDEX diagnose_event_tenant_type ON diagnose_event (tenant_id, event_type, created_at DESC);
CREATE INDEX diagnose_event_partner ON diagnose_event (partner_org_id, created_at DESC) WHERE partner_org_id IS NOT NULL;

-- RLS:
ALTER TABLE diagnose_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY diagnose_event_admin_all ON diagnose_event FOR SELECT
  USING (is_strategaize_admin(auth.uid()));

CREATE POLICY diagnose_event_partner_own ON diagnose_event FOR SELECT
  USING (
    partner_org_id IN (SELECT partner_org_id FROM partner_admin_view WHERE user_id = auth.uid())
  );

CREATE POLICY diagnose_event_insert_own_session ON diagnose_event FOR INSERT
  WITH CHECK (
    tenant_id = current_tenant_id() AND
    capture_session_id IN (SELECT id FROM capture_session WHERE tenant_id = current_tenant_id())
  );

GRANT SELECT, INSERT ON diagnose_event TO service_role, authenticated;
```

### V7.1 Resolver-Flow im Detail

**Single-Query-Load pro Server-Component-Render:**

```typescript
// src/lib/text-override/resolver.ts
export async function loadOverrides(
  partnerOrgId: string | null,
  locale: string = 'de'
): Promise<Map<string, string>> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('text_override')
    .select('scope, scope_id, text_key, text_value')
    .or([
      `scope.eq.global`,
      `scope.eq.template`,
      partnerOrgId ? `and(scope.eq.partner,scope_id.eq.${partnerOrgId})` : null
    ].filter(Boolean).join(','))
    .eq('locale', locale);

  if (error) throw error;

  // Merge mit Reihenfolge partner > template > global
  const map = new Map<string, string>();
  for (const scope of ['global', 'template', 'partner'] as const) {
    for (const row of data.filter(r => r.scope === scope)) {
      map.set(row.text_key, row.text_value);
    }
  }
  return map;
}

export function resolveText(
  map: Map<string, string>,
  key: string,
  defaultText: string
): string {
  return map.get(key) ?? defaultText;
}
```

**Per-Request-Cache via React-Context:**

```typescript
// src/components/text-override/Provider.tsx (Server-Component)
export async function TextOverrideProvider({ children, partnerOrgId }: Props) {
  const map = await loadOverrides(partnerOrgId, 'de');
  return <TextOverrideContext.Provider value={{ map, partnerOrgId }}>{children}</TextOverrideContext.Provider>;
}
```

**60s-TTL als Fallback** (DEC-145):

```typescript
// In-Memory-Map mit TTL pro Server-Prozess
const cache = new Map<string, { map: Map<string,string>; expiresAt: number }>();

export async function loadOverridesWithCache(partnerOrgId, locale) {
  const cacheKey = `${partnerOrgId}::${locale}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.map;
  const map = await loadOverrides(partnerOrgId, locale);
  cache.set(cacheKey, { map, expiresAt: Date.now() + 60_000 });
  return map;
}
```

**Save-Action mit Cache-Bust:**

```typescript
// src/lib/text-override/actions.ts
export async function saveTextOverride(scope, scopeId, textKey, newValue, locale) {
  // ...RLS-Check, Upsert, History-Insert
  cache.delete(`${scopeId ?? 'null'}::${locale}`);   // Cache invalidiert
  revalidatePath('/dashboard/diagnose', 'layout');    // Next.js Cache-Bust
  return { ok: true, newValue };
}
```

### V7.1 EditableText-Komponente

**Hybrid-Editor (DEC-143)**:

```tsx
// src/components/text-override/EditableText.tsx
type Props = {
  keyPath: string;
  defaultText: string;
  scope?: 'global' | 'template' | 'partner';   // Default 'global'
  scopeId?: string;                             // Pflicht bei scope='template'|'partner'
  multiline?: boolean;                          // Default false
  markdown?: boolean;                           // Default false, opt-in via DEC-144
  as?: keyof JSX.IntrinsicElements;             // Default 'span'
};

export function EditableText({ keyPath, defaultText, scope='global', scopeId, multiline=false, markdown=false, as='span' }: Props) {
  const { map, role, currentPartnerOrgId } = useTextOverride();
  const text = resolveText(map, keyPath, defaultText);

  const canEdit = role === 'strategaize_admin' || role === 'partner_admin';
  const useModal = multiline || defaultText.length > 80;   // DEC-143 Schwelle

  if (markdown) {
    return <MarkdownRender content={text} as={as} editable={canEdit} onEdit={() => openEditor(useModal)} />;
  }
  return <PlainTextRender text={text} as={as} editable={canEdit} onEdit={() => openEditor(useModal)} />;
}
```

**Inline-Editor (default <= 80 chars, Single-Line)**:
- Klick auf Pencil-Icon → Span wird zu `<input type="text">` mit Auto-Width.
- Enter zum Save, Esc zum Cancel.
- Save-Loading-State per Spinner-Icon-Toggle.

**Modal-Editor (multiline=true ODER default > 80 chars)**:
- Klick auf Pencil-Icon → Modal-Dialog mit grosser `<textarea rows=8>`.
- Markdown-Preview-Toggle (falls `markdown={true}`).
- Save / Cancel-Buttons.
- "Auf Standard zuruecksetzen"-Button sichtbar wenn Override-Row existiert.

### V7.1 Markdown-Subset (DEC-144)

Markdown rendered via `remark@15` + `remark-html@16` (Pattern aus IS-SLC-201, `feedback_email_render_remark_pattern.md`). Erlaubte Syntax:

- **Bold** `**text**`
- *Italic* `*text*`
- [Links](https://...) `[label](url)` mit URL-Validation (https-only)
- Unordered lists `- item`
- Ordered lists `1. item`
- Line-Breaks

**Verboten** (HTML-Sanitizer entfernt):
- `<script>`, `<iframe>`, `<style>`, andere HTML-Tags
- Code-Blocks (`` ``` ``)
- Images (`![]()`)
- Tables

Markdown-Modus ist opt-in via `markdown={true}` prop auf `<EditableText>`. Default ist Plain-Text (kein Markdown-Parse).

### V7.1 Telemetry-Flow (DEC-147)

**Client-Side-Tracker** (`src/lib/telemetry/diagnose.ts`):

```typescript
type DiagnoseEventType =
  | 'question_start' | 'question_answer' | 'question_skip'
  | 'helper_text_open'
  | 'session_paused' | 'session_resumed' | 'session_abandoned' | 'session_completed'
  | 'session_heartbeat';

let currentSession: SessionContext | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

export function initTracker(session: SessionContext) {
  currentSession = session;
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('beforeunload', onBeforeUnload);
  startHeartbeat();
}

function startHeartbeat() {
  heartbeatInterval = setInterval(() => {
    if (!document.hidden) {
      trackEvent('session_heartbeat', { question_key: currentSession?.currentQuestionKey });
    }
  }, 5_000);   // DEC-147: 5s-Heartbeat, 100% Sampling
}

export function trackEvent(type: DiagnoseEventType, payload: Record<string, unknown> = {}) {
  if (!currentSession) return;
  const isTest = localStorage.getItem('strategaize:is_test_user') === 'true';
  fetch('/api/diagnose-event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      capture_session_id: currentSession.captureSessionId,
      event_type: type,
      question_key: payload.question_key ?? null,
      payload,
      is_test: isTest,
    }),
  }).catch(() => {});   // fire-and-forget, Tracker-Fail NIE blocking
}

function onVisibilityChange() {
  if (document.hidden) trackEvent('session_paused');
  else trackEvent('session_resumed');
}

function onBeforeUnload() {
  // sendBeacon fuer reliable delivery bei Tab-Close
  navigator.sendBeacon('/api/diagnose-event', JSON.stringify({
    capture_session_id: currentSession?.captureSessionId,
    event_type: 'session_paused',
    question_key: currentSession?.currentQuestionKey,
    payload: { reason: 'beforeunload' },
    is_test: localStorage.getItem('strategaize:is_test_user') === 'true',
  }));
}
```

**Server-Endpoint** (`src/app/api/diagnose-event/route.ts`):
- POST-only.
- Rate-Limit: 600 Events/h pro Session (10 pro Minute).
- Validation: capture_session_id gehoert dem aktuellen Tenant (RLS via Insert-Policy).
- INSERT in diagnose_event.

**Analytics-Aggregation** (`src/app/admin/diagnose-funnel-analytics/actions.ts`):

```sql
-- Drop-off pro Frage (Beispiel-Query)
SELECT
  question_key,
  COUNT(*) FILTER (WHERE event_type = 'question_start') AS starts,
  COUNT(*) FILTER (WHERE event_type = 'question_answer') AS answered,
  COUNT(*) FILTER (WHERE event_type = 'question_skip') AS skipped,
  (COUNT(*) FILTER (WHERE event_type = 'question_start')
    - COUNT(*) FILTER (WHERE event_type = 'question_answer'))::float /
    NULLIF(COUNT(*) FILTER (WHERE event_type = 'question_start'), 0) AS dropoff_rate
FROM diagnose_event
WHERE
  is_test = false
  AND ($partner_org_id IS NULL OR partner_org_id = $partner_org_id)
  AND created_at >= now() - interval '$range_days days'
GROUP BY question_key
HAVING COUNT(DISTINCT capture_session_id) >= 5   -- DSGVO-5-Sessions-Schwelle
ORDER BY dropoff_rate DESC NULLS LAST;
```

**30min-Abandoned-Detector**: kein eigener Cron, sondern on-demand-View-Query in Analytics-Page: Sessions ohne Event in den letzten 30min werden als `session_abandoned` gezaehlt (LEFT JOIN auf `diagnose_event`).

### V7.1 PDF-Generation-Flow (DEC-141)

**`@react-pdf/renderer` Setup**:

```tsx
// src/lib/pdf/diagnose-report.tsx
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 20 * 2.83465, fontSize: 11 },   // 20mm-Margin
  header: { fontSize: 18, marginBottom: 12, fontWeight: 'bold' },
  blockTitle: { fontSize: 13, marginTop: 14, marginBottom: 6, fontWeight: 'bold' },
  blockText: { lineHeight: 1.4 },
  footer: { fontSize: 9, marginTop: 18, color: '#666' },
});

export async function renderDiagnoseReportPdf(
  sessionData: SessionDataShape,
  overrides: Map<string, string>
): Promise<Buffer> {
  const closingStatement = resolveText(
    overrides,
    'template.partner_diagnostic.closing_statement',
    sessionData.template.metadata.closing_statement
  );

  return await renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>StrategAIze Diagnose-Bericht</Text>
        <ScoreVisualPdf scores={sessionData.scores} />
        {sessionData.blocks.map(b => (
          <View key={b.key}>
            <Text style={styles.blockTitle}>{b.title}</Text>
            <Text style={styles.blockText}>{b.kiCondensation}</Text>
          </View>
        ))}
        <Text style={styles.footer}>{closingStatement}</Text>
      </Page>
    </Document>
  );
}
```

**Email-Send-Action**:

```typescript
export async function sendDiagnoseReportByEmail(input: SendInput) {
  // ...RLS-Check, Rate-Limit, Recipients-Resolution
  const pdfBuffer = await renderDiagnoseReportPdf(sessionData, overrides);
  await sendMail({
    to: recipients,
    subject: resolveText(overrides, 'email.diagnose_report.subject', 'Ihr StrategAIze Diagnose-Bericht'),
    bodyMd: resolveText(overrides, 'email.diagnose_report.body_md', defaultBody),
    attachments: [{ filename: 'diagnose-bericht.pdf', content: pdfBuffer, contentType: 'application/pdf' }],
  });
  await auditLog({ event: 'diagnose_report_emailed', sessionId: input.captureSessionId, recipientsCount: recipients.length });
}
```

### V7.1 Cross-Repo-Schema-Sync mit IS V3 (DEC-142)

**OP V7.1 (dieses Repo)** definiert:

```jsonc
// template.blocks[].questions[]-Schema (Migration 099-Validation)
{
  "key": "q1",                     // pflicht
  "label": "Frage-Text",           // pflicht
  "options": [...],                // pflicht
  "helper_text": "Definition...",  // optional, max 300 chars (V7.1-NEU)
  "examples_md": "- Beispiel A\n- Beispiel B"   // optional, max 800 chars Markdown (V7.1-NEU)
}
```

**IS V3 (strategaize-intelligence-studio)** Questionnaire Builder erzeugt identische Schema-Form. Pflicht-Cross-Check in /architecture V7.1:

- DEC-073 in IS-DECISIONS.md mit identischer Schema-Definition + Verweis auf OP-DEC-142.
- Memory `project_op_v71_cross_repo_helper_text_sync.md` als Cold-Start-Pointer fuer beide Repos.
- Schema-Aenderungen an `helper_text + examples_md` in beiden Repos NUR koordiniert.

Keine Sync-Mechanik via gemeinsames Schema-Repo oder CI-Hash-Check in V7.1 (DEC-142). Manual-Cross-Check + Spiegel-DEC ist V7.1-Approach, Upgrade auf gemeinsames Schema-Repo ist V8+-Topic falls Drift in Praxis Probleme verursacht.

### V7.1 Security and Privacy

- **RLS-Pen-Test-Pflicht** (FEAT-055 AC-2/3, Pen-Test-Suite-Erweiterung):
  - partner_admin Partner A darf NICHT Override-Row mit scope=partner, scope_id=Partner-B anlegen/editieren/loeschen.
  - tenant_admin + tenant_member duerfen NICHT text_override schreiben.
  - tenant_admin + tenant_member sehen NUR global+template+own-partner-Overrides beim Read.
- **DSGVO-Datensparsamkeit Telemetrie**:
  - Event-Payload enthaelt KEIN Klartext-PII (keine Antwort-Inhalte, keine Email, keine IP).
  - Aggregations-Schwelle: 5 Sessions pro Filter-Kombo. Unter dieser Schwelle wird "zu wenig Daten" angezeigt, nicht der Zahlenwert (Re-Identifikations-Schutz).
  - is_test-Flag filtert SLC-700-Live-Test-Daten + interne QA-Runs raus.
- **Audit-Log fuer Edit-Aktionen**:
  - text_override_history bekommt Insert pro Create/Update/Delete.
  - DSGVO-Auskunftspflicht: "Was hat User X wann editiert?" beantwortbar via `editor_id`-Index.
- **EditableText-Role-Check** Server-Side:
  - Pencil-Icon-Sichtbarkeit ist ZUSAETZLICHE UX-Hinweis, NICHT Security-Gate.
  - saveTextOverride-Server-Action prueft RLS + Role server-side. Browser-DevTools-Manipulation des Edit-Klicks aendert NICHTS.
- **PDF-Generation in-process**:
  - Kein externer PDF-Service, kein Daten-Transfer.
  - PDF-Bytes werden direkt aus Server-Action an SMTP weitergereicht (kein Disk-Persist, kein Storage-Bucket).
  - Audit-Log enthaelt nur `recipients_count`, kein Recipient-Klartext.

### V7.1 Constraints and Tradeoffs

- **Coolify-Single-Container-Setup** macht Cache-Cross-Container-Invalidation ueberfluessig. Bei V8+-Multi-Container-Scale-Out muss Cache-Strategy via Redis-pubsub erweitert werden (V8+-DEC).
- **Resolver-Single-Query** kann bei sehr vielen Overrides (> 5000 Rows) langsam werden. V7.1 erwartet ~50-200 Override-Rows max — innerhalb Performance-Budget. Bei Wachstum: partitionierte Queries pro Scope.
- **EditableText-Migration ~50-80 Keys** ist Hauptzeitfresser in SLC-137. Grep-Audit + systematisches Mapping `old-string -> key-path` ist Pflicht-Workflow.
- **Helper-Texts-Inhaltsarbeit** ist 3-6h User-Mitarbeit + Code-side parallel. Empfehlung: SLC-138 parallelisiert Code (Schema + Migration + UI) mit User-Content-Erstellung.
- **PDF-Layout-Limitation**: `@react-pdf/renderer` ist keine 1:1-Browser-Print-Parity. PDF nutzt eigenen Stil-Pfad, das ist akzeptierter Tradeoff (DEC-141).
- **Telemetrie-Heartbeat 5s** + 100%-Sampling erzeugt ~720 Events/h/Session. Bei 50 parallelen Sessions = 36000 Events/h = 864000/Tag. Skaliert ohne Sampling bis ~500 Sessions parallel. Daruber muss Sampling V8+ eingefuehrt werden.
- **Cross-Repo-Manual-Cross-Check** mit IS V3 ist V7.1-Approach (DEC-142). Bei Drift muss V8+ entscheiden ob gemeinsames Schema-Repo oder CI-Hash-Check eingefuehrt wird.

### V7.1 Resolved Open Questions

Die acht Open Questions Q-V7.1-A..H aus PRD V7.1-Section sind in V7.1-Architecture entschieden und als DECs dokumentiert:

| Q | Frage | DEC | Entscheidung |
|---|---|---|---|
| Q-V7.1-A | Edit-Modal vs. Inline-Editor | DEC-143 | Hybrid: Inline fuer Default-Text <= 80 chars + multiline=false, Modal sonst |
| Q-V7.1-B | Markdown-Support | DEC-144 | Opt-in via prop, remark@15-Pipeline, Subset (bold/italic/links/lists) |
| Q-V7.1-C | Cache-Invalidation | DEC-145 | Manual revalidatePath + 60s in-Memory-Map-TTL als Fallback |
| Q-V7.1-D | Text-Key-Namespace | DEC-146 | Punkt-separiert, 4 Top-Level-Bereiche (template/diagnose/email/legal) |
| Q-V7.1-E | Telemetrie-Sampling | DEC-147 | 100% V7.1, 5s-Heartbeat, Sampling V8+ falls Volumen waechst |
| Q-V7.1-F | PDF-Engine-Choice | DEC-141 (V7.1-Requirements) | @react-pdf/renderer |
| Q-V7.1-G | Edit-Audience | DEC-148 | strategaize_admin + partner_admin schreiben, tenant Read-Only |
| Q-V7.1-H | Cross-Repo-Schema-Sync | DEC-142 (V7.1-Requirements) | Manual-Cross-Check + Spiegel-DEC im IS-Repo |

### V7.1 Implementation Direction

Reihenfolge SLC-136 -> SLC-142 ist BLOCKING aus Architektur-Gruenden:

| Slice | Komponenten | Pre-Conditions | Aufwand |
|---|---|---|---|
| **SLC-136** | Migration 101 + Resolver-Lib + Save/Reset-Actions + Admin-Override-Liste-Page + RLS-Pen-Test | Keine (Foundation) | ~12-18h |
| **SLC-137** | TextOverrideProvider + EditableText-Komponente + Audit-Skript + Migration A/D/F (~50-80 Keys) + Migration E (Email-Templates) | SLC-136 done | ~4-8h |
| **SLC-138** | Migration 099 + 099a Helper-Text-Initial-Content + Info-Icon + HelperTextModal + Admin-Helper-Edit-Page + IS V3 Cross-Repo-Sync-Verifikation | SLC-137 done | ~6-10h Code + ~3-6h User-Content |
| **SLC-139** | Migration 100 + Telemetry-Tracker-Lib + /api/diagnose-event + Funnel-Analytics-Page mit Aggregations-Queries | SLC-138 done (helper_text_open-Events brauchen Info-Icon) | ~6-10h |
| **SLC-140** | Style Guide V2 Polish auf Start + Run + Bericht-Pages + QuickActionRing-Komponente + Page-Level-Visual-Reference-Checklist | SLC-137 done (EditableText-Migration nicht ueberschrieben) | ~4-8h |
| **SLC-141** | @react-pdf/renderer-Setup + PDF-Generator + sendDiagnoseReportByEmail-Action + SendReportByEmailModal | SLC-140 done (Bericht-Page Layout finalisiert) | ~4-6h |
| **SLC-142** | LegalPageHeader-Komponente + Integration auf /datenschutz + /impressum | Keine, parallel moeglich | ~15-30min |

Geschaetzt **~36-60h Code-Side** + ~3-6h Helper-Inhalt + Pen-Test-Erweiterung + Live-Smoke + /post-launch.

**Naechster Schritt: /slice-planning V7.1** — 7 Slices als feste Files anlegen, Micro-Task-Decomposition pro Slice, Acceptance-Criteria + Aufwand-Schaetzung.

## V7.4 Architektur — App-Shell Touch-Target + Auth-Pages-Polish

### Architecture Summary

V7.4 ist eine 1-Slice-Polish-Iteration ohne neue Backend-Pfade, ohne DB-Migration, ohne neue Dependencies. Architektur-Effekt beschraenkt sich auf 4 isolierte Aenderungspunkte: 1 Component-Tweak in `components/ui/button.tsx` (shadcn Default-Size), 1 Component-Tweak in `StrategaizePoweredFooter` (Padding), Verifikation der 4 Auth-Pages-Layouts und 4 neue Playwright-Mobile-Baselines.

Q-V7.4-A..D wurden mit Minimal-Scope-Pfad entschieden (DEC-151..154). Diese Section dokumentiert das Architektur-Delta + Risiko-Mitigation.

### Main Components Affected

| Component | Path | Change | Risk |
|---|---|---|---|
| `Button` shadcn-Default | `src/components/ui/button.tsx` | Default-Size `h-10 -> h-11` in `buttonVariants` cva | M — alle `<Button>` ohne `size`-Prop werden 4px hoeher |
| `StrategaizePoweredFooter` | `src/components/branding/StrategaizePoweredFooter.tsx` (Source-of-Truth in MT-1 final verifizieren) | Touch-Area-Padding um 3 Links (`py-3` oder `min-h-[44px] inline-flex items-center px-3`) | L — Footer-Hoehe wird groesser, Desktop-Layout-Audit Pflicht |
| Auth-Pages (`<Button>`-Konsum) | `src/app/login/login-form.tsx`, `src/app/auth/set-password/set-password-form.tsx`, `src/app/accept-invitation/[token]/page.tsx`, `src/app/auth/verify-signup/page.tsx` | KEIN Code-Edit — uebernehmen Default-Size-Anhebung automatisch | L |
| `IchWillMehrCard` (`<Button>`-Konsum) | `src/components/diagnose/IchWillMehrCard.tsx` | KEIN Code-Edit — uebernimmt Default-Size-Anhebung automatisch | L |
| Playwright Visual-Regression | `tests/e2e/diagnose-pages.spec.ts` + NEU `tests/e2e/auth-pages.spec.ts` | Neue Spec fuer 4 Auth-Pages-Mobile-Baselines + V7.3-Diagnose-Baselines-Re-Run mit Diff-Review | L |

### Data Model

Unveraendert. 0 Migrations.

### Data Flow / Request Flow

Unveraendert. 0 neue API-Routes, 0 neue Server-Actions, 0 neue Cron-Jobs.

### External Dependencies

Unveraendert. 0 neue Production-Deps. (`@playwright/test` als devDep bleibt aus V7.3.)

### Security / Privacy

Unveraendert. Touch-Target-Polish hat 0 Auth-Logic-Implikationen.

### Constraints + Tradeoffs

- **Cascading-Effect-Risk** durch globale Button-Default-Anhebung (DEC-151) — mitigiert durch MT-1 Usage-Audit + MT-5 Visual-Regression-Re-Run mit Diff-Review.
- **Surgical-Changes-Disziplin** (CLAUDE.md Rule 3) — keine "Wenn-wir-schon-dabei-sind"-Aenderungen am Auth-Layout oder Footer-Inhalt.
- **Pattern-Reuse-Pflicht** (CLAUDE.md Rule 5) — shadcn-cva-Size-Mechanik nutzen, kein eigenes Touch-Target-Pattern erfinden.

### Implementation Direction

**1 Slice SLC-143 mit 6 Micro-Tasks ~3-5h Code-Side.** Reihenfolge:

1. **MT-1 Pre-Audit (~30min)**
   - Grep `<Button` ohne `size="..."`-Prop im gesamten Repo, Ergebnis als Tabelle dokumentieren
   - Live-Mobile-Audit der 4 Auth-Pages (Login + Set-Password + Accept-Invitation + Verify-Signup) per Playwright-MCP gegen Production, ist-Werte aller Buttons + interaktiven Elemente festhalten
   - Footer-Component Source-of-Truth identifizieren

2. **MT-2 shadcn-Button-Default-Anhebung (~15min)**
   - 1 Edit in `src/components/ui/button.tsx` cva `size.default: "h-10 ..."` -> `"h-11 ..."`
   - tsc + eslint Quality-Gate

3. **MT-3 Footer-Touch-Target (~30min)**
   - Source-Component aus MT-1 mit `min-h-[44px] inline-flex items-center px-3` o.ae. anreichern
   - Visual-Smoke auf 3 Viewports (375/768/1280) per Playwright-MCP

4. **MT-4 Auth-Pages Visual-Verify (~30min)**
   - 4 Pages auf 3 Viewports per Playwright-MCP rendern, Layout-Bruch-Check
   - Keine Code-Edits erwartet (Buttons uebernehmen Default-Anhebung automatisch)

5. **MT-5 Playwright-Baselines (~1-2h)**
   - V7.3 9 Diagnose-Funnel-Baselines re-run, Diff-Review (erwartet: minimale Button-Height-Anhebung im Diff)
   - NEU 4 Auth-Pages-Mobile-Baselines anlegen (Login real, Set-Password / Accept-Invitation / Verify-Signup mit dummy-Token = visualisiert ErrorPage-State oder Form-State)
   - Auth-Pages-Spec-File `tests/e2e/auth-pages.spec.ts` neu

6. **MT-6 Records-Update + Slice-Schluss (~30min)**
   - SLC-143 -> done, FEAT-062 -> done, BL-120 -> done
   - Run /qa als Folge-Schritt vor Master-Merge

### Open Technical Questions (zu klaeren in /slice-planning oder pre-MT-1)

- Test-Akteur fuer Set-Password/Verify-Signup-Baseline: dummy-Token reicht (Page rendert ErrorPage statt Form — beide Visuals sind baseline-wuerdig) — finale Entscheidung in /slice-planning oder als MT-1-Sub-Decision
- Footer-Padding-Konkretisierung: `py-3` (24px + 19px line-height = ~43px-44px) vs `min-h-[44px] flex`-Pattern — Entscheidung in MT-3 abhaengig von Layout-Resultat
- Diff-Threshold fuer V7.3-Baselines-Re-Run: Playwright-Default ist 0.2% Pixel-Diff. Button-Height-Anhebung um 4px in einer Page produziert ~1% Diff -> Threshold-Update auf 2% empfohlen, oder Baselines komplett neu generieren

### V7.4 vs V7.3 vs V7.2 vs V7.1 Architektur-Kontext

Diese V7.4-Section ergaenzt die V7.1-Section (`text_override`-Foundation) und V7-Section (Self-Signup-Backend). V7.2 (Telemetrie + Email-PDF) und V7.3 (Look-Polish) wurden historisch nicht als eigene Architektur-Sections eingepflegt — ihre Strukturentscheidungen liegen in DECs (DEC-128 ScoreVisual-Farben, DEC-150 EditableText-Pattern) und Slice-Files. V7.4 folgt der gleichen Disziplin: Decisions in DECISIONS.md, Implementation-Direction in dieser kompakten Section.

**Naechster Schritt: /slice-planning SLC-143** — 1 Slice-File mit Micro-Task-Decomposition (6 MTs aus Implementation-Direction oben) + Acceptance-Criteria (aus FEAT-062 AC-1..8) + Aufwand-Schaetzung pro MT.

---

## V8 Architecture Addendum — Mandanten-Report-Port (RPT-349, 2026-05-28)

### Architecture Summary

V8 ist eine substantielle Iteration mit 4 neuen Features (FEAT-063..066) auf der bestehenden Capture-Session-Architektur. Es gibt **keine neuen Container**, **keine neuen Cron-Jobs**, **keine neuen Production-Dependencies**, **keine neuen Tabellen** — V8 erweitert ausschliesslich additiv:

- 1 neue Template-Row in `public.template` (Migration 102 / MIG-047)
- 1 neue JSONB-Spalte-Erweiterung in `capture_session.metadata.v8_report_snapshot` (additivum, keine Schema-Migration)
- 1 neuer Renderer-Folder `src/lib/pdf/mandanten-report-v2/` (10-15 neue TS-Files)
- 3 neue UI-Components fuer Antwort-Schemata (`HygieneAnswerPills`, `ReifeSkalaAnswer`, `ReflexionTextarea`)
- 1 neue Pure-Function-Library `src/lib/diagnose/sui-engine.ts` (Score-Berechnung)

Pattern-Reuse-Quote ueber 70%: V6.3 `runLightPipeline`-Worker-Branch + `template.metadata.usage_kind`-Switch (DEC-126), V7.2 `@react-pdf/renderer`-PDF-Stack (DEC-157), V7.2 `sendDiagnoseReportByEmail`-Email-Pfad (FEAT-060), V7.1 EditableText + HelperTextModal (FEAT-056 + FEAT-057), V6.3 `computeBlockScores`-Pure-Function-Pattern.

Q-V8-A..H wurden als DEC-157..164 entschieden, alle 8 in `docs/DECISIONS.md`. Diese Section dokumentiert das Architektur-Delta + Data-Flow + Slice-Decomposition.

### Main Components Affected

| Component | Path | Change | Risk |
|---|---|---|---|
| Template-Seed | NEU `sql/migrations/102_v8_exit_readiness_teaser_template.sql` (MIG-047) | INSERT 1 Row mit 47 Fragen + Stufen-Lookup + Hausaufgaben-Lookup JSONB | L — idempotent via `ON CONFLICT (slug, version) DO UPDATE`, additiv |
| SUI-Score-Engine | NEU `src/lib/diagnose/sui-engine.ts` (Pure-Functions) + `src/lib/diagnose/wheel-paths.ts` | 6 Pure-Functions: `computeModuleScores`, `computeSui`, `classifySui`, `mapModuleScoreToStufe`, `aggregateHausaufgaben`, `aggregateReflexion`, `selectThreeHebel` + `computeWheelPaths` | L — pure, deterministisch, Vitest-coverable |
| Server-Action Finalize | NEU `src/lib/diagnose/actions.ts::finalizeMandantenReport` ODER Erweiterung des bestehenden V6.3-Pfads | Schreibt `capture_session.metadata.v8_report_snapshot` JSONB | L — additiv |
| Worker-Branch | BESTEHEND `src/workers/condensation/` mit `template.metadata.usage_kind`-Switch erweitert | NEUE Branch fuer `usage_kind='mandanten_report_teaser_v1'` — ruft Finalize-Logik OHNE Bedrock (DEC-159) | L — DEC-126 Pattern-Reuse |
| Fragebogen-UI Switch | `src/app/dashboard/diagnose/run/[id]/page.tsx` Branching auf `question.answer_schema_kind` | 4 Branchings: `choice_5` (Bestand V6.3), `hygiene_yes_partial_no`, `reife_skala_5`, `reflexion_freitext` | M — neue Antwort-Schemata muessen UX-clean integriert sein |
| Antwort-UI-Components | NEU `src/components/diagnose/HygieneAnswerPills.tsx`, `ReifeSkalaAnswer.tsx`, `ReflexionTextarea.tsx` | 3 Style-Guide-V2 + Touch-Target-44px (DEC-151) + EditableText-konsumierend + HelperTextModal-konsumierend | M — Mobile-Layout-Pflicht |
| PDF-Renderer V2 | NEU `src/lib/pdf/mandanten-report-v2/` (Folder-Modul) — Sub-Components: `cover.tsx`, `sui-hero.tsx`, `modul-profil.tsx`, `modul-page.tsx`, `wheel.tsx`, `hausaufgaben.tsx`, `hebel.tsx`, `reflexion.tsx`, `cta.tsx`, `styles.ts` + `index.ts::renderMandantenReportV2Pdf` | 17-Seiten-PDF, @react-pdf-Komponenten, Inline-SVG-Wheel via `computeWheelPaths` | M — Phase A/B-Split per [[feedback-slice-phase-a-b-split-for-large-slices]] |
| Email-Versand-Branch | BESTEHEND `src/app/dashboard/diagnose/actions.ts::sendDiagnoseReportByEmail` (V7.2) | Erkennt `template.metadata.report_renderer='mandanten_report_v2'` und ruft V2-Renderer statt V1-Renderer | L — additivum, V6.3-Pfad unveraendert |
| Template-Switcher-Resolution | NEU Server-Side in `/dashboard/diagnose/start/page.tsx` | Liest `partner_organization.metadata.default_template_slug ?? 'partner_diagnostic_v1'` + Founder-Override `?template_override=...` nur fuer strategaize_admin (DEC-158) | L — server-side guard |
| V7.2 PDF-Renderer V1 | `src/lib/pdf/diagnose-report.tsx` (V6.3 6-Block-Variante) | **UNVERAENDERT** — strict no-touch | 0 |

### Data Model

Keine neue Tabelle, keine neue Spalte. Nur JSONB-Erweiterung in bestehenden Spalten:

**`public.template` neue Row:**
```
slug='exit-readiness-teaser-v1', version=1
metadata: {
  usage_kind: 'mandanten_report_teaser_v1',
  scoring_kind: 'sui_weighted',
  report_renderer: 'mandanten_report_v2',
  stufen_lookup: { m1: { s1: {was_es_bedeutet, unsere_empfehlung}, s2: {...}, ..., s5: {...} }, m2: {...}, ..., m9: {...} },
  hausaufgaben_lookup: { 'M0.1': { nein: 'Was zu tun...', teilweise: '...' }, 'M0.2': {...}, ..., 'M0.5': {...} },
  worum_es_geht: { m1: 'Skalierbares Produkt...', m2: '...', ..., m9: '...' },
  gewichtung: { m1: 10, m2: 10, m3: 10, m4: 10, m5: 10, m6: 10, m7: 10, m8: 10, m9: 20 }
}
blocks: [
  { modul_id: 'M0', name: 'Hygiene-Pruefung', questions: [{ id: 'M0.1', text: 'Vertraege...', answer_schema_kind: 'hygiene_yes_partial_no', helper_text?, examples_md? }, ..., 5 Fragen] },
  { modul_id: 'M1', name: 'Skalierbares Produkt', questions: [{ id: 'F1.1', text: '...', answer_schema_kind: 'reife_skala_5', score_mapping: {1:0, 2:2, 3:5, 4:8, 5:10}, helper_text?, examples_md? }, ..., 4 Fragen] },
  ... M2..M9 ...,
  { modul_id: 'M10', name: 'Reflexion', questions: [{ id: 'R10.1.1', text: '...', answer_schema_kind: 'reflexion_freitext' }, ..., 5 Fragen] }
]
```

**`public.capture_session.metadata` JSONB-Erweiterung (additivum, keine Migration):**
```
metadata.v8_report_snapshot: {
  schemaVersion: 1,
  finalizedAt: '2026-XX-XX',
  moduleScores: { m1: 6.5, m2: 4.0, ..., m9: 8.0 },
  sui: 67.0,
  classification: { kind: 'tragbar', color: 'gruen', label: 'Tragbar', meaning: '...' },
  stufenMapping: { m1: 3, m2: 2, ..., m9: 4 },
  hausaufgaben: [{ frage_id: 'M0.1', status: 'nein', text: 'Vertraege...' }, ...],
  reflexionen: [{ frage_id: 'R10.1.1', text: '...' }, ...],
  hebel: [{ modul_id: 'm2', score: 4.0, stufe: 2, empfehlung: '...' }, ...]
}
```

**`public.partner_organization.metadata` JSONB-Erweiterung (additivum):**
```
metadata.default_template_slug: 'exit-readiness-teaser-v1' | 'partner_diagnostic_v1'
```

Bestehende Tabellen (`capture_response`, `block_checkpoint`, `knowledge_unit`, `validation_layer`) bleiben unveraendert.

### Data Flow / Request Flow

```
StB legt Partner-Org an / Onboarding-Wizard
  → partner_organization.metadata.default_template_slug = 'exit-readiness-teaser-v1'

Mandant bekommt Einladung (Co-Hosting-Plattform / Invite-Link)
  → partner_client_mapping mit invitation_source='self_signup' oder 'invite_token'
  → Tenant + auth.users + profiles angelegt (V7 Self-Signup oder V4.2 Invite-Flow)

Mandant Login + /dashboard/diagnose/start
  → Server-Side: partner_org.metadata.default_template_slug -> 'exit-readiness-teaser-v1'
  → Founder-Override-Check: ?template_override= nur fuer strategaize_admin akzeptiert (DEC-158)
  → Create capture_session mit template_id=exit-readiness-teaser-v1.v1

/dashboard/diagnose/run/[id] (47 Fragen ueber 11 Module)
  → QuestionFlow.tsx Branching auf question.answer_schema_kind:
    * 'hygiene_yes_partial_no' -> <HygieneAnswerPills /> (5 Fragen Modul 0)
    * 'reife_skala_5'           -> <ReifeSkalaAnswer />   (37 Fragen Module 1-9)
    * 'reflexion_freitext'      -> <ReflexionTextarea /> (5 Fragen Modul 10)
  → capture_response-Inserts per Block-Submit-Pattern (Bestand)
  → diagnose_event Telemetrie pro Frage (FEAT-058-Reuse)

Mandant: "Diagnose abschliessen"
  → Server-Action finalizeMandantenReport(captureSessionId):
    1. Read alle capture_response fuer Session
    2. Pure-Function-Pipeline (DETERMINISTISCH, kein Bedrock-Call):
       a. computeModuleScores(answers, template) -> { m1, ..., m9 }
       b. computeSui(moduleScores) -> 0-100
       c. classifySui(sui) -> { kind, color, label, meaning }
       d. mapModuleScoreToStufe(score) fuer alle 9 Module
       e. aggregateHausaufgaben(answers, template) -> Array<{frage_id, status, text}>
       f. aggregateReflexion(answers, template) -> Array<{frage_id, text}>
       g. selectThreeHebel(moduleScores) -> 3 Module mit niedrigstem Score
    3. UPDATE capture_session SET metadata = metadata || jsonb_build_object('v8_report_snapshot', $snapshot)
    4. INSERT block_checkpoint mit checkpoint_type='auto_final' (V6.3-Pattern-Reuse fuer Status-Tracking)
  → Redirect zu /dashboard/diagnose/[id] (Bericht-Page)

/dashboard/diagnose/[id] (Bericht-Page)
  → Bestehende UI (V6.3 oder V8-spezifische?) — V8.0 fuehrt KEINE NEUE WEB-Bericht-UI ein (out-of-scope, V8.1+)
  → Statt: "Bericht per E-Mail senden"-Button (V7.2 SendReportByEmailModal-Reuse)

User klickt "Bericht senden"
  → Server-Action sendDiagnoseReportByEmail (V7.2 FEAT-060):
    1. Read template.metadata.report_renderer -> 'mandanten_report_v2' (V8) oder default (V6.3)
    2. Branch auf renderer-kind:
       - 'mandanten_report_v2' -> renderMandantenReportV2Pdf(snapshot) (V8 NEU)
       - default                -> renderDiagnoseReportPdf(...) (V6.3 BESTAND)
    3. Email via IONOS-SMTP-Reuse (V4.2)
  → Empfaenger-Auswahl: self / partner / additional (V7.2-Pattern)
```

### External Dependencies

V8.0 fuegt **keine neuen Production-Dependencies** hinzu:
- `@react-pdf/renderer` ^4.5.1 — BESTAND seit V7.2
- `@playwright/test` ^1.60.0 — devDep, BESTAND seit V7.3
- AWS Bedrock — KEIN V8-Konsum, da DEC-159/160/161 deterministisch
- IONOS SMTP — BESTAND seit V4.2

Optional Phase-A-Pivot (nur wenn Spike-Klausel DEC-157 zieht):
- `satori` + `sharp` (~5MB), Pre-Render-Pipeline fuer Wheel-PNG-Asset
- Wuerde in /backend SLC-150 MT-1 hinzukommen falls @react-pdf-Wheel visuell nicht akzeptiert

Custom Fonts (Fraunces + JetBrains Mono):
- Pflege ueber `public/fonts/`-Folder (~150KB Fonts hinzufuegen) oder Google Fonts CDN
- @react-pdf Font.register() unterstuetzt beide Wege

### Security / Privacy

- Mandanten-Antworten landen wie heute in `capture_response` (RLS-protected via V4 Pattern)
- `v8_report_snapshot` JSONB im selben Tenant-Scope (RLS folgt `capture_session`-Owner)
- PDF wird **nicht** persistiert (DEC-163) — kein Storage-Bucket, keine Signed-URLs, kein Cross-Tenant-Leak-Risiko durch unbeabsichtigtes Cachen
- Email-Versand: Recipient-Auswahl von V7.2 (FEAT-060) — Rate-Limit 5/h/Session bleibt
- Bedrock-Calls: KEINE in V8.0 (DEC-159..161) — Data-Residency-Implikation trivial: nur SUI-Berechnung lokal in Worker, kein PII-Export
- Founder-Override `?template_override=...` ist Strategaize-Admin-only (Server-Side-Role-Check) — KEINE Mandant-faking-Vektor

### Constraints + Tradeoffs

- **Premium-Look vs. Simplicity** (DEC-157): @react-pdf-Engine spart Docker-Bloat + Cold-Start, kostet aber CSS-Effekt-Treue (Drop-Shadow, transform:scale). Spike-Klausel in SLC-150 MT-1 ist die Sicherheits-Eskalation falls visuell nicht akzeptiert.
- **Deterministisch vs. LLM-Personalisierung** (DEC-159..161): V8.0 spart $0.27/Bericht + Founder-Reviewability + Reproduzierbarkeit. LLM-Augmentations-Layer ist V8.1+ Erweiterungspunkt **nach** Founder-Test-Verdict.
- **Wheel-Schatten-Approximation** (DEC-162): Drop-Shadow + filter:saturate fallen weg oder werden mit 2 ueberlappenden Pfaden simuliert — AC-11 erlaubt das.
- **Tonalitaets-Migration** (DEC-159): 90+ Texte LEVELS.md → Mandant-Adressat ist EINMALIG manueller Schreib-Prozess in SLC-148 Pre-MT-1. ~30-45min Founder-Pflicht. KEIN LLM-Pass um Drift-Risiko zu vermeiden.
- **PDF-Re-Generation** (DEC-163): Bei jedem Email-Versand wird PDF neu gerendert (~3-5s). Storage-Cache als V8.1+ Optimierung wenn Volumen >100 Reports/Monat.

### Implementation Direction

**5 Slices SLC-148..152 mit geschaetzt ~5-8 Sessions ueber 2-3 Wochen.**

**SLC-148 — FEAT-063 + FEAT-065 Backend (Template-Daten + Score-Engine)** — ~6-10h
- Pre-MT-1: Tonalitaets-Migration der 90+ Stufen-Lookup-Texte (Founder-Pflicht, NICHT LLM)
- MT-1: Migration 102 schreiben + lokaler-Test
- MT-2: Migration 102 LIVE auf Coolify-DB applizieren
- MT-3: Pure-Function-Library `src/lib/diagnose/sui-engine.ts` mit 7 Functions + 15+ Vitest
- MT-4: Pure-Function `computeWheelPaths` in `src/lib/diagnose/wheel-paths.ts` + 6+ Vitest
- MT-5: Server-Action `finalizeMandantenReport` mit Worker-Branch-Trigger via `usage_kind`
- MT-6: Worker-Pipeline-Branch in `src/workers/condensation/` fuer `usage_kind='mandanten_report_teaser_v1'`
- MT-7: Records + /qa SLC-148 + Live-Test einer Founder-Session ohne UI (DB-INSERT capture_response Test-Set, finalize, snapshot-JSONB-Inspection)

**SLC-149 — FEAT-064 Frontend (3 Antwort-Schemata + QuestionFlow-Switch)** — ~4-6h
- MT-1: HygieneAnswerPills.tsx + Pure-Logic-Helper + Vitest
- MT-2: ReifeSkalaAnswer.tsx + Pure-Logic-Helper + Vitest (Style-Guide-V2 Farb-Gradient-Entscheidung)
- MT-3: ReflexionTextarea.tsx + Pure-Logic-Helper + Auto-Save-Indikator + Vitest
- MT-4: QuestionFlow.tsx Switch-Logik auf answer_schema_kind + 4-Branch-Vitest
- MT-5: EditableText + HelperTextModal-Integration in alle 3 neuen Components (Reuse-Pattern)
- MT-6: Records + /qa SLC-149 + Mobile-Smoke per Playwright-MCP (375px-Viewport)

**SLC-150 — FEAT-066 Phase A Backend+Frontend (Renderer-Foundation + Wheel + 3 Pages)** — ~8-12h
- MT-1: PDF-Engine-Spike (DEC-157 Spike-Klausel) — erste Wheel-Implementation in @react-pdf <Svg> + Visual-Vergleich gegen HTML-Prototyp. Pivot-Trigger auf Hybrid (satori+sharp) wenn Founder-Visual-Akzeptanz fail
- MT-2: Renderer-Folder `src/lib/pdf/mandanten-report-v2/` + `styles.ts` + Font-Registration
- MT-3: `cover.tsx` Page 1 (Cover-Titel + Logo-Slot + Mandant-Name + Datum + Wheel-Watermark)
- MT-4: `sui-hero.tsx` Page 2 (SUI-Score gross + Klassifizierungs-Label + Pitch)
- MT-5: `wheel.tsx` Sub-Component (Inline @react-pdf <Svg> mit computeWheelPaths)
- MT-6: `modul-profil.tsx` Page 3 (Wheel + Legende rechts)
- MT-7: `index.ts::renderMandantenReportV2Pdf(data)` Entry-Point + Vitest Smoke
- MT-8: Records + /qa SLC-150 + Founder-Visual-Akzeptanz auf 3 Phase-A-Pages

**SLC-151 — FEAT-066 Phase B (9 Modul-Pages + 4 End-Sections)** — ~8-12h
- MT-1: `modul-page.tsx` mit fokussiertem Wheel-Segment (computeWheelPaths(scores, focusIdx)) + 3-Sektionen-Text (worum_es_geht + was_es_bedeutet + unsere_empfehlung)
- MT-2: 9 Modul-Pages via Loop (Page 4-12), Stufen-Lookup-Resolution via stufenMapping aus Snapshot
- MT-3: `hausaufgaben.tsx` Page 13 mit Modul-0-Findings (Status nein/teilweise) + Alternative-Gratulation
- MT-4: `hebel.tsx` Page 14 mit 3 Hebel-Bloecken
- MT-5: `reflexion.tsx` Page 15 mit Zitat-Sammlung + Alternative-Pitch
- MT-6: `cta.tsx` Page 16-17 mit StB-Kontakt + Strategaize-Footer
- MT-7: Tonalitaets-Audit-Skript (Grep "Ihr Steuerberater" / "der Berater" / "wir empfehlen" in gerenderten Strings)
- MT-8: Records + /qa SLC-151 + Founder-Visual-Akzeptanz End-to-End

**SLC-152 — Integration + Email-Versand-Branch + Telemetrie + Live-Smoke** — ~3-5h
- MT-1: `sendDiagnoseReportByEmail`-Branch auf template.metadata.report_renderer (V2 vs. V1)
- MT-2: Telemetrie-Event-Hooks fuer V8-Session-Lifecycle (FEAT-058-Reuse, `template_slug`-Filter)
- MT-3: Founder-Eigen-Test: Komplette Diagnose End-to-End (47 Fragen, Bericht generieren, Email versenden, PDF auf Mobile + Desktop oeffnen, visuell + inhaltlich validieren)
- MT-4: Records + /qa Slice-Schluss + Gesamt-/qa V8 + Live-Smoke-Bericht (RPT-XXX)
- MT-5: Master-Merge-Sequenz + User-Coolify-Redeploy + /post-launch V8 (18-24h Window)

### Open Technical Questions (zu klaeren in /slice-planning oder in den Slices)

- **SLC-148 Pre-MT-1 Tonalitaets-Migration Workflow**: Founder schreibt die 90+ Texte selbst in Markdown-File (`docs/curriculum/v2/EXIT_READINESS_LEVELS_MANDANT.md` NEU) ODER direkt in einer Migration-SQL-Datei (`102_v8_*.sql`) ODER ueber ein Skript das LEVELS.md liest + Search&Replace anwendet + manual review? Empfehlung: separate `LEVELS_MANDANT.md`-Datei (Founder schreibt in Markdown-Editor mit Live-Preview) + Build-Time-Skript das die Datei in Migration-Seed konvertiert. Entscheidung in /slice-planning SLC-148.
- **SLC-149 Visual-Differenzierung 5-Stufen-Skala**: Farb-Gradient rot-amber-gruen ODER neutrale Grauskala? Style-Guide-V2-Entscheidung — Founder-Verdict in MT-2. Bezug: Mandant darf "Stufe 1" antworten ohne sich beschaemt zu fuehlen (UX-Tonalitaet).
- **SLC-150 MT-1 Spike-Pivot-Trigger**: Konkrete Akzeptanz-Kriterien fuer "Founder-Visual-Akzeptanz" — Pixel-Diff-Threshold? Subjektives Verdict mit Notiz? Empfehlung: Side-by-Side-Vergleich-PNG (Prototyp-HTML-Screenshot vs. @react-pdf-PDF-Render) + Founder-Verdict pro Page-Element (Wheel + SUI-Hero + Cover). Pivot wenn 2+ Elemente "nicht akzeptabel" sind.
- **SLC-150 Custom-Font-Sourcing**: Fraunces + JetBrains Mono lokal in `public/fonts/` ablegen ODER Google Fonts CDN nutzen? `@react-pdf` Font.register() unterstuetzt URLs. Lokal = +150KB Repo, kein CDN-Risiko. CDN = kein Repo-Bloat, aber Build-Time-Pflicht-Network-Access. Empfehlung: lokal in `public/fonts/`.
- **SLC-151 Cover-Logo-Slot StB-Branding**: V8.0 = "out-of-scope" per FEAT-066 Out-of-Scope. Aber Cover-Page hat einen "Logo-Slot" — was kommt rein? Strategaize-Default-Logo (PNG)? Empfehlung: Strategaize-Logo unten + Mandant-Name oben. StB-Logo-Slot = V8.1+ Reuse V6 Partner-Branding-Pattern.
- **SLC-152 Telemetrie-Filter `template_slug` in Analytics-Page**: V7.2 SLC-139 Analytics-Page hat Filter fuer is_test + Partner-Org. Brauchen wir explizit `template_slug`-Filter um V6.3 vs. V8-Sessions auseinanderzuhalten? Empfehlung: ja, additive Filter-Erweiterung in /admin/diagnose-funnel-analytics — KEIN Slice-Scope-Drift (15min Quick-Win in SLC-152 MT-2).

### V8 vs V7.x Architektur-Kontext

V8 setzt auf der V6.3-Light-Pipeline-Architektur auf (DEC-126 `template.metadata.usage_kind`-Worker-Branch, DEC-127 deterministische Score-Logik). Es ist ein **paralleler Use-Case** zu V6.3 (`partner_diagnostic_v1`, 24-Frage-Workshop-Variante) und V1 (`exit-readiness-v1.0.0`, 6-Block-Voll-Diagnose). Diese drei Templates koexistieren ohne Replace.

Pattern-Reuse-Quote ueber Strategaize-Repos (per `feedback_strategaize_pattern_reuse`):
- V6.3 DEC-126 `usage_kind`-Branch (Worker-Pipeline) — voll uebernommen
- V7.2 FEAT-060 PDF-Versand-Pfad — Renderer-Branch additiv
- V7.1 FEAT-056 EditableText + FEAT-057 HelperTextModal — als Frage-UI-Konsumenten
- V6.4 DEC-XXX UNIQUE(slug, version) — fuer Template-Versionierung
- V1 capture_session + capture_response + block_checkpoint — voll genutzt

**Naechster Schritt: /slice-planning V8** — SLC-148..152 Slice-Files anlegen mit Micro-Task-Decomposition + Acceptance-Criteria-Matrizen + Aufwand-Schaetzung pro MT. Pre-Conditions fuer V8-Code-Start: V7.7 /post-launch STABLE-Bestaetigung (~2026-05-29 16:30 UTC Window-Ende).

---

## V8.1 Architecture Addendum — Lead-Conversion-Outro + Strategaize-Freigabe-CTA + Dual-Email-Trigger (RPT-365, 2026-05-30)

### Context

V8.1 setzt auf V8.0 RELEASED 2026-05-30 (REL-026, main HEAD `875e47d`) auf. V8.1 ist keine neue Capture-Pipeline und kein neuer Template-Switch — V8.1 ist eine **Outro-Erweiterung** des V8.0-Mandanten-Report-Renders + neue **CTA-Click-Mechanik** + neue **LLM-Augmentation-Schicht**. Drei FEATures FEAT-067 (Outro-Renderer PDF + Web) + FEAT-068 (CTA-Mechanik + Dual-Email-Trigger) + FEAT-069 (LLM-Augmentation Bedrock eu-central-1).

Alle 9 Open Questions Q-V8.1-A..I aus /requirements RPT-364 sind durch via DEC-167..DEC-175 entschieden.

### Architecture Summary

V8.1 fuegt drei Schichten zu V8.0 hinzu:

1. **LLM-Augmentation-Adapter** (`src/lib/llm/v8-1-augmentation/`) — neuer Schicht ueber bestehendem Bedrock-Adapter. Pure-Function `augmentEmpfehlungsText(input)` + Cache-Layer + Tonality-Validation + ai_cost_ledger-Audit. Sync-Aufruf im PDF-Render-Path (DEC-174). Cache per Tuple `{capture_session_id + model_id + prompt_version}` (DEC-167) in `capture_session.metadata.v8_1_llm_augmentation_cache` JSONB-Slot (Schema bereits aus V8.0 DEC-165 vorhanden, **0 neue Migrations**).

2. **Outro-Renderer** (`src/lib/pdf/mandanten-report-v2/pages/outro.tsx` + `src/app/dashboard/diagnose/[id]/V8OutroSection.tsx`) — ersetzt V8.0-CtaPage (DEC-170) komplett. PDF bleibt 17 Seiten total (Pages 1-15 V8.0 unveraendert, Pages 16-17 = V8.1-Outro-2-Page-Section). Vier Bloecke pro Outro: Strategaize-Vorstellung (statisch, redaktionell) + 3 Empfehlungs-Cards (Verkaufs-Style per DEC-171, LLM-augmentiert) + Video-Platzhalter (statisch) + CTA-Slot.

3. **CTA-Trigger-Mechanik** (`src/app/strategaize-anfrage/route.ts` + `src/app/strategaize-anfrage/bestaetigung/page.tsx` + Server-Action `triggerStrategaizeFreigabe`) — HMAC-SHA256-Magic-Link (PDF) + Server-Action (Web). Stateless Token-Validation (DEC-173, **keine cta_token-Tabelle**). Idempotenz ueber `capture_session.released_for_strategaize_review`-Flag (DEC-163 existiert seit V8.0). Dual-Email-Versand: Lead an `bd@strategaizetransition.de` (JSON+HTML per DEC-168) + StB-Partner-Notification (neutral-informativ per DEC-169, silent-skip bei leerem contact_email).

### Main Components

#### Component-Diagram (textuell)

```
+--------------------------------------------------------------+
| V8.1 Outro-Section Renderer (Sync-Path)                      |
|                                                              |
|  +-------------------+    +---------------------------+      |
|  | augmentEmpfehlungs|<-->| BEDROCK eu-central-1      |      |
|  | Text (Pure-Fn)    |    | Claude Sonnet 3.5         |      |
|  +-------------------+    +---------------------------+      |
|         |   ^                                                |
|         v   | Cache-Read/Write                               |
|  +-------------------+                                       |
|  | capture_session   |                                       |
|  | .metadata.v8_1_   |                                       |
|  | llm_augmentation_ |                                       |
|  | cache (JSONB)     |                                       |
|  +-------------------+                                       |
|         |                                                    |
|         v                                                    |
|  +-------------------+    +---------------------------+      |
|  | renderOutroSection|--->| @react-pdf v4 / Web-React |      |
|  | (PDF + Web)       |    +---------------------------+      |
|  +-------------------+                                       |
+--------------------------------------------------------------+
                       |
                       v Mandant erhaelt PDF
+--------------------------------------------------------------+
| V8.1 CTA-Trigger-Mechanik                                    |
|                                                              |
|  PDF-Klick: GET /strategaize-anfrage?token=<HMAC>            |
|  Web-Klick: Server-Action triggerStrategaizeFreigabe()       |
|         |                                                    |
|         v                                                    |
|  +-------------------+                                       |
|  | verifyToken (PDF) | -- HMAC-Check + Expiry                |
|  | or auth.users (Web)|                                      |
|  +-------------------+                                       |
|         |                                                    |
|         v                                                    |
|  +-------------------+                                       |
|  | Idempotency-Check |  flag==true?  --> Skip-Emails         |
|  | (Flag-Check)      |                                       |
|  +-------------------+                                       |
|         |                                                    |
|         v                                                    |
|  +-------------------+                                       |
|  | UPDATE flag=true  |                                       |
|  +-------------------+                                       |
|         |                                                    |
|         +-->+----------------------+                         |
|         |   | sendBdLeadEmail()    | --> bd@strategaize-     |
|         |   | (JSON+HTML)          |     transition.de       |
|         |   +----------------------+                         |
|         |                                                    |
|         +-->+----------------------+                         |
|         |   | sendStbNotification()| --> partner.contact_    |
|         |   | (neutral-informativ) |     email OR silent-skip|
|         |   +----------------------+                         |
|         |                                                    |
|         v                                                    |
|  +-------------------+                                       |
|  | Redirect to       |                                       |
|  | /strategaize-     |                                       |
|  | anfrage/          |                                       |
|  | bestaetigung      |                                       |
|  +-------------------+                                       |
+--------------------------------------------------------------+
```

#### Component Responsibilities

| Component | Path | Responsibility |
|---|---|---|
| `augmentEmpfehlungsText` Pure-Function | `src/lib/llm/v8-1-augmentation/augment.ts` | Bedrock-Call + Tonality-Post-Validation + Word-Count-Check + Fallback-Auswahl |
| `v8-1-augmentation-cache` Module | `src/lib/llm/v8-1-augmentation/cache.ts` | Read/Write capture_session.metadata.v8_1_llm_augmentation_cache, Tuple-Key-Match |
| `prompt.ts` Module | `src/lib/llm/v8-1-augmentation/prompt.ts` | System-Prompt + V8_1_PROMPT_VERSION-Konstante + Tonality-Vorgabe |
| `OutroPage` PDF-Component | `src/lib/pdf/mandanten-report-v2/pages/outro.tsx` | 4-Block-Layout in @react-pdf v4: Strategaize-Vorstellung + 3 Empfehlungs-Cards + Video-Platzhalter + CTA-Slot |
| `V8OutroSection` React-Component | `src/app/dashboard/diagnose/[id]/V8OutroSection.tsx` | Web-Bericht-Variante, Tailwind + shadcn/ui, Style Guide V2 konform |
| `generateCtaMagicLinkToken` Pure-Function | `src/lib/cta/token.ts` | HMAC-SHA256 + Payload + Expiry (90 Tage Default per DEC-172) |
| `verifyCtaMagicLinkToken` Pure-Function | `src/lib/cta/token.ts` | HMAC-Check + Expiry-Strict-Check |
| `/strategaize-anfrage` Route Handler | `src/app/strategaize-anfrage/route.ts` | GET-Handler: Token-Verify + Flag-Set + Dual-Email + Redirect-to-Bestaetigung |
| `triggerStrategaizeFreigabe` Server-Action | `src/app/dashboard/diagnose/[id]/actions.ts` | Web-Pfad: Auth-Check + Flag-Set + Dual-Email + Bestaetigungs-Redirect |
| `sendBdLeadEmail` Function | `src/lib/email/v8-1/bd-lead.ts` | Email-Template + IONOS-SMTP-Send an `bd@strategaizetransition.de` |
| `sendStbPartnerNotification` Function | `src/lib/email/v8-1/stb-notification.ts` | Email-Template (neutral-informativ DEC-169) + IONOS-SMTP-Send an `partner_organization.contact_email` |
| `/strategaize-anfrage/bestaetigung` Page | `src/app/strategaize-anfrage/bestaetigung/page.tsx` | Statische Bestaetigungs-Page, Strategaize-Wir-Voice |

### Data Model / Storage Direction

**Keine neuen Tabellen, keine neuen Migrationen.** Reuse-Pattern:

- `capture_session.metadata.v8_1_llm_augmentation_cache` JSONB-Slot (DEC-165-Schema aus V8.0 vorhanden)
- `capture_session.released_for_strategaize_review` BOOL (DEC-163-Schema aus V8.0 vorhanden)
- `partner_organization.contact_email` TEXT (V6 Migration 090 vorhanden)
- `ai_cost_ledger` Tabelle (V6+, Constraint-Erweiterung V6.3 Migration 095 vorhanden — V8.1-Eintraege passen rein)
- `error_log` Tabelle (V1.1 vorhanden, V8.1-Audit-Eintraege mit `category` in `cta_strategaize_freigabe`, `stb_notification_skipped_no_email`, `v8_1_llm_call`)

**JSONB-Cache-Struktur**:

```jsonc
// capture_session.metadata.v8_1_llm_augmentation_cache
{
  "cache_key": "anthropic.claude-3-5-sonnet-20241022-v2:0|v1",
  "augmented_at": "2026-05-30T08:37:00Z",
  "hebel": [
    {
      "modul_name": "Modul 4 — Operative Skalierbarkeit",
      "modul_id": 4,
      "aktuelle_stufe": 2,
      "text": "...",
      "is_llm_augmented": true,
      "token_count": { "input": 812, "output": 94 },
      "cost_usd": 0.0067
    }
    // 2 weitere Hebel...
  ]
}
```

### Data Flow / Request Flow

#### Flow 1: PDF-Erzeugung mit V8.1-Outro (Mandant klickt "Bericht herunterladen")

1. User-Action triggert PDF-Render
2. `renderMandantenReportV2Pdf(capture_session)` startet
3. Pages 1-15 (V8.0) werden gerendert (deterministisch, unveraendert)
4. **V8.1-Outro-Render startet** — Cache-Check: matched `cache_key` in `capture_session.metadata.v8_1_llm_augmentation_cache` mit aktuellem `BEDROCK_V8_1_MODEL_ID` + `V8_1_PROMPT_VERSION`?
   - **Hit**: Cached Texte werden in Pages 16-17 gerendert. Instant.
   - **Miss**: 3 sequentielle Bedrock-Calls (~24s Total) mit Tonality-Post-Validation. Erfolgreiche Texte werden gecached. Fail/Timeout → deterministischer Fallback aus V8.0-stufen_lookup. ai_cost_ledger-Entry pro Call.
5. PDF-Output an Mandant + Token-Generierung fuer CTA-Magic-Link
6. PDF-Buffer wird an Email-Adapter weitergereicht (V8.0-Pipeline) oder als Download geliefert

#### Flow 2: CTA-Klick im PDF (Magic-Link)

1. Mandant klickt CTA-Button "Mit Strategaize sprechen" in PDF
2. Browser oeffnet `https://onboarding.strategaizetransition.com/strategaize-anfrage?token=<HMAC>`
3. Route-Handler `route.ts` GET-Handler:
   - `verifyCtaMagicLinkToken(token)` → Pure HMAC-Check + Expiry-Strict
   - **Invalid/Expired**: Error-Page mit StB-Kontakt-Hinweis. Audit-Log mit category `cta_invalid_token`.
   - **Valid**: weiter zu 4.
4. DB-Read: `capture_session.released_for_strategaize_review` Status
   - **Already true**: Idempotency-Hit. Audit-Log `cta_idempotent_skip`. Redirect to Bestaetigungs-Page.
   - **False**: weiter zu 5.
5. DB-Update: `released_for_strategaize_review = true`
6. Parallel Email-Sends (Promise.allSettled):
   - `sendBdLeadEmail()` → bd@strategaizetransition.de (JSON+HTML per DEC-168)
   - `sendStbPartnerNotification()` → `partner.contact_email` ODER silent-skip
7. Audit-Log mit category `cta_strategaize_freigabe` (Source `pdf_magic_link`, Token-Validity, BD-Sent, StB-Sent oder StB-Skipped-No-Email)
8. Redirect zu `/strategaize-anfrage/bestaetigung`

#### Flow 3: CTA-Klick im Web-Bericht (Server-Action)

1. Mandant klickt CTA-Button im V8-Web-Bericht (`/dashboard/diagnose/[id]`)
2. Server-Action `triggerStrategaizeFreigabe(capture_session_id)` startet
3. Auth-Check: Session-User muss Mandant der capture_session sein ODER strategaize_admin
4. Idempotency + Flag-Update + Dual-Email + Audit-Log (analog Flow 2 Schritte 4-7)
5. Server-Side-Redirect zu `/strategaize-anfrage/bestaetigung`

### External Dependencies / Integrations

#### Strategaize-Pattern-Reuse Pflicht (alle existent)

| Service | Reuse-Pfad | V8.1-Nutzung |
|---|---|---|
| AWS Bedrock (eu-central-1) | `src/lib/llm/bedrock-client.ts` | LLM-Augmentation 3 Calls pro First-Render |
| IONOS-SMTP | `src/lib/email/smtp/ionos.ts` | Dual-Email-Versand BD + StB |
| Supabase Postgres (Coolify) | `src/lib/supabase/server.ts` | capture_session-Read/Update + ai_cost_ledger + error_log |
| HMAC-Token-Pattern | V7 Self-Signup-Verify-Endpoint | generateCtaMagicLinkToken/verifyCtaMagicLinkToken portieren |
| Markdown→HTML | `remark` + `remark-html` (V7.2) | BD-Lead-Email JSON-Block + HTML-Body |

**Keine neuen externen Dependencies.** Keine neuen npm-Pakete. 0 Bundle-Risk.

#### Neue ENV-Variablen

| ENV-Variable | Default | Pflicht | Zweck |
|---|---|---|---|
| `STRATEGAIZE_BD_EMAIL` | `bd@strategaizetransition.de` | Nein | BD-Lead-Email Empfaenger (Override pro Environment moeglich) |
| `STRATEGAIZE_CTA_TOKEN_SECRET` | — | **Ja** | HMAC-Secret, min 64 Zeichen, kryptografisch stark |
| `STRATEGAIZE_CTA_TOKEN_EXPIRY_DAYS` | `90` | Nein | Token-Expiry-Lifetime in Tagen (DEC-172) |
| `BEDROCK_V8_1_MODEL_ID` | `anthropic.claude-3-5-sonnet-20241022-v2:0` | Nein | LLM-Modell-ID (DEC-175) |

### Security / Privacy Considerations

- **DSGVO**: Lead-Email + StB-Notification enthalten PII (Mandant-Name, Email, Firma, SUI-Score). Empfaenger `bd@strategaizetransition.de` (Strategaize-eigene Inbox) + StB-Adressen (Pflicht-Felder seit V6) sind etablierte rechtsgrundlage-konforme Strategaize/Partner-Kanaele. Keine Drittlands-Uebermittlung.
- **Data-Residency**: Bedrock eu-central-1 Pflicht (data-residency.md). IONOS-SMTP EU-DE Hosting. Postgres Coolify-Hetzner DE.
- **Token-Security**: HMAC-SHA256 mit min 64-Zeichen-Secret. Expiry-Strict-Check vor jedem Endpoint-Access. Brute-Force-Resistenz durch HMAC-Cryptographic-Hash garantiert.
- **Idempotenz**: Flag-Check verhindert Email-Spam bei Mehrfach-Klick. Wichtig fuer Mandant-Trust + StB-Trust.
- **Audit-Trail**: Jeder Trigger-Event geloggt mit Source + Token-Validity + Email-Sent-Status. Pflicht fuer Founder-Sichtbarkeit + DSGVO-Auskunfts-Pflicht.
- **No-Pricing-Pflicht**: Keine Pricing-Hinweise im Bericht/PDF/Email/Notification. Festgelegt in Tonality-Audit-Skript (Blacklist-Pattern `Euro|EUR|Kosten|Preis`).
- **Tonality-Wir-Voice-Pflicht**: Strategaize-Wir-Voice durchgehend. LLM-Output-Post-Validation Blacklist `ich|mein Team|der Founder|Founders`.

### Constraints and Tradeoffs

#### Pflicht-Reuse (per strategaize-pattern-reuse.md)
- V8.0-Theme + Renderer-Foundation
- Bedrock-Adapter eu-central-1
- IONOS-SMTP-Adapter
- HMAC-Magic-Link-Pattern aus V7
- selectThreeHebel Pure-Function aus V8.0
- capture_session.metadata-JSONB-Schema aus V8.0
- ai_cost_ledger + error_log Tabellen

#### Bewusste Tradeoffs

| Decision | Trade-off |
|---|---|
| DEC-167 Tuple-Cache-Key | + Reproduzierbarkeit / − Cache-Miss bei jedem Modell-Update kostet 3 LLM-Calls pro Re-Render |
| DEC-168 JSON+HTML-Format | + BS-Parser-Forward-Compat / − Mail-Size leicht groesser (~5%) |
| DEC-170 V8.0-CtaPage ersetzt | + Saubere CTA-Hierarchie / − Visual-Drift von V8.0-Baseline |
| DEC-171 Verkaufs-Style Cards | + Conversion-Intent klar / − Stilbruch zu V8.0-Hebel-Block (intentional) |
| DEC-172 90 Tage Expiry, no Single-Use | + UX-friendly / − Token-Replay-Risk bleibt theoretisch |
| DEC-173 Stateless HMAC | + Keine neue Tabelle, einfacher Code / − Keine Single-Use ohne V8.2+ Tabelle |
| DEC-174 Sync-Render | + Einfache Architektur, kein Worker / − First-Render 24s |
| DEC-175 ENV-Modell-ID | + A/B-Testing trivial / − Per-Environment Drift moeglich |

### Open Technical Questions (alle resolved)

| Q-ID | Frage | Resolution |
|---|---|---|
| Q-V8.1-A | LLM-Caching-Granularitaet | DEC-167 — Tuple {capture_session + model_id + prompt_version} |
| Q-V8.1-B | Token-Expiry + Single-Use | DEC-172 — 90 Tage, kein Single-Use in V8.1 |
| Q-V8.1-C | Lead-Email-Format an BD-Inbox | DEC-168 — JSON-Block im HTML-Comment + semantisches HTML |
| Q-V8.1-D | StB-Notification + Fallback | DEC-169 — neutral-informativ, silent-skip bei leerem contact_email |
| Q-V8.1-E | Outro-Position im PDF | DEC-170 — Ersetzt V8.0-CtaPage komplett |
| Q-V8.1-F | Empfehlungs-Block-Visual-Style | DEC-171 — Verkaufs-Style mit groesseren Cards |
| Q-V8.1-G | Token-State-Speicherung | DEC-173 — Stateless via HMAC, keine cta_token-Tabelle |
| Q-V8.1-H | LLM-Sync-vs-Async-Render | DEC-174 — Synchron im PDF-Render-Path |
| Q-V8.1-I | Modell-Version-Konfiguration | DEC-175 — ENV BEDROCK_V8_1_MODEL_ID mit Default |

### Recommended Implementation Direction (Slice-Sketch fuer /slice-planning V8.1)

**3 Slices, ~2-3 Sessions, Cumulative-Single-Branch-Worktree `v8-1-lead-conversion` empfohlen** (analog V8.0-Pattern, SaaS-Mode-Pflicht).

#### SLC-V8.1-A — LLM-Augmentation-Backend (FEAT-069)
- MT-1: Worktree-Setup `c:/strategaize/strategaize-onboarding-plattform-v8-1-lead-conversion` + Branch + npm install
- MT-2: `src/lib/llm/v8-1-augmentation/prompt.ts` mit System-Prompt + `V8_1_PROMPT_VERSION = 'v1'`
- MT-3: `src/lib/llm/v8-1-augmentation/cache.ts` Tuple-Key-Logik + JSONB-Read/Write
- MT-4: `augmentEmpfehlungsText` Pure-Function inkl. Tonality-Post-Validation + Word-Count-Check + Fallback-Logik
- MT-5: ai_cost_ledger-Audit-Integration + error_log-Eintraege fuer LLM-Calls
- MT-6: Vitest gegen Coolify-DB: Cache-Hit/Miss + Modell-ID-Drift-Invalidation + Tonality-Drift-Fallback + Word-Count-Cap
- Geschaetzt: ~2-3h

#### SLC-V8.1-B — Outro-Renderer (FEAT-067) + V8.0-CtaPage-Replacement
- MT-1: Pre-Slice Asset-Freigabe-Check (Strategaize-Vorstellungs-Text + StB-Notification-Wording-Freigabe Status)
- MT-2: Theme-Erweiterung in `theme.ts` fuer Outro-Card-Tokens
- MT-3: `src/lib/pdf/mandanten-report-v2/pages/outro.tsx` — 4-Block-PDF-Component
- MT-4: V8.0-Renderer-Pipeline-Modifikation: CtaPage-Aufruf entfernen, Outro-Aufruf hinzufuegen
- MT-5: `src/app/dashboard/diagnose/[id]/V8OutroSection.tsx` — Web-Bericht-Component
- MT-6: Tonality-Audit-Skript-Erweiterung um V8.1-Outro-Scope
- MT-7: Smoke-PDF-Test (17 Seiten verifizieren, KEIN Doppel-CTA) + Vitest
- Geschaetzt: ~3-5h

#### SLC-V8.1-C — CTA-Mechanik + Dual-Email-Trigger (FEAT-068)
- MT-1: ENV-Variablen-Setup (`STRATEGAIZE_CTA_TOKEN_SECRET` generieren + in `.env.deploy.example` + Coolify-Resource)
- MT-2: `src/lib/cta/token.ts` HMAC-SHA256 generate + verify Pure-Functions + Vitest
- MT-3: `src/lib/email/v8-1/bd-lead.ts` Email-Template mit JSON-Block
- MT-4: `src/lib/email/v8-1/stb-notification.ts` Email-Template (neutral-informativ)
- MT-5: `src/app/strategaize-anfrage/route.ts` GET-Handler + Idempotency + Dual-Email + Redirect
- MT-6: `src/app/strategaize-anfrage/bestaetigung/page.tsx` Statische Bestaetigungs-Page
- MT-7: Server-Action `triggerStrategaizeFreigabe` im Web-Pfad
- MT-8: Magic-Link-Token im PDF-CTA-Slot einbetten (Renderer-Integration)
- MT-9: docs/INTEGRATION_BUSINESS_SYSTEM.md anlegen mit JSON-Schema-Doku
- MT-10: Live-Smoke gegen Founder-Test-Diagnose: PDF-Magic-Link klicken, BD-Email-Inbox verifizieren, StB-Notification verifizieren, Bestaetigungs-Page rendert
- Geschaetzt: ~4-6h

#### Reihenfolge

**A vor B vor C** (Hard-Dependency-Kette):
- A liefert `augmentEmpfehlungsText` → B's Outro-Renderer braucht es
- B liefert Outro-Renderer mit CTA-Slot → C's Magic-Link-Token muss in Slot embedded werden

#### Pre-Slice User-Pflichten

1. **Strategaize-Vorstellungs-Text-Freigabe** (R1 PRD): Founder schreibt 2-3 Absaetze in Wir-Voice. **Blockiert SLC-V8.1-B MT-3.**
2. **StB-Notification-Wording-Freigabe** (R3 PRD): Founder freigibt 4-Saetze-Body fuer DEC-169 neutral-informativ. **Blockiert SLC-V8.1-C MT-4.**
3. **`STRATEGAIZE_CTA_TOKEN_SECRET` Produktions-Generation**: 64-Zeichen kryptografisch stark, in Coolify-ENV setzen. **Blockiert SLC-V8.1-C MT-1.**

#### Coolify-Apply-Plan

- **Migrations**: 0
- **Neue Container**: 0
- **Neue Cron-Jobs**: 0
- **Neue Dependencies**: 0 (alle Reuse)
- **Neue ENV-Variablen**: 4 (1 Pflicht, 3 mit Default)
- **Redeploy-Trigger**: Per Coolify-API analog V8.0-Pattern (Token + is_api_enabled)

### V8.1 vs V8.0 Architektur-Kontext

V8.1 ist eine **additive Schicht** auf V8.0. Es ist **keine** neue Capture-Pipeline (V8.0 bleibt aktiv), **kein** neuer Template-Switch (V8.0-Template-Pfad rendert ab V8.1-Deploy automatisch die neue Outro), **keine** neuen Tabellen oder Migrations.

V8.0 LIVE auf main HEAD `875e47d` bleibt unveraendert. V8.1-Deploy aktiviert Outro automatisch fuer alle bestehenden V8-Template-Sessions, weil:
- `renderMandantenReportV2Pdf` ruft im V8.1-Pfad neue `OutroPage` statt alter `CtaPage` auf
- LLM-Augmentation startet beim ersten PDF-Render einer bestehenden V8.0-Session (Cache leer, voller Call)
- Bestehende `report_snapshot`-Eintraege haben keinen `v8_1_llm_augmentation_cache` → erster Re-Render macht ihn

Co-Existenz mit V1 + V6.3 + V4 bleibt unveraendert (V8.0-Co-Existenz-Tests gelten).

### V8.1-Verifikations-Standard

Eine Implementation ist regelkonform wenn:
- LLM-Augmentation laeuft via Bedrock eu-central-1 (Audit via ai_cost_ledger)
- Deterministischer Fallback ist Pflicht-getestet (Timeout-Simulation)
- Cache-Tuple-Logik invalidiert korrekt bei Modell-ID-Change
- Tonality-Audit-Skript findet 0 Treffer auf erweiterte Blacklist
- HMAC-Token-Verify rejects expired + tampered Tokens (3 Vitest-Cases min)
- Idempotenz verhindert doppelte Emails (Vitest + Live-Smoke)
- StB-Notification silent-skipped bei leerem contact_email (Audit-Log-Entry verifiziert)
- BD-Lead-Email enthaelt JSON-Block UND HTML-Body (Snapshot-Test)
- PDF-Output bleibt 17 Seiten (kein Doppel-CTA)
- Strategaize-Wir-Voice durchgehend (Tonality-Audit + Manuell)

**Naechster Schritt: /slice-planning V8.1** — SLC-V8.1-A/B/C Slice-Files mit Micro-Task-Decomposition + AC-Matrizen + Aufwand-Schaetzung. Realistisch ~1h /slice-planning. Pre-Conditions fuer Code-Start: Strategaize-Vorstellungs-Text-Freigabe + StB-Notification-Wording-Freigabe + STRATEGAIZE_CTA_TOKEN_SECRET-Generation.

## V9 Architecture Addendum — Bulk-Import GF-Email -> Pattern-Extraktion -> Handbuch-Vervollstaendigung (RPT-375, 2026-06-01)

### Context

V9 setzt auf V8.1 RELEASED 2026-06-01 (REL-027 + REL-028 Hotfix, main HEAD `ad94b60`) auf. V9 ist kein Mandanten-Report-Erweiterung und keine Lead-Conversion-Iteration — V9 oeffnet erstmals **unstrukturierte Email-Korrespondenz** als Wissens-Quelle. Founder-Pull BL-146: "GF hat hier eine ganze Menge E-Mails, die er taeglich hin und her schickt — da ist sehr viel Wissen rauszuziehen." V9.0 setzt sich auf 1 Persona (GF im eigenen Tenant) + 1 Daten-Quelle (.mbox-Upload) + 1 Konsum-Pfad (V4.1-Handbuch-Snapshot) ein. Alle anderen Pfade (Forward-Bucket, IMAP, Multi-Mitarbeiter, CRM, IS-Knowledge-Push) sind nach V9.1+/V10+ deferred.

Fuenf neue Features: FEAT-070 Upload + .mbox-Parser, FEAT-071 KI-Pre-Filter (Haiku eu-central-1), FEAT-072 Thread-Aggregation + PII-Redaction (V5-Pipeline-Reuse), FEAT-073 Pattern-Extraktion (Sonnet eu-central-1) + Curation-UI, FEAT-074 Handbuch-Integration + Audit/Cost-Tracking.

Alle 10 Open Questions Q-V9-A..J aus /requirements RPT-374 sind via DEC-176..186 entschieden. **R1 Cost-Validation-Risiko bleibt aktiv** — Test-Email-Corpus deferred bis /backend SLC-V9-A (DEC-179). Architektur arbeitet mit Discovery-Schaetzungen ~0.10 EUR Haiku + ~5 EUR Sonnet pro 1000 Emails; bei Faktor-2-Abweichung in SLC-V9-A werden Cost-Cap-Werte (DEC-182) neu validiert.

### Architecture Summary

V9 fuegt vier neue Schichten zu V8.x hinzu:

1. **Bulk-Email-Foundation** (`src/lib/bulk-email/` + 4 neue Tabellen + neuer Storage-Bucket `bulk-email`) — `.mbox`/`.eml`-Upload, `mailparser`-Parsing, Pflicht-Header-Persistierung (`message_id` + `in_reply_to` + `references`), Bulk-Run-Audit-Header. Reuse FEAT-013 Multi-File-Upload-Pattern + RLS-Bucket-Pattern.

2. **KI-Pre-Filter-Adapter** (`src/lib/ai/bedrock-haiku/`) — neuer Bedrock-Sub-Path fuer Haiku eu-central-1, Strict-JSON-Klassifikations-Output mit 6 kanonischen Labels (content/short_reply/notification/newsletter/private/unclear). Reuse bestehender `ai_cost_ledger`-Audit-Pattern mit `feature='email_bulk_pre_filter'`.

3. **PII-Redaction-Email-Wrapper** (`src/lib/ai/pii-patterns/email-adapter.ts`) — wrapt V5-PII-Pattern-Library (`src/lib/ai/pii-patterns/`) + V5-Walkthrough-Redact-Prompt-Pattern. Email-Spezial-Pre-Processing (Header-Pseudonymisierung Participant-Map P1/P2/... + Signatur-Entfernung via `--` und "Mit freundlichen Gruessen"-Trigger) BEVOR der V5-Bedrock-Call laeuft. Kein neuer LLM-Provider, kein neuer Prompt-Pattern — nur Email-Spezial-Wrapper um existierende Pipeline.

4. **Pattern-Extraktion-Sonnet-Adapter + Curation-UI** (`src/lib/ai/bedrock-sonnet/email-pattern.ts` + `src/app/dashboard/bulk-email-import/[run_id]/curation/`) — Sonnet eu-central-1 mit Strict-JSON-Output-Schema (themes/patterns/decisions/open_questions), Cost-Cap-Pattern aus V8.1 FEAT-069 reused (Run 20 EUR / Monat 100 EUR / Pre-Approval ab 10 EUR), Curation-UI mit Akzeptieren/Ablehnen/Editieren/Section-Zuordnung + Bulk-Aktionen.

Die finale Stufe (Handbuch-Integration via knowledge_unit-Insert + Snapshot-Trigger) ist **kein neuer Worker** — sie laeuft synchron in einer Server-Action am Curation-Abschluss-Trigger. Reuse FEAT-026 + FEAT-028 V4.1-Handbuch-Foundation.

### Main Components

#### Component-Diagram (textuell)

```
+---------------------------------------------------------------+
| V9 Bulk-Email-Pipeline (async, 4 Stufen mit GF-Gates)         |
|                                                               |
|  GF -> Upload-Page (Drag-Drop .mbox/.eml)                     |
|         |                                                     |
|         v                                                     |
|  +----------------+   +-----------------------+               |
|  | Storage-Bucket |<--| Upload-Handler        |               |
|  | bulk-email     |   | (Server-Action)       |               |
|  +----------------+   +-----------------------+               |
|         |                       |                             |
|         |                       v                             |
|         |             +-----------------------+               |
|         |             | Worker: email_bulk_   |               |
|         |             |   parse               |               |
|         |             | - mailparser-Loop     |               |
|         |             | - email_message INS   |               |
|         |             +-----------------------+               |
|         |                       |                             |
|         |                       v   status='parsed'           |
|         |             +-----------------------+               |
|         |             | Worker: email_bulk_   |               |
|         |             |   pre_filter (Haiku)  |               |
|         |             | - Batch 50/Call       |               |
|         |             | - 6-Label-Klassif.    |               |
|         |             | - ai_cost_ledger INS  |               |
|         |             +-----------------------+               |
|         |                       |                             |
|         |                       v   status='pre_filtered'     |
|         |             +-----------------------+               |
|         |             | GF Filter-Review-UI   | <== GF-GATE 1 |
|         |             | - Counts + Korrektur  |               |
|         |             | - Approval-Button     |               |
|         |             +-----------------------+               |
|         |                       |                             |
|         |                       v                             |
|         |             +-----------------------+               |
|         |             | Worker: email_bulk_   |               |
|         |             |   thread_redact       |               |
|         |             | - Thread-Aggregation  |               |
|         |             |   (RFC-5322-Headers)  |               |
|         |             | - PII-Redact (V5 +    |               |
|         |             |   Email-Adapter)      |               |
|         |             +-----------------------+               |
|         |                       |                             |
|         |                       v   status='thread_redacted'  |
|         |             +-----------------------+               |
|         |             | GF Pre-Cost-Estimate  | <== GF-GATE 2 |
|         |             | + Pre-Approval-Modal  |               |
|         |             | (Cost-Cap-Check)      |               |
|         |             +-----------------------+               |
|         |                       |                             |
|         |                       v                             |
|         |             +-----------------------+               |
|         |             | Worker: email_bulk_   |               |
|         |             |   pattern_extraction  |               |
|         |             | - Sonnet 1/Thread     |               |
|         |             | - Strict-JSON-Schema  |               |
|         |             | - ai_cost_ledger INS  |               |
|         |             +-----------------------+               |
|         |                       |                             |
|         |                       v   status='pattern_extracted'|
|         |             +-----------------------+               |
|         |             | GF Curation-UI        | <== GF-GATE 3 |
|         |             | - Pattern-Cards       |               |
|         |             | - Akzept./Ablehnen    |               |
|         |             | - Section-Zuordnung   |               |
|         |             | - Bulk-Aktionen       |               |
|         |             +-----------------------+               |
|         |                       |                             |
|         |                       v                             |
|         |             +-----------------------+               |
|         |             | Server-Action:        |               |
|         |             |   importToHandbook    |               |
|         |             | - knowledge_unit INS  |               |
|         |             | - handbook_snapshot   |               |
|         |             |   Trigger             |               |
|         |             +-----------------------+               |
|         |                       |                             |
|         +-----------------------+   status='completed'        |
+---------------------------------------------------------------+
```

#### Component Responsibilities

| Component | Path | Responsibility |
|---|---|---|
| Upload-Page | `src/app/dashboard/bulk-email-import/page.tsx` | Drag-Drop UI, File-Type-Check, Capture-Mode `email_bulk`-Hook |
| Upload-Handler (Server-Action) | `src/app/dashboard/bulk-email-import/actions.ts` | File-Hash, Duplicate-Check via UNIQUE-Constraint, Storage-Bucket-PUT, email_bulk_run INSERT, enqueue Worker-Job |
| `email_bulk_parse` Worker | `src/workers/bulk-email/handle-parse-job.ts` | `.mbox`/`.eml`-Read aus Storage, `mailparser`-Loop, email_message INSERT mit Pflicht-Headers |
| `email_bulk_pre_filter` Worker | `src/workers/bulk-email/handle-pre-filter-job.ts` | Bedrock-Haiku-Adapter-Call in Batches von 50, Strict-JSON-Klassifikation, ai_cost_ledger Audit-Entry |
| Filter-Review-UI | `src/app/dashboard/bulk-email-import/[run_id]/filter-review/page.tsx` | Klassifikations-Counts, Pro-Email-Korrektur, Bulk-Reclassify, Approval-Trigger |
| `email_bulk_thread_redact` Worker | `src/workers/bulk-email/handle-thread-redact-job.ts` | Thread-Aggregation (RFC-5322 message_id + in_reply_to + references), V5-PII-Pipeline-Aufruf via Email-Adapter, Pseudonymisierung |
| Pre-Cost-Estimate + Pre-Approval-Modal | `src/app/dashboard/bulk-email-import/[run_id]/pattern-start/page.tsx` | Token-Count-Schaetzung pro Thread, Cost-Cap-Check (Run + Monat), Pre-Approval-Modal bei >10 EUR (DEC-182) |
| `email_bulk_pattern_extraction` Worker | `src/workers/bulk-email/handle-pattern-extraction-job.ts` | Bedrock-Sonnet-Call pro Thread mit Strict-JSON-Schema, email_pattern INSERT, ai_cost_ledger Audit |
| Curation-UI | `src/app/dashboard/bulk-email-import/[run_id]/curation/page.tsx` | Pattern-Cards (sortiert nach Confidence), Section-Dropdown (V4.1-Template-Sections + "Andere..."), Akzept./Ablehnen/Editieren, Bulk-Aktionen |
| Handbuch-Import Server-Action | `src/app/dashboard/bulk-email-import/[run_id]/curation/actions.ts` | Idempotente knowledge_unit-Erzeugung, handbook_snapshot-Trigger, email_pattern.imported_to_handbook_at-Update |
| Source-Attribution-View | `src/app/dashboard/handbook/[snapshot_id]/page.tsx` (Erweiterung FEAT-028) | Anzeige "Aus Email-Bulk-Import vom YYYY-MM-DD" mit Link zur Run-Detail |
| Bulk-Run-Detail-Page (Admin-Audit) | `src/app/dashboard/bulk-email-import/[run_id]/page.tsx` + `src/app/admin/audit/bulk-email/page.tsx` | Pipeline-Stufen-Progress, Final-Stats, Audit-Trail Cross-Tenant fuer strategaize_admin |
| `bulk-email`-Storage-Bucket | Supabase Storage | Tenant-isoliert RLS, getrennt von evidence-Bucket (DEC-183), separate Quota |
| PII-Email-Adapter | `src/lib/ai/pii-patterns/email-adapter.ts` | Header-Participant-Map P1/P2, Signatur-Removal, wrapt V5-PII-Pattern-Library |
| Bedrock-Haiku-Adapter | `src/lib/ai/bedrock-haiku/index.ts` | Erweiterung des bestehenden Bedrock-Clients fuer Haiku-Modell-ID, eu-central-1 |

### Data Model / Storage Direction

#### Schema-Variante: Neue email_*-Tabellen (DEC-177)

Vier neue Tabellen werden angelegt — KEINE `evidence_chunk`-Erweiterung. Begruendung: Email-Domain ist semantisch zu unterschiedlich (Headers, Thread-Relations, Pseudonym-Map). evidence_chunk-Misuse waere Drift-Quelle und wuerde RLS- + Mapping-Logik aus FEAT-013 stoeren. Reuse-Pattern: Index-Strategie + tenant_id + Storage-Bucket-RLS-Helper-Functions + ai_cost_ledger.

##### `email_bulk_run` (Audit-Header pro Upload)

```sql
CREATE TABLE email_bulk_run (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
  uploader_user_id            uuid NOT NULL,                                       -- FK auth.users
  capture_session_id          uuid REFERENCES capture_session ON DELETE SET NULL, -- FEAT-025-Hook
  source_file_name            text NOT NULL,
  file_hash                   text NOT NULL,                                       -- SHA256
  storage_path                text NOT NULL,                                       -- bulk-email/<tenant_id>/<run_id>/source.mbox
  email_count                 integer NOT NULL DEFAULT 0,
  content_emails              integer NOT NULL DEFAULT 0,
  thread_count                integer NOT NULL DEFAULT 0,
  patterns_extracted          integer NOT NULL DEFAULT 0,
  patterns_accepted           integer NOT NULL DEFAULT 0,
  patterns_imported           integer NOT NULL DEFAULT 0,
  pre_filter_cost_eur         numeric(8, 4) NOT NULL DEFAULT 0,
  pattern_extraction_cost_eur numeric(8, 4) NOT NULL DEFAULT 0,
  total_cost_eur              numeric(8, 4) GENERATED ALWAYS AS
                                (pre_filter_cost_eur + pattern_extraction_cost_eur) STORED,
  status                      text NOT NULL CHECK (status IN (
                                'uploaded', 'parsing', 'parsed',
                                'pre_filtering', 'pre_filtered',
                                'thread_redacting', 'thread_redacted',
                                'pattern_extracting', 'pattern_extracted',
                                'curating', 'importing', 'completed',
                                'failed'
                              )) DEFAULT 'uploaded',
  failure_reason              text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  completed_at                timestamptz,
  UNIQUE (tenant_id, file_hash)
);
```

Idempotenz-Story: UNIQUE-Constraint `(tenant_id, file_hash)` verhindert Doppel-Upload derselben Datei. Re-Upload erzeugt Warning ohne neuen Run.

##### `email_message`

```sql
CREATE TABLE email_message (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
  bulk_run_id           uuid NOT NULL REFERENCES email_bulk_run ON DELETE CASCADE,
  message_id            text NOT NULL,                                  -- RFC-5322 Message-ID
  in_reply_to           text,
  references_array      text[],
  from_address          text,                                           -- Roh, pre-redact
  to_addresses          text[],
  cc_addresses          text[],
  subject               text,
  date                  timestamptz,
  body_text             text,
  body_html             text,
  has_attachments       boolean NOT NULL DEFAULT false,
  attachment_metadata   jsonb,                                          -- [{name, mime, size}]
  pre_filter_label      text CHECK (pre_filter_label IN (
                          'content', 'short_reply', 'notification',
                          'newsletter', 'private', 'unclear'
                        )),
  pre_filter_confidence numeric(3, 2),
  pre_filter_corrected  boolean NOT NULL DEFAULT false,                 -- GF-Korrektur-Flag
  pii_redacted          boolean NOT NULL DEFAULT false,
  thread_id             uuid,                                           -- FK email_thread SET NULL, late-bind
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_message_bulk_run ON email_message(bulk_run_id);
CREATE INDEX idx_email_message_thread ON email_message(thread_id);
CREATE INDEX idx_email_message_message_id ON email_message(message_id);
```

`from_address` + `to_addresses` werden **vor** PII-Redact persistiert (fuer Thread-Aggregation via Headers noetig). Nach Redact werden Klarnamen via `participant_pseudonyms`-Map ersetzt im `redacted_body` auf email_thread. email_message.from_address bleibt unverschleiert — RLS schuetzt Tenant-Isolation.

##### `email_thread`

```sql
CREATE TABLE email_thread (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
  bulk_run_id            uuid NOT NULL REFERENCES email_bulk_run ON DELETE CASCADE,
  root_message_id        text NOT NULL,
  subject                text,
  email_count            integer NOT NULL DEFAULT 0,
  first_date             timestamptz,
  last_date              timestamptz,
  participant_pseudonyms jsonb,                                         -- {"P1": "kunde-mueller", "P2": "gf-self"}
  redacted_body          text,                                          -- Pseudonyme + Zeitstempel + Roles
  thread_status          text NOT NULL CHECK (thread_status IN (
                           'aggregated', 'redacting', 'redacted', 'failed'
                         )) DEFAULT 'aggregated',
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_thread_bulk_run ON email_thread(bulk_run_id);

-- Late-Binding FK fuer email_message.thread_id
ALTER TABLE email_message
  ADD CONSTRAINT fk_email_message_thread
  FOREIGN KEY (thread_id) REFERENCES email_thread ON DELETE SET NULL;
```

##### `email_pattern`

```sql
CREATE TABLE email_pattern (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
  bulk_run_id                uuid NOT NULL REFERENCES email_bulk_run ON DELETE CASCADE,
  thread_id                  uuid NOT NULL REFERENCES email_thread ON DELETE CASCADE,
  title                      text NOT NULL,
  description                text NOT NULL,
  evidence_snippets          jsonb,                                       -- ["snippet 1", "snippet 2"]
  themes                     text[],
  confidence                 numeric(3, 2) NOT NULL,
  suggested_section          text,
  curation_status            text NOT NULL CHECK (curation_status IN (
                               'pending_curation', 'accepted', 'rejected', 'edited'
                             )) DEFAULT 'pending_curation',
  curated_section            text,
  curator_user_id            uuid,                                        -- FK auth.users
  curated_at                 timestamptz,
  imported_to_handbook_at    timestamptz,
  imported_knowledge_unit_id uuid REFERENCES knowledge_unit ON DELETE SET NULL,
  created_at                 timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_pattern_bulk_run ON email_pattern(bulk_run_id);
CREATE INDEX idx_email_pattern_curation ON email_pattern(bulk_run_id, curation_status);
```

Idempotenz-Story Handbuch-Import: `imported_to_handbook_at IS NULL` markiert Pattern als noch nicht in Handbuch importiert. Re-Run uebersetzt nur unprocessed Pattern.

#### `capture_session.capture_mode` CHECK erweitert um `email_bulk` (DEC-186)

```sql
ALTER TABLE capture_session
  DROP CONSTRAINT capture_session_capture_mode_check;
ALTER TABLE capture_session
  ADD CONSTRAINT capture_session_capture_mode_check
  CHECK (capture_mode IS NULL OR capture_mode IN (
    'questionnaire',
    'evidence',
    'dialogue',
    'employee_questionnaire',
    'walkthrough_stub',
    'walkthrough_v5',
    'email_bulk'  -- NEU V9.0
  ));
```

(Aktuelle Liste der erlaubten Modes wird in MIG-050 entsprechend aktuellem Stand kanonisch ergaenzt.)

#### Storage-Bucket `bulk-email` (DEC-183)

Neuer Bucket statt evidence-Reuse. Begruendung:
- Klare Quota-Buchhaltung pro Capture-Mode (.mbox kann mehrere GB sein).
- Separate Lifecycle-Policy moeglich.
- Mixing mit kleinen PDFs/Bildern aus evidence-Mode waere Operations-Albtraum.

```sql
INSERT INTO storage.buckets (id, name, public)
  VALUES ('bulk-email', 'bulk-email', false);

-- RLS-Policies analog evidence-Bucket-Pattern (V2 SLC-018, MIG-044):
-- - SELECT: tenant_id matched + Rolle IN (tenant_admin, strategaize_admin)
-- - INSERT: tenant_id matched + Rolle = tenant_admin (uploader)
-- - DELETE: Rolle = strategaize_admin only (compliance + Auto-Delete-Cron)
```

Storage-Pfad-Konvention: `bulk-email/<tenant_id>/<bulk_run_id>/source.mbox` (oder `<n>.eml` bei Multi-Upload).

#### View `vw_bulk_email_cost_monthly` (fuer Tenant-Monats-Cap-Enforcement)

```sql
CREATE VIEW vw_bulk_email_cost_monthly AS
SELECT
  tenant_id,
  date_trunc('month', created_at) AS month,
  SUM(total_cost_eur) AS total_cost_eur,
  COUNT(*) AS run_count
FROM email_bulk_run
WHERE status != 'failed'
GROUP BY tenant_id, date_trunc('month', created_at);

GRANT SELECT ON vw_bulk_email_cost_monthly TO authenticated;
-- RLS folgt email_bulk_run.tenant_id-Filter.
```

#### `ai_cost_ledger.feature`-Werte fuer V9

Reuse bestehende `ai_cost_ledger`-Tabelle (V2 deployed, V8.1 in use). Neue feature-Strings:
- `email_bulk_pre_filter` (Haiku-Calls)
- `email_bulk_pattern_extraction` (Sonnet-Calls)
- `email_bulk_pii_redact` (V5-PII-Pipeline-Calls, falls separate Cost-Buchung gewuenscht)

`feature` ist ein freier text-DEFAULT, kein CHECK-Constraint — kein Migration-Bedarf.

#### `knowledge_unit.source='email_bulk'` + Source-Attribution-Markdown im `body` (Path-A-Lite per DEC-193)

**Korrektur 2026-06-06 (L-V9-4 Carry-Over aus RPT-417):** Die urspruengliche Annahme (Source-Attribution via `knowledge_unit.metadata`-JSONB-Lookup + separate `SourceAttributionBlock.tsx`-Reader-Component) hat die Pre-Implementation-Discovery 2026-06-05 (DEC-193) ueberlebt **nicht**. Realitaet-Bruch-Befund:

1. **Worker `handle-snapshot-job.ts` Z.97** selektiert nur `id, block_key, source, unit_type, title, body, confidence, status` — **kein `metadata`, kein `evidence_refs`**. Worker rendert `title`/`body` als Markdown, packt in ZIP, V4.1-Reader laedt nur Markdown. Eine `metadata.source_type='email_bulk'`-JSONB-Lookup-Komponente waere im Worker-Render gar nicht angekommen.
2. **`source` und `block_checkpoint.checkpoint_type` haben CHECK-Constraints** die `email_bulk` / `email_bulk_import` initial nicht zugelassen haben — Erweiterung per MIG-055/Migration 110 noetig.

Implementierte Variante (**Path-A-Lite**, DEC-193 Option C):

- **`knowledge_unit.source`** wird per MIG-055/Migration 110 von 10 auf 11 Werte erweitert: `+ 'email_bulk'`. Jede importierte Pattern-Row hat `source='email_bulk'`.
- **`knowledge_unit.body`** enthaelt am Ende einen Markdown-Block mit Source-Attribution: Pseudonym-Hinweis ("Klarnamen wurden pseudonymisiert"), Confidence-Indikator (low/medium/high abgeleitet aus `pattern.confidence` ueber Schwellen 0.85 / 0.7), Datum aus `pattern.created_at` (`YYYY-MM-DD` de-DE), Link `[Quelle ansehen](/dashboard/bulk-email-import/<bulk_run_id>)`.
- **`knowledge_unit.metadata`** (JSONB, `NOT NULL DEFAULT '{}'::jsonb`, real existent per LIVE-DB-Verify 2026-06-05) wird zusaetzlich defensiv mit Spread-Pattern befuellt (`bulk_run_id`, `pattern_id`, `thread_id`, `participant_pseudonyms`, `confidence`, `extracted_at`) — **nur als Audit-Hilfe**, **nicht als Render-Pfad**. Der Reader sieht es nie.
- **`block_checkpoint.checkpoint_type`** wird per MIG-055/Migration 110 von 4 auf 5 Werte erweitert: `+ 'email_bulk_import'`. `importToHandbook()` legt vor dem Pattern-Loop einen **Pseudo-Checkpoint** pro Bulk-Run an (`content='{}'::jsonb`, `content_hash=sha256(bulk_run_id)`, `block_key=<curated_section>`).
- **MT-3 (separater SourceAttributionBlock.tsx + Reader-Page-Update) wurde GESTRICHEN** — 0 Reader-Aenderung, 0 Component-Aenderung, 0 Worker-Aenderung. V4.1-Handbuch-Reader bleibt 100% unveraendert.

Source-Attribution-View-Erfuellung (FEAT-074 AC-4 + AC-5: "Aus Email-Bulk-Import vom YYYY-MM-DD" + Pseudonym-Hinweis + Link) ist **inhalts-aequivalent** als inline-Markdown im `body`-Feld erfuellt. AC-SLC-168-2 ist auf `PASS-CODE-MODIFIED (DEC-193)` markiert (RPT-417 Line 153). AC-SLC-168-4 ist auf `PASS-CODE-WITH-LOW` markiert wegen Visual-Polish-Carry-Over (L-V9-2 / ISSUE-091).

**Konsequenz fuer V9.1+**: Forward-Bucket-Email-Pipeline (V9.1) erbt das Path-A-Lite-Pattern — Pattern→knowledge_unit-INSERT laeuft via `mapPatternToKnowledgeUnit()` aus `src/lib/bulk-email/handbook-import.ts` ohne neue Worker/Reader-Erweiterung. **KEIN** Metadata-Render-Pfad rechnen, **KEIN** separate SourceAttributionBlock-Komponente vorsehen.

**Quellen**: DEC-193 (DECISIONS.md Z.3-6), MIG-055/Migration 110 (sql/migrations/110_*.sql LIVE-applied 2026-06-05), `src/lib/bulk-email/handbook-import.ts` (`mapPatternToKnowledgeUnit` + `renderSourceAttributionMarkdown`), `src/workers/snapshot/handle-snapshot-job.ts` (Worker-Select-Spalten Z.97 unveraendert).

### Data Flow / Request Flow

#### Pipeline-Stufen + Status-Transitions

| # | Stufe | Trigger | Worker / Action | Status-Transition | LLM | GF-Gate |
|---|---|---|---|---|---|---|
| 1 | Upload + Parse | Sync (Upload-Handler) → Async (Worker) | `email_bulk_parse` | `uploaded` -> `parsing` -> `parsed` | nein | - |
| 2 | Pre-Filter | Auto-chained on `parsed` (oder manuell) | `email_bulk_pre_filter` | `pre_filtering` -> `pre_filtered` | Haiku | - |
| 3 | Filter-Review | UI | GF Review + Approval | (kein Status-Aenderung, internes UI-Gate) | nein | **GATE 1** |
| 4 | Thread-Aggregation + PII-Redaction | Manuell on Approval | `email_bulk_thread_redact` | `thread_redacting` -> `thread_redacted` | Haiku (PII-Redact) | - |
| 5 | Pre-Cost-Estimate + Pre-Approval-Modal | UI | Token-Count-Heuristik, Cap-Check | (kein DB-Aenderung, UI-Gate) | nein | **GATE 2** |
| 6 | Pattern-Extraktion | Manuell on Pre-Approval | `email_bulk_pattern_extraction` | `pattern_extracting` -> `pattern_extracted` | Sonnet | - |
| 7 | Curation | UI | GF Akzept./Ablehnen/Editieren/Section | (UPDATE email_pattern.curation_status, kein bulk_run-Status-Change) | nein | **GATE 3** |
| 8 | Handbuch-Import | Sync (Server-Action on Curation-Complete) | `importToHandbook` Server-Action | `importing` -> `completed` | nein | - |

#### Async vs Sync Begruendung (DEC-178)

- **Stufen 1+2 (Parse, Pre-Filter)**: Async Worker. Parse braucht potenziell mehrere Minuten fuer grosse .mbox-Files. Pre-Filter braucht mehrere Minuten (50 Bedrock-Calls pro 1000 Emails). Worker-Pattern aus V2/V5 reused.
- **Stufe 4 (Thread + Redact)**: Async Worker. Thread-Aggregation deterministisch, PII-Redact mit Bedrock-Haiku-Call pro Thread = mehrere Minuten Worker-Zeit. Beide Stufen als **ein** Worker-Job, weil kein GF-Gate dazwischen und beide deterministisch.
- **Stufe 6 (Pattern-Extraktion)**: Async Worker. Sonnet-Calls pro Thread, 42 Threads ~ 30-60 Min Worker-Zeit. Sync-per-Button waere UX-Albtraum (Browser-Tab muss offen, Timeout-Risiko).
- **Stufe 8 (Handbuch-Import)**: Sync Server-Action. knowledge_unit-Insert + Snapshot-Trigger sind deterministisch + schnell (<30s laut FEAT-074 AC). Worker-Overhead nicht gerechtfertigt.

#### Cost-Cap-Enforcement-Flow (DEC-182, Reuse V8.1 FEAT-069-Pattern)

```
GF startet Pattern-Extraktion (Stufe 6)
    |
    v
1) Plattform berechnet Pre-Cost-Estimate basierend auf Token-Count
   aller redacted_body-Strings im Run + Sonnet-Token-Tarif
    |
    v
2) Lookup vw_bulk_email_cost_monthly fuer Tenant + aktueller Monat
    |
    v
3) Check: monatlicher Stand + Pre-Estimate > 100 EUR Hard-Cap?
   ja  -> Block mit Fehlermeldung "Tenant-Monatlimit erreicht, weitere
          Runs nicht moeglich". Run-Status bleibt 'thread_redacted'.
   nein -> weiter
    |
    v
4) Check: Pre-Estimate > 20 EUR Run-Cap?
   ja  -> Block mit Fehlermeldung "Run-Limit ueberschritten, bitte
          kleineren Bulk-Run waehlen". Run-Status bleibt 'thread_redacted'.
   nein -> weiter
    |
    v
5) Check: Pre-Estimate > 10 EUR Pre-Approval-Schwelle?
   ja  -> Pre-Approval-Modal mit "Erwartete Kosten: X EUR. Fortfahren?".
          GF muss bestaetigen, sonst Abbruch (Status bleibt).
   nein -> Direkt-Start ohne Modal.
    |
    v
6) Worker email_bulk_pattern_extraction startet.
   - Pro Bedrock-Call wird ai_cost_ledger entry mit feature=
     'email_bulk_pattern_extraction' angelegt.
   - Worker prueft nach jedem Call laufende Run-Kosten gegen Run-Cap
     (Live-Cap-Check, soft). Bei Ueberschreitung: status='failed',
     failure_reason='cost_cap_run_exceeded'.
   - Aggregation: email_bulk_run.pattern_extraction_cost_eur wird
     nach Run-Ende per Worker UPDATE gesetzt.
```

### External Dependencies / Integrations

- **`mailparser` ^3.7.0** (NEU) — Email-Parsing fuer .mbox + .eml. NodeMailer-Team-Maintainer, MIT, aktive Maintenance, Quasi-Standard fuer Node-Email-Parsing. Alternative `emailjs-mime-parser` rejected (weniger aktiv) (DEC-185).
- **AWS Bedrock eu-central-1 Frankfurt** (existing) — neue Modell-IDs:
  - `anthropic.claude-3-haiku-20240307-v1:0` (Pre-Filter, PII-Redact)
  - `anthropic.claude-3-5-sonnet-20241022-v2:0` (Pattern-Extraktion, reuse `BEDROCK_V8_1_MODEL_ID`)
- **Supabase Storage Bucket `bulk-email`** (NEU, MIG-050) — Tenant-RLS-Pattern aus FEAT-013 evidence-Bucket geportet.

Keine externe Vendors fuer Inbound-SMTP, IMAP-OAuth oder PST-Parsing — alle nach V10+ deferred (Out-of-Scope).

### Security / Privacy Considerations

#### Tenant-Isolation
- RLS auf allen 4 neuen Tabellen (`email_bulk_run`, `email_message`, `email_thread`, `email_pattern`) mit Standard-Helper `auth_tenant_id() = tenant_id`.
- RLS auf `bulk-email`-Storage-Bucket analog evidence-Bucket-Pattern.
- View `vw_bulk_email_cost_monthly` erbt RLS aus email_bulk_run.

#### Rollen-Matrix V9.0

| Rolle | email_bulk_run | email_message | email_thread | email_pattern | bulk-email-Bucket |
|---|---|---|---|---|---|
| strategaize_admin | SELECT Cross-Tenant (Audit) | SELECT Cross-Tenant | SELECT Cross-Tenant | SELECT Cross-Tenant | SELECT Cross-Tenant (Auto-Delete) |
| tenant_admin (GF) | SELECT + INSERT + UPDATE (Curation) own Tenant | SELECT own Tenant | SELECT own Tenant | SELECT + UPDATE own Tenant | SELECT + INSERT own Tenant |
| tenant_member | KEIN ACCESS V9.0 | KEIN ACCESS | KEIN ACCESS | KEIN ACCESS | KEIN ACCESS |
| employee | KEIN ACCESS V9.0 | KEIN ACCESS | KEIN ACCESS | KEIN ACCESS | KEIN ACCESS |

V9.2+: tenant_member + employee bekommen Multi-Mitarbeiter-Upload-Recht (Out-of-Scope V9.0).

#### PII-Handling-Pflicht (DEC-176, Reuse V5)
- `email_message.from_address` + `to_addresses` + `body_text` enthalten Roh-PII (Pre-Redact).
- `email_thread.redacted_body` enthaelt Pseudonyme + Zeitstempel + Roles ohne Klarnamen / Email-Adressen / Telefonnummern.
- Sonnet-Pattern-Extraktion (Stufe 6) liest ausschliesslich `email_thread.redacted_body` — kein Roh-PII zu Bedrock.
- `participant_pseudonyms`-Map bleibt Tenant-intern, ist Teil der email_thread-Row, ist NICHT Teil des Pattern-Output oder Source-Attribution-Anzeige.

#### Audit-Trail (DSGVO + COMPLIANCE.md)
- Jeder Bedrock-Call (Haiku + Sonnet) erzeugt `ai_cost_ledger` Entry mit Provider, Region, Modell-ID, Input/Output-Token-Count, EUR-Cost, Timestamp.
- `email_bulk_run.status`-Transitions erzeugen `updated_at`-Touch fuer Audit-Korrelation.
- Curation-Aktionen werden in `email_pattern.curated_at + curator_user_id` persistiert.
- Aufbewahrung: 7 Jahre (DSGVO + COMPLIANCE.md, analog V5-Audit-Pattern).

#### Region-Pflicht (data-residency.md)
- Alle Bedrock-Calls eu-central-1 Frankfurt. Adapter-Code erzwingt Region via Bedrock-Client-Config. CI-Test prueft Region-Header in Mock-Bedrock-Tests.

#### Cost-Cap (DEC-182)
- Soft-Cap Run: 20 EUR (Default, ENV-overridable `V9_BULK_EMAIL_RUN_CAP_EUR`).
- Hard-Cap Monat: 100 EUR pro Tenant (`V9_BULK_EMAIL_TENANT_MONTH_CAP_EUR`).
- Pre-Approval-Schwelle: 10 EUR (`V9_BULK_EMAIL_PRE_APPROVAL_THRESHOLD_EUR`).
- Live-Cap-Check im Worker nach jedem Bedrock-Call, abort bei Ueberschreitung.

### Constraints and Tradeoffs

#### Constraint — V9.0 nur GF im eigenen Tenant (DEC-184)
Persona ist nur `tenant_admin` (GF). Multi-Mitarbeiter (V9.2+) braucht Per-User-Bucket + RLS-Erweiterung. Mandanten-Upload im Multiplikator-Pfad (V10+) braucht Anwalts-Pass.

#### Constraint — Klassifikations-Schema kanonisch (DEC-184)
6 Labels (content / short_reply / notification / newsletter / private / unclear) sind hardcoded in V9.0. Pro-Tenant Custom-Schema erst V9.2+ (mit Multi-Mitarbeiter-Mode).

#### Constraint — Cost-Validation deferred (DEC-179)
Test-Email-Corpus liegt nicht parat. /architecture V9 arbeitet mit Discovery-Schaetzungen. R1-Risiko-Marker bleibt. Pre-Cond fuer /backend V9 SLC-V9-A: Test-Corpus muss in MT-1 bereitgestellt sein. Falls Faktor-2-Abweichung von Schaetzung: Cost-Cap-Werte (DEC-182) werden in /backend nachjustiert + Architektur-Update.

#### Constraint — Async-Pipeline + GF-Gates (DEC-178)
Vier separate Worker-Jobs + drei GF-Gates. Synchronisierung waere UX-Albtraum bei groesseren Korpora. Tradeoff: groessere Anzahl Status-Transitions = mehr Test-Surface.

#### Constraint — Deterministischer Fallback bei Bedrock-Fail (Reuse V8.1)
Bei Bedrock-Timeout / Bedrock-500-Fehler: Worker setzt Bulk-Run-Status `failed`, GF kann Re-Try ausloesen ohne Doppel-Charge (Idempotenz via email_message.pre_filter_label IS NULL + email_pattern.curation_status='pending_curation').

#### Constraint — Kein Auto-Akzept ohne GF-Review (Founder-Direktive)
Jeder Pattern in V9.0 MUSS GF-Approved sein. Bulk-Aktion "alle confidence >0.8 akzeptieren" ist Convenience-UI, aber kein implizites Auto-Akzept ohne GF-Click.

#### Tradeoff — Neue Tabellen vs evidence_chunk-Erweiterung (DEC-177)
Pro neue Tabellen: Klare Trennung, einfache RLS, einfache Mapping-Logik.
Contra: Mehr Migrations-Arbeit (1 grosse MIG statt kleiner Erweiterung).
Trotz Contra: gewaehlt, weil evidence_chunk-Misuse Schmerzen ueber Jahre erzeugen wuerde.

#### Tradeoff — V5-PII-Pipeline-Reuse mit Email-Wrapper vs neuer Pipeline (DEC-176)
Pro Wrapper: Strategaize-Pattern-Reuse, kein neuer LLM-Prompt-Pattern, V5-Pattern-Library deckt 90% der PII ab.
Contra: Wrapper-Layer ist zusaetzliche Code-Schicht.
Trotz Contra: Pattern-Reuse-Pflicht (rule strategaize-pattern-reuse.md) sticht.

### Resolved Open Questions

Alle 10 Q-V9-A..J aus PRD V9-Section sind via DEC-176..186 entschieden.

| Open Question | Entscheidung | DEC |
|---|---|---|
| Q-V9-A PII-Redaction-Adapter | V5-Pipeline + Email-Adapter-Wrapper | DEC-176 |
| Q-V9-B Schema-Variante | Neue email_*-Tabellen | DEC-177 |
| Q-V9-C Worker-Pipeline-Sequenz | Async pro Stufe mit 4 Worker-Jobs + 3 GF-Gates | DEC-178 |
| Q-V9-D Test-Email-Corpus | Deferred bis /backend SLC-V9-A | DEC-179 |
| Q-V9-E Pattern-Extraktion-Trigger | Async Worker mit Status-Polling | DEC-180 |
| Q-V9-F Curation-UI Section-Zuordnung | Vorgegebene V4.1-Sections + "Andere..."-Free-Text | DEC-181 |
| Q-V9-G Cost-Cap-Werte | Run 20 EUR / Monat 100 EUR / Pre-Approval ab 10 EUR | DEC-182 |
| Q-V9-H Storage-Bucket | Neuer `bulk-email`-Bucket | DEC-183 |
| Q-V9-I Klassifikations-Schema-Customizing | V9.0 = 6-Labels kanonisch, V9.2+ Custom | DEC-184 |
| Q-V9-J mailparser-Lib | `mailparser ^3.7.0` (NodeMailer-Team) | DEC-185 |
| (zusaetzlich) Capture-Mode-Hook | Neuer `email_bulk` Mode in CHECK-Constraint | DEC-186 |

### Recommended Implementation Direction (Slice-Sketch fuer /slice-planning V9)

**Konsolidierung 5 -> 4 Slices** (PRD-Slice-Sketch SLC-V9-A..E -> 4 Slices). Begruendung in jedem Slice.

#### SLC-V9-A — Bulk-Email-Foundation + Upload (FEAT-070 + Schema)

Aufwand: ~5-7 MTs, ~3-4 Tage.

Includes:
- MT-1: Test-Email-Corpus-Bereitstellung von Founder (Pre-Cond) + LLM-Kosten-Validation gegen Discovery-Schaetzung
- MT-2: MIG-050 Schema (4 neue Tabellen + capture_mode CHECK + bulk-email-Bucket + RLS)
- MT-3: `src/lib/bulk-email/parser.ts` mailparser-Wiring mit Pflicht-Header-Persistierung + Unit-Tests
- MT-4: Upload-Page (`src/app/dashboard/bulk-email-import/page.tsx`) + Multi-File-Drag-Drop (Reuse FEAT-013-Component)
- MT-5: Upload-Handler Server-Action (`actions.ts`) + Duplicate-Check via UNIQUE-Constraint
- MT-6: `email_bulk_parse` Worker (`src/workers/bulk-email/handle-parse-job.ts`) + handle-job.ts Dispatcher
- MT-7: Status-View Dashboard-Card + Pipeline-Progress + RLS-Test-Matrix

Konsolidierungs-Begruendung: Schema-Foundation muss vor jedem Pipeline-Schritt stehen. Trennung Schema + Upload-UI = 2 Slices mit Cross-Coupling → ineffizient.

#### SLC-V9-B — Pre-Filter (Haiku) + Thread-Aggregation + PII-Redaction (FEAT-071 + FEAT-072)

Aufwand: ~6-8 MTs, ~4-5 Tage.

Includes:
- MT-1: `src/lib/ai/bedrock-haiku/` Adapter-Sub-Path (Modell-ID + Strict-JSON-Klassifikations-Schema)
- MT-2: `email_bulk_pre_filter` Worker mit Batching (50 Emails/Call) + ai_cost_ledger feature=`email_bulk_pre_filter`
- MT-3: Filter-Review-UI + Bulk-Reclassify + Approval-Button
- MT-4: `src/lib/bulk-email/thread-aggregation.ts` Pure-Function (RFC-5322 Headers) + Edge-Cases (Single-Email, Reply-Loops, Forward-Chains)
- MT-5: `src/lib/ai/pii-patterns/email-adapter.ts` Wrapper (Participant-Map P1/P2 + Signatur-Entfernung) + V5-Pipeline-Aufruf
- MT-6: `email_bulk_thread_redact` Worker (kombiniert Thread + Redact)
- MT-7: Stage-Detail-View pro Run (Threads-Count + Redact-Status)
- MT-8: RLS-Test-Matrix + Cost-Tracking-Integration

Konsolidierungs-Begruendung: Pre-Filter, Thread-Aggregation und PII-Redaction nutzen alle Bedrock-Haiku. Ein gemeinsamer Slice = ein Adapter-Touch, ein gemeinsamer Worker-Lifecycle-Refactor. GF-Gate zwischen Pre-Filter und Thread-Aggregation ist UI-State, nicht Schema-State.

#### SLC-V9-C — Pattern-Extraktion (Sonnet) + Curation-UI + Cost-Cap (FEAT-073)

Aufwand: ~5-7 MTs, ~4-5 Tage.

Includes:
- MT-1: `src/lib/ai/bedrock-sonnet/email-pattern.ts` Pure-Function mit Strict-JSON-Output-Schema
- MT-2: Pre-Cost-Estimate-Service (`src/lib/bulk-email/cost-estimate.ts`)
- MT-3: Cost-Cap-Check-Service (Reuse V8.1 FEAT-069-Pattern) + Live-Cap-Check im Worker
- MT-4: `email_bulk_pattern_extraction` Worker
- MT-5: Pre-Approval-Modal + Token-Count-Anzeige
- MT-6: Curation-UI (Pattern-Cards + Section-Dropdown + Akzept./Ablehnen/Editieren + Bulk-Aktionen)
- MT-7: Vitest-Tests Cost-Cap + Curation-Actions + RLS

#### SLC-V9-D — Handbuch-Integration + Audit/Cost-Aggregation + Source-Attribution-View (FEAT-074)

Aufwand: ~4-5 MTs, ~2-3 Tage.

Includes:
- MT-1: MIG-051 vw_bulk_email_cost_monthly View + GRANTs
- MT-2: `importToHandbook` Server-Action (idempotente knowledge_unit-Insert + handbook_snapshot-Trigger)
- MT-3: Source-Attribution-View im V4.1-Handbuch-Reader
- MT-4: Bulk-Run-Detail-Page mit Final-Stats + Audit-Trail
- MT-5: Admin-Audit-Cross-Tenant-View + Vitest-Tests Idempotenz + RLS

**Reihenfolge linear**: SLC-V9-A -> SLC-V9-B -> SLC-V9-C -> SLC-V9-D. Strikte Pipeline-Reihenfolge: jeder Slice braucht den vorigen als Daten-Quelle.

**Cumulative-Single-Branch-Worktree** analog V8.0/V8.1 (Pflicht per SaaS-Mode-Direktive). Branch: `v9-bulk-email-import`.

#### MIG-Plan (alle PLANNED)

| ID | Migration-Datei | Inhalt |
|---|---|---|
| MIG-050 | `106_v9_bulk_email_schema.sql` | 4 neue Tabellen (email_bulk_run, email_message, email_thread, email_pattern) + capture_mode CHECK-Erweiterung um `email_bulk` + bulk-email-Storage-Bucket + RLS-Policies |
| MIG-051 | `107_v9_bulk_email_cost_view.sql` | vw_bulk_email_cost_monthly View + GRANTs + RLS-Filter-Funktionen |

Naechste SQL-Migration-Datei = `106_v9_bulk_email_schema.sql`.

### V9 vs V8 / V8.1 Architektur-Kontext

V8.x bleibt unveraendert. V9 ist additive Erweiterung:
- Mandanten-Report-Render (V8.0/V8.1) bleibt unveraendert. V9 produziert KEIN Mandanten-Report-Output.
- Lead-Conversion-CTA (V8.1) bleibt unveraendert. V9 hat keinen CTA-Trigger.
- LLM-Augmentation-Cache (V8.1 FEAT-069) bleibt unveraendert. V9 nutzt **eigenen** Bedrock-Adapter-Sub-Path fuer Haiku + Sonnet, keinen V8.1-Cache.
- Cost-Cap-Pattern (V8.1 FEAT-069) wird konzeptionell reused, aber V9 implementiert eigene Cost-Cap-Logik fuer Bulk-Email-Runs (separater Konsum-Pfad, separate Caps).

Foundations explizit reused:
- FEAT-013 (V2 Evidence) — Multi-File-Upload-Component, RLS-Bucket-Pattern (Schema-Pattern, nicht evidence_chunk-Tabelle selbst).
- FEAT-025 (V4 Capture-Mode-Hook) — neuer Mode `email_bulk` via CHECK-Constraint-Erweiterung (DEC-186).
- FEAT-026 + FEAT-028 (V4 + V4.1 Handbuch) — knowledge_unit-Insert-Pattern + handbook_snapshot-Trigger.
- V5 SLC-076..078 (PII-Redaction-Pipeline) — Pattern-Library + Bedrock-Prompt + Pipeline-Stufen-Pattern, wrapped via Email-Adapter (DEC-176).
- V5 ai_cost_ledger — feature-Spalte fuer V9-spezifische Cost-Buchung.
- V8.1 FEAT-069 Cost-Cap-Pattern — Pre-Approval-Modal + Hard-Cap-Enforcement.

### V9-Verifikations-Standard

Eine Implementation ist regelkonform wenn:
- Alle Bedrock-Calls laufen via Bedrock eu-central-1 (Audit via ai_cost_ledger, CI-Test prueft Region-Config)
- PII-Redact-Adapter wrapt V5-Pattern-Library, kein neuer LLM-Prompt-Pattern (Pattern-Reuse-Rule)
- 4 neue Tabellen haben Tenant-RLS auf allen CRUD-Operationen (Pen-Test 4x4-Matrix in /qa)
- Cost-Cap (Run 20 EUR / Monat 100 EUR / Pre-Approval 10 EUR) ist enforced in Worker + UI (Vitest-Cases mit synthetischen Token-Counts)
- Pre-Cost-Estimate-Modal erscheint bei >10 EUR (Pflicht-Vitest)
- Hard-Cap blockt Run bei >100 EUR Tenant-Monat (Pflicht-Vitest)
- Deterministischer Fallback bei Bedrock-Fail markiert Run als `failed`, GF kann Re-Try ohne Doppel-Charge (Pflicht-Vitest)
- Idempotenz: Re-Upload + Re-Run sind no-ops (UNIQUE-Constraint + imported_to_handbook_at-Check)
- Source-Attribution-View zeigt Pseudonyme, keine Klarnamen (Pattern-Scan im /qa)
- Audit-Trail vollstaendig pro Run (Upload + Pre-Filter + Thread + Redact + Pattern + Curation + Import nachweisbar)
- strategaize_admin sieht Cross-Tenant-Audit, tenant_admin nur eigenen (RLS-verifiziert)
- `mailparser`-Version gepinnt auf `^3.7.0`, kein Lock-File-Drift

**Naechster Schritt: /slice-planning V9** — SLC-V9-A/B/C/D Slice-Files mit Micro-Task-Decomposition + AC-Matrizen + Aufwand-Schaetzung. Pre-Conditions fuer /backend V9-Start:
1. V8.1 STABLE-Bestaetigung via /post-launch nach Burn-In ~2026-06-02 08:00 UTC
2. Test-Email-Corpus von Founder bereit (~100 anonymisierte .mbox-Emails fuer SLC-V9-A MT-1 Cost-Validation)
3. `mailparser ^3.7.0` lokal validiert (npm-Install + Smoke-Parse-Test)

## V9.1 Architecture Addendum — Continuous-Stream Forward-Bucket-Email (RPT-429, 2026-06-09)

> ### ⚠️ REVISION R1 (2026-06-10) — Inbound-Transport: AWS SES → IMAP-Reuse gegen IONOS
>
> **Founder-Direktive 2026-06-10 (Reuse-First):** Kein neues AWS-SES/S3/SNS/Lambda-Konstrukt. Stattdessen die **bereits laufende IMAP-Sync-Lösung aus dem Business-System wiederverwenden**, gegen ein **IONOS-Postfach** (DNS der Domain liegt verifiziert bei IONOS, nicht Hetzner — Nameserver `ns10xx.ui-dns.*`, Root-MX `mx0x.ionos.de`).
>
> **DEC-194 (AWS SES Inbound) → `superseded` durch DEC-205 (IMAP-Sync-Reuse).** Alle SES-/S3-/SNS-/Lambda-bezogenen Abschnitte weiter unten in diesem Addendum (Architecture-Summary Punkt 1, Component-Tabelle "AWS Lambda", Flow A Schritte 1-7, Section "AWS-Resources", "Pflicht-Founder-Step-Liste" Steps 1-5, "Lambda-Function-Role"/"SNS-Topic-Policy"-JSON) sind **OBSOLET** und nur noch als historischer Kontext zu lesen. Maßgeblich ist dieser Revision-Block.
>
> #### R1 Flow A (neu) — IMAP-Poll statt SES-Webhook
>
> ```
> GF-Mail-Forward  →  IONOS-Postfach (bulk@strategaizetransition.com)
>   →  Coolify-Cron POST /api/cron/inbound-email-imap-sync  (x-cron-secret)
>        1. ImapFlow connect (IMAP_HOST/PORT/USER/PASSWORD) — secure 993
>        2. email_inbound_sync_state.last_uid → inkrementeller UID-Fetch
>        3. pro neue Mail: mailparser (simpleParser, schon in OP vorhanden)
>        4. Ziel-Endpoint auflösen (s.u. Routing)
>        5. Validation-Layer (REUSE MT-4): setup-token? + optional sender-allowlist
>        6. Storage-PUT raw EML (REUSE storage-persist.ts)
>        7. rpc_inbound_record_message (REUSE — atomic Daily-Roll-Over + email_message)
>        8. last_uid persistieren + error_log-Audit (captureInfo)
> ```
>
> **Kein HMAC, kein 401/200-silent-drop, kein Lambda-Retry-Loop** — der Pull-Mechanismus ersetzt den Push. Fehler pro Mail werden geloggt + übersprungen (BS-Pattern), `last_uid` wandert nur bei Erfolg/Skip weiter.
>
> #### R1 Routing — Single-Mailbox jetzt, Catchall später (kostenneutral vorbereitet)
>
> - **Jetzt (Internal-Test, Founder-only):** EIN normales IONOS-Postfach. Alle Mails → der **eine konfigurierte aktive `email_inbound_endpoint`** (per ENV `INBOUND_DEFAULT_ENDPOINT_SLUG` oder die einzige `status='active'`-Row). Keine Slug-Parsing-Pflicht.
> - **Später (Multi-Tenant):** IONOS-**Catchall** auf `bulk.strategaizetransition.com` (ein Häkchen im IONOS-Panel) → alle `bulk-<slug>@…` landen im selben Postfach. Routing dann via Recipient-Slug aus den EML-Headern — die Extraktion (`bulk-<slug>` aus To/X-Forwarded-To/Delivered-To) existiert bereits aus **DEC-204** und wird wiederverwendet. **Kein Code-Umbau, nur Aktivierung.**
>
> #### R1 Komponente — IMAP-Sync-Service (Port aus Business-System)
>
> Reuse-Quelle (Pattern-Reuse-Rule, BLOCKING): `strategaize-business-system/cockpit/src/lib/imap/sync-service.ts` + `api/cron/imap-sync/route.ts` + `types/imapflow.d.ts` (Library `imapflow@^1.3.1`). Port nach OP `src/lib/inbound-email/imap-sync.ts` + Cron `src/app/api/cron/inbound-email-imap-sync/route.ts`. Anpassungen ggü. BS: (a) Persist nicht direkt in `email_messages`, sondern über die **V9.1-Pipeline** (Endpoint-Resolve → Validation → `rpc_inbound_record_message`); (b) `imapflow` neu als OP-Dependency (mailparser ist in OP bereits `^3.9.9`); (c) Cron-Auth über OP-Pattern `x-cron-secret` vs `process.env.CRON_SECRET` (wie `capture-reminders`).
>
> #### R1 Persistenz — neue Sync-State-Tabelle
>
> Neue Migration **MIG-061** `email_inbound_sync_state` (analog BS `email_sync_state`, aber **per Endpoint**): `endpoint_id uuid PK/FK`, `folder text DEFAULT 'INBOX'`, `last_uid bigint DEFAULT 0`, `status text`, `last_sync_at timestamptz`, `emails_synced_total int DEFAULT 0`, `error_message text`, `updated_at timestamptz`. Tenant-RLS analog der anderen V9.1-Inbound-Tabellen (admin_all + tenant-scoped read, service_role write).
>
> #### R1 ENV (Coolify, ersetzt SES-ENVs)
>
> `IMAP_HOST` / `IMAP_PORT=993` / `IMAP_USER` / `IMAP_PASSWORD` (IONOS-Postfach) + `IMAP_INITIAL_SYNC_DAYS=90` + `INBOUND_DEFAULT_ENDPOINT_SLUG`. **Entfällt:** `INBOUND_WEBHOOK_HMAC_SECRET`, `INBOUND_VENDOR`, AWS-SES-/Secrets-Manager-ENVs. `INBOUND_CATCHALL_DOMAIN` bleibt nur für den späteren Catchall-Modus dokumentiert.
>
> #### R1 Impact auf SLC-V9.1-A (für /slice-planning-Revision)
>
> | Baustein | R1-Schicksal |
> |---|---|
> | MT-2 Migrationen (3 Tabellen + ALTER, LIVE) | **bleibt** |
> | Validation-Layer (setup-token, sender-allowlist, tenant-lookup, reject-log, storage-persist) | **bleibt** (Caller wechselt Webhook → Cron) |
> | `rpc_inbound_record_message` (MIG-060, LIVE) | **bleibt** |
> | Recipient-Slug-Extraktion (DEC-204) | **bleibt** (für Catchall-Modus) |
> | MT-3 SES-Adapter (`vendors/aws-ses.ts`) + `hmac.ts` | **raus** (SES-/HMAC-spezifisch) |
> | MT-4 Webhook `src/app/api/inbound/email/route.ts` | **ersetzt** durch IMAP-Cron; interne Validation/Persist-Logik wandert in `imap-sync.ts` |
> | MT-5 Lambda `infra/lambda/forward-ses-to-op-webhook/` + `scripts/deploy-lambda.sh` | **gelöscht** |
> | NEU | `src/lib/inbound-email/imap-sync.ts` (Port) + `api/cron/inbound-email-imap-sync/route.ts` + MIG-061 `email_inbound_sync_state` + `imapflow`-Dependency |
>
> **Vorteil:** Die LIVE-getesteten + ge-QA'ten Teile (Schema, Persist, Validation) überleben; nur der Transport (SES-Push → IMAP-Pull) wird getauscht und ist selbst ein Reuse aus BS. **Kein AWS-Sandbox-24h-Approval mehr nötig** — Live-Smoke gegen ein IONOS-Postfach ist sofort möglich. Details + MT-Decomposition in der /slice-planning-Revision.

### Context

V9.1 setzt auf V9 RELEASED (REL-030, 2026-06-07 STABLE) auf. V9 war episodische `.mbox`-Batch-Uploads durch den GF. V9.1 oeffnet den **kontinuierlichen Stream**: GF richtet einmalig eine Mail-Forward-Regel in seinem Mail-Client ein, Inbound-Vendor empfaengt forwarded-Mails ueber Tage/Wochen, die V9.0-Pipeline laeuft periodisch auf dem akkumulierten Korpus. Pipeline (Pre-Filter + Threading + PII + Pattern + Curation + Handbuch-Insert) bleibt **strukturell unveraendert** — nur die Trigger-Source wechselt von Upload-Action zu Continuous-Webhook-Stream + periodischem Pipeline-Trigger.

V9.1 schliesst die Friction-Luecke zwischen "operativem Wissen entsteht kontinuierlich" und "GF muss bewusst exportieren + uploaden". Per [[module-lifecycle-discipline]] + [[feedback-no-strategaize-live-until-all-systems-ready]] bleibt V9.1 strikt Internal-Test-Mode (Founder-only Pilot) — kein Customer-Outreach, kein Pilot-Multiplikator, kein Anwalts-Sign-off-Trigger.

5 neue Features: FEAT-075 Inbound-SMTP-Vendor + Catchall-Routing, FEAT-076 Forward-Validation-Layer + Spam-Defense, FEAT-077 Continuous-Cost-Cap-Service, FEAT-078 Storage-Retention-Cron, FEAT-079 Admin-Audit + Setup-UI mit Conversational-First.

Vendor + Validation-Approach sind bereits via DEC-194 (AWS SES Inbound Ireland eu-west-1) + DEC-195 (Synthetic-Corpus Ground-Truth-Labels) entschieden. /architecture V9.1 entscheidet die verbleibenden 5 Open Questions (Q-V9.1-B Cost-Cap-Modell + Q-V9.1-C Retention-Policy + Q-V9.1-D Forward-Validation + Q-V9.1-F Address-Routing + Q-V9.1-H Spam-Defense) und legt die Region-Drift-TIA-Dokumentation, das IAM-Policy-Layout, die Pflicht-Founder-Step-Liste und den MT-0-Skeleton-Validation-Plan fest.

### Architecture Summary

V9.1 fuegt **5 neue Schichten** ueber V9 hinzu — die V9-Pipeline-Stages 1-8 (Parse + Pre-Filter + Thread-Redact + Pattern-Extract + Curation + Handbuch-Import) bleiben 1:1 unveraendert (~80% V9-Code-Reuse erreicht):

1. **AWS SES Inbound Foundation** (External AWS-Resources, NICHT in App-Repo) — SES Receipt-Rule-Set in eu-west-1 (Ireland) catched `bulk.strategaizetransition.com`-Subdomain, schreibt Raw-Email in S3-Bucket `bulk-email-inbound-eu-west-1`, triggert SNS-Topic, SNS pusht an Lambda `forward-ses-to-op-webhook`, Lambda transformiert SES-Event in HMAC-signierten POST an `/api/inbound/email` der OP-App. Setup-Aufwand: ~2-4h einmalig, danach Standard-AWS-Operations. AWS-Standard-DPA bereits aktiv via bestehendes AWS-Account.

2. **InboundEmailVendor Adapter** (`src/lib/inbound-email/`) — Interface `InboundEmailVendor` + SES-Implementation (`vendors/aws-ses.ts`). Adapter-Pattern analog Bedrock-Client (DEC-194). Plan-B-Vendor Mailgun EU dokumentiert, kein Code, bei Bedarf 2-3 Wochen Vendor-Switch. Webhook-Endpoint `src/app/api/inbound/email/route.ts` ist Vendor-agnostisch — laedt Adapter aus ENV `INBOUND_VENDOR=ses-ireland`.

3. **Forward-Validation-Layer** (`src/lib/inbound-email/validation/`) — 3-Schicht-Defense gegen Spam / Unsolicited-PII / Fremd-Forwards. Schicht 1: SES-Built-In-Spam-Score (SES Receipt-Rule lehnt Spam vor S3-Persistierung ab). Schicht 2: Setup-Token-Validation (Mandatory in V9.1 — GF muss Token im Forward-Header `X-Strategaize-Forward-Token` setzen). Schicht 3: Optional Sender-Allowlist (Tenant pflegt erlaubte Forward-Source-Domains, Default-Off — wenn aktiv ueberprueft sie den Original-Header `From:`). DKIM-Re-Sign-Verifikation deferred V9.2+ (komplexer, externer DKIM-Resolver, ~2-3 Wochen Aufwand).

4. **Continuous-Cost-Cap-Service** (`src/lib/bulk-email/continuous-cost-cap.ts`) — Erweiterung der V9.0-Cost-Cap (`src/lib/bulk-email/cost-cap.ts`) um Continuous-Stream-Modell. Drei Schichten: Daily-Threshold (5 EUR/Tag/Tenant, Default), Monthly-Cap (100 EUR/Tenant/Monat, Reuse V9.0 DEC-182), Per-Email-Approval-Schwelle (>0.50 EUR/Email triggert Pre-Approval-Modal beim GF). Bei Threshold-Erreichung: Pipeline pausiert, GF bekommt Notification via Email + admin/audit/bulk-email Banner.

5. **Storage-Retention-Cron + Setup-UI** (`src/workers/retention/handle-bulk-email-retention-sweep.ts` + `src/app/dashboard/bulk-email-import/forward-setup/`) — Daily Coolify-Scheduled-Task loescht Raw-Emails nach Retention-Policy (60 Tage Soft-Delete + 90 Tage Hard-Delete, Default — per Tenant ENV-overridable). Idempotent: pruefe `email_pattern.imported_to_handbook_at IS NOT NULL` vor Hard-Delete (bereits in knowledge_unit eingespielte Pattern bleiben unangetastet). Setup-UI mit Conversational-First-Pattern ("Mit KI beschreiben"-Button), 4-Mail-Client-Anleitungen (Gmail / Outlook / Thunderbird / Apple Mail), Setup-Token-Display, DSGVO-Pflicht-Disclaimer, Test-Send-Button (End-to-End-Verifikation der Forward-Regel).

### Main Components

#### Component-Diagram (textuell)

```
+----------------------------------------------------------------------+
| V9.1 Continuous-Stream Forward-Bucket Pipeline                       |
|                                                                      |
| GF Mail-Client                                                       |
|   |                                                                  |
|   v  forward-rule: alle gesendeten Mails -> bulk-<slug>@bulk.*       |
|                                                                      |
| +========================== AWS eu-west-1 ===================+       |
| |  bulk.strategaizetransition.com  (MX -> SES Inbound)        |       |
| |        |                                                    |       |
| |        v                                                    |       |
| |  SES Receipt-Rule-Set "bulk-strategaize"                    |       |
| |    - Built-In-Spam-Reject (Schicht 1 Validation)            |       |
| |    - WriteToS3-Action                                       |       |
| |        |                                                    |       |
| |        v                                                    |       |
| |  S3 Bucket bulk-email-inbound-eu-west-1                     |       |
| |    Path: <tenant-slug>/<message-id>.eml                     |       |
| |        |                                                    |       |
| |        v  EventBridge / S3-Notification                     |       |
| |  SNS Topic ses-inbound-forward                              |       |
| |        |                                                    |       |
| |        v                                                    |       |
| |  Lambda forward-ses-to-op-webhook                           |       |
| |    - read S3-object                                         |       |
| |    - sign HMAC-SHA256 (shared secret)                       |       |
| |    - POST https://onboarding.strategaizetransition.com/     |       |
| |          api/inbound/email                                  |       |
| +=============================================================+       |
|                       |                                              |
|                       v  HMAC-signed POST                            |
|         +---------------------------------------+                    |
|         | /api/inbound/email (Webhook-Endpoint) |                    |
|         | - HMAC-verify (InboundEmailVendor)    |                    |
|         | - Schicht 2: Setup-Token-Validation   |                    |
|         | - Schicht 3: Sender-Allowlist (opt.)  |                    |
|         | - Tenant-Lookup via Local-Part        |                    |
|         | - PUT in bulk-email Bucket            |                    |
|         | - INSERT email_message                |                    |
|         | - email_bulk_run continuous-mode      |                    |
|         | - audit_log Entry                     |                    |
|         +---------------------------------------+                    |
|                       |                                              |
|                       v   silent-drop on validation-reject           |
|                       |   + INSERT email_validation_reject_log       |
|                       |                                              |
|         +---------------------------------------+                    |
|         | Periodischer Pipeline-Trigger          |                    |
|         | (Continuous-Cost-Cap + Threshold)      |                    |
|         |  - Daily 5 EUR / Monthly 100 EUR       |                    |
|         |  - Per-Email-Approval >0.50 EUR        |                    |
|         |  - Pause + GF-Notify on Threshold      |                    |
|         +---------------------------------------+                    |
|                       |                                              |
|                       v   trigger V9.0-Pipeline                      |
|         +---------------------------------------+                    |
|         | V9.0 Pipeline (UNVERAENDERT)          |                    |
|         |  Pre-Filter -> Thread-Redact ->       |                    |
|         |  Pattern-Extract -> Curation ->       |                    |
|         |  Handbuch-Import                      |                    |
|         +---------------------------------------+                    |
|                                                                      |
|         +---------------------------------------+                    |
|         | Daily Cron: handle-retention-sweep    |                    |
|         |  - 60d Soft-Delete (deleted_at set)   |                    |
|         |  - 90d Hard-Delete (S3 + DB)          |                    |
|         |  - idempotent: skip imported patterns |                    |
|         +---------------------------------------+                    |
+----------------------------------------------------------------------+
```

#### Component Responsibilities

| Component | Path | Responsibility |
|---|---|---|
| AWS SES Receipt-Rule-Set | AWS Console eu-west-1 | Catchall `bulk.*`, Spam-Reject, S3-Write |
| AWS S3 Bucket `bulk-email-inbound-eu-west-1` | AWS Console eu-west-1 | Raw-Email-Persistierung pro Tenant-Slug |
| AWS Lambda `forward-ses-to-op-webhook` | AWS Lambda eu-west-1 | S3-Read + HMAC-Sign + POST an OP-Webhook |
| Inbound-Webhook-Endpoint | `src/app/api/inbound/email/route.ts` | HMAC-Verify, Validation-Layer-Call, Tenant-Lookup, Storage-Persist, audit_log |
| InboundEmailVendor Adapter | `src/lib/inbound-email/vendors/aws-ses.ts` (+ `index.ts` factory) | Vendor-spezifische Event-Parsing + HMAC-Verify-Schema-Definition |
| Forward-Validation-Layer | `src/lib/inbound-email/validation/setup-token.ts` + `sender-allowlist.ts` | Setup-Token-Check + Optional Allowlist-Check |
| Tenant-Lookup-Service | `src/lib/inbound-email/tenant-lookup.ts` | Local-Part-Pattern `bulk-<slug>@bulk.*` -> Tenant-ID + email_inbound_endpoint-Row |
| Continuous-Cost-Cap-Service | `src/lib/bulk-email/continuous-cost-cap.ts` | Daily + Monthly + Per-Email-Approval-Logik. Wrapt V9.0 cost-cap.ts. |
| Pipeline-Trigger-Cron | `src/workers/inbound/handle-pipeline-trigger.ts` | Periodisch (z.B. stuendlich) pruefen: gibt es genug akkumulierte Emails pro Tenant? Cost-Cap OK? -> V9.0-Pipeline starten |
| Storage-Retention-Cron | `src/workers/retention/handle-bulk-email-retention-sweep.ts` | Daily 02:00 UTC: Soft-Delete bei >60d, Hard-Delete bei >90d, idempotent vs knowledge_unit |
| Setup-UI Forward-Setup | `src/app/dashboard/bulk-email-import/forward-setup/page.tsx` | Conversational-First "Mit KI beschreiben" + 4-Mail-Client-Anleitungen + Setup-Token-Display + DSGVO-Disclaimer + Test-Send-Button |
| Setup-UI Server-Actions | `src/app/dashboard/bulk-email-import/forward-setup/actions.ts` | `createInboundEndpoint`, `regenerateSetupToken`, `updateAllowlist`, `sendTestEmail`, `confirmDsgvoDisclaimer` |
| Admin-Audit-Erweiterung | `src/app/admin/audit/bulk-email/page.tsx` (Erweiterung V9.0) | Forward-Source-Statistik pro Tenant: Vendor + Inbound-Volume + Validation-Reject-Rate + Cost. Cross-Tenant-Aggregat fuer strategaize_admin. |

### Data Model / Storage Direction

V9.1 fuegt **3 neue Tabellen** + **2 ALTER-Erweiterungen** auf bestehenden V9-Tabellen hinzu. Pipeline-Tabellen (`email_message`, `email_thread`, `email_pattern`) bleiben strukturell unveraendert — V9.0-Pipeline-Code laeuft 1:1 weiter.

#### `email_inbound_endpoint` (Tenant -> Routing-Token-Map)

```sql
CREATE TABLE email_inbound_endpoint (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
  vendor                     text NOT NULL CHECK (vendor IN ('ses-ireland', 'mailgun-eu')),
  local_part                 text NOT NULL,                                    -- z.B. 'bulk-acme'
  domain                     text NOT NULL,                                    -- z.B. 'bulk.strategaizetransition.com'
  setup_token                text NOT NULL,                                    -- 32-byte URL-safe Random, GF setzt im Forward-Header
  setup_token_created_at     timestamptz NOT NULL DEFAULT now(),
  status                     text NOT NULL CHECK (status IN ('pending_setup', 'active', 'paused', 'revoked')) DEFAULT 'pending_setup',
  dsgvo_consent_text_version text NOT NULL,                                    -- Bezug auf COMPLIANCE.md-Version
  dsgvo_consent_accepted_at  timestamptz NOT NULL,                             -- GF-Disclaimer-Bestaetigung Audit
  dsgvo_consent_user_id      uuid NOT NULL,                                    -- FK auth.users (who bestaetigt)
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor, local_part, domain)
);

CREATE INDEX idx_email_inbound_endpoint_tenant ON email_inbound_endpoint(tenant_id);
CREATE INDEX idx_email_inbound_endpoint_lookup ON email_inbound_endpoint(local_part, domain) WHERE status = 'active';
```

Idempotenz-Story: UNIQUE-Constraint `(vendor, local_part, domain)` verhindert Doppel-Setup desselben Aliases. Setup-Token-Rotation per `regenerateSetupToken`-Action: UPDATE setup_token + setup_token_created_at, keine neue Row.

#### `email_forward_allowlist` (Optional Sender-Allowlist pro Tenant)

```sql
CREATE TABLE email_forward_allowlist (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants ON DELETE CASCADE,
  endpoint_id         uuid NOT NULL REFERENCES email_inbound_endpoint ON DELETE CASCADE,
  allowed_pattern     text NOT NULL,                                    -- Domain '*.example.com' oder Email 'specific@example.com'
  pattern_type        text NOT NULL CHECK (pattern_type IN ('domain', 'email')),
  enabled             boolean NOT NULL DEFAULT true,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL,                                     -- FK auth.users
  UNIQUE (endpoint_id, allowed_pattern)
);

CREATE INDEX idx_email_forward_allowlist_endpoint ON email_forward_allowlist(endpoint_id) WHERE enabled = true;
```

Semantik: Wenn **keine** Allowlist-Rows fuer einen Endpoint existieren -> Allowlist deaktiviert (Schicht 3 skipped). Wenn mindestens 1 Row existiert -> Allowlist aktiv, nur Mails mit `From:`-Header-Match passieren.

#### `email_validation_reject_log` (Audit pro Validation-Reject)

```sql
CREATE TABLE email_validation_reject_log (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid,                                            -- nullable: bei Pre-Tenant-Lookup-Reject
  endpoint_id          uuid REFERENCES email_inbound_endpoint ON DELETE SET NULL,
  vendor               text NOT NULL,
  recipient_local_part text,                                            -- bulk-acme
  recipient_domain     text,
  sender_address       text,                                            -- From:-Header (Klartext, kein Pseudonym — Audit-Pflicht)
  message_id           text,
  spam_score           numeric,                                         -- vendor-supplied score
  reject_layer         text NOT NULL CHECK (reject_layer IN (
                          'hmac_invalid', 'spam_score', 'setup_token_missing',
                          'setup_token_invalid', 'tenant_not_found',
                          'endpoint_inactive', 'allowlist_mismatch'
                        )),
  reject_reason        text,                                            -- frei-text Details
  raw_headers          jsonb,                                           -- vendor-supplied original Headers (Audit-Beweis)
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_validation_reject_log_tenant ON email_validation_reject_log(tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_email_validation_reject_log_reject_layer ON email_validation_reject_log(reject_layer, created_at DESC);
```

Persistierungs-Politik: Original-Sender-Adresse + Headers bleiben Klartext (Audit-Pflicht — DSGVO erlaubt bei Spam-Defense-Zweck). Body wird **nicht** persistiert (silent-drop). 90-Tage-Retention via separate Retention-Pass (analog email_message Hard-Delete).

#### ALTER `email_bulk_run` (V9-Tabelle)

```sql
ALTER TABLE email_bulk_run
  ADD COLUMN inbound_source       text NOT NULL DEFAULT 'mbox_upload' CHECK (inbound_source IN ('mbox_upload', 'forward_bucket')),
  ADD COLUMN endpoint_id          uuid REFERENCES email_inbound_endpoint ON DELETE SET NULL,
  ADD COLUMN retention_until      timestamptz,                                    -- 90d nach created_at
  ADD COLUMN deleted_at           timestamptz;                                    -- Soft-Delete (60d)

CREATE INDEX idx_email_bulk_run_retention ON email_bulk_run(retention_until) WHERE deleted_at IS NULL;
CREATE INDEX idx_email_bulk_run_inbound ON email_bulk_run(inbound_source, created_at DESC);
```

`inbound_source='forward_bucket'`-Rows haben `source_file_name='<endpoint>-continuous'` + `storage_path='bulk-email/<tenant_id>/<bulk_run_id>/continuous/'` (Subverzeichnis statt Single-File). Continuous-Mode: 1 bulk_run_id pro Tag pro Tenant pro endpoint (Daily-Roll-Over).

#### ALTER `email_message` (V9-Tabelle)

```sql
ALTER TABLE email_message
  ADD COLUMN raw_storage_path     text,                                          -- Pfad in bulk-email/<tenant_id>/forward-bucket/<endpoint_id>/<message_id>.eml
  ADD COLUMN retention_until      timestamptz,                                   -- 90d nach received_at
  ADD COLUMN deleted_at           timestamptz;                                   -- Soft-Delete (60d)

CREATE INDEX idx_email_message_retention ON email_message(retention_until) WHERE deleted_at IS NULL;
```

`raw_storage_path` ist nur bei `inbound_source='forward_bucket'` gesetzt — V9-mbox-Uploads haben weiter Single-File-Path im `email_bulk_run.storage_path`.

#### CHECK-Constraint-Extensions

```sql
-- ai_jobs.job_type erweitert um V9.1-Worker-Typen
ALTER TABLE ai_jobs DROP CONSTRAINT IF EXISTS ai_jobs_job_type_check;
ALTER TABLE ai_jobs ADD CONSTRAINT ai_jobs_job_type_check
  CHECK (job_type IN (
    /* ... 17 bestehende V9-Typen aus MIG-053/MIG-054/MIG-056 ... */
    'email_bulk_pipeline_trigger',         -- V9.1: periodischer Trigger
    'email_bulk_retention_sweep'           -- V9.1: Daily Retention-Cron
  ));

-- email_bulk_run.status erweitert um 'continuous' fuer Daily-Roll-Over-Run im Forward-Bucket-Modus
ALTER TABLE email_bulk_run DROP CONSTRAINT IF EXISTS email_bulk_run_status_check;
ALTER TABLE email_bulk_run ADD CONSTRAINT email_bulk_run_status_check
  CHECK (status IN (
    /* ... bestehende V9-Werte ... */
    'continuous'                           -- V9.1: noch nicht-getriggerter Forward-Bucket-Run (akkumuliert)
  ));
```

#### Storage-Bucket-Reuse: `bulk-email` (DEC-200)

V9.1 nutzt den bestehenden V9 `bulk-email`-Bucket. **Kein** neuer `bulk-email-inbound`-OP-Bucket — AWS S3-Bucket `bulk-email-inbound-eu-west-1` ist der primaere Raw-Email-Drop (AWS-Side), Lambda kopiert auf OP-Side in `bulk-email/<tenant_id>/forward-bucket/<endpoint_id>/<message_id>.eml`. Begruendung: Tenant-RLS-Pattern, Storage-Quota-Aggregation, Cost-Cap-Visibility, einheitliche Loesch-Cron-Logik.

Pfad-Konvention V9.1:
- `bulk-email/<tenant_id>/<bulk_run_id>/source.mbox` (V9 mbox-Upload, unveraendert)
- `bulk-email/<tenant_id>/forward-bucket/<endpoint_id>/<YYYY-MM-DD>/<message_id>.eml` (V9.1 continuous-stream, neuer Subbaum)

### Data Flow / Request Flow

#### Flow A: Inbound (AWS SES -> Webhook -> OP)

1. GF Mail-Client forwarded eine Email an `bulk-acme@bulk.strategaizetransition.com` (Original-`From:`-Header bleibt, neuer `To:`-Header bulk-Adresse, neuer `X-Strategaize-Forward-Token`-Header mit Setup-Token).
2. DNS-MX-Record `bulk.strategaizetransition.com` zeigt auf `inbound-smtp.eu-west-1.amazonaws.com` -> AWS SES Inbound-Server empfaengt.
3. SES Receipt-Rule "bulk-strategaize" matched Wildcard `*@bulk.strategaizetransition.com`, prueft Built-In-Spam-Score (SES-Default `spam-action: REJECT` bei Score > Threshold). Bei Spam: SMTP-550-Reject, nichts in S3, nichts an OP. Sender bekommt Bounce-Mail (SES-Standard).
4. Bei Pass: SES schreibt Raw-Email als `<message-id>.eml` in S3-Bucket `bulk-email-inbound-eu-west-1` mit Path-Prefix `<recipient-local-part>/...`.
5. S3-Notification triggert SNS-Topic `ses-inbound-forward`.
6. SNS pusht JSON-Payload an Lambda `forward-ses-to-op-webhook` (Lambda-Invocation pro Email, max ~10s Laufzeit).
7. Lambda liest S3-Object, berechnet HMAC-SHA256-Signatur ueber Body mit shared secret `INBOUND_WEBHOOK_HMAC_SECRET` (in AWS Secrets Manager), POSTet `{ raw_eml_base64, s3_key, message_id, recipient }` an `https://onboarding.strategaizetransition.com/api/inbound/email` mit Headers `X-Strategaize-Signature: sha256=...` + `X-Strategaize-Vendor: ses-ireland`.
8. OP-Webhook `src/app/api/inbound/email/route.ts` verifiziert HMAC -> bei Mismatch: INSERT email_validation_reject_log (reject_layer='hmac_invalid') + 401-Response.
9. Vendor-Adapter parsed Raw-Email (mailparser-Reuse V9). Extract Headers: `To:` (Recipient = `bulk-acme@bulk.*`), `From:` (Original-Sender), `X-Strategaize-Forward-Token:` (Setup-Token), `Message-ID:`.
10. Tenant-Lookup-Service zerlegt `To:`-Local-Part `bulk-acme` -> SELECT FROM email_inbound_endpoint WHERE local_part='bulk-acme' AND domain='bulk.strategaizetransition.com' AND status='active'. Bei kein Match: INSERT reject_log (reject_layer='tenant_not_found') + 200-OK (silent-drop, kein Bounce). Bei status='paused' oder 'revoked': INSERT reject_log (reject_layer='endpoint_inactive') + 200-OK.
11. Setup-Token-Validation: `X-Strategaize-Forward-Token`-Header vs endpoint.setup_token (constant-time compare). Bei Mismatch: INSERT reject_log + 200-OK silent-drop.
12. Optional Sender-Allowlist (wenn min. 1 enabled Row in email_forward_allowlist fuer den Endpoint): pruefe `From:` gegen alle enabled patterns (Domain-Match `*.example.com` oder Email-exact). Kein Match: INSERT reject_log + 200-OK.
13. Pass: Service-Role-Client schreibt Raw-Email in OP `bulk-email`-Bucket unter `bulk-email/<tenant_id>/forward-bucket/<endpoint_id>/<YYYY-MM-DD>/<message_id>.eml`. INSERT email_message-Row mit `tenant_id`, `bulk_run_id` (Daily-Roll-Over-Run), `message_id`, `raw_storage_path`, `from_address`, etc.
14. INSERT/UPDATE `email_bulk_run` Daily-Roll-Over: SELECT bulk_run WHERE tenant_id + endpoint_id + DATE(created_at)=today AND status='continuous'. Wenn keine: INSERT mit `inbound_source='forward_bucket'`, `status='continuous'`. Wenn ja: UPDATE email_count += 1.
15. INSERT audit_log (event_type='email_inbound_received', tenant_id, payload={message_id, sender_domain, endpoint_id, vendor}). 200-OK an Lambda. Lambda S3-Object kann via Lifecycle-Policy nach 7 Tagen geloescht werden (OP hat Kopie).

#### Flow B: Periodischer Pipeline-Trigger (Cron -> V9.0-Pipeline)

1. Coolify-Scheduled-Task feuert stuendlich `POST /api/cron/email-bulk-pipeline-trigger` mit `CRON_SECRET`-Header.
2. Cron-Handler iteriert ueber alle `email_bulk_run` WHERE `inbound_source='forward_bucket'` AND `status='continuous'`.
3. Pro Tenant: Continuous-Cost-Cap-Check (siehe Flow C). Bei Hit (Daily oder Monthly): skip, log.
4. Pro Run: Pruefe Trigger-Bedingung — z.B. `email_count >= EMAIL_BULK_TRIGGER_MIN_COUNT` (Default 25) ODER `DATE(created_at) < today` (Daily-Roll-Over).
5. Bei Trigger: UPDATE status='continuous' -> 'parsing'. Enqueue `email_bulk_parse`-Job in ai_jobs (V9-Worker laeuft 1:1). V9-Pipeline laeuft Stufen 2-8 ohne Aenderung.
6. Per-Email-Approval-Schwelle (>0.50 EUR/Email Schaetzung) ist in V9-Pre-Cost-Estimate (`pattern-start/page.tsx`) bereits implementiert — Trigger fuer GF-Modal sind V9.1-konfigurierbare ENVs.

#### Flow C: Continuous-Cost-Cap-Check (Service Layer)

```typescript
// src/lib/bulk-email/continuous-cost-cap.ts
export async function checkContinuousCostCap(tenantId: string): Promise<CapCheckResult> {
  const today = new Date().toISOString().substring(0, 10);
  const month = today.substring(0, 7);

  // Daily-Check
  const { data: daily } = await admin
    .from('vw_bulk_email_cost_daily')
    .select('total_cost_eur')
    .eq('tenant_id', tenantId)
    .eq('day', today)
    .maybeSingle();

  if ((daily?.total_cost_eur ?? 0) >= EUR_CAP_DAILY) {
    return { allowed: false, reason: 'daily_cap_hit', cap: EUR_CAP_DAILY, actual: daily.total_cost_eur };
  }

  // Monthly-Check (V9-Reuse vw_bulk_email_cost_monthly DEC-182)
  const { data: monthly } = await admin
    .from('vw_bulk_email_cost_monthly')
    .select('total_cost_eur')
    .eq('tenant_id', tenantId)
    .eq('month', month)
    .maybeSingle();

  if ((monthly?.total_cost_eur ?? 0) >= EUR_CAP_MONTHLY) {
    return { allowed: false, reason: 'monthly_cap_hit', cap: EUR_CAP_MONTHLY, actual: monthly.total_cost_eur };
  }

  return { allowed: true };
}
```

ENV-Defaults (DEC-197): `V91_BULK_EMAIL_DAILY_CAP_EUR=5`, `V91_BULK_EMAIL_MONTHLY_CAP_EUR=100`, `V91_BULK_EMAIL_PER_EMAIL_APPROVAL_THRESHOLD_EUR=0.5`. Per-Tenant-Override via Tenant-Settings JSONB deferred V9.1.x.

#### Flow D: Retention-Cron (Daily)

**RUN-LEVEL (DEC-208, korrigiert gegen as-built MIG-058):** Die Retention-Spalten `retention_until` + `soft_delete_at` leben auf `email_bulk_run`, NICHT auf `email_message` (das nur `raw_storage_path`/`received_at` traegt). `email_message.bulk_run_id` ist FK ON DELETE CASCADE. OP hat kein `audit_log` — Audit via `error_log`.

1. Coolify-Scheduled-Task feuert taeglich 02:00 UTC `POST /api/cron/bulk-email-retention-sweep` mit CRON_SECRET (Header `x-cron-secret`).
2. Soft-Delete-Phase: UPDATE email_bulk_run SET soft_delete_at=now() WHERE created_at < now()-`softDeleteDays` (Default 60d) AND soft_delete_at IS NULL.
3. Hard-Delete-Phase: SELECT email_bulk_run WHERE created_at < now()-`hardDeleteDays` (Default 90d) AND soft_delete_at IS NOT NULL. Per Run: pruefe `isRunImportedToHandbook` (knowledge_unit WHERE source='email_bulk' AND metadata->>'bulk_run_id' = run.id). Bei pass (kein Import): DELETE Storage-Objekte aller email_message (bulk-email Bucket Path) -> DELETE FROM email_bulk_run (CASCADE entfernt email_message-Rows). Bei imported: log skip, behalt Run (auch ueber 90d). Storage-Fehler -> Run behalten, naechster Sweep-Retry (kein Orphan).
4. INSERT error_log (level='info', message='email_retention_sweep_run', metadata={runs_evaluated, soft_deleted_runs, hard_deleted_runs, skipped_imported, deleted_storage_objects, storage_errors, policy, duration_ms}).

### External Dependencies

#### Neue Dependencies

- **AWS SES Inbound** in eu-west-1 (Ireland) — neue AWS-Service-Aktivierung. Region-Drift gegenueber Bedrock eu-central-1 ist akzeptiert (DEC-196 Region-Drift-TIA, beide EU). DPA: AWS-Standard-DPA via bestehendes AWS-Account.
- **AWS S3 Bucket** `bulk-email-inbound-eu-west-1` mit Lifecycle-Policy 7d (Lambda-Side, NICHT OP-Side). Separates Bucket vom bestehenden AWS-S3-Usage (Logs etc).
- **AWS SNS Topic** `ses-inbound-forward` — triggert Lambda. Default-Settings, kein Encryption noetig (kein PII im SNS-Payload, nur S3-Object-Reference).
- **AWS Lambda** `forward-ses-to-op-webhook` (Node 20 Runtime, 256 MB Memory, 30s Timeout). Code: ~50 LOC + npm deps fuer SDK + HMAC. Deploy via AWS Console oder kleines `infra/lambda/`-Subverzeichnis im OP-Repo.
- **AWS IAM Role** `op-ses-inbound-forwarder` — Permissions: `s3:GetObject` auf `bulk-email-inbound-eu-west-1/*`, `sns:Subscribe` auf `ses-inbound-forward`, `secretsmanager:GetSecretValue` auf `INBOUND_WEBHOOK_HMAC_SECRET`. Trust-Policy: nur Lambda-Service.
- **AWS Secrets Manager Entry** `INBOUND_WEBHOOK_HMAC_SECRET` (32-byte Random). Lambda liest beim Cold-Start. OP-App liest via ENV (Coolify-Secret) — beide Werte muessen synchron sein.

#### Reused Dependencies

- **Bedrock eu-central-1** (Frankfurt) — Haiku + Sonnet, unveraendert.
- **mailparser ^3.7.0** — V9-Reuse, kein neuer Versions-Pin.
- **Coolify Scheduled-Tasks** — bestehender Cron-Mechanismus, neue Eintraege fuer pipeline-trigger + retention-sweep.

#### Plan-B Vendor

Mailgun EU Frankfurt — bei AWS-Lambda-Komplexitaet oder Vendor-Wechsel-Bedarf. Geschaetzter Wechsel-Aufwand: ~2-3 Wochen (neuer Adapter `vendors/mailgun-eu.ts`, neue HMAC-Schema, MX-Record-Update, DEC mit Migration-Plan).

### Security / Privacy

#### Cross-Region-TIA (DEC-196)

Bedrock LLM-Calls (Haiku + Sonnet) laufen in Frankfurt eu-central-1. Inbound-Email-Storage liegt Ireland eu-west-1 (SES + S3 + Lambda). Beide AWS-Regions in der EU. Kein Dritt-Land-Transfer, kein TIA-Risiko nach EuGH Schrems II. Im DSGVO-Audit + COMPLIANCE.md dokumentiert als "Cross-Region innerhalb EU mit AWS-Standard-DPA + AWS-Europe-SARL-EU-Subsidiary-Vertrag (Bedrock-Praezedenz V5)".

#### Webhook-Auth (HMAC)

Webhook-Endpoint nutzt HMAC-SHA256 mit Shared Secret. Secret-Rotation-Plan: Quartalsweise per Founder-Maintenance-Window (synchron AWS Secrets Manager + Coolify-ENV neu). Kein Sliding-Window noetig in V9.1 — Cold-Start bei beiden Seiten reicht.

#### Tenant-RLS

Alle 3 neuen V9.1-Tabellen (`email_inbound_endpoint`, `email_forward_allowlist`, `email_validation_reject_log`) tragen Tenant-RLS via Standard-Helper `auth_tenant_id() = tenant_id`. `email_validation_reject_log` mit `tenant_id IS NULL`-Rows (Pre-Tenant-Lookup-Reject) nur fuer strategaize_admin lesbar.

#### Rollen-Matrix V9.1

| Rolle | email_inbound_endpoint | email_forward_allowlist | email_validation_reject_log | bulk-email-Bucket (V9.1-Subbaum) |
|---|---|---|---|---|
| strategaize_admin | ALL (Cross-Tenant) | ALL | ALL | ALL |
| tenant_admin | OWN-TENANT INS/SEL/UPD | OWN-TENANT INS/SEL/UPD/DEL | OWN-TENANT SEL | OWN-TENANT R |
| tenant_member | KEIN ACCESS V9.1 | KEIN ACCESS | KEIN ACCESS | KEIN ACCESS |
| employee | KEIN ACCESS V9.1 | KEIN ACCESS | KEIN ACCESS | KEIN ACCESS |

V9.2+: Multi-Mitarbeiter-Erweiterung bringt employee-INSERT-Rechte (per [[feedback-v87b-switch-true-internal-test-mode-without-anwalt]] aequivalent: Anwalts-Sign-off vor Customer-Live).

#### Spam-Defense 3-Schicht (DEC-201)

| Schicht | Mechanismus | Ort | Default |
|---|---|---|---|
| 1 | SES Built-In-Spam-Score-Reject | AWS Receipt-Rule | aktiv (SES-Default, kein Override) |
| 2 | Setup-Token X-Strategaize-Forward-Token | OP-Webhook (`src/lib/inbound-email/validation/setup-token.ts`) | aktiv, Pflicht |
| 3 | Sender-Allowlist (Domain oder Email exact) | OP-Webhook (`src/lib/inbound-email/validation/sender-allowlist.ts`) | inaktiv per Default, Tenant-optional |

Eigene Spam-Heuristik (Subject-Pattern-Block, Bayesian-Score) deferred V9.2+.

#### Disclaimer + Audit-Trail-Pflicht (DSGVO)

- Setup-UI fordert vor Aktivierung explizite GF-Bestaetigung der DSGVO-Pflicht-Disclaimer-Sentence (z.B. "Ich bestaetige, dass ich die weitergeleiteten Emails verarbeiten und an Strategaize uebermitteln darf"). `email_inbound_endpoint.dsgvo_consent_*`-Felder dokumentieren Version + Timestamp + User unloeschbar.
- audit_log-Event `email_inbound_received` pro empfangener Mail (mit `sender_domain` als Hash + `endpoint_id`, kein Klartext-Sender).
- audit_log-Event `email_validation_rejected` pro Reject (mit reject_layer als facet).
- audit_log-Event `email_retention_sweep_run` pro Daily-Cron mit Aggregat-Counts.
- 7-Jahre-Aufbewahrung der audit_log-Eintraege analog V8.1 (Reuse).

### Constraints und Tradeoffs

| Trade-off | Entscheidung | Begruendung |
|---|---|---|
| AWS SES Lambda vs Mailgun Direct-Webhook | Lambda akzeptiert | DEC-194 Cost + DPA + V9.0-mailparser-Reuse |
| Region-Drift Frankfurt vs Ireland | Akzeptiert | DEC-196: beide EU, kein TIA |
| Setup-Token vs DKIM-Verify | Setup-Token in V9.1, DKIM V9.2+ | Setup-Token = 1-Tag-Bauzeit, DKIM = ~2-3 Wochen + externer Resolver |
| Optional Sender-Allowlist Default-Off | Akzeptiert | UX-Friction-Reduktion: GF kann ohne Allowlist-Pflege starten, V9.1.x kann Default-On werden |
| Daily-Roll-Over Continuous-Run vs Pro-Email-Run | Daily-Roll-Over | Reduziert ai_jobs-Volumen 100x, Pipeline-Trigger orientiert sich an Threshold + Cost-Cap |
| Soft-Delete vor Hard-Delete | 60d + 90d | DEC-198: GF-Reverse-Window 30d, Storage-Wachstums-Begrenzung |
| OP-Side S3 vs Direkt-S3-Read-from-Worker | OP-Side bulk-email-Bucket | Tenant-RLS + Cost-Aggregation + Loesch-Cron-Konsistenz |
| Continuous-Mode in V9-email_bulk_run vs neue Tabelle | ALTER existing | Reuse V9-Pipeline-Trigger-Logik, Pre-Cost-Estimate-UI, Curation-UI |

### V9.1 Open Questions Resolution

Alle Open-Questions sind in /architecture entschieden. Cross-Reference in DECISIONS.md:

| Q | Frage | Entscheidung | DEC |
|---|---|---|---|
| Q-V9.1-A | Vendor-Wahl | AWS SES Inbound Ireland eu-west-1 | DEC-194 (vor /architecture) |
| Q-V9.1-B | Continuous-Cost-Cap-Modell | Daily 5 EUR + Monthly 100 EUR (V9-Reuse) + Per-Email-Approval > 0.50 EUR | DEC-197 |
| Q-V9.1-C | Storage-Retention-Policy | 60d Soft-Delete + 90d Hard-Delete, Per-Tenant ENV-overridable | DEC-198 |
| Q-V9.1-D | Forward-Validation-Mechanik | Setup-Token (Mandatory) + Optional Sender-Allowlist + DKIM-Verify deferred V9.2+ | DEC-199 |
| Q-V9.1-E | Pre-Filter-Quality-Gate | keine harte Schwelle, Telemetry-Justierung post-deploy | DEC-195 (vor /architecture) |
| Q-V9.1-F | Address-Routing | Catchall `bulk-<tenant-slug>@bulk.strategaizetransition.com` | DEC-200 |
| Q-V9.1-G | Persona-Reinheit | GF-only V9.1, Multi-Mitarbeiter V9.2+ | PRD-Closure (vor /architecture) |
| Q-V9.1-H | Spam-Defense-Tiefe | 3-Schicht (SES Built-In + Setup-Token + Optional Allowlist), eigene Heuristik V9.2+ | DEC-201 |
| Q-V9.1-Region-Drift | Cross-Region-TIA Frankfurt ↔ Ireland | EU-intra-Region: kein TIA-Risiko, DPA-konform | DEC-196 |

### Pflicht-Founder-Step-Liste (AWS + DNS Setup)

Diese Steps muessen **VOR** SLC-V9.1-A `/backend` durchgefuehrt sein. Geschaetzter Aufwand: 2-4h. Bei Bedarf assistiert der Agent im AWS-Console-Walkthrough (per Screenshare oder Schritt-fuer-Schritt).

#### Step 1: DNS-Vorbereitung (~30 Min)

1. Bei DNS-Provider (vermutlich Hetzner DNS oder Strato): Subdomain `bulk.strategaizetransition.com` als CNAME oder direkter Subdomain-Eintrag anlegen.
2. SES Domain-Verification: in AWS-SES-Console Region `eu-west-1` -> Identities -> Create Identity -> Domain `bulk.strategaizetransition.com` -> SES generiert `_amazonses.bulk.*` TXT-Record. **TXT-Record bei DNS-Provider eintragen.** Verifikation dauert ~5-30 Min.
3. SES generiert DKIM-Records (3 CNAME-Records `_<token>._domainkey.bulk.*`). **Alle 3 CNAME-Records bei DNS-Provider eintragen** (auch wenn DKIM-Re-Sign-Verifikation erst V9.2+ aktiv ist — DKIM-Setup jetzt erspart spaeter Re-Verification).
4. SPF-Record auf `bulk.strategaizetransition.com` (TXT `v=spf1 include:amazonses.com -all`). Optional aber empfohlen.

#### Step 2: AWS SES Receipt-Rule-Set (~30 Min)

1. AWS SES Console -> eu-west-1 -> Email Receiving -> Rule Sets -> Create new "bulk-strategaize-active".
2. Receipt-Rule "catchall-bulk":
   - Recipient: `bulk.strategaizetransition.com` (Wildcard)
   - Actions: (a) Spam-Action `BOUNCE`, (b) S3-Action -> Bucket `bulk-email-inbound-eu-west-1` (created in Step 3), Prefix `inbound/`, KMS-Encryption optional.
3. Set Rule Set as `active`.
4. MX-Record bei DNS-Provider eintragen: `bulk.strategaizetransition.com` MX 10 `inbound-smtp.eu-west-1.amazonaws.com`. **Pflicht — ohne MX kein Empfang.**
5. SES Sandbox-Mode pruefen — bei neuen AWS-Accounts ist SES initial in Sandbox (kein Production-Receiving). Ggf. Production-Access-Request stellen (Standard-Approval ~24h).

#### Step 3: AWS S3 Bucket + Lifecycle (~15 Min)

1. AWS S3 Console -> eu-west-1 -> Create Bucket `bulk-email-inbound-eu-west-1`.
2. Settings: Block all public access (aktiv), Versioning disabled (kein Bedarf), Default-Encryption SSE-S3.
3. Bucket-Policy: SES darf Write (`AWS:SourceAccount=<aws-account-id>`, SES-Service als Principal). Lambda darf Read (siehe IAM Step 5).
4. Lifecycle-Policy: Rule "delete-after-7-days" auf Prefix `inbound/` -> Expiration nach 7 Tagen (Lambda forwarded an OP, OP haelt eigene Kopie im Coolify-S3-equivalent / Supabase-Storage).

#### Step 4: AWS Secrets Manager (~5 Min)

1. AWS Secrets Manager -> eu-west-1 -> Create Secret `INBOUND_WEBHOOK_HMAC_SECRET`.
2. Value: 32-byte URL-safe Random (z.B. via `openssl rand -hex 32`).
3. **Gleichen Value als ENV `INBOUND_WEBHOOK_HMAC_SECRET` im Coolify OP-Service eintragen** (sync-Pflicht).

#### Step 5: AWS IAM Role + Lambda Deployment (~30-60 Min, Agent-Assist empfohlen)

1. IAM Role `op-ses-inbound-forwarder`:
   - Trust-Policy: Service `lambda.amazonaws.com`
   - Permissions: `AWSLambdaBasicExecutionRole` + Custom-Policy {s3:GetObject auf `bulk-email-inbound-eu-west-1/*`, secretsmanager:GetSecretValue auf `INBOUND_WEBHOOK_HMAC_SECRET`}
2. Lambda Function `forward-ses-to-op-webhook`:
   - Runtime: Node 20.x
   - Architecture: arm64 (Cost-Optimierung)
   - Memory: 256 MB, Timeout: 30s
   - Code: aus `infra/lambda/forward-ses-to-op-webhook/` (wird in SLC-V9.1-A MT-X angelegt, dann ZIP-Deploy via `aws lambda update-function-code`)
   - Environment: `OP_WEBHOOK_URL=https://onboarding.strategaizetransition.com/api/inbound/email`, `HMAC_SECRET_ARN=<secret-arn>`
3. SNS Topic `ses-inbound-forward` -> Subscription: Protocol `lambda`, Endpoint `<lambda-arn>`. Lambda muss SNS-Invoke-Permission haben (auto-set via Console).
4. S3-Bucket-Event-Notification: bei ObjectCreated -> SNS Topic `ses-inbound-forward` mit Prefix `inbound/`.

#### Step 6: OP-Coolify-ENVs (~5 Min)

```bash
# .env.deploy.example (V9.1)
INBOUND_VENDOR=ses-ireland
INBOUND_WEBHOOK_HMAC_SECRET=<32-byte-hex>           # AWS Secrets Manager synchron
INBOUND_CATCHALL_DOMAIN=bulk.strategaizetransition.com
V91_BULK_EMAIL_DAILY_CAP_EUR=5
V91_BULK_EMAIL_MONTHLY_CAP_EUR=100
V91_BULK_EMAIL_PER_EMAIL_APPROVAL_THRESHOLD_EUR=0.5
V91_RETENTION_SOFT_DELETE_DAYS=60
V91_RETENTION_HARD_DELETE_DAYS=90
V91_BULK_EMAIL_TRIGGER_MIN_COUNT=25
```

Coolify -> OP-Service -> Environment-Variables -> alle obigen Werte setzen + Redeploy. **Vorbehalt: Setup-Steps 1-5 muessen vor SLC-V9.1-A MT-1-Live-Smoke abgeschlossen sein.**

### IAM-Policy-Layout

#### Lambda-Function-Role `op-ses-inbound-forwarder`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadInboundS3",
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::bulk-email-inbound-eu-west-1/inbound/*"
    },
    {
      "Sid": "ReadHmacSecret",
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:eu-west-1:<account-id>:secret:INBOUND_WEBHOOK_HMAC_SECRET-*"
    },
    {
      "Sid": "Logs",
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "arn:aws:logs:eu-west-1:<account-id>:log-group:/aws/lambda/forward-ses-to-op-webhook:*"
    }
  ]
}
```

#### S3-Bucket-Policy `bulk-email-inbound-eu-west-1`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSESWrite",
      "Effect": "Allow",
      "Principal": { "Service": "ses.amazonaws.com" },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::bulk-email-inbound-eu-west-1/inbound/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceAccount": "<account-id>",
          "AWS:SourceArn": "arn:aws:ses:eu-west-1:<account-id>:receipt-rule-set/bulk-strategaize-active:receipt-rule/catchall-bulk"
        }
      }
    },
    {
      "Sid": "AllowLambdaRead",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::<account-id>:role/op-ses-inbound-forwarder" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::bulk-email-inbound-eu-west-1/inbound/*"
    }
  ]
}
```

#### SNS-Topic-Policy `ses-inbound-forward`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowS3Publish",
      "Effect": "Allow",
      "Principal": { "Service": "s3.amazonaws.com" },
      "Action": "SNS:Publish",
      "Resource": "arn:aws:sns:eu-west-1:<account-id>:ses-inbound-forward",
      "Condition": {
        "ArnLike": { "aws:SourceArn": "arn:aws:s3:::bulk-email-inbound-eu-west-1" },
        "StringEquals": { "aws:SourceAccount": "<account-id>" }
      }
    },
    {
      "Sid": "AllowLambdaSubscribe",
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": ["SNS:Subscribe", "SNS:Receive"],
      "Resource": "arn:aws:sns:eu-west-1:<account-id>:ses-inbound-forward"
    }
  ]
}
```

### MT-0 Skeleton-Validation-Plan gegen synthetic.yaml

V9.1 nutzt **DEC-195 Synthetic-Corpus** als Skeleton-Validation-Metric (KEINE harte Gate-Schwelle per Q-V9.1-E DECIDED). MT-0 wird als erster Micro-Task in SLC-V9.1-A platziert.

#### Implementation

```
tests/integration/v91-pre-filter/
  ├── corpus-to-eml.ts                      # YAML -> .eml conversion helper
  ├── synthetic-corpus-validation.test.ts   # Vitest run
  └── README.md                              # Run-Instruction + Telemetry-Doc
```

#### `corpus-to-eml.ts` (Reuse-Quelle)

```typescript
// Liest test-fixtures/v91-mbox-corpus/synthetic.yaml, baut RFC-5322-MIME-Strings
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

export interface CorpusEntry {
  id: string;
  expected_classification: 'valuable' | 'skip';
  expected_pattern: string | null;
  reasoning: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
}

export function loadCorpus(path: string): CorpusEntry[] {
  const raw = readFileSync(path, 'utf-8');
  return parseYaml(raw).corpus;
}

export function entryToEml(entry: CorpusEntry): string {
  return [
    `Message-ID: <synthetic-${entry.id}@bulk.strategaizetransition.com>`,
    `Date: ${new Date(entry.date).toUTCString()}`,
    `From: ${entry.from}`,
    `To: ${entry.to}`,
    `Subject: ${entry.subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    '',
    entry.body,
  ].join('\r\n');
}
```

#### `synthetic-corpus-validation.test.ts` (Skeleton-Validation)

```typescript
import { describe, it, expect } from 'vitest';
import { loadCorpus, entryToEml } from './corpus-to-eml';
import { invokeBedrockHaikuPreFilter } from '@/lib/ai/bedrock-haiku/email-pre-filter';

const CORPUS = loadCorpus('test-fixtures/v91-mbox-corpus/synthetic.yaml');

describe('V9.1 Pre-Filter Skeleton-Validation (DEC-195)', () => {
  it('runs Haiku-Pre-Filter against synthetic corpus and reports Precision/Recall/F1', async () => {
    const results = [];
    for (const entry of CORPUS) {
      const eml = entryToEml(entry);
      const out = await invokeBedrockHaikuPreFilter(eml, { tenantId: 'test-tenant', useMock: false });
      results.push({
        id: entry.id,
        expected: entry.expected_classification,
        actual: out.label === 'content' ? 'valuable' : 'skip',
        confidence: out.confidence,
        cost_eur: out.cost_eur,
      });
    }

    // Aggregate Precision/Recall/F1 vs ground truth
    const tp = results.filter(r => r.expected === 'valuable' && r.actual === 'valuable').length;
    const fp = results.filter(r => r.expected === 'skip' && r.actual === 'valuable').length;
    const fn = results.filter(r => r.expected === 'valuable' && r.actual === 'skip').length;
    const tn = results.filter(r => r.expected === 'skip' && r.actual === 'skip').length;

    const precision = tp / (tp + fp);
    const recall = tp / (tp + fn);
    const f1 = (2 * precision * recall) / (precision + recall);
    const totalCost = results.reduce((s, r) => s + r.cost_eur, 0);

    console.log('=== V9.1 Skeleton-Validation Telemetry ===');
    console.log(`Corpus-Size: ${results.length}`);
    console.log(`Precision: ${precision.toFixed(3)}`);
    console.log(`Recall: ${recall.toFixed(3)}`);
    console.log(`F1: ${f1.toFixed(3)}`);
    console.log(`Total Cost: ${totalCost.toFixed(4)} EUR`);
    console.log(`Per-Email-Cost: ${(totalCost / results.length).toFixed(4)} EUR`);

    // Soft-Gate: warn if F1 < 0.7, no test fail
    if (f1 < 0.7) {
      console.warn(`[WARN] F1 < 0.7 — Consider IMP-Carry-Over to V9.1.x for Telemetry-based Justification`);
    }

    // Always-Pass — Skeleton-Validation, not Gate
    expect(results.length).toBe(45);
  }, 600_000); // 10min timeout for 45 Bedrock-Calls
});
```

#### Outputs MT-0

- Console-Log mit Precision/Recall/F1 + Total-Cost + Per-Email-Cost
- README.md mit Re-Run-Instruction (gated via ENV `RUN_V91_SKELETON_VALIDATION=true`, kein CI-Auto-Run wegen Live-Bedrock-Cost)
- BL-Carry-Over zu V9.1.x falls F1 < 0.7 oder Per-Email-Cost ueber DEC-179-V9-Schaetzung (>0.0002 EUR Haiku)

### Slice-Empfehlung

Geschaetzt **3-4 Slices, ~2-3 Wochen Implementations-Zeit**. Cumulative-Single-Branch-Worktree `v9-1-forward-bucket-email` analog V8.1/V9 (Worktree-Pattern aus [[feedback-worktree-npm-install-not-symlink]] BLOCKING — echtes `npm install`, kein Symlink).

#### Final-Empfehlung Slice-Bundling (Architecture-Review nach DEC-194..201)

PRD-Slice-Sketch (4 Slices) bleibt der Default. **SLC-V9.1-A bleibt das groesste Slice** und buendelt FEAT-075 + FEAT-076 (Inbound-Foundation + Validation-Layer). FEAT-077 (Continuous-Cost-Cap) und FEAT-078 (Retention-Cron) sind eigene Slices (klare Trennung Cost-Logic vs Retention-Logic, separate Test-Surfaces). FEAT-079 (Setup-UI + Admin-Audit-Erweiterung) ist das letzte Slice.

| Slice | Scope | Pre-Conditions | Aufwand |
|---|---|---|---|
| SLC-V9.1-A | FEAT-075 + FEAT-076 — AWS-Setup (Founder-Steps 1-6) + Webhook-Endpoint + HMAC-Verify + Tenant-Lookup + Validation-Layer + Storage-Persist + 3 neue Tabellen + MT-0 Skeleton-Validation | Founder-Steps 1-6 (AWS Console + DNS), DEC-194..201 entschieden | ~1 Woche (Setup-Steps + 4-5 MTs) |
| SLC-V9.1-B | FEAT-077 — Continuous-Cost-Cap-Service: Daily + Monthly + Per-Email-Approval-Logik + GF-Notification + Pipeline-Pause | SLC-V9.1-A DONE | ~3-4 Tage |
| SLC-V9.1-C | FEAT-078 — Storage-Retention-Cron: Daily-Coolify-Task + Soft/Hard-Delete + Idempotency-Check vs knowledge_unit | SLC-V9.1-A DONE | ~2-3 Tage |
| SLC-V9.1-D | FEAT-079 — Setup-UI mit Conversational-First + 4-Mail-Client-Anleitungen + DSGVO-Disclaimer + Test-Send + Admin-Audit-Erweiterung Forward-Source-Statistik | SLC-V9.1-A + B + C DONE | ~3-5 Tage |

Reihenfolge linear A → B → C → D. SLC-V9.1-A enthaelt MT-0 (Synthetic-Corpus-Validation) als ersten Schritt (parallel zu AWS-Setup-Founder-Steps).

### V9.1 Technische DECs (Cross-Reference)

| Frage | Entscheidung | DEC | Datum |
|---|---|---|---|
| Q-V9.1-A Vendor | AWS SES Inbound Ireland eu-west-1 | DEC-194 | 2026-06-06 |
| Pre-Filter-Validation-Approach | Synthetic-Corpus Ground-Truth-Labels | DEC-195 | 2026-06-09 |
| Region-Drift Frankfurt ↔ Ireland TIA | EU-intra-Region, kein TIA | DEC-196 | 2026-06-09 |
| Q-V9.1-B Continuous-Cost-Cap-Modell | Daily 5 + Monthly 100 + Per-Email >0.50 EUR | DEC-197 | 2026-06-09 |
| Q-V9.1-C Storage-Retention | 60d Soft + 90d Hard, Per-Tenant ENV | DEC-198 | 2026-06-09 |
| Q-V9.1-D Forward-Validation | Setup-Token Mandatory + Optional Allowlist, DKIM V9.2+ | DEC-199 | 2026-06-09 |
| Q-V9.1-F Address-Routing | Catchall `bulk-<slug>@bulk.*` | DEC-200 | 2026-06-09 |
| Q-V9.1-H Spam-Defense | 3-Schicht, eigene Heuristik V9.2+ | DEC-201 | 2026-06-09 |

### Migration-Plan V9.1

| MIG | Scope | Bezug |
|---|---|---|
| MIG-057 | 3 neue Tabellen + RLS + ai_jobs.job_type-CHECK + email_bulk_run.status-CHECK | SLC-V9.1-A MT-1 |
| MIG-058 | ALTER email_bulk_run + email_message: inbound_source + retention_until + deleted_at + raw_storage_path + Indizes | SLC-V9.1-A MT-2 |

Beide Migrationen idempotent (DROP CONSTRAINT IF EXISTS + CREATE INDEX IF NOT EXISTS Pattern). Apply via `sql-migration-hetzner.md` Standard. Coolify-Postgres-Container-Name dynamisch resolven (kein Hardcode per IMP-497).

### V9.1-Reuse-Standard

Eine V9.1-Implementation ist regelkonform wenn:

- AWS SES Inbound laeuft in eu-west-1 (Audit per Region-Check im CI-Test)
- HMAC-Webhook-Verify ist constant-time (kein Timing-Attack)
- Setup-Token-Generierung nutzt `crypto.randomBytes(32)` mit URL-safe-Base64 (kein Math.random)
- Validation-Reject INSERTs in email_validation_reject_log werden mit `try/catch` swallowed (kein Webhook-Fail bei Audit-INSERT-Fail) per [[feedback-audit-helper-admin-client-pattern]]
- Tenant-RLS auf allen 3 neuen Tabellen + 4-Rollen-Matrix in Pen-Test verifiziert
- Continuous-Cost-Cap-Service nutzt V9-Vw-bulk_email_cost_monthly + neue Vw-bulk_email_cost_daily (kein Duplikat)
- Retention-Cron pruft email_pattern.imported_to_handbook_at vor Hard-Delete (Idempotency)
- Setup-UI nutzt Conversational-First-Pattern (Mit-KI-beschreiben-Button) per [[feedback-strategaize-conversational-first-ux]]
- Lambda-Code in `infra/lambda/forward-ses-to-op-webhook/` mit `package.json` + Lock-File (kein implizites Dep-Drift)
- MT-0 Skeleton-Validation-Test laeuft erfolgreich mit synthetic.yaml und loggt Precision/Recall/F1
- DSGVO-Disclaimer-Audit in email_inbound_endpoint persistiert (dsgvo_consent_text_version + accepted_at + user_id)
- Audit-Trail vollstaendig: inbound_received + validation_rejected + retention_sweep_run + setup_token_regenerated + dsgvo_disclaimer_confirmed
- Per-Email-Approval-Modal erscheint bei >0.50 EUR-Schaetzung (V9-Reuse + V9.1-Threshold)
- Pipeline-Trigger-Cron pausiert Pipeline bei Cost-Cap-Hit + sendet GF-Notification

**Naechster Schritt: /slice-planning V9.1** — SLC-V9.1-A/B/C/D Slice-Files mit Micro-Task-Decomposition + AC-Matrizen + Aufwand-Schaetzung. Pre-Conditions fuer /backend V9.1-Start:
1. Founder-Steps 1-6 (AWS Console + DNS) durchgefuehrt + dokumentiert
2. AWS Secrets Manager `INBOUND_WEBHOOK_HMAC_SECRET` + OP-Coolify-ENV synchron
3. SES-Sandbox-Production-Access-Request gestellt (~24h)
4. Worktree `v9-1-forward-bucket-email` mit echtem `npm install` per IMP-1112 BLOCKING

## V9.5 Architecture Addendum — Bulk-Import Deep-Extraction (Cross-Thread-Synthese + Critic-Gate) (RPT-454, 2026-06-12)

Quelle: /discovery RPT-452 + /requirements RPT-453 (PRD §"V9.5"). Entscheidet Q-V9.5-A..E (→ DEC-214..218), skizziert MIG-111, entwirft die Synthese-/Critic-Prompts **frisch** (Prinzip-Reuse aus `condensation/*`, KEIN Code-1:1). Alle Befunde code-grounded (Files unten zitiert).

### 1. Architektur-Summary

V9.5 fuegt **eine additive Stage** in den bestehenden Bulk-Pfad ein, zwischen `pattern_extracted` und `curating`. Der flache Per-Thread-Extraktor (`handle-pattern-extraction-job.ts`) bleibt im Kern unveraendert; er produziert weiter rohe `email_pattern`-Rows. Die neue Stage liest **alle** rohen Patterns eines Runs, partitioniert sie deterministisch nach `suggested_section`, ruft pro Section **einen** Sonnet-Synthese-Call (Dedup/Merge/Evidenz-Aggregation/Frequenz-Gewichtung), danach **einen** Sonnet-Critic-Call ueber die konsolidierte Menge (Verwerfen von trivial/unbelegt/halluziniert), und persistiert die ueberlebenden Units in eine **neue Tabelle `email_synthesized_unit`** (+ Provenance-Join). Die GF-Curation kuratiert dann diese konsolidierten Units statt der n flachen Fragmente. Kosten bleiben bounded (fixe 2 LLM-Phasen, gleicher Hard-Cost-Cap).

Kern-Prinzip: **bounded, nicht konvergent.** Anders als `iteration-loop.ts` (2–8 Iterationen bis `ACCEPTED`) ist V9.5 eine fixe 1+1-Pass-Pipeline ohne Konvergenz-Loop — das vermeidet Runaway-Kosten und passt zur SLC-167-Cost-Cap-Philosophie.

### 2. Hauptkomponenten

| Komponente | Verantwortung | Status |
|---|---|---|
| `email_synthesized_unit` (neue Tabelle) | Konsolidierte Kandidaten-Units; spiegelt die curierbaren Felder von `email_pattern` + Aggregat-Felder (`evidence_count`, `source_pattern_ids`, `synthesis`-Provenance) | NEU (MIG-111) |
| `email_synthesized_unit_source` (Join) | Provenance: `(unit_id, pattern_id, thread_id)` — welche rohen Patterns/Threads belegen die Unit | NEU (MIG-111) |
| `email_bulk_synthesis` Worker (`handle-synthesis-job.ts`) | Claim-Loop-Job: Partition → Synthese-Call(s) → Critic-Call → Filter → Persist → Status-Flip; Live-Cap-Check | NEU |
| `bedrock-sonnet/email-synthesis.ts` + `-prompt.ts` | Frische Synthese-Pure-Function (analog `email-pattern.ts`-Struktur, eigener Prompt + zod-Schema) | NEU |
| `bedrock-sonnet/email-critic.ts` + `-prompt.ts` | Frische Critic-Pure-Function (Verdict KEEP/REJECT pro Unit) | NEU |
| Cost-Cap-Erweiterung (`cost-cap.ts`) | `getRunTotalCostEur(runId)` (liest `total_cost_eur`) + Live-Total-Cap-Check fuer die Synthese-Stage | ERWEITERT |
| Curation-UI + `importAcceptedPatterns` (`curation/actions.ts`) | Liest/promotet `email_synthesized_unit` statt `email_pattern`; knowledge_unit-INSERT-Contract unveraendert | ANGEPASST (DEC-214-Folge) |
| Per-Thread-Extraktor (`handle-pattern-extraction-job.ts`) | Kern unveraendert; **+1 Enqueue-Statement** am Success-Tail (enqueued `email_bulk_synthesis`) | MINIMAL-TOUCH |
| 4 Modell-Default-Files (FEAT-082) | eu-Sonnet-4 / aktuelle eu-Haiku Defaults; ENV-Override-Mechanik unveraendert | GEAENDERT |

### 3. Daten-Flow (Status-Maschine)

```
pattern_extracting --(Extraktor, KERN UNVERAENDERT)--> pattern_extracted
        |
        |  Extraktor enqueued am Success-Tail einen email_bulk_synthesis ai_job  (1 Statement)
        v
  [Worker email_bulk_synthesis]
        status: pattern_extracted --> synthesizing
        1. SELECT email_pattern WHERE bulk_run_id=X  (id, title, description, evidence_snippets, themes, confidence, suggested_section, thread_id)
        2. Partition nach suggested_section (NULL/'andere' -> eigene Gruppe)
        3. pro Section: 1 Sonnet-Synthese-Call -> Draft-Units (source_pattern_ids, evidence_count, merged evidence, aggregated_confidence)
        4. 1 Sonnet-Critic-Call ueber alle Draft-Units -> Verdict KEEP/REJECT + reason je Unit
        5. Filter: drop wenn evidence_count < 2 ODER verdict=REJECT
        6. INSERT email_synthesized_unit (+ email_synthesized_unit_source) — pro Unit atomar
        7. nach jedem LLM-Call: synthesis_cost_eur += cost (UPDATE) + Live-Cap-Check (total_cost_eur vs runCap) -> bei Hit status=failed
        status: synthesizing --> synthesized
        v
  curating  (Curation-UI listet email_synthesized_unit; Guard akzeptiert jetzt 'synthesized'/'curating')
        v
  importing --> completed   (importAcceptedPatterns: accepted/edited synthesized_unit -> knowledge_unit; Snapshot-Trigger unveraendert)
```

`email_bulk_run.status` CHECK wird um **`synthesizing`, `synthesized`** erweitert (MIG-111).

### 4. Decisions (Q-V9.5-A..E)

- **DEC-214 (Q-A) — Repraesentation: NEUE Tabelle `email_synthesized_unit`** (Option a). Entscheidend code-grounded, nicht nur Sauberkeit:
  - `email_pattern.thread_id` ist **`NOT NULL` Single-FK** (MIG-106 Z.230). Eine konsolidierte Unit spannt n Threads → kann nicht in `email_pattern` leben ohne `thread_id` nullable zu machen.
  - **Pseudonyme P1/P2 sind thread-lokal** (`email_thread.participant_pseudonyms`, MIG-106 Z.199). Der Promotion-Mapper macht `pseudonymMap.get(pattern.thread_id)` **pro einzelnem Thread** (`curation/actions.ts:718,806`). Cross-Thread-Merge mischt disjunkte Pseudonym-Namensraeume (P1 in Thread A ≠ P1 in Thread B) → die konsolidierte Unit MUSS thread-agnostisch beschrieben werden + Evidenz pro-Snippet quellenattribuiert. Das ist eine genuin andere Entitaet, keine `email_pattern`-Variante. → In-Place (Option b) ist nicht nur invasiv, sondern semantisch gebrochen.
- **DEC-215 (Q-B) — Granularitaet: deterministische Partition nach `suggested_section`, ein Synthese-Call pro Section-Gruppe.** `suggested_section` (V4.1-Pfad) ist die Theme-Achse, die bereits auf jedem Pattern liegt → deterministisch, bounded Payload pro Call, kohaerente Cross-Thread-Reichweite innerhalb eines Themas. Kein LLM-getriebenes Clustering (Nicht-Determinismus), kein Single-Giant-Call (Context-Blowup bei grossen Runs). `NULL`/`'andere'` → eigene Gruppe.
- **DEC-216 (Q-C) — Bounded-Passes: 1 Synthese + 1 Critic, EIN Worker, zwei sequentielle LLM-Phasen.** Accept-Kriterium: Unit verworfen wenn `evidence_count < 2` ODER Critic-Verdict `REJECT`. Keine Konvergenz, harte Obergrenze (Synthese 1 Call/Section, Critic 1 Call/Run). Minimale Status-Maschine (2 neue Werte), Cost-Cap an einer Stelle.
- **DEC-217 (Q-D) — Cost: neue Spalte `synthesis_cost_eur numeric(8,4)`; `total_cost_eur` GENERATED erweitert auf `pre_filter + pattern_extraction + synthesis`.** Der Synthese-Worker inkrementiert `synthesis_cost_eur` nach jedem LLM-Call und prueft Live-Cap gegen `total_cost_eur` (volle Run-Kosten) vs `V9_BULK_EMAIL_RUN_CAP_EUR`. Der Extraktor bleibt auf `pattern_extraction_cost_eur` (unveraendert).
- **DEC-218 (Q-E) — Modell-Cleanup: alle 4 Files** auf eu-inference-profile-Default, ENV-Override unveraendert. v8-1-augmentation priorisiert (latent-broken).

### 5. Migrations-Skizze (MIG-111 → `sql/migrations/119_v95_synthesis_stage.sql`)

1. `ALTER TABLE email_bulk_run` Status-CHECK um `'synthesizing'`, `'synthesized'` erweitern (Drop+Add, idempotent).
2. `ADD COLUMN synthesis_cost_eur numeric(8,4) NOT NULL DEFAULT 0;` + **DROP+RECREATE** der GENERATED-Spalte `total_cost_eur` (eine generierte Spalte kann ihren Ausdruck nicht per ALTER aendern) auf `(pre_filter_cost_eur + pattern_extraction_cost_eur + synthesis_cost_eur) STORED`.
3. `CREATE TABLE email_synthesized_unit` — `id, tenant_id NOT NULL FK tenants, bulk_run_id NOT NULL FK email_bulk_run ON DELETE CASCADE, title, description, evidence_snippets jsonb, themes text[], aggregated_confidence numeric(3,2), evidence_count int NOT NULL, suggested_section text, curation_status default 'pending_curation' CHECK(pending_curation|accepted|rejected|edited), curated_section, curator_user_id FK auth.users, curated_at, imported_to_handbook_at, imported_knowledge_unit_id FK knowledge_unit ON DELETE SET NULL, created_at`. (Spiegelt die curierbaren `email_pattern`-Felder → Curation-UI-Anbindung ist ein Near-Clone, kein Rewrite.)
4. `CREATE TABLE email_synthesized_unit_source` — `(id, synthesized_unit_id NOT NULL FK email_synthesized_unit ON DELETE CASCADE, pattern_id NOT NULL FK email_pattern ON DELETE CASCADE, thread_id uuid, tenant_id NOT NULL)` + `UNIQUE(synthesized_unit_id, pattern_id)`.
5. RLS auf beide neue Tabellen analog MIG-106-Matrix (`strategaize_admin` SELECT cross-tenant; `tenant_admin` SELECT/INSERT/UPDATE own-tenant via `auth.user_role()` + `auth.user_tenant_id()`); GRANTs authenticated + service_role; Indizes auf `(bulk_run_id)`, `(bulk_run_id, curation_status)`, `(tenant_id)`.
- Apply-Pattern: `sql-migration-hetzner.md` (base64 → `psql -U postgres`). LIVE-Apply ist /backend-Sache, nicht /architecture.

### 6. Synthese-Prompt-Entwurf (frisch — System, gekuerzt)

> Du bist ein Geschaeftsanalyst. Du erhaeltst **bereits extrahierte** Email-Pattern-Fragmente eines Unternehmens (alle aus demselben Themenbereich) und verdichtest sie zu **konsolidierten Handbuch-Bausteinen**. Mehrere Fragmente, die dieselbe wiederkehrende Aussage/Entscheidung/Antwort belegen, werden zu **einer** Unit gemerged.
> **Vorgaben:** (1) Schreibe jede konsolidierte `description` **thread-agnostisch** und generisch ("der Kunde", "wir") — die Eingabe-Pseudonyme P1/P2 sind thread-lokal und ueber Fragmente hinweg NICHT vergleichbar; uebernimm KEINE P1/P2-Token in die Ausgabe. (2) Strategaize-Wir-Voice, sachlich, verkaufsfrei, keine Pricing-Hinweise. (3) Aggregiere Evidenz: jede Unit listet `source_pattern_ids` (die belegenden Eingabe-Pattern-IDs) + `evidence_count` (Anzahl distinkter belegender Patterns) + bis zu 5 repraesentative `evidence_snippets` (jeweils mit `source_pattern_id` getaggt). (4) `aggregated_confidence` = belegdichte-gewichtet, nicht naives Mittel. (5) Verwirf bei der Synthese noch nichts — Trivialitaet/Halluzination prueft der Critic.
> **Strict-JSON:** `{ "units": [ { "title", "description", "themes":[…], "suggested_section", "source_pattern_ids":[…], "evidence_count":N, "evidence_snippets":[{ "text", "source_pattern_id" }], "aggregated_confidence":0.0-1.0 } ] }`. Beginne mit `{`, ende mit `}`.

User-Prompt: Section-Name + JSON-Array der kompakten Patterns der Gruppe (`id, title, description, evidence_snippets, themes, confidence, thread_id`).

### 7. Critic-Prompt-Entwurf (frisch — System, gekuerzt)

> Du bist ein **kritischer Pruefer** konsolidierter Handbuch-Bausteine. Du erhaeltst die synthetisierten Units und gibst pro Unit ein Verdict. **`REJECT`** wenn: trivial / nicht durch die Evidenz belegt (Halluzination) / redundant zu einer anderen Unit / `evidence_count < 2`. Sonst **`KEEP`**. Keine Umformulierung, nur Urteil + knappe Begruendung.
> **Strict-JSON:** `{ "verdicts": [ { "unit_ref": <index>, "verdict": "KEEP"|"REJECT", "reason": "…" } ] }`.

Worker-Filter: `KEEP && evidence_count>=2` ueberlebt; Rest verworfen (geloggt fuer Reduktions-Statistik).

### 8. Modell-Cleanup (FEAT-082) — konkrete Targets

| File:Line | Aktueller Default | Ziel |
|---|---|---|
| `src/lib/ai/bedrock-sonnet/email-pattern.ts:51` | `anthropic.claude-3-5-sonnet-20241022-v2:0` | `eu.anthropic.claude-sonnet-4-20250514-v1:0` (= condensation-Core, `iteration-loop.ts:21`) |
| `src/lib/bulk-email/ai-assisted-setup.ts:24` | `anthropic.claude-3-5-sonnet-20241022-v2:0` | `eu.anthropic.claude-sonnet-4-20250514-v1:0` |
| `src/lib/llm/v8-1-augmentation/augment.ts:44-46` | `anthropic.claude-3-5-sonnet-20241022-v2:0` (latent-broken) | `eu.anthropic.claude-sonnet-4-20250514-v1:0` — **priorisiert** |
| `src/lib/ai/bedrock-haiku/index.ts:42` | `anthropic.claude-3-haiku-20240307-v1:0` | aktuelle eu-Haiku Inference-Profile (`eu.anthropic.claude-haiku-*`) — **exakte ID + Pricing-Konstanten /backend-Sache** |

Pricing-Hinweis: Sonnet-4 = Sonnet-3.5 Bedrock-Pricing ($3/$15) → die `COST_PER_*_TOKEN`-Konstanten der Sonnet-Files bleiben. **Haiku-Tier-Wechsel aendert das Pricing** → bedrock-haiku Cost-Konstanten muessen im /backend mit-aktualisiert werden (R4). Exakte Bedrock-eu-Modell-IDs verifiziert das /backend gegen `claude-api`-Skill + Bedrock-eu-central-1-Verfuegbarkeit; ENV-Override (`BEDROCK_V9_*_MODEL_ID`) bleibt das Sicherheitsnetz.

### 9. Security / Privacy

- Alle Synthese-/Critic-Calls ueber Bedrock **eu-central-1** (data-residency.md), `ai_cost_ledger`-Audit mit Region+Modell-ID+Cost+`job_id`, roles `email_bulk_synthesis` / `email_bulk_critic`.
- Der Synthese-Worker ist ein **echter Claim-Loop-Job** → er hat eine regulaere `ai_jobs`-Row ueber das normale Enqueue; das **synthetic-ai_jobs-INSERT-Pattern (backend.md) entfaellt** (das gilt nur fuer synchrone Nicht-Worker-Calls). `ai_cost_ledger.job_id` = die Synthese-Job-ID.
- Pseudonyme P1/P2 duerfen NICHT in `email_synthesized_unit.description` landen (thread-lokal, Re-Identifikations-/Verwechslungs-Risiko) — im Synthese-Prompt verboten, in /qa zu pruefen.
- Tenant-RLS auf beide neue Tabellen; Cross-Tenant-Read-Pen-Test in /qa (SC-V9.5-8).

### 10. Constraints & Tradeoffs

- **Cost-Cap-Leak (R2, BLOCKING):** Synthese-Calls MUESSEN unter den Run-Hard-Cap fallen → Live-Cap auf `total_cost_eur` (DEC-217). Ohne das umgeht ein grosser Run den Cap.
- **Over-Merge (R3):** zu aggressives Dedup verliert Nuance. Mitigation: `evidence_count>=2`-Schwelle + Critic-`REJECT` fuer Redundanz, NICHT fuer Merge-Aggressivitaet; Merge-Schwelle bewusst konservativ (lieber 2 Units als 1 ueber-gemergte). /qa-Vorher-Nachher-Fixture.
- **SC-V9.5-7 Nuance:** der Extraktor-Algorithmus + Cost-Loop bleibt unveraendert; **eine** Enqueue-Zeile am Success-Tail ist der einzige Touch. Im Completion-Report/QA als bewusster Minimal-Touch zu fuehren, nicht als „0 Touch".
- **Curation-Contract-Shift (R5, DEC-214-Folge):** Curation-UI-Query + `importAcceptedPatterns`-Status-Guard + Source-Tabelle wechseln auf `email_synthesized_unit`. Der knowledge_unit-INSERT + Snapshot-Trigger bleiben strukturell; nur die Multi-Thread-Pseudonym-Assembly entfaellt (Pseudonyme werden in der Synthese bereits entfernt → der Promotion-Mapper braucht den Single-`thread_id`-Pseudonym-Lookup nicht mehr).

### 11. Offene technische Punkte (→ /slice-planning)

- **OQ-1 (Enqueue-Punkt):** Extraktor-Success-Tail vs continuous-pipeline-trigger (V9.1) vs .mbox-start-action. Empfehlung: Extraktor-Tail (uniform fuer beide Run-Typen, da beide ueber den Extraktor zu `pattern_extracted` laufen). /slice-planning fixiert.
- **OQ-2 (Slice-Schnitt):** SLC-V9.5-A Modell-Cleanup → SLC-V9.5-B Synthese-Stage (Migration+Worker+Curation-Anbindung) → SLC-V9.5-C Critic-Phase. Pruefen, ob B+C als 1 Slice sinnvoll (ein Worker, Critic ist nur eine zweite LLM-Phase + Filter vor Persist).
- **OQ-3 (Curation-UI-Tiefe):** zeigt die UI nur die konsolidierten Units oder auch Drill-Down auf die rohen `email_pattern` via `email_synthesized_unit_source`? V9.5-Default: konsolidierte Units curieren; Drill-Down optional/read-only.
- **OQ-4 (Re-Run-Idempotenz):** Synthese-Worker-Idempotenz bei Re-Run (skip wenn `email_synthesized_unit` fuer `bulk_run_id` existiert, analog Extraktor-thread_id-Skip).

### 12. Empfohlener naechster Schritt

`/slice-planning V9.5` — SLC-V9.5-A/B/C mit Micro-Task-Decomposition, AC-Matrizen, Cumulative-Single-Branch-Worktree `v9-5-bulk-deep-extraction`. Pre-Cond (Koordination, kein Code-Block): V9.1 `/post-launch` T+24h STABLE.

## V9.7 Architecture Addendum — OKF Handbuch-Export (Concept-Emitter + Bundle-Assembly, RPT-471, 2026-06-15)

### 1. Architektur-Zusammenfassung

V9.7 macht den OP-Unternehmerhandbuch-Snapshot zusaetzlich als **OKF-v0.1-Bundle** (Google Open Knowledge Format) nach **Strategaize-OKF-Profil 1.0** verfuegbar. Der bestehende narrative Handbuch-Renderer (`renderHandbook` → `handbuch/`-Ordner) bleibt **byte-fuer-byte unveraendert** (alongside, SC-V9.7-10). Ein neuer **isolierter Emitter** (`src/lib/handbook/okf/*`) serialisiert jede kuratierte Wissens-Row (`knowledge_unit`, `block_diagnosis`, `sop`) in **eine** OKF-Concept-`.md` (fein-granular), assembliert sie zu einem Bundle (root `index.md` + `log.md` + Section-Ordner) und validiert das Ergebnis programmatisch. Beide Ordner (`handbuch/` + `okf/`) liegen im **selben Download-ZIP**.

**Grundsatz (BLOCKING, aus `strategaize-okf-profile.md`):** OKF ist Export-/Serialisierungs-Schicht, KEIN Storage. Postgres bleibt System-of-Record. **0 DB-Migrationen, 0 neue Tabellen, 0 neue Dependencies, 0 neue ENVs, 0 neue Cron-Jobs.** Alle OKF-Felddetails leben ausschliesslich im `okf/`-Modul (Isolation, SC-V9.7-7).

### 2. Hauptkomponenten + Verantwortlichkeiten

| Komponente | Pfad (Vorschlag /slice-planning) | Art | Verantwortung |
|---|---|---|---|
| OKF-Concept-Emitter (FEAT-083) | `src/lib/handbook/okf/emit.ts` | NEU | Pure Functions `emitKnowledgeUnitConcept` / `emitDiagnosisConcept` / `emitSopConcept` (Row → `{path, content}`); Frontmatter-Serializer (nutzt `yaml`); `type`-Mapper; `confidence`-Mapper; Body-Render; Cross-Link-Aufloesung |
| OKF-Concept-Typen | `src/lib/handbook/okf/types.ts` | NEU | `OkfConcept`, Frontmatter-Shape — gekapselt im Modul (Isolation) |
| Bundle-Assembly (FEAT-084) | `src/lib/handbook/okf/bundle.ts` | NEU | `assembleOkfBundle(concepts, ctx)` → `Record<path,content>` inkl. root `index.md` (mit `okf_version`/`strategaize_okf_profile`, Section-gruppierte Bullet-Form) + `log.md` (Creation-Eintrag) |
| Konformitaets-Check (FEAT-084) | `src/lib/handbook/okf/conformance.ts` (+ Test) | NEU | `checkOkfConformance(files)` → `{ok, violations[]}`; parst Frontmatter via `yaml`; prueft SC-V9.7-1..5 programmatisch; **TDD-RED zuerst** |
| Worker-Integration | `src/workers/handbook/handle-snapshot-job.ts` | GEAENDERT | Loader-SELECTs erweitern (generische Felder); nach `renderHandbook` additiv `emit`+`assemble`+`conformance`; OKF-Files an ZIP-Builder uebergeben. Worker-Kern bleibt OKF-agnostisch (ruft nur das isolierte Modul) |
| Shared-Types | `src/workers/handbook/types.ts` | GEAENDERT | `KnowledgeUnitRow`/`DiagnosisRow`/`SopRow` um `evidence_refs` + `updated_at` (+ KU `created_at`) erweitern — generische Row-Felder, KEINE OKF-Details |
| ZIP-Builder | `src/workers/handbook/zip-builder.ts` | GEAENDERT | Mehrere benannte Folder-Sets in EIN ZIP (`handbuch/` + `okf/`); rueckwaerts-kompatible Signatur (`files`+`rootFolder` bleibt) |

### 3. Daten-/Storage-Richtung

**Keine Schema-Aenderung.** Quellen sind die bereits vom Snapshot-Worker geladenen Tabellen. Live-Schema-Grounding (2026-06-15, Coolify-DB):

| Tabelle | OKF-`type` | Identitaet (`strategaize_id`) | `timestamp` | `confidence` | `curation_status` | Citations-Quelle |
|---|---|---|---|---|---|---|
| `knowledge_unit` | `unit_type` → finding/risk/action/observation (`ai_draft`→observation, DEC-224) | `id` | `updated_at` | `confidence` text-enum low/medium/high **1:1** (DEC-224) | `status` proposed/accepted/edited **1:1** | `evidence_refs` jsonb — **PII, NICHT als Citations** (DEC-223) |
| `block_diagnosis` | `diagnosis` (1 Concept/Row, DEC-222) | `id` | `updated_at` | — (Spalte fehlt) | confirmed→accepted (nur confirmed emittiert) | — |
| `sop` | `sop` | `id` | `updated_at` | — | — (kein status) | — |

`strategaize_source: op` (fix), `strategaize_tenant: <snapshot.tenant_id>` je Concept. `tags` in V9.7 **weggelassen** (es gibt keine `themes`-Spalte; kontrolliertes Tag-Vokabular kommt V9.8/BL-505, DEC-224).

**Bundle-Layout im ZIP (DEC-220/221/222):**
```
<snapshot>.zip
├── handbuch/            ← UNVERAENDERT (narrativer Renderer)
│   ├── INDEX.md
│   └── NN_section.md
└── okf/                 ← NEU (OKF-Bundle, self-contained = Bundle-Root)
    ├── index.md         (frontmatter: okf_version "0.1" + strategaize_okf_profile "1.0"; Bullet-Form gruppiert nach Section)
    ├── log.md           (1 Creation-Eintrag fuer diesen Snapshot)
    └── <section-key>/
        ├── finding-<slug>-<id8>.md
        ├── diagnosis-<id8>.md
        └── sop-<slug>-<id8>.md
```
Cross-Links sind bundle-root-absolut relativ zum `okf/`-Root (z.B. `/A/diagnosis-1a2b3c4d.md`) → stabil bei Verschieben. Kein per-Section Container-File in V9.7 (`handbook-section`-Type bleibt registriert-aber-ungenutzt, DEC-221).

### 4. Request-/Daten-Flow

```
handbook_snapshot_generation Job (bestehender Worker-Claim-Loop)
  → load (erweiterte SELECTs: + evidence_refs, + updated_at)
  → renderHandbook(...)              → files["handbuch/*"]      (UNVERAENDERT)
  → [NEU] emit pro Row              → OkfConcept[]              (post-Filter: KU=block-review-gefiltert, diagnosis=confirmed, sop=alle)
  → [NEU] assembleOkfBundle(...)    → files["okf/*"]
  → [NEU] checkOkfConformance(okf)  → ok|violations (Verhalten bei Verstoss = OQ §9.1)
  → buildHandbookZip({handbuch, okf}) → 1 ZIP
  → Storage-Upload (bestehend) + UPDATE handbook_snapshot
Download: GET /api/handbook/[snapshotId]/download  (UNVERAENDERT — selber Endpoint, ZIP-Inhalt erweitert)
```

### 5. Externe Abhaengigkeiten / Integrationen

Keine neuen. `yaml@^2.9.0` (bereits Dependency) fuer Frontmatter-Serialize/Parse; `archiver@^7.0.1` (bereits) fuer ZIP. Kein Bedrock-Call (Emitter ist deterministisch, $0 — konsistent mit DEC-038). Spec-Drift-Absicherung via bestehendem Cron `okf-spec-watch` (monatlich, Dev-System) + Rule `okf-spec-monitoring.md`.

### 6. Security / Privacy

- **DSGVO (SC-V9.7-9) — kritischer Grounding-Befund:** OP-`evidence_refs` sind Walkthrough-Provenance-Objekte `{recorded_by_user_id, walkthrough_session_id}` — reine UUIDs, **`recorded_by_user_id` ist Personenbezug**, kein menschenlesbarer Citation-Text. Sie werden NICHT in `# Citations` gerendert (kein PII-Leak, kein Nutzwert). Nur `evidence_count` (Zahl) landet im Frontmatter. (DEC-223)
- Bundle ist tenant-scoped (`strategaize_tenant`); Download laeuft ueber den bestehenden RLS-gegateten `rpc_get_handbook_snapshot_path` + Next.js-Proxy (unveraendert). `strategaize_tenant` = Tenant-UUID (Metadaten, kein Personenbezug).
- Emitter laeuft service-role im Worker (wie der bestehende Renderer) — keine neue Exposure.

### 7. Constraints & Tradeoffs

- **Content-Paritaet (Tradeoff):** OKF-Bundle und narratives Handbuch werden aus DERSELBEN kuratierten Session gezogen, aber das OKF-Selektionskriterium ist explizit (KU post-block-review-filter; diagnosis `status='confirmed'`; sop alle) und repliziert NICHT die per-Section `min_status`-Logik des narrativen Renderers. Exakte 1:1-Mengengleichheit ist ein dokumentiertes Nicht-Ziel von V9.7 (DEC-225). Risiko gering (beide aus curated data); falls spaeter exakte Paritaet gefordert: shared Selector.
- **log.md single-entry:** Snapshots sind immutable Point-in-Time-Exporte ohne kumulierte Historie → `log.md` enthaelt einen Creation-Eintrag pro Generierung. Cross-Snapshot-History waere Persistenz (out of scope).
- **Fail-Verhalten:** Empfehlung **weiche Degradation** — der OKF-Emitter laeuft additiv NACH erfolgreichem narrativen Render; ein OKF-Fehler/Konformitaets-Verstoss → `error_log` + ZIP ohne `okf/`-Ordner (narratives Handbuch = Kern-Deliverable bricht NIE). Alternative (harter Job-Fail) waere strenger, riskiert aber den Handbuch-Download wegen eines Export-Wrapper-Bugs. Endgueltig in /slice-planning (§9.1).

### 8. Aufgeloeste Open Questions (Q-V9.7-A..E)

- **Q-A (Packaging):** selber Download-ZIP, zweiter Ordner `okf/`, kein neuer Endpoint → **DEC-220**.
- **Q-B (Container-Files):** keine `handbook-section`-Container; root `index.md` gruppiert nach Section → **DEC-221**.
- **Q-C (Naming/Ordner):** Section-Ordner + deterministische Filenames `<type>-<slug>-<id8>.md`; bundle-root-absolute Cross-Links → **DEC-221**.
- **Q-D (block_diagnosis):** 1 Concept pro Row (subtopics als Body-Subsections), NICHT pro Subtopic (Subtopics haben keine eigene UUID-Identitaet fuer `strategaize_id`) → **DEC-222**.
- **Q-E (evidence_refs → Citations):** OP-evidence_refs sind PII-UUIDs ohne Citation-Text → `# Citations` in V9.7 weggelassen, nur `evidence_count` → **DEC-223**.
- **Grounding-Korrekturen am Proposal/Profil:** confidence text-enum 1:1 (kein numeric-threshold-Mapping fuer OP-KU); `ai_draft`→observation; `tags`/`themes` → V9.8/BL-505 (keine `themes`-Spalte); curation_status←status 1:1; timestamp←updated_at → **DEC-224**. Emitter-Isolation + Input-Contract + Content-Selection + weiche-Degradation + `yaml`-Reuse + Conformance-TDD → **DEC-225**.

### 9. Offene technische Punkte fuer /slice-planning V9.7

1. **OKF-Fehler-Degradation final fixieren:** weich (Empfehlung, §7) vs. hart.
2. **Slice-Schnitt:** FEAT-083 (Emitter, TDD) und FEAT-084 (Bundle+Conformance+Worker-Wiring+ZIP) — 2 Slices, sequenziell (Emitter zuerst, Bundle baut darauf). Cumulative-Single-Branch + EIN Master-Merge.
3. **Cross-Link-Regel:** KU↔diagnosis ueber gemeinsamen `block_key` (kein expliziter FK). Welche Links genau (KU→diagnosis des Blocks? bidirektional?) → /slice-planning fixiert.
4. **Test-Layout** (colocated vs `__tests__/`, IMP-1262): reale OP-Konvention vor Test-Pfad-Auflistung pruefen.

### 10. Empfohlener naechster Schritt

`/slice-planning V9.7` — SLC-Schnitt fuer FEAT-083 (Concept-Emitter, TDD-RED Conformance zuerst) → FEAT-084 (Bundle-Assembly + Worker-Wiring + ZIP-Multi-Folder), Cumulative-Single-Branch-Worktree, AC-Matrizen gegen SC-V9.7-1..10. 0 Migrationen, 0 neue Deps.

## V9.75 Architecture Addendum — Exit-Readiness-Produktisierung (Tier-Gating + Stufe-1-Fahrplan-Report + Mitarbeiter-Register) (RPT-481, 2026-06-17)

> Grundlage: PRD-Section „## V9.75 — Exit-Readiness-Produktisierung" + RPT-480 (/requirements) + Operatives Stufen-Mapping §3 (Dev-System). V9.75 ist **Verpackung, kein Capability-Build**: 1 Spalte + Gates, 1 Renderer auf vorhandenen Daten, 1 leichte Tabelle + Bruecke auf vorhandener RPC. Code-Grounding via Explore (Dispatch-Punkte, Worker-Claim, Schemas, React-PDF-Pattern, Invitation-RPC) + Direkt-Verifikation der zwei lasttragenden Schema-Fakten (siehe §0).

### 0. Schema-Grounding-Korrekturen (gegen reale OP verifiziert 2026-06-17)

Zwei Annahmen aus RPT-480 wurden direkt am Code geprueft — beide aufgeloest, eine mit erheblicher Scope-Erleichterung:

1. **`block_checkpoint.quality_report` EXISTIERT** als reale jsonb-Spalte (Migration `040_orchestrator_extensions.sql:19-20`, `ADD COLUMN quality_report jsonb`). Sie traegt den `OrchestratorOutput` (`coverage` {covered_subtopics, missing_subtopics, coverage_ratio}, `evidence_quality`, `gap_questions[]` {question_text, context, subtopic, priority: required|nice_to_have}, `recommendation`: sufficient|needs_backspelling|critical_gaps). TS-Typ: `src/workers/condensation/types.ts:144-165`. → RPT-480 war korrekt; eine fruehe Explore-Vermutung („quality_report nicht vorhanden, in block_diagnosis gefaltet") war falsch und ist verworfen.
2. **Verkaufs-Framing-Felder sind BEREITS in den Daten** (loest R2 / Q-D-Sorge). Das Diagnose-Prompt-Schema (`051_template_diagnosis_fields.sql:121`, `diagnosis_prompt.output_instructions`) instruiert das LLM, pro Subtopic u.a. `aufwand` (S|M|L), `owner`, `naechster_schritt`, `empfehlung`, `belege`, `abhaengigkeiten`, `zielbild` **zusaetzlich zu** ampel/reifegrad/risiko/hebel/relevanz_90d zu erzeugen. Diese landen in `block_diagnosis.content.subtopics[].fields` (`Record<string, string|number|null>`, Typ `DiagnosisContent`/`DiagnosisSubtopic` in `src/workers/diagnosis/types.ts:38-50`). Lese-Praezedenz existiert: `src/app/dashboard/diagnose/[capture_session_id]/lead-push-actions.ts:382-408` liest `content.subtopics[*].fields.reifegrad`. **Konsequenz: FEAT-086 braucht KEINEN neuen LLM-Job** — siehe §6 / DEC-222.

### 1. Architektur-Summary

V9.75 fuegt der OP einen **server-side erzwungenen Entitlement-Layer** (Stufen-Flag pro `capture_session`) hinzu, der steuert, welche Worker-Jobs (= Capture-Verarbeitung + Outputs) eine Session ausloesen darf, plus zwei reine **Verpackungs-Artefakte**: einen PDF-Fahrplan-Report auf bereits erzeugten Diagnose-/Orchestrator-Daten und ein leichtes Mitarbeiter-Register mit Bruecke zur bestehenden Einladungs-RPC. **Keine** neue Pipeline, kein neuer Capture-Modus, keine neue LLM-Stage. Drei strukturelle Bausteine, ein gemeinsames Gating-Source-of-Truth (SQL-Funktion).

### 2. Hauptkomponenten + Verantwortlichkeiten

| Komponente | Typ | Verantwortung |
|---|---|---|
| `capture_session.tier` | DB-Spalte (neu) | Entitlement-Flag pro Session (`free`/`blueprint`/`handbook`) |
| `fn_tier_rank(text)` / `fn_min_tier_for_job(text)` / `fn_session_tier_allows(uuid, text)` | SQL-Helfer (neu) | **Single Source of Truth** der Gating-Matrix (Job→Min-Tier, Tier-Ordnung, Session-Erlaubnis) |
| `set_capture_session_tier(session_id, tier)` | RPC (neu, SECURITY DEFINER) | Einziger legitimer Schreibpfad auf `tier` (strategaize_admin-only) |
| `capture_session_tier_change_guard` | BEFORE-UPDATE-Trigger (neu) | Column-Level-Schutz: `tier`-Aenderung nur via service_role (= set-tier-RPC) — Reuse BS-`profiles.role`-Pattern |
| `assertSessionTierAllows(client, sessionId, jobType)` | TS-Guard (neu) | Dispatch-Gate an den TS-Eintrittspunkten |
| `ai_jobs.session_tier` | DB-Spalte (neu) | Denormalisierter Session-Tier-Stempel pro Job → Worker-Defense ohne Join |
| Fahrplan-Report-Renderer | `src/lib/pdf/fahrplan-report/` (neu) | React-PDF-Deliverable aus `block_diagnosis` + `quality_report` (Reuse `mandanten-report-v2`-Fonts/Theme) |
| `employee_roster_draft` | DB-Tabelle (neu) | Leichtes Name+Funktion-Register (ohne E-Mail), session-scoped |
| `promoteRosterEntryToInvitation` | Server-Action (neu) | Bruecke Register-Eintrag → bestehende `rpc_create_employee_invitation` |

**Strukturell unveraendert (Reuse, SC-V9.75-7):** alle Capture-Modi, 3-Agenten-Verdichtung, `block_diagnosis`-/Orchestrator-Erzeugung, `sop_generation`, `handbook_snapshot_generation`/OKF, `employee_invitation`/`bridge_proposal`, Worker-Handler-Logik. V9.75 legt nur ein Schloss davor und einen Renderer/Bruecke daneben.

### 3. Gating-Matrix (Q-V9.75-B → DEC-220) — finalisiert nach Operativem Mapping §3

Quelle der Wahrheit ist die SQL-Funktion `fn_min_tier_for_job(job_type)`. **Tier-Ordnung:** `free`=0 < `blueprint`=1 < `handbook`=2. Erlaubt, wenn `fn_tier_rank(session.tier) >= fn_tier_rank(fn_min_tier_for_job(job_type))`.

| job_type | Min-Tier | Begruendung (§3) |
|---|---|---|
| `knowledge_unit_condensation` | **blueprint** | Verdichtung Einzelperspektive (Stufe 1) |
| `diagnosis_generation` | **blueprint** | Reifegrad-Diagnose je Subtopic (Stufe 1) |
| `recondense_with_gaps` | **blueprint** | Chef-Self-Backspelling (Stufe 1, Einzelperspektive). Job-Mechanik ist modus-agnostisch; was Stufe 2 ausmacht, sind die zusaetzlich freigeschalteten Capture-Modi (Mirror/Dialog/Walkthrough/Bulk), die separat gegated sind. Gating bei `handbook` wuerde Stufe-1-Backspelling faelschlich blocken. |
| `evidence_extraction` | **blueprint** | Eigene Chef-Dokumente, begrenzt (Stufe 1) |
| `bridge_generation` | **blueprint** | Stufe1→2-Bruecken-Vorschlag (aus Stufe-1-Diagnose). /backend bestaetigt finale Zuordnung an der realen Handler-Semantik. |
| `dialogue_transcription` / `dialogue_extraction` | **handbook** | Berater-Interviews (Stufe 2) |
| `walkthrough_stub_processing` / `_transcribe` / `_redact_pii` / `_extract_steps` / `_map_subtopics` | **handbook** | Walkthroughs (Stufe 2) |
| `email_bulk_parse` / `_pre_filter` / `_thread_redact` / `_pattern_extract` / `_synthesis` | **handbook** | Bulk-Import-Lueckenschluss (Stufe 2) |
| `sop_generation` | **handbook** | SOP-Generierung (Stufe 2) |
| `handbook_snapshot_generation` | **handbook** | Unternehmens-/SOP-Handbuch (Stufe 2) |
| `lead_push_retry` | **ungated** (immer erlaubt) | Lead-Delivery-Infra, kein Capture-/Output-Entitlement |

**`free`-Konsequenz:** Da jeder gated Job ≥`blueprint` verlangt, kann eine `free`-Session **keinen** LLM-Job ausloesen — nur der statische Fragebogen + V8-Teaser-Scoring (kein ai_job) laeuft. Das deckt §4 (Stufe 0 = statisches Scoring, keine LLM-Verdichtung) ohne Sonderfall ab.

**R3-Aufloesung (free vs V8-Teaser, Q-B):** Der V8-Teaser bleibt ein **getrennter Funnel-Flow** (eigenes Template, statisches Scoring, eigener Renderer). `tier='free'` ist kein zweites „Free-Produkt", sondern die **Entitlement-Untergrenze** einer reale `capture_session` (blockt alle gated Jobs). Keine Verschmelzung — zwei verschiedene Konzepte (Marketing-Funnel-Einstieg vs. Session-Entitlement).

### 4. Enforcement-Architektur (Q-V9.75-C → DEC-221) — server-side, zwei Schichten

**Alle gated Dispatches sind session-scoped** (verifiziert: auch `rpc_trigger_handbook_snapshot(p_capture_session_id)` nimmt eine Session-ID, `074_rpc_handbook.sql:32` — die in RPT-480 befuerchtete Tenant-vs-Session-Spannung existiert nicht). Damit ist die Gate-Signatur **uniform**: `fn_session_tier_allows(capture_session_id, job_type)`.

**Schicht 1 — Dispatch-Gate (primaeres Entitlement, BLOCKING):** an JEDEM der enumerierten Eintrittspunkte VOR dem `ai_jobs`-INSERT:

| Eintrittspunkt | Datei | Gate-Form |
|---|---|---|
| `rpc_create_block_checkpoint` → condensation | `032_*.sql` | Inline-PL/pgSQL-Guard `IF NOT fn_session_tier_allows(...) THEN RAISE EXCEPTION 'tier_gate_denied'` vor INSERT |
| `rpc_enqueue_recondense_job` → recondense | `047_*.sql` | dito (inline) |
| `rpc_trigger_handbook_snapshot` → handbook | `074_*.sql` | dito (inline) |
| `triggerDiagnosisGeneration` → diagnosis | `…/[blockKey]/diagnosis-actions.ts` | TS-Guard `assertSessionTierAllows()` vor `.insert()` |
| `triggerSopGeneration` → sop | `…/[blockKey]/sop-actions.ts` | TS-Guard |
| Walkthrough-Trigger (initialer Customer-Entry) | `src/app/actions/walkthrough.ts` | TS-Guard `assertSessionTierAllows()` + `session_tier`-Stempel am initialen Trigger; Re-Gate + Stempel der Folge-Stages in `src/lib/walkthrough/pipeline-trigger.ts` (Schicht 2) |
| Bulk-Email-Import (Customer-Entry) | `src/app/dashboard/bulk-email-import/actions.ts` | TS-Guard + Stempel am Customer-Entry; Re-Gate + Stempel im Pipeline-Funnel `src/lib/bulk-email/pipeline-trigger.ts` (Folge-Jobs; autonome NULL-Session-Forward-Runs ausgenommen) |
| Dialogue Recording-Ready | `src/app/api/dialogue/recording-ready/route.ts` | TS-Guard vor `admin.from('ai_jobs').insert()` |

Da `032`/`047`/`074` PL/pgSQL-RPCs sind und die TS-Dispatches direkt `.insert()`en, gibt es **keinen** einzelnen zentralen Enqueue-Punkt — das Gate muss an beiden Welten sitzen. Der TS-Guard `src/lib/auth/assert-session-tier.ts` liest `capture_session.tier` + ruft die SQL-Erlaubnislogik (oder spiegelt die Matrix als TS-Konstante mit Test-Paritaet gegen die SQL-Funktion).

**Schicht 2 — Worker-Defense-in-Depth (Backstop gegen vergessene/direkte Pfade):**
- **Stempel:** jeder Dispatch schreibt `ai_jobs.session_tier` = aktueller Session-Tier. Folge-Pipeline-Jobs (Walkthrough/Bulk) erben den `session_tier` des Eltern-Jobs.
- **Claim-RPC erweitern:** `rpc_claim_next_ai_job_for_type` (`035_*.sql`) gibt zusaetzlich `session_tier` zurueck.
- **Worker-Check:** in `src/workers/condensation/claim-loop.ts` unmittelbar nach Claim → `fn_tier_allows(session_tier, job_type)`. Bei Verstoss: Job `status='failed'`, `error='tier_gate_denied_worker'`, kein Handler-Aufruf.
- **Fail-closed bei NULL:** ist `session_tier` fuer einen **gated** job_type NULL (vergessener Pfad), versucht der Worker eine billige Aufloesung aus dem Payload (`capture_session_id`/`block_checkpoint_id`); gelingt das nicht → **Job faellt fehl** (fail-closed, macht den Bug sichtbar; vgl. `security-audit-fable5-standard`). **Ungated** job_types (`lead_push_retry`) sind von der Pruefung ausgenommen (immer erlaubt).

Reuse: `assertRole`-Stil-Guard (kein zentraler Helper in OP vorhanden → neu, schlank) + Synthetic-ai_jobs-Worker-Pre-Check-Disziplin ([[backend]]). **Kein Nav-Hiding als Gate** — UI darf Buttons ausblenden (UX), aber die Durchsetzung ist immer server-side.

### 5. Datenmodell-Aenderungen (Migration-Skizze)

**Migration(en) 121+ (SLC-V9.75-A, Gating-Foundation):**
```
ALTER TABLE capture_session
  ADD COLUMN tier text NOT NULL DEFAULT 'handbook'
  CHECK (tier IN ('free','blueprint','handbook'));        -- NOT NULL DEFAULT backfillt Bestand = 'handbook' (Q-A / DEC-219)

ALTER TABLE ai_jobs ADD COLUMN session_tier text NULL;     -- Worker-Defense-Stempel

CREATE FUNCTION fn_tier_rank(text) RETURNS int IMMUTABLE;          -- free=0/blueprint=1/handbook=2
CREATE FUNCTION fn_min_tier_for_job(text) RETURNS text IMMUTABLE;  -- die Matrix aus §3 (CASE)
CREATE FUNCTION fn_session_tier_allows(uuid, text) RETURNS boolean; -- liest capture_session.tier + Rank-Vergleich
CREATE FUNCTION set_capture_session_tier(uuid, text) ... SECURITY DEFINER; -- strategaize_admin-only Schreibpfad
CREATE TRIGGER capture_session_tier_change_guard BEFORE UPDATE ...; -- tier-Change nur via service_role (Reuse profiles.role-Pattern)
-- CREATE OR REPLACE: rpc_create_block_checkpoint / rpc_enqueue_recondense_job / rpc_trigger_handbook_snapshot (+ inline Gate)
-- CREATE OR REPLACE: rpc_claim_next_ai_job_for_type (+ RETURN session_tier)
-- RLS: capture_session SELECT erlaubt tenant das Lesen von tier; UPDATE auf tier nur service_role (Trigger erzwingt)
```

**Migration 122 (SLC-V9.75-C, Register):**
```
CREATE TABLE employee_roster_draft (
  id uuid PK, tenant_id uuid NOT NULL, capture_session_id uuid NOT NULL,
  name text NOT NULL, role_hint text NULL, block_key text NULL,   -- KEINE E-Mail
  promoted_invitation_id uuid NULL,                                -- Bruecken-Linkage (Re-Promote-Schutz)
  created_by uuid, created_at timestamptz, updated_at timestamptz
);
CREATE UNIQUE INDEX ... ON employee_roster_draft (capture_session_id, lower(name), lower(coalesce(role_hint,'')));  -- weiche Dedup
-- RLS: tenant_id = auth.user_tenant_id() (read/write within tenant); strategaize_admin full
```

**SLC-V9.75-B (Renderer):** **0 Migrationen** — liest ausschliesslich bestehende `block_diagnosis.content` + `block_checkpoint.quality_report`.

MIG-Nummern (121/122) sind **Skizze** — finale Nummer + File-Split entscheidet /backend (next freie Migration = 121, hoechste real = `120_v95_critic_role.sql`). Formale MIGRATIONS.md-Eintraege entstehen bei Apply (mit Datum) im /backend bzw. /deploy.

### 6. Fahrplan-Report-Datenfluss (FEAT-086, Q-V9.75-D/E → DEC-222/223)

**Quelle (rein lesend, kein neuer Job):** pro Session ueber den Join `capture_session → block_checkpoint (quality_report) + block_diagnosis (content)`:
- `block_diagnosis.content.subtopics[].fields`: `ampel`, `reifegrad`, `risiko`, `hebel`, `relevanz_90d`, `empfehlung`, `aufwand` (S/M/L), `owner`, `naechster_schritt`.
- `block_checkpoint.quality_report`: `coverage.missing_subtopics`, `gap_questions[]` (`priority`), `recommendation`.

**Report-Feld → Quelle-Mapping:**

| Report-Sektion | Quelle (DERIVED, kein LLM) |
|---|---|
| Reifegrad-Profil je Block/Subtopic | `fields.{ampel,reifegrad,risiko,hebel,relevanz_90d}` |
| Aufwand S/M/L, naechster Schritt | `fields.aufwand`, `fields.naechster_schritt` (bereits LLM-erzeugt, mig 051) |
| Owner | `fields.owner` falls befuellt, sonst Template-Fallback „Geschaeftsfuehrung / noch zu benennen" (Owner ist im Prompt bewusst leer = Chef benennt) |
| Priorisierte Luecken-/To-Do-Liste | `quality_report.gap_questions` (required vor nice_to_have) + `coverage.missing_subtopics`; Sortierung `(priority, risiko*hebel desc, relevanz_90d)` |
| Exit-Wert/Risiko-Kopplung pro Luecke | **Getemplatete** Narrative aus `risiko`+`hebel`+`relevanz_90d`+`empfehlung` (das Diagnose-Prompt rahmt `risiko` bereits als „Was passiert bei Due Diligence" und `hebel` als „Wirkung auf Exit-Readiness" — deterministisches Template pro (ampel, risiko-Band, hebel-Band) ist ehrlich + gegroundet) |
| Scope-Satz („Landkarte, nicht Handbuch") | statische Copy |
| 1 Muster-Handbuch-Sektion | Reuse `src/lib/handbook/okf/emit.ts` (`renderDiagnosisBody`) fuer 1 reifen Block als Substanz-Beweis |
| Scope-Schaetzung | Heuristik aus #rot/#gelb-Bloecke + #missing_subtopics → Spannen-Range (kein LLM) |

**Ausgabe (Q-E / DEC-223):** **PDF** via React-PDF, neues Modul `src/lib/pdf/fahrplan-report/` (Geschwister zu `mandanten-report-v2`, Reuse `fonts.ts`/`theme.ts`/Wheel-Komponenten). Bereitstellung via Server-Action/Route analog bestehendem Mandanten-Report-Pfad, **Tier-Gate: nur `blueprint`+** (SC-V9.75-5). Optionale Web-Ansicht: deferred (PDF ist das Deliverable; thin Web-Preview ist Folge-Polish, kein V9.75-Blocker).

**Q-D-Refinement (gegen PRD-Default):** Die PRD empfahl tentativ „leichte LLM-Augmentation fuer Aufwand/Owner/naechster-Schritt". §0.2 zeigt: diese Felder sind **bereits in `block_diagnosis.content`**. → **Kein neuer LLM-Job, keine Bedrock-Kosten, keine Latenz** — guenstiger, schneller und staerker „reine Verpackung". `data-residency`-LLM-Pfad entfaellt fuer V9.75 damit ganz.

### 7. Mitarbeiter-Register + Bruecke (FEAT-087, Q-V9.75-F → DEC-224)

- **Tabelle** `employee_roster_draft` (§5): session-scoped, Name+role_hint, optional `block_key`-Tag, **ohne E-Mail**. Weiche Dedup via Unique-Index (`ON CONFLICT DO NOTHING` im Insert) — Register-Dedup ist Warn-Level (PRD R5); die harte Idempotenz sitzt auf der Invitation-Seite.
- **UI:** Roster-Panel im Debrief-/Meeting-View (`src/app/admin/debrief/[sessionId]/[blockKey]/`); `block_key` aus dem aktuellen Block vor-getaggt. Add/Edit/Delete.
- **Bruecke** `promoteRosterEntryToInvitation(rosterId, email)`: liest Eintrag → ruft **unveraendert** `rpc_create_employee_invitation(p_email=email, p_display_name=name, p_role_hint=role_hint)` (`072_*.sql`, RETURNS jsonb, 14d-Token, tenant_admin/strategaize_admin-validiert). Respektiert die bestehende `idx_employee_invitation_pending_email`-UNIQUE (tenant_id, lower(email)) WHERE status='pending' → bei Duplikat liefert die RPC `{error:'duplicate_pending_invitation'}`, UI surft als „bereits eingeladen". Erfolg → `employee_roster_draft.promoted_invitation_id` gesetzt (Re-Promote-Schutz). **Keine** Aenderung an `employee_invitation`/`bridge_proposal`/Onboarding (Reuse, SC-V9.75-7).
- **Register-Tier-Sichtbarkeit:** Register ist Stufe-1-Aktivitaet → verfuegbar ab `blueprint`+ (leichtes UI-/Action-Gate; nicht security-kritisch, da keine teure Ressource — leichtere Pruefung als das Job-Gating).

### 8. Security / Privacy

- **Tier-Spalte Column-Level-Schutz:** `tier` darf NUR via `set_capture_session_tier`-RPC (SECURITY DEFINER, strategaize_admin) geaendert werden; der `capture_session_tier_change_guard`-Trigger (service_role-aware, Reuse BS-`profiles.role`-Pattern [[strategaize-pattern-reuse]]) blockt direkte `PATCH /rest/v1/capture_session {tier:'handbook'}`-Self-Promotion durch tenant_admin. **Bypass-Test Pflicht in /qa** (direkter PostgREST-PATCH).
- **ISSUE-097-Closure (SC-V9.75-3):** ein `blueprint`/`free`-Mandant kann Voll-Kunden-Jobs (Bulk, SOP, Handbook-Snapshot) weder per Menue noch per **direktem RPC-/Action-Aufruf** ausloesen — durchgesetzt Schicht 1 (Dispatch) + Schicht 2 (Worker). /qa-Bypass-Test pro gated Pfad (direkter Call, nicht nur fehlender Nav-Link).
- **Tenant-RLS:** `employee_roster_draft` + `capture_session.tier` tenant-scoped (`auth.user_tenant_id()`); Cross-Tenant-Read/Write Pen-Test (SC-V9.75-8) in /qa via node:20-Sidecar-SAVEPOINT-Pattern ([[coolify-test-setup]]).
- **Kein PII-Zuwachs:** Register haelt nur Name+Funktion (Datensparsamkeit); Fahrplan-Report enthaelt keine Roh-Evidenz ueber das diagnostisch Noetige hinaus.
- **EU-Data-Residency:** entfaellt fuer V9.75 (kein neuer LLM-Call, DEC-222).

### 9. Constraints / Tradeoffs

- **Breite Gating-Oberflaeche (R1):** 8 Dispatch-Eintrittspunkte ueber PL/pgSQL + TS. Tradeoff akzeptiert mit zwei Gegenmitteln: zentrale Matrix-Funktion (eine Wahrheitsquelle) + Worker-Defense-in-Depth (fail-closed) als Backstop gegen einen vergessenen Pfad. /qa enumeriert pro gated Pfad.
- **Matrix in SQL + TS gespiegelt:** der TS-Guard braucht die Matrix zur Dispatch-Zeit; SQL-Funktion ist die Wahrheit. Tradeoff: ein Test erzwingt Paritaet (TS-Konstante == `fn_min_tier_for_job`-Output fuer alle 20 job_types).
- **session_tier-Denormalisierung:** ein Stempel pro Job statt Laufzeit-Join — bewusst, damit der Worker ohne capture_session-Join pruefen kann (Claim-RPC gibt heute keinen Session-Kontext).
- **Per-Session-Tier (nicht per-Tenant):** Founder-Lock (Q-A). Akzeptiert; da alle gated Dispatches session-scoped sind, entsteht keine Tenant-Rollup-Komplexitaet (handbook-Trigger ist ebenfalls session-scoped).
- **Reine Verpackung:** keine bestehende Engine-Logik wird angefasst; Reuse-Quote in /qa verifiziert (SC-V9.75-7).

### 10. Offene technische Punkte fuer /slice-planning V9.75

1. **`bridge_generation`-Min-Tier final bestaetigen** an der realen Handler-Semantik (blueprint vs handbook) — Matrix-Funktion macht das zur 1-Zeilen-Aenderung.
2. **File-Split der Gating-Migration** (eine Migration 121 vs. mehrere: Schema / Helfer-Funktionen / RPC-Replaces) — /backend entscheidet; atomic-commit-Disziplin pro Micro-Task.
3. **TS-Guard-Quelle der Matrix:** TS-Konstante mit Paritaets-Test vs. Roundtrip-RPC-Call (`fn_session_tier_allows`) je Dispatch — Tradeoff Latenz vs. Single-Source. Empfehlung: RPC-Call in den TS-Guards (eine Wahrheit), TS-Konstante nur falls Latenz auffaellt.
4. **Muster-Handbuch-Sektion im Report:** welcher Block (hoechster reifegrad? erster confirmed?) als Substanz-Beweis — /slice-planning fixiert die Auswahlregel.
5. **Test-Layout** (colocated vs `src/__tests__/`, IMP-1262) vor Test-Pfad-Auflistung an realer OP-Konvention pruefen.
6. **Parallelisierbarkeit:** SLC-C (Register) haengt nur an SLC-A (tier-Spalte fuer RLS-Kontext), nicht an SLC-B → nach A parallel zu B moeglich.

### 11. Empfohlener naechster Schritt

`/slice-planning V9.75` — SLC-Schnitt A (Tier-Gating-Foundation: Migration + Matrix-Funktionen + Dispatch-Guards + Worker-Defense + Bypass-Test-Matrix + ISSUE-097-Closure, TDD-RED zuerst) → B (Fahrplan-PDF-Renderer, 0 Migrationen, Reuse mandanten-report-v2) → C (Register + Bruecke, parallel zu B nach A). Cumulative-Single-Branch-Worktree `v9-75-exit-readiness`, EIN Master-Merge, AC-Matrizen gegen SC-V9.75-1..8. Geschaetzt 3 Slices, 2 Migrationen, **0 neue LLM-Jobs, 0 neue Deps** (React-PDF bereits vorhanden).

## V9.8 Architecture Addendum — Controlled Tag-Vokabular + Tag-Export-Propagation (BL-505)

### 1. Architektur-Summary
Zwei kleine, additive Erweiterungen der bestehenden Bulk-Import-Pipeline — **kein neuer Service, kein neuer Worker, kein neuer LLM-Job, keine neue Dependency**:
1. **Tag-Export-Propagation (FEAT-089):** neue Spalte `knowledge_unit.themes text[]` + GIN-Index; `handbook-import.ts` schreibt `email_synthesized_unit.themes` beim Promote mit. Macht Tags fuer Handbuch-Suche/Downstream queryable.
2. **Controlled Tag-Vokabular (FEAT-088):** der `email_bulk_synthesis`-Worker laedt vor dem Prompt-Bau das pro-Tenant Tag-Vokabular (= aggregierte `knowledge_unit.themes`) und injiziert es in den Synthese-Prompt mit „use-existing-where-fits / only-add-if-novel"-Regel.

FEAT-089 ist Fundament: das Vokabular (FEAT-088) speist sich aus den propagierten `knowledge_unit.themes`. Reihenfolge: FEAT-089 → FEAT-088.

### 2. Komponenten & Verantwortung
| Komponente | Datei | Aenderung |
|---|---|---|
| Migration `knowledge_unit.themes` | `sql/migrations/123_*.sql` (geplant) | `ADD COLUMN themes text[] NOT NULL DEFAULT '{}'` + `CREATE INDEX … USING gin(themes)`. Additiv, kein Backfill (Bestand = `{}`). |
| Promote-Mapping | `src/lib/bulk-email/handbook-import.ts` (`mapSynthesizedUnitToKnowledgeUnit`) | `themes: unit.themes ?? []` ins `knowledge_unit`-INSERT aufnehmen. |
| Vokabular-Loader | `src/lib/bulk-email/*` (neuer schlanker Helper) | `getTenantTagVocabulary(admin, tenantId, capN)` → `SELECT unnest(themes) tag, count(*) c FROM knowledge_unit WHERE tenant_id=$1 GROUP BY tag ORDER BY c DESC LIMIT capN`. |
| Synthese-Prompt | `src/lib/ai/bedrock-sonnet/email-synthesis-prompt.ts` (`buildSynthesisUserPrompt`) | neuer Parameter `existingTags: string[]`; rendert Vokabular-Block + Regel. |
| Synthese-Worker | `src/workers/bulk-email/handle-synthesis-job.ts` | nach `run`-Load (tenant_id vorhanden, Z.270) Vokabular fetchen, an `buildSynthesisUserPrompt` durchreichen. |

### 3. Datenfluss
Promote (`handbook-import`): `email_synthesized_unit.themes` → `knowledge_unit.themes`. Synthese (`handle-synthesis-job`): `knowledge_unit.themes` (Tenant, Top-N) → Vokabular-Block → `buildSynthesisUserPrompt` → Sonnet (eu-central-1) → `email_synthesized_unit.themes` (an Vokabular ausgerichtet). Selbstverstaerkende Schleife: nur **promotete** Tags werden Vokabular → kontrolliertes Wachstum, kein Wildwuchs-Feedback.

### 4. Fork-Entscheidungen (Q-V9.8-A..E)
- **Q-A → DEC-228:** dedizierte `knowledge_unit.themes text[]`-Spalte + GIN (NICHT `metadata` JSONB). Findbarkeit = Produktkern; typed array + GIN ist sauber such-/facetten-faehig. OKF-tags-Emission bleibt out-of-scope (DEC-224 steht; spaetere Opportunity).
- **Q-B → DEC-229:** Vokabular-Quelle = on-the-fly-Aggregation aus `knowledge_unit.themes` pro Tenant (KEINE neue `tenant_tag`-Tabelle). Lean; die kuratierte/promotete Tag-Menge IST das kanonische Vokabular. Cold-Start (leer) → freie Generierung seedet (akzeptiert).
- **Q-C → DEC-230:** Top-N nach Haeufigkeit, Cap (Default 60) global pro Tenant. Bounded Token-Budget (R1); meist-genutzte Tags gewinnen.
- **Q-D → DEC-231:** Injektion NUR im Synthese-Prompt (V1). Extraktion-Injektion deferred — Extraktion laeuft in 50er-Batches (hohe Call-Zahl/Token-Kosten) und ihre Themes sind intermediaer (Synthese re-thematisiert); Synthese ist bounded (1 Call/Section, DEC-216) + propagations-bindend. Bewusste Verfeinerung des PRD-„default both".
- **Q-E → DEC-232:** Embedding-Normalisierung (Titan/pgvector) deferred (Founder „nicht ueberdesignen"). V9.8+-Kandidat; Stack vorhanden, ohne Code-Schuld nachruestbar.

### 5. Security / Privacy
Themes sind non-PII Kurz-Tags (`preis-einwand`). Tenant-Isolation: Vokabular-Query strikt `WHERE tenant_id` + bestehende `knowledge_unit`-RLS — kein Cross-Tenant-Tag im Prompt/Speicher (SC-4). Keine Data-Residency-Aenderung: kein neuer externer Call; das Vokabular ist eine lokale DB-Query, injiziert in den bereits EU-gehosteten (Bedrock eu-central-1) Synthese-Call.

### 6. Constraints / Tradeoffs
- Additiv-only, 0 neue Deps/Jobs/Worker. Migration 123 additiv, forward-only (kein Re-Tagging Bestand).
- Tradeoff R2: ohne Embedding-Normalisierung haengt Konsolidierung an Prompt-Disziplin → Ziel „deutlich weniger Synonym-Wildwuchs", nicht „null".
- Cap-N (DEC-230) ist ein Token/Findbarkeit-Tradeoff; Default 60, in /slice-planning justierbar.

### 7. Offene technische Fragen
Keine BLOCKING. Justierung Cap-N (DEC-230) + exakte Vokabular-Block-Formulierung sind /slice-planning/-backend-Feindetail. `email_pattern.themes` (Extraktion) bleibt unveraendert.

### 8. Migrations-Skizze
**Migration 123 (FEAT-089):** `ALTER TABLE knowledge_unit ADD COLUMN themes text[] NOT NULL DEFAULT '{}'::text[];` + `CREATE INDEX IF NOT EXISTS idx_knowledge_unit_themes ON knowledge_unit USING gin (themes);` + `NOTIFY pgrst, 'reload schema'`. Additiv, verlustfrei, kein Backfill. Rollback: `DROP INDEX … ; ALTER TABLE … DROP COLUMN themes;`.

### 9. Empfohlener naechster Schritt
`/slice-planning V9.8` — SLC-Schnitt: A = FEAT-089 (Migration 123 + handbook-import-Propagation + DB-Test), B = FEAT-088 (Vokabular-Loader + Synthese-Prompt-Injektion + Worker-Wiring + hermetische Tests). A vor B (Vokabular speist sich aus propagierten Themes). Geschaetzt 2 Slices, 1 Migration, 0 neue Deps/Jobs.

---

## V10 Architecture Addendum — StB-Vertikale Phase 1 (Stufe-1-Kern: StB onboardet eigene Kanzlei) (RPT-506, 2026-06-21)

### 0. Status
- Quelle: `/architecture V10`, RPT-506. Grounding: PRD `## V10`, `STB_VERTIKALE_R3R4_UEBERSICHT_2026-06-18.md` (§2 Wirk-Schicht, §4 Liefer-Architektur, §9 KI-Lieferung), OP-Capability-Scan 2026-06-20, 3 read-only Code-Maps (Knowledge-Schema / AI-Pipeline / Repo-Konventionen).
- DECs: DEC-233..DEC-239. Migration: MIG-124 (SQL-Datei `124_v10_stb_modul_domain.sql`). Naechster Schritt: `/slice-planning V10`.

### 1. Architektur-Zusammenfassung
Die StB-Vertikale Phase 1 wird **in die OP-Codebase** gebaut (Founder-BLOCKING 2026-06-20, kein neues Repo). ~60-70 % ist **Reuse** vorhandener OP-Infra (Tenant/RLS/Rollen, `template`/`capture_session`/`block_checkpoint`/`knowledge_unit`, ai_jobs-Worker, Bedrock eu-central-1, Tier-Gating, Cost-Cap). Der **eine echte Neubau** ist die **Modul-Workspace-Lieferdomaene**: ein Blueprint-Diagnostik-Lauf (eigene Kanzlei) routet in 3 Finanz-Module (M-04/05/06); pro Modul werden via KI strukturierte Deliverables erzeugt — das **Output-Triple** (Entscheidung / Standard / Implementierungsschritt) + eine **KI-Hebel-Liste** (Reifegrad 1-4) — und in einem Workspace-Reader konsumiert. Stufe-1 = StB onboardet die **eigene** Kanzlei (= normaler Tenant, `tenant_admin`); Mandanten/Partner-Hierarchie ist V11+ (out of V10).

Leitprinzip: **Capture-Flow wiederverwenden, Liefer-Output als saubere neue Domaene.** Die generische Knowledge-Maschinerie traegt Fragebogen + Antworten + Blueprint-Diagnostik; das modulspezifische, strukturierte Deliverable bekommt eine eigene Tabelle, weil das flache `knowledge_unit` (Text-`body`) das Triple + Reifegrad-gestaffelte Hebel nicht sauber queryable abbildet.

### 2. Fork-Entscheidungen (Q-V10-A..E) auf einen Blick
- **Q-A → DEC-233 (Modul-Domaene-Schnitt):** Hybrid. Reuse `template` (Modul-Definition) + `capture_session`/`block_checkpoint` (Lauf + Antworten) + `knowledge_unit` **nur** fuer Blueprint-Diagnostik-Findings. **NEU:** eine Tabelle `modul_output` fuer das strukturierte Modul-Deliverable (Triple + KI-Hebel mit Reifegrad). Begruendung: flaches `knowledge_unit` modelliert das Triple/Reifegrad nicht clean; Workspace-Reader (FEAT-095) braucht queryable Struktur; haelt `knowledge_unit`-Semantik intakt; saubere DATEV-Import-Flaeche.
- **Q-B → DEC-234 (Blueprint):** Mechanismus reusen, Inhalt neu. Blueprint = neue `template`-Row `stb_blueprint_kanzlei` v1.0 (mit `diagnosis_schema`/`diagnosis_prompt`), laeuft als `capture_session` → `block_checkpoint` → `diagnosis_generation`-Job → **`block_diagnosis`** (Ampel/Reifegrad/Empfehlung). **NICHT** den Exit-Readiness-Template-Inhalt reusen (anderer Zweck + DATEV-„ReifegradCheck"-Abgrenzung, SC-6). **Daten-Fluss + Reuse-Pfad praezisiert in §12 / DEC-244** (Output = `block_diagnosis`, nicht `knowledge_unit`; light-pipeline `self_service_partner_diagnostic` ist NICHT der Reuse-Pfad).
- **Q-C → DEC-236 (Kapselung):** Gebundene Cross-Cutting-Sub-Domaene nach bulk-email/handbook-Konvention: `src/lib/stb-vertikale/*`, `src/workers/stb-vertikale/*`, Reader unter Tenant-Cockpit-Route-Group (`dashboard/stb/*`), Capture-Eintritt reust den bestehenden `capture/`-Wizard, `src/components/stb/*`, 1 Migration, i18n `stb.*`. Kein separates Package, nicht verstreut. V10 = eigener Tenant → Tenant-Cockpit, NICHT `partner/` (Mandanten-Hierarchie = V11+).
- **Q-D → DEC-237 (DATEV-Import):** Nur Daten-Modell-Merker, keine Implementierung. Modul-Input + `modul_output` so geschnitten, dass ein spaeterer importierter Finanz-Datensatz als Evidenz/Source andocken kann ohne Schema-Aenderung; `capture_session.metadata.imported_dataset_ref` als offener Slot; `evidence_refs` bleibt offen. Keine Tabelle, keine Integration in V10.
- **Q-E → DEC-235 (KI-Output-Pipeline):** ai_jobs-Worker + Cost-Cap reusen; **lean Per-Modul-Synthese (Draft + Bounded-Critic, ~2-4 LLM-Calls/Modul) nach dem bulk-email-`handle-synthesis-job`-Muster** — NICHT der schwere condensation-Orchestrator (Analyst→Challenger 5-17 Calls = Overkill fuer 3 Module im Internal-Test) und NICHT Single-Pass (verliert Cost-Cap/Job-Tracking/Quality-Gate). Neuer `job_type = module_output_synthesis`, tier-gated, Bedrock Sonnet eu-central-1 via `src/lib/llm.ts`, strukturierter JSON-Output, `ai_cost_ledger` + Cost-Cap (Run-Cap + Tenant-Monatscap + Worker-Live-Cap).

### 3. Main Components
1. **StB-Onboarding (FEAT-090, ~Reuse, DEC-238).** Kein neuer Code-Kern: der StB onboardet die eigene Kanzlei via bestehendem Tenant-Provisioning (Invitation `role_hint='tenant_admin'` ODER Self-Signup), keine neue Rolle, keine Partner/Mandanten-Hierarchie in V10. RLS via `auth.user_tenant_id()`/`auth.user_role()` (Zwei-Teil-USING).
2. **Modul-Domaene + Content-Seed (FEAT-091).** 4 `template`-Rows: 1 Blueprint (`stb_blueprint_kanzlei`) + 3 Module (`stb_modul_m04`/`m05`/`m06`), jede mit `blocks` (Fragebogen Stufe-1-Kern + Stufe-2-Vertiefung ueber Block-Set/`ebene`/`required`) + KI-Hebel-Katalog-Referenz. Content aus Dev-System-IP (`StrategAIze Module.xlsx` + M-04-Spec). Module = lebende Dokumente (per Template-Version nachschaerfbar).
3. **Blueprint-Diagnostik (FEAT-092, DEC-234).** `capture_session` auf `stb_blueprint_kanzlei` → `block_checkpoint` → `diagnosis_generation`-Job (Reuse) → `knowledge_unit`-Diagnostik-Findings (Ampel/Reifegrad/Empfehlung) → empfiehlt/routet die 3 Module.
4. **Modul-Fragebogen-Capture (FEAT-093, Reuse `capture/`-Wizard).** Pro Modul `capture_session` → Stufe-1-Kern-Blocks (Pflicht) + optional Stufe-2-Vertiefung → `block_checkpoint.content`. Voice optional via vorhandenem Whisper-Pfad.
5. **KI-Output-Generierung (FEAT-094, DEC-235, NEU).** `src/workers/stb-vertikale/handle-module-output-job.ts`: lean Fan-out (Triple-Synthese) + Bounded-Critic → schreibt `modul_output`-Rows (Triple + KI-Hebel mit Reifegrad 1-4). Tier-gated, cost-capped, EU-Region. ~70-80 % Draft-Ziel; StB macht ~20 % Vertiefung (Edit-Status auf `modul_output`).
6. **Modul-Workspace-Reader (FEAT-095, NEU).** `dashboard/stb/*`: liest `modul_output` (RLS) gruppiert nach Modul + Output-Kind + KI-Hebel-Liste nach Reifegrad. Konsum-only.

### 4. Data Model
**NEU — `modul_output`** (das einzige neue Kern-Schema in V10):
```
modul_output (
  id uuid PK,
  tenant_id uuid NOT NULL REFERENCES tenants,
  capture_session_id uuid NOT NULL REFERENCES capture_session,
  block_checkpoint_id uuid REFERENCES block_checkpoint,   -- Herkunfts-Submission
  modul_key text NOT NULL,                                -- 'm04'|'m05'|'m06'
  output_kind text NOT NULL
    CHECK (output_kind IN ('entscheidung','standard','implementierungsschritt','ki_hebel')),
  title text,
  body text NOT NULL,
  reifegrad smallint CHECK (reifegrad BETWEEN 1 AND 4),   -- nur bei output_kind='ki_hebel'
  evidence_refs jsonb NOT NULL DEFAULT '[]',
  source text NOT NULL DEFAULT 'ai_draft',                -- ai_draft|edited|manual
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','accepted','edited','rejected')),
  ai_job_id uuid,                                         -- erzeugender Synthese-Job
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
)
-- Indizes: (tenant_id), (capture_session_id), (modul_key); RLS tenant-scoped (Zwei-Teil-USING),
-- ai_draft-Writes service_role, Edit/Status tenant_admin.
```
**Reuse (unveraendert):** `template` (+ `diagnosis_schema`/`diagnosis_prompt`/`metadata`), `capture_session` (+ `tier`, `metadata`), `block_checkpoint`, `knowledge_unit` (Blueprint-Findings), `validation_layer`, `ai_jobs`, `ai_cost_ledger`.

### 5. Data Flow
1. StB onboardet eigene Kanzlei → Tenant + `tenant_admin` (Reuse).
2. Blueprint: `capture_session(stb_blueprint_kanzlei)` → Blocks → `block_checkpoint` → `diagnosis_generation` → `knowledge_unit`-Findings → Modul-Empfehlung.
3. Pro Modul M-04/05/06: `capture_session(stb_modul_mXX)` → Stufe-1-Kern-Blocks → `block_checkpoint` → `rpc_enqueue_module_output` (tier-gated) → `ai_jobs(module_output_synthesis)` → Worker (lean Fan-out + Critic) → `modul_output`-Rows. Optional Stufe-2-Vertiefung → Re-Synthese.
4. Workspace-Reader liest `modul_output` (RLS) + KI-Hebel-Liste nach Reifegrad.

### 6. External Dependencies
Keine neue externe Abhaengigkeit. Bedrock Sonnet 4 `eu.anthropic.claude-sonnet-4-20250514-v1:0` (eu-central-1) via `src/lib/llm.ts` (vorhanden). Titan-Embeddings (vorhanden, optional fuer Modul-Output-Semantik — deferred). Whisper-Pfad (vorhanden, Voice optional). **DATEV-Import = V11+ (nur Merker, DEC-237).**

### 7. Security / Privacy
- Tenant-Isolation: `modul_output`-RLS strikt `tenant_id = auth.user_tenant_id()` + Rollen-Check; ai_draft-Writes nur `service_role`. KEIN Cross-Tenant-Pool in V10 (= V12/Stufe-3-Moat, compliance-heavy).
- Data-Residency: jeder LLM-Call EU (Bedrock Frankfurt), Cost in `ai_cost_ledger` geloggt, Tier-Gating gegen ungewollte Jobs.
- DATEV-Begriffs-Abgrenzung (SC-6): Naming/Copy markiert „operative Wirk-/Mandanten-Schicht" — NICHT DATEVs kanzlei-eigener „ReifegradCheck"/„Organisationshandbuch". Positionierungs-Constraint, kein Code-Mechanismus.
- Gating (DEC-239): neue `job_type`s tier-gated + neue Routen hinter Env-Flag (`NEXT_PUBLIC_ENABLE_STB_VERTIKALE`) → V10 OFF bis bereit (`module-lifecycle-discipline`, Internal-Test-Mode).

### 8. Constraints / Tradeoffs
- **DEC-233:** dedizierte `modul_output`-Tabelle statt `knowledge_unit`-JSON-in-body — +1 Tabelle/Enum/RLS gegen Reader-Klarheit + DATEV-Import-Flaeche. Bewusst.
- **DEC-235:** lean Fan-out + Critic statt vollem Orchestrator — Kosten/Scope-Proportionalitaet (3 Module, Founder-Internal-Test). Tradeoff: weniger Iterations-Tiefe als condensation; akzeptiert (Live-Smoke an Founder-eigener Kanzlei = R1-Validierung).
- **DEC-234 / DEC-244:** Blueprint-Mechanismus-Reuse (`diagnosis_generation` → `block_diagnosis`), neuer Inhalt — kein neuer Diagnostik-Engine; Tradeoff: Blueprint-Content muss neu autoriert werden (SLC-170b), und es kommt eine duenne Fragebogen→KU-Seed-Vorstufe + ein tenant-scoped Self-Service-Trigger + deterministisches Modul-Routing dazu (alles code-only, keine Migration).
- Additiv: 1 Migration (124), 1 neue Tabelle, 1 neuer `job_type`, 0 Aenderung an bestehenden OP-Funktionen (SC-7).

### 9. Migrations-Skizze (MIG-124)
`124_v10_stb_modul_domain.sql` (additiv): (1) `CREATE TABLE modul_output` (+ Enum-CHECKs, Indizes, RLS-Matrix Zwei-Teil-USING + GRANTs authenticated/service_role); (2) `module_output_synthesis` in `fn_min_tier_for_job` mappen (→ `blueprint`-Tier) + `ai_jobs.job_type`-CHECK + `ai_cost_ledger.role`-CHECK je um die neuen Werte erweitern (Live-Stand vorab via `pg_get_constraintdef` verifizieren — IMP-1228-Disziplin); (3) `rpc_enqueue_module_output(p_capture_session_id, p_modul_key)` (tier-gated, INSERT ai_jobs, Pattern aus `rpc_create_block_checkpoint`); (4) `NOTIFY pgrst, 'reload schema'`. **Template-Seeds (Blueprint + M-04/05/06) als separate Seed-Migration** (Content aus Dev-System-IP) — Schnitt in /slice-planning. `capture_session.metadata.imported_dataset_ref` braucht keine Schema-Aenderung (jsonb vorhanden). Naechste freie SQL-Datei = **124**.

### 10. Offene technische Fragen
- **Seed-Content-Tiefe:** Nur M-04 hat eine vollstaendige Spec; M-05/M-06 Fragebogen + KI-Hebel muessen aus `StrategAIze Module.xlsx` extrahiert/autoriert werden (Seed-Slice, /slice-planning/-backend).
- **Reifegrad-Inferenz:** deterministisch (aus Evidenz-Dichte/Confidence) vs. LLM-gewertet — im /backend-Slice festlegen.
- **Blueprint→Modul-Routing:** in V10 nur 3 Finanz-Module → Routing trivial; Detail-Regeln in den Slice.
- **Q-V10-F (Founder, Versionierung, NICHT-blockierend):** StB Phase 2/3 → V11/V12 reservieren (Deferred weiter schieben) vs. spaeter naechste freie Nr. **Empfehlung:** V11/V12 fuer StB reservieren (StB-Vertikale ist jetzt die Prioritaets-Linie; die Deferred-Items haben 0 Backlog-Surface). Founder-Bestaetigung offen.

### 11. Empfohlener naechster Schritt
`/slice-planning V10` — grobe SLC-Richtung: (A) MIG-124 `modul_output`-Domaene + RPC + Tier-Job-Mapping (backend); (B) Template-Seeds Blueprint + M-04/05/06 (backend, IP-Extraktion); (C) Modul-Output-Synthese-Worker lean Fan-out+Critic + Cost-Cap (backend); (D) Capture-Eintritt-Reuse + Stufe-1/Stufe-2-Flow (frontend/backend); (E) Workspace-Reader + KI-Hebel-Liste (frontend); (F) FEAT-090 Onboarding-Reuse + Env-Gate (klein). Reihenfolge + genauer Schnitt = /slice-planning.

### 12. Q-B1-1 Resolution — Blueprint-Diagnostik-Mechanismus (DEC-244, 2026-06-22)

Vertiefung von DEC-234 (Q-V10-B) vor SLC-172, gegen den **heutigen** Code verifiziert (`src/workers/diagnosis/handle-diagnosis-job.ts`, `src/workers/condensation/{handle-job,light-pipeline}.ts`, `sql/migrations/{050_block_diagnosis,051_template_diagnosis_fields,052_rpc_diagnosis,093_v63_partner_diagnostic_seed,094_*}.sql`). Q-B1-1 = der FEAT-092-Fork „neuer schlanker Blueprint vs. bestehende Exit-Readiness-/Partner-Diagnose reusen", konkretisiert in SLC-172 R-172-1.

**Befund: die Slice-Records mappten den Reuse-Pfad falsch.** Es gibt drei verschiedene Diagnose-Mechanismen, und die zwei in SLC-172 R-172-1 genannten Optionen zielten beide auf den **falschen** (`condensation`/light-pipeline via `usage_kind`):

| Mechanismus | Trigger | Output | Ampel/Reifegrad/Empfehlung? | Modul-Routing? |
|---|---|---|---|---|
| **light-pipeline** (`usage_kind='self_service_partner_diagnostic'`) | condensation claim-loop | `knowledge_unit` (unit_type=`finding`): Block-Score 0-100 + Bedrock-Freitext-Kommentar | **NEIN** (nur Score + Prosa) | nein |
| **Standard-condensation** (Fall-through, `runIterationLoop`) | condensation claim-loop | `knowledge_unit` (status=`proposed`), schwerer Analyst→Challenger-Loop | teilweise (Debrief-Felder, review-pflichtig) | nein |
| **`diagnosis_generation`** (schema-getrieben) | eigener `ai_jobs.job_type='diagnosis_generation'` | **`block_diagnosis`** via `rpc_create_diagnosis`: Subtopics mit `ist_situation/ampel/reifegrad/risiko/hebel/relevanz_90d/empfehlung/owner/aufwand/naechster_schritt/...` | **JA, first-class** | nein (existiert nirgends) |

**Resolution (DEC-244):**

1. **Mechanismus = `diagnosis_generation` → `block_diagnosis` (schema-getrieben), NICHT die light-pipeline.** Nur dieser Pfad liefert Ampel/Reifegrad/Empfehlung als strukturierte Felder (AC-172-2) und ist `diagnosis_schema`-getrieben → neuer StB-Inhalt ohne Exit-Readiness-Recycling (DEC-234, DATEV-Abgrenzung SC-6). `job_type='diagnosis_generation'` existiert bereits im `ai_jobs`-CHECK → **keine Migration** auf SLC-172-Ebene. R-172-1 (a) (`self_service_partner_diagnostic` reusen) ist damit **widerlegt** — die light-pipeline kann AC-172-2 strukturell nicht erfuellen; R-172-1 (b) (`+MIG-126`) entfaellt ebenfalls.
2. **Daten-Fluss-Korrektur:** Die Ampel/Reifegrad/Empfehlung landen in **`block_diagnosis`**, nicht in `knowledge_unit`. `knowledge_unit` sind **Input** des `diagnosis_generation`-Workers (`handle-diagnosis-job.ts` wirft, wenn pro Block keine KUs vorliegen), nicht das Blueprint-Deliverable. DEC-234-Consequence-Formulierung „→ knowledge_unit-Findings (Ampel/Reifegrad/Empfehlung)" war ungenau (in DEC-244 korrigiert).
3. **KU-Input-Vorstufe (Bauentscheidung /backend):** der Blueprint braucht pro Block KU-Rows, bevor `diagnosis_generation` laeuft. Empfohlener leaner Pfad: **duenne Fragebogen→KU-Seed-Stufe** aus dem Blueprint-`block_checkpoint` (Reuse des KU-Schreib-Musters aus `rpc_finalize_partner_diagnostic`), **NICHT** der schwere condensation-Loop. Exakte Mechanik in SLC-172/-173 /backend.
4. **Trigger/Auth-Delta:** der bestehende `triggerDiagnosisGeneration` ist `strategaize_admin`-only (Berater-Debrief-Flow). Der Blueprint ist **self-service** → tenant-scoped Trigger (`tenant_admin`-Action oder Auto-Enqueue nach Finalize), tier-gated wie heute (`blueprint`-Tier in `fn_min_tier_for_job`). Code-only, klein.
5. **Modul-Routing (M-04/05/06) ist echt neu** — kein bestehender Mechanismus emittiert es. Lean + deterministisch + ohne neue Tabelle: Block→`modul_key`-Map liegt im Blueprint-Template (`diagnosis_schema`/`metadata`, autoriert in **SLC-170b**); SLC-172 MT-2 liest `block_diagnosis` (Ampel/Reifegrad) + Schwellwert → rendert „relevante Module". Kein LLM-Routing (trivial bei 3 Modulen), keine MIG-126.

**Sequencing-Konsequenz (BLOCKING):** `stb_blueprint_kanzlei` existiert noch **nicht** — Inhalt (Blocks + `diagnosis_schema` + `diagnosis_prompt` + Block→`modul_key`-Routing-Map) = Founder-IP in **SLC-170b** (content-gated). Q-B1-1 loest die **Mechanismus-Haelfte** jetzt; die **Content-Haelfte** gehoert zu SLC-170b. **SLC-172 ist hart auf SLC-170b (Blueprint-Welle) geblockt.** Autoring-Ziel fuer SLC-170b: `diagnosis_schema`-Modell (Subtopics mit Standard-Diagnose-Feldern ampel/reifegrad/empfehlung) + Block→`modul_key`-Map — dieselbe Mechanik wie Exit-Readiness, Inhalt neu.

### 13. SLC-172 Wiring — Block-Reconciliation + adaptive Vertiefung + KU-Seed-RPC (DEC-249, 2026-06-24)

SLC-170b ist geseedet (MIG-126 live); §12 (DEC-244) hatte den Diagnose-**Pfad** geklaert. Diese Sektion fixiert das konkrete SLC-172-Wiring nach dem Founder-Entscheid **Vertiefung-Surfacing = A/adaptiv** (M-BP §7.7). Verifiziert gegen `handle-diagnosis-job.ts`, `admin/debrief/.../diagnosis-actions.ts`, `assert-session-tier.ts`, MIG-094/126.

**Kern-Befund (Reconciliation):** Die Diagnose-Engine keyed ALLES auf **einen** `block_key` — sie laedt `diagnosis_schema.blocks[block_key]` UND die KUs `WHERE capture_session_id=… AND block_key=…`. Der Blueprint hat aber Capture-Bloecke (`stufe1_kern`/`stufe2_vertiefung`) ≠ Diagnose-Bloecke (A–G). **Loesung:** KUs werden mit `block_key ∈ {A..G}` geseedet (nicht `stufe1/stufe2`); pro A–G werden die Capture-Antworten ueber `diagnosis_schema.blocks[X].subtopics[].question_keys` eingesammelt; dann **7 `diagnosis_generation`-Jobs** (je A–G) → Engine laeuft unveraendert → 7 `block_diagnosis`-Rows.

**Komponentensicht (alles code-only ausser MIG-127):**

| Komponente | Verantwortung | Reuse / Neu |
|---|---|---|
| Blueprint-Capture-Eintritt (`dashboard/stb/blueprint/page.tsx`) | StB startet `capture_session` auf `stb_blueprint_kanzlei` (tier=`blueprint`), durchlaeuft `stufe1_kern` | Reuse Capture-Wizard + `rpc_create_block_checkpoint` |
| **Adaptive Vertiefung** (Kopplungstabelle + `assessAnswerAmpel`) | Bei den 5 gekoppelten Kern-Fragen (F-BP-004/005/007/009/013) synchroner Mini-Bedrock-Call → Ampel; bei gelb/rot gekoppelte Vertiefungsfrage (016/017/018/019/020) einblenden | **Neu** (kein Live-Assessment heute); Bedrock-Reuse `chatWithLLM` (EU) |
| KU-Seed (`rpc_seed_blueprint_diagnosis_input`, **MIG-127**) | Atomar je A–G KUs aus `answers` bauen (Q+A im `body`) + Checkpoint-Ref | **Neu (RPC)**, Muster aus `rpc_finalize_partner_diagnostic` |
| Tenant-Trigger (`triggerBlueprintDiagnosis`) | 7× `diagnosis_generation` enqueuen, Owner-Auth + Tier-Gate | Klon von `triggerDiagnosisGeneration` (Owner statt `strategaize_admin`) |
| Reader (`SubtopicDiagnosisCard`) | `block_diagnosis` A–G rendern: Ampel/Reifegrad/Empfehlung je Unterthema | `fetchDiagnosis` + Layout-Reuse `BerichtRenderer`/`BlockSectionCard`; Subtopic-Nesting **neu** |
| Modul-Routing-Card (`blueprint-routing.ts`) | Pro `metadata.routing[]`-Eintrag: Subtopic-Ampel ∈ `activate_when.ampel` → primaer(+sekundaer) `modul_key` mit Link in den Modul-Capture (SLC-173) | **Neu**, deterministisch, kein LLM |

**Daten-/Request-Fluss:** Capture `stufe1_kern` (+ adaptiv eingeblendete Vertiefung) → `block_checkpoint` → `rpc_seed_blueprint_diagnosis_input` (KUs A–G) → `triggerBlueprintDiagnosis` (7 Jobs) → Worker `handle-diagnosis-job` (je A–G) → `block_diagnosis` → Reader + Routing-Card.

**Adaptive Schicht — Details:** Kopplung = statische Tabelle (Single-Source, abgeleitet aus den `unterbereich`-geteilten Subtopics a2/b1/c1/d1/f1). `assessAnswerAmpel` = ein kleiner EU-Bedrock-Call (temp 0, ~64 tok), Ergebnis in `capture_session.metadata.blueprint_adaptive_ampel` (JSONB-Marker-Slot, kein Schema-Touch; NICHT in `answers`, das `record<string,string>` ist — /backend-Refinement MT-1). Kopplung zur Laufzeit aus dem Template abgeleitet (gemeinsames `unterbereich`), nicht hartkodiert. Audit via `error_log` (provider/region/model, data-residency.md); **kein `ai_cost_ledger` in V1** (Mikro-Kosten; vermeidet eine ai_jobs-job_type-CHECK-Migration) — bewusster Tradeoff (KNOWN_ISSUES). Falls die Live-Schicht (§7.3) sich als zu flaky erweist, degradiert dieselbe Kopplungstabelle trivial auf Fallback B (optionaler Block) — aber Founder waehlte A.

**Constraints/Tradeoffs:** (a) **Migrationsbedarf korrigiert** — SLC-172 ist NICHT migrationsfrei (MIG-127, atomarer KU-Seed; DEC-244 „migrationsfrei" galt nur dem Trigger-Pfad). (b) Tenant-Isolation: KU-Seed-RPC SECURITY DEFINER, Trigger Owner-scoped, Reader via RLS — im /qa per DB-Sidecar zu belegen. (c) DATEV-Abgrenzung (SC-6) in Naming/Copy gewahrt.

**Offene technische Fragen (im /backend zu fixieren):** (1) Braucht `block_diagnosis`/`rpc_create_diagnosis` eine `block_checkpoint` mit GLEICHEM `block_key` wie die Diagnose, oder darf der eine bestehende Capture-Checkpoint fuer alle 7 A–G referenziert werden? (entscheidet, ob MIG-127 7 thin Checkpoints anlegt oder den Capture-Checkpoint reused) — durch Lesen von MIG-050/052 + `rpc_create_diagnosis` aufloesen. (2) Genaues Wizard-Einblende-UX der adaptiv getriggerten Vertiefungsfrage (inline-Nachfrage vs. Folge-Step). (3) Latenz-Budget der bis zu 5 synchronen Assess-Calls (ggf. nur beim Block-Advance statt pro Frage).

**Empfohlene Implementierungs-Reihenfolge:** MT-1 (Capture-Eintritt + adaptive Vertiefung) → MT-2 (KU-Seed-RPC MIG-127 + Tenant-Trigger + 7 Jobs) → MT-3 (Subtopic-Reader + Modul-Routing-Card). Danach `/qa` (DB-Sidecar fuer MIG-127 + Tenant-RLS + AC-Matrix).

## V10.1 Architecture Addendum — /module-delivery Scoring-/Interview-Engine (Stufe-1-Vertiefung) (RPT-545, 2026-07-02)

### 0. Status
- Quelle: `/architecture V10.1`, RPT-545. Grounding: PRD `## V10.1`, DEC-252 (Discovery-Scope), 2 read-only Code-Maps (Modul-/Blueprint-Strukturen + Echtzeit-LLM-/Capture-Internals). Fork-Entscheidungen Q-V10.1-A..F via Founder (B+D) + code-verankerte Engineering-Calls (A/C/E/F).
- DECs: DEC-253 (Fork-Bundle). Migration: MIG-129 (Flag-Seed). Naechster Schritt: `/slice-planning V10.1`.

### 1. Architektur-Zusammenfassung
`/module-delivery` ist eine **duenne neue Schicht** ueber der fertigen V10-Maschinerie (Blueprint-Diagnostik + Modul-Capture + Modul-Synthese), die die bisher toten 5 Scoring-Flags (`TemplateQuestionSchema.flags`, heute ueberall `false`) mit Leben fuellt. Drei Phasen: **(P1)** ein einmaliger LLM-Autoring-Lauf setzt die Flags an den 17 Modulen (Founder-Abnahme → deterministischer Seed MIG-129) + eine **regel-basierte Modul-Reife-Ampel**; **(P2)** **Echtzeit-Rueckfragen** waehrend der Modul-Erfassung (synchroner Bedrock-Haiku-Call pro Kern-Frage, spiegelt exakt das bestehende Blueprint-`assessAnswerAmpel`-Muster); **(P3)** eine **duenne SOP-Bruecke** (bewertete `modul_output` + Scoring → bestehende `sop`-Tabelle, Legacy-Worker unberuehrt). **Kein neuer Async-Infra-Kern** — der synchrone LLM-Pfad existiert bereits (`blueprint/actions.ts`), Rueckfrage-Antworten fliessen ueber das vorhandene **Evidence-Merge-Muster** in die Synthese. Artefakt-Dualitaet: **Skill** `/module-delivery` = Design-Time (Flag-Klassifikation Sonnet + Abnahme + Seed-Emission), **Runtime OP** = Live-Delivery (Haiku-Bewertung + Regel-Ampel + SOP-Bruecke). Fachmodule bleiben unangetastet M-04-treu (DEC-251).

### 2. Fork-Entscheidungen (Q-V10.1-A..F) auf einen Blick — DEC-253
- **Q-A (Echtzeit-Topologie + Modell):** **Synchroner Server-Action-Call** (Reuse `chatWithLLM()`-Muster von `assessAnswerAmpel`, `src/app/dashboard/stb/blueprint/actions.ts:177`), fail-open. **Modell: Haiku 4.5** (`eu.anthropic.claude-haiku-4-5-20251001-v1:0`, $1/$5) fuer Live-Bewertung (Latenz/Kosten); **Sonnet 4** fuer den einmaligen Autoring-Lauf. Trigger = Antwort-Blur/Submit pro Kern-Frage (nicht per-Keystroke), ggf. Block-Advance-Batch als Latenz-Fallback. **Keine neue Async-Infra.**
- **Q-B (Flag-Storage) → Founder: Seed-Migration MIG-129.** Flags werden in die bestehende Template-JSONB (`TemplateQuestion.flags` in `template.blocks[].questions[]`) geschrieben — deterministisch/pruefbar, konsistent zu MIG-128. Nachjustieren = neuer Autoring-Lauf + neue Seed-Migration. Keine Override-Tabelle in V1.
- **Q-C (Reife-Ampel):** **Deterministische Pure-Function** (kein LLM), Muster wie `surfacedVertiefungFrageIds`. Regel: ein getriggerter `ko_hart` → **red**; getriggerter `ko_soft`/`deal_blocker`/`owner_dependency` (bei Fehl-/Luecken-Antwort) → **yellow**; sonst **green**. Speicherung in `capture_session.metadata` (spiegelt Blueprint-`blueprint_adaptive_ampel`) — **keine zweite Migration**. „Getriggert" = die Live-Haiku-Bewertung (P2) markiert eine geflaggte Frage als riskant/unvollstaendig.
- **Q-D (SOP-Bruecke) → Founder: Duenne Bruecke, Legacy unberuehrt.** Neues Mapping `modul_output` + Scoring → `sop`-Rows (bestehende `sop`-Tabelle wiederverwenden); Legacy-`src/workers/sop/*` bleibt unangetastet. Niedrigstes Risiko; Phase-3-Ausbau als eigener spaeterer Slice.
- **Q-E (Skill-vs-Runtime):** **Skill** `/module-delivery` (Dev-System) = Design-Time: Sonnet-Flag-Klassifikation ueber die 17 Module → Founder-Abnahme-Flow → emittiert MIG-129 (Pattern wie `gen-mig128`-Parser-Generator, deterministisch). **Runtime OP-Feature** = Live-Haiku-Bewertung (P2) + Regel-Ampel (P1-Runtime) + SOP-Bruecke (P3). Uebergabe-Artefakt = die MIG-129-Seed-Datei.
- **Q-F (Rueckfrage-Speicherung + Synthese-Fluss):** **Evidence-Merge-Muster** (KORREKTUR der naiven „synthetische question.id"-Annahme: `assembleQaPairs` iteriert Template-Fragen, nicht Answer-Keys — freie Keys wuerden uebersprungen). Rueckfrage-Antwort wird per Key `followup.<blockKey>.<questionId>` an die **Eltern-Antwort konkateniert** (exakt wie `evidence.<block>.<qid>` heute in `mergeAnswers`, `module-context.ts`) → Synthese sieht angereicherte Antworten **ohne Schema-/Logik-Aenderung**. Welche Fragen Rueckfragen ausloesten, wird zusaetzlich in `capture_session.metadata` fuer die Ampel-Aggregation vermerkt.

### 3. Main Components
1. **Skill `/module-delivery` (Design-Time, FEAT-096 P1-Autoring, DEC-253/E).** Fuehrt einen Sonnet-Klassifikationslauf ueber die 17 Modul-Fragebogen (setzt pro Frage die 5 Flags), zeigt dem Founder den Vorschlag pro Modul zur Abnahme, emittiert nach Abnahme eine deterministische Seed-Migration `129_v101_module_delivery_flags_seed.sql` (Generator-Muster wie `gen-mig128-fachmodule-seed.py`).
2. **Live-Scoring-Server-Action (Runtime, FEAT-097 P2).** `assessModulAnswer(sessionId, modulKey, frageId, answer)` in `src/lib/stb-vertikale/module-delivery/*` — synchroner Haiku-Call (temp 0, kleiner Token-Budget), bewertet Vollstaendigkeit/Risiko der Antwort **im Kontext der Frage-Flags**; fail-open (kein Block bei LLM-Fehler); erzeugt bei Bedarf eine kontextuelle Rueckfrage. Guardrail: Trigger-Schwelle + Max-Rueckfragen/Block.
3. **Rueckfrage-UI (Runtime, FEAT-097 P2).** Inline im Modul-Capture-Wizard (Reuse `QuestionnaireWorkspace`): nach Antwort einer geflaggten Kern-Frage erscheint bei Trigger eine adaptive Rueckfrage; Antwort → per `followup.<block>.<qid>`-Merge in `block_checkpoint.content`.
4. **Modul-Reife-Ampel (Runtime, FEAT-096 P1-Runtime, DEC-253/C).** Pure-Function `computeModulReifeAmpel(flags, triggerHits)` → green/yellow/red, in `capture_session.metadata`; im Workspace-Reader (`dashboard/stb/workspace/*`) pro Modul sichtbar.
5. **SOP-Bruecke (Runtime, FEAT-098 P3, DEC-253/D).** Mapping `modul_output` (accepted) + Scoring → `sop`-Rows; Legacy-Worker unberuehrt. Eigener spaeterer Slice.

### 4. Data Model
- **KEINE neue Tabelle.** Nur additive Nutzung bestehender Strukturen:
  - `template.blocks[].questions[].flags` (JSONB) — von MIG-129 mit den Founder-approvten Flag-Werten befuellt (heute `false`).
  - `capture_session.metadata` (JSONB) — neue Marker-Slots `modul_delivery_ampel` (per modulKey → green/yellow/red) + `modul_delivery_followups` (per frageId → Trigger-/Rueckfrage-State). Kein Schema-Touch (Muster wie `blueprint_adaptive_ampel`).
  - `block_checkpoint.content.answers` — Rueckfrage-Antworten via `followup.<block>.<qid>`-Key (Merge in Eltern-Antwort, Muster wie Evidence).
  - `sop` (bestehend) — P3-Bruecke schreibt hier.
- **1 Migration: MIG-129** (Daten-Seed, kein DDL): UPDATE der 17 Modul-`template`-Rows mit den Flag-Werten + `NOTIFY pgrst`.

### 5. Data Flow
1. **Design-Time (einmalig):** Skill `/module-delivery` → Sonnet klassifiziert Flags je Frage → Founder-Abnahme → MIG-129 → Live-Apply (Coolify, `sql-migration-hetzner.md`).
2. **Capture (P2):** Modul-`capture_session` → StB beantwortet Kern-Frage → `assessModulAnswer` (sync Haiku, liest Frage-Flags) → bei Trigger inline-Rueckfrage → Antwort → `followup.*`-Merge in `block_checkpoint.content` + Trigger-Hit in `capture_session.metadata`.
3. **Ampel (P1-Runtime):** nach Block-Abschluss `computeModulReifeAmpel(flags, triggerHits)` → `capture_session.metadata.modul_delivery_ampel` → Workspace-Reader zeigt Modul-Ampel.
4. **Synthese (unveraendert):** `assembleQaPairs` sammelt angereicherte Antworten (inkl. gemergter Followups) → bestehende `module_output_synthesis` (kein Touch).
5. **SOP-Bruecke (P3):** accepted `modul_output` + Scoring → `sop`-Rows.

### 6. External Dependencies
Keine neue externe Abhaengigkeit. **NEU genutzt: Bedrock Haiku 4.5** (`eu.anthropic.claude-haiku-4-5-20251001-v1:0`, eu-central-1) fuer Live-Bewertung — Adapter `src/lib/ai/bedrock-haiku/*` existiert (V9 SLC-166). Sonnet 4 (vorhanden) fuer Autoring. Beide EU (data-residency).

### 7. Security / Privacy
- Data-Residency: Live-Haiku + Autoring-Sonnet beide eu-central-1 (Bedrock Frankfurt). Audit der Live-Calls via `error_log` (provider/region/model), Muster wie `assessAnswerAmpel`; **kein `ai_cost_ledger` fuer den Mikro-Live-Call in V1** (vermeidet ai_jobs-job_type-CHECK-Migration) — bewusster Tradeoff (KNOWN_ISSUES, wie ISSUE-107 beim Blueprint). Der Autoring-Lauf (Batch, teurer) SOLL ledger-getrackt sein.
- Tenant-Isolation: alle Reads/Writes ueber bestehende RLS (`capture_session`/`block_checkpoint`/`modul_output`), keine neue BYPASSRLS-Flaeche. MIG-129 = reiner Content-Seed (kein RLS-Impact).
- Gating: hinter bestehendem `NEXT_PUBLIC_ENABLE_STB_VERTIKALE`-Flag (Internal-Test-Mode, `module-lifecycle-discipline`).

### 8. Constraints / Tradeoffs
- **DEC-253/A:** synchroner Haiku-Live-Call statt Job-Queue — Echtzeit-Zwang; Tradeoff: Latenz pro Frage (Mitigation: Haiku statt Sonnet, Block-Advance-Batch-Fallback, fail-open) + keine Ledger-Kostenverfolgung des Mikro-Calls in V1.
- **DEC-253/B:** Flags im Template-JSONB-Seed statt Override-Tabelle — Determinismus vs. Iterations-Reibung (Re-Autoring = neue Migration). Bewusst (Founder).
- **DEC-253/C:** regel-basierte Ampel statt LLM — pruefbar/guenstig; Tradeoff: Regel-Schwellen sind grob (Founder kann spaeter verfeinern).
- **DEC-253/D:** duenne SOP-Bruecke statt Legacy-Ablösung — niedriges Risiko; Tradeoff: zwei SOP-Erzeugungspfade koexistieren (Legacy + Bruecke), Konsolidierung spaeter.
- Additiv: 1 Migration (129, reiner Seed), 0 neue Tabelle, 0 Aenderung bestehender OP-Funktionen (Regressions-Ziel).

### 9. Migrations-Skizze (MIG-129)
`129_v101_module_delivery_flags_seed.sql` (additiv, Daten-Seed): UPDATE der 17 `stb_modul_*`-`template`-Rows — setzt in `blocks[].questions[].flags` die Founder-approvten Werte (`owner_dependency`/`deal_blocker`/`sop_trigger`/`ko_hart`/`ko_soft`), idempotent (deterministischer Generator, uuid5-stabile Frage-Refs wie MIG-128), + `NOTIFY pgrst, 'reload schema'`. Kein DDL, kein RLS-Touch. Naechste freie SQL-Datei = **129**. Live-Apply via `sql-migration-hetzner.md`; DB-Sidecar-Verify (App-Zod, Muster RPT-542): Flags gesetzt + Modul-Content unveraendert.

### 10. Offene technische Fragen (im /slice-planning / /backend zu fixieren)
- **F-A:** Trigger-Schwelle + Max-Rueckfragen/Block — konkrete Werte (Produkt-Guardrail gegen Nervfaktor, R3).
- **F-B:** Latenz-Budget — assess pro Frage vs. beim Block-Advance (wie Blueprint offene Frage 3).
- **F-C:** Autoring-Lauf-Kalibrierung — Prompt-Guardrails, damit Sonnet Flags nicht zu aggressiv setzt (R2); Abnahme-UX pro Modul.
- **F-D:** SOP-Bruecken-Kontrakt (P3) — welche `output_kind`/Scoring-Kombination wird SOP-Sektion; Mapping-Detail (eigener Slice).
- **F-E:** Rueckfrage-Fluss in die Ampel — wie „Trigger-Hit" nach Rueckfrage-Antwort aufgeloest wird (bleibt yellow/red oder heilt bei guter Nachantwort).

### 11. Empfohlener naechster Schritt
`/slice-planning V10.1` — 3 Phasen in Slices schneiden. Vorschlag-Reihenfolge: **P1** (Skill-Autoring-Lauf + MIG-129 + Regel-Ampel) → **P2** (Live-Haiku-Bewertung + inline-Rueckfrage + Followup-Merge) → **P3** (SOP-Bruecke). P1 zuerst, weil P2 die gesetzten Flags braucht.

## V10.2 Architecture Addendum — Berater-KI-Workspace "Mein Tag" (Cross-Mandant) (RPT-563, 2026-07-04)

### 1. Architektur-Summary
Ein neuer **cross-Mandanten Berater-Workspace** unter `/admin/mein-tag`, gebaut fast vollstaendig aus Reuse: der bestehende `strategaize_admin`-Gate (`src/app/admin/layout.tsx:27`), das Cross-Tenant-Aggregat-Pattern (`src/lib/cockpit/load-cross-tenant.ts` via `createAdminClient`), der Bedrock-Haiku-Client (`src/lib/ai/bedrock-haiku`), der bestehende Bedrock-Sonnet-Pfad (module_output_synthesis), der Titan-Embedding-Adapter (`src/lib/ai/embeddings`), die RAG-RPC (`rpc_search_knowledge_chunks`, MIG-036) und der Whisper-Provider (`src/lib/ai/whisper`). **Kernentscheid: V10.2 ist migrations-frei** — die gesamte Aggregation liegt im Query-Layer (service-role nach Gate), es entstehen keine neuen Tabellen, Views, RPCs oder CHECK-Constraint-Aenderungen. Echter Neubau = (a) die Workspace-Shell/UI, (b) fuenf Bericht-Loader + je ein Haiku-Kurzfazit, (c) die RAG-Frage-Antwort-Kette (Embedding → Search → Sonnet-Antwort mit Quellen) inkl. Coverage-Guard, (d) eine duenne admin-gated Transcribe-Route.

### 2. Hauptkomponenten
| Komponente | Ort (neu/reuse) | Verantwortung |
|---|---|---|
| **Workspace-Page** | `src/app/admin/mein-tag/page.tsx` (neu) | Server-Component, Gate via `admin/layout.tsx`-Reuse, rendert Shell |
| **WorkspaceShell** | `src/components/workspace/` (neu) | Hybrid-Layout: Berichts-Buttons oben · Frage-Box (Text+Sprache) mitte · Antwort-Fenster unten |
| **Bericht-Loader** | `src/lib/workspace/reports/*.ts` (neu) | 5 Loader (je `loadX(admin): Promise<XReport>`) via `createAdminClient` nach Gate |
| **KI-Kurzfazit** | `src/lib/workspace/fazit.ts` (neu) | `invokeHaiku` mit expliziter modelId, zod-Schema, fail-open, error_log-Audit |
| **RAG-Kette** | `src/lib/workspace/rag.ts` + `src/app/admin/mein-tag/rag-action.ts` (neu) | Frage → Titan-Embedding → `rpc_search_knowledge_chunks(tenant)` → Sonnet-Antwort+Zitate; Coverage-Guard |
| **Admin-Transcribe** | `src/app/api/admin/transcribe/route.ts` (neu, duenn) | strategaize_admin-gated Wrapper um `getWhisperProvider()`; in-memory, DSGVO |
| **Cross-Tenant-Aggregat** | `load-cross-tenant.ts` (reuse/erweitern) | Basis fuer Bericht 1 (Mandanten-Uebersicht) |
| **Ampel-Compute** | `computeModulReifeAmpel` (`module-delivery/reife-ampel.ts:44`, reuse) | Modul-Reife-Rollup pro Mandant (pure fn) |
| **AdminSidebar** | `src/components/admin-sidebar.tsx:9` (reuse/erweitern) | neues NAV_ITEM `/admin/mein-tag` |

### 3. Datenfluss
- **Berichte:** Page (Gate) → `createAdminClient` → Bericht-Loader (Multi-Query cross-Tenant) → visuelle Aggregation gerendert → Button-Klick auf "Kurzfazit" → Server-Action `invokeHaiku(zahlen)` → 2-3-Satz-Text (on-demand, kein Cache in V1).
- **RAG:** Frage (Text ODER Sprache→`/api/admin/transcribe`→Text) + gewaehlter Mandant → Server-Action: Titan-`embed(frage)` → `rpc_search_knowledge_chunks(embedding, tenant_id, limit)` → Top-Chunks → Coverage-Guard (siehe §7) → Sonnet-Prompt mit Kontext+Zitier-Instruktion → Antwort + Quellenliste.

### 4. Datenmodell / Storage
**Keine Aenderung.** Reuse-Reads: `tenants`, `profiles`, `capture_session`, `block_checkpoint`, `block_diagnosis`, `modul_output`, `capture_session.metadata.modul_delivery_ampel`, `knowledge_unit`, `validation_layer`, `ai_jobs`, `error_log`, `knowledge_chunks`, `bridge_run`, `handbook_snapshot`. Timeline-Quellen (created_at, tenant-scoped): `capture_events`, `diagnose_event`, `modul_output`, `validation_layer`, `block_checkpoint`, `ai_jobs`.

### 5. Externe Abhaengigkeiten
Bedrock Frankfurt eu-central-1 (Haiku 4.5 für Kurzfazit; Sonnet für RAG-Antwort; Titan V2 für Query-Embedding) — alle Adapter existieren, Region hardcoded EU. Whisper self-hosted `http://whisper:9000` (in-memory). Keine neuen Provider.

### 6. Security / Privacy
- **Cross-Tenant nur nach Gate:** `createAdminClient` (BYPASSRLS) wird ausschliesslich nach `strategaize_admin`-Check aufgerufen (`admin/layout.tsx`-Gate + expliziter Re-Check im Server-Action/Loader, kein Fallback auf `auth.user()` — security-audit-fable5-standard).
- **RAG-tenant_id server-derived:** die gewaehlte Mandanten-ID wird server-seitig nach dem Admin-Gate an `rpc_search_knowledge_chunks` gebunden; nie ungeprueft aus dem Client uebernommen. Kein tenant → keine Suche (fail-closed).
- **Whisper in-memory** (keine Persistenz, DSGVO, DEC-017-Linie); Admin-Transcribe-Route strategaize_admin-gated.
- **Kein Customer-Outreach** (module-lifecycle-discipline, Internal-Test-Mode).

### 7. Constraints, Tradeoffs, Risiken
- **0 Migrationen** (DEC-260): Aggregation im Query-Layer statt Views/RPCs — bewusst boring/reviewable. Tradeoff: bei sehr vielen Mandanten Multi-Query-Last; akzeptabel im Internal-Test-Mode, View-Optimierung ist ein spaeterer Slice.
- **RAG-Coverage-Risiko (KRITISCH, ISSUE-112):** `embedKnowledgeUnits()` (`src/workers/condensation/embed-knowledge-units.ts`) ist **fire-and-forget** (`handle-job.ts:208` `.catch(log)`); scheitert er, bleibt `knowledge_chunks` fuer den Tenant still leer und `rpc_search_knowledge_chunks` liefert 0 → eine RAG-Antwort waere wertlos/halluzinationsanfaellig. **Mitigation in FEAT-101 (DEC-261):** Coverage-Guard vor der Antwort — Query `count(knowledge_unit) vs count(knowledge_chunks, source_type='knowledge_unit')` pro Mandant; bei Luecke: ehrlicher Hinweis "keine/teilweise indexierten Erkenntnisse" statt erfundener Antwort, plus optionaler Re-Embed-Trigger (Reuse `embedKnowledgeUnits`). Kein neuer Embedding-Pipeline-Bau in V10.2.
- **Kosten-Audit statt Ledger (DEC-259):** LLM-Calls schreiben `error_log`-Audit (Provider/Region/Model), NICHT `ai_cost_ledger` — konsistent mit dem Micro-Call-Praezedenzfall ISSUE-107 (assess-answer). Vermeidet CHECK-Constraint-Migration für neue Ledger-Rollen. `ai_cost_ledger`-Integration deferred, falls Volumen relevant wird.
- **ISSUE-111-Falle:** Haiku-Call MUSS explizit `modelId: "eu.anthropic.claude-haiku-4-5-20251001-v1:0"` uebergeben (nicht auf `BEDROCK_V9_HAIKU_MODEL_ID`-ENV verlassen — der wird vom V9-bulk-email geteilt).

### 8. Offene technische Fragen (→ /slice-planning V10.2)
- F-A2: Bericht-Loader-Modularisierung — 5 separate Loader vs. 1 Sammel-Loader (Latenz vs. Granularitaet).
- F-B2: RAG-Reranking — reicht der pgvector-Top-N oder leichtes Re-Ranking vor Sonnet-Injektion.
- F-C2: Sprach-Aufnahme-UI — MediaRecorder-Blob (Reuse `questionnaire-form.tsx transcribeRecording`-Pattern) an admin-Transcribe.

### 9. Empfohlene Implementierungs-Richtung
Slice-Schnitt: **SLC-A Shell + Gate + Nav** (FEAT-099) → **SLC-B 5 Berichte (visuell) + Kurzfazit** (FEAT-100) → **SLC-C RAG-Kette + Coverage-Guard + Sprach-Eingabe** (FEAT-101). SLC-A zuerst (Shell traegt B+C). B vor C, weil die visuellen Berichte 0 LLM-Abhaengigkeit haben (schneller Nutzen) und C den kritischen Coverage-Guard braucht.

### 10. Empfohlener naechster Schritt
`/slice-planning V10.2` — 3 Slices schneiden (SLC-A/B/C wie §9), je mit Acceptance-Kriterien; die fire-and-forget-Coverage-Guard-Anforderung als AC in SLC-C verankern.

## V10.2.1 Architecture Addendum — Embedding-Reliability-Härtung (ISSUE-112) (RPT-577, 2026-07-05)

### 1. Architektur-Zusammenfassung
Ein **Self-Healing Reconciliation-Cron** schließt RAG-Coverage-Lücken in `knowledge_chunks`, die durch den fire-and-forget-Embedding-Pfad (DEC-261/ISSUE-112) still entstehen können. Kein neues UI, **0 Migration, 0 neue Tabellen** — ein dünner Cron-Orchestrator über bestehende V10.2-Primitiven (`reembedTenantKnowledge` + Count-Gap-Query) im OP-Cron-Pattern. Entscheidungen in DEC-262.

### 2. Hauptkomponenten
- **Cron-Route** `src/app/api/cron/knowledge-embed-reconcile/route.ts` — GET, `runtime='nodejs'`, `dynamic='force-dynamic'`; x-cron-secret-Auth (503 ohne `CRON_SECRET`, 403 bei Mismatch, 200 Pass, 500 Throw). Dünn: Auth → Orchestrator → JSON-Summary.
- **Reconcile-Orchestrator** `src/lib/workspace/reconcile-embeddings.ts` — `reconcileEmbeddings(admin, deps?)`: listet Mandanten, prüft pro Mandant Coverage, ruft bei Lücke `reembedTenantKnowledge`, aggregiert Counts. Injizierbare Deps (hermetische Tests).
- **rag.ts de-drift-Refactor** — Count-Gap-Logik als exportierter Helper `getTenantCoverage(admin, tenantId): {kuCount, chunkCount}` (heute privat in `DEFAULT_RAG_DEPS`); Cron + RAG-Coverage-Guard teilen dieselbe Query.
- **Coolify-Scheduled-Task** `knowledge-embed-reconcile` (`*/10 * * * *`, node-fetch mit `x-cron-secret`) — Ops-Config, kein Code.

### 3. Verantwortlichkeiten
- Route = Auth-Gate + Aufruf + Response (keine Business-Logik).
- Orchestrator = Enumeration (`tenants.select("id")`) + per-Tenant `getTenantCoverage` + sequentieller Re-Embed bei Gap (Cap `MAX_TENANTS_PER_RUN=25`) + Summary.
- `reembedTenantKnowledge` (unverändert, V10.2) = idempotenter Titan-Batch + Upsert pro Mandant.
- `getTenantCoverage` (neu, aus rag.ts) = die eine Wahrheit der Gap-Definition.

### 4. Datenmodell / Storage
**0 Migration.** `knowledge_chunks` unverändert; Idempotenz über bestehenden Unique-Constraint (`source_type, source_id, chunk_index`). Enumeration über `tenants(id)`. Keine neue Tabelle/Spalte/RPC/View.

### 5. Datenfluss
Coolify-Tick (`*/10`) → `GET /api/cron/knowledge-embed-reconcile` (x-cron-secret) → Auth-Guard → `reconcileEmbeddings(admin)`: `tenants.select("id")` → **sequentiell** je Mandant `getTenantCoverage` → wenn `chunkCount < kuCount`: `reembedTenantKnowledge` (Titan-Batch → Upsert) → akkumuliere `{tenantsChecked, tenantsWithGap, chunksReembedded, failures, capped}` → `captureInfo`-Summary → `200` JSON. Fehler pro Mandant: `captureException`, fail-open (blockt andere nicht).

### 6. Externe Abhängigkeiten
Amazon Titan V2 Embeddings via `getEmbeddingProvider()` (Bedrock **eu-central-1**, unverändert). Keine neue Integration.

### 7. Security / Privacy
`createAdminClient` (service-role/BYPASSRLS) — zulässig: trusted server-side Reconciliation ohne User-Kontext, hinter x-cron-secret-Gate (security-audit-standard: Admin-Client nach vertrauenswürdigem Gate). Alle Writes tenant-scoped (`reembedTenantKnowledge` filtert `.eq('tenant_id', tenantId)`, Chunks tragen `tenant_id`) → kein Cross-Tenant-Leak. Logs enthalten nur Counts + `tenant_id`, keine PII. EU-Data-Residency: Titan Frankfurt unverändert.

### 8. Constraints & Tradeoffs
- **Reembed-all-on-gap** statt only-missing (R1) — akzeptiert, idempotent, kleine Skala.
- **Sequentiell** statt parallel — Throttle-freundlich, minimal langsamer (bei kleiner N irrelevant).
- **Per-Tenant-Counts** statt Aggregat-RPC (DEC-262) — 0 Migration; Skalierungs-Promotion geparkt.
- **`MAX_TENANTS_PER_RUN=25`** — Safety-Cap; Rest heilt nächster Tick; Cap-Hit wird geloggt.

### 9. Offene technische Fragen
Keine blockierenden. Backend-Detail: exakter Cap-Wert (Default 25) + ob `getTenantCoverage` `status='active'` mitfiltert (ja — identisch zum V10.2-Guard).

### 10. Empfohlener nächster Schritt
`/slice-planning V10.2.1` — 1 Slice **SLC-185** (Cron-Route + Reconcile-Orchestrator + rag.ts-Helper-Extraktion + Route-Tests + Coolify-Task), Acceptance = SC1–SC6 aus PRD §V10.2.1. Kein Migrations-Slice.
