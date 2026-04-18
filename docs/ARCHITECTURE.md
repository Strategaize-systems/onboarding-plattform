# Architecture

## Status
V1-Architektur festgelegt am 2026-04-14.

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
