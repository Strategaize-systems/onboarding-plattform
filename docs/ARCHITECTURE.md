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
