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
