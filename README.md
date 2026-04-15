# Strategaize Onboarding-Plattform

Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung.

## Status

**Aktuelle Phase:** Discovery

Die Plattform wurde am 2026-04-14 initialisiert. Code-Basis aus Blueprint V3.4 uebernommen. Scope, Template-Strategie und Capture-Modi werden in `/discovery` und `/requirements` festgelegt.

## Was diese Plattform ist

Die Onboarding-Plattform ist ein Baukasten-System fuer Wissenserhebung. Aus einer gemeinsamen Codebasis entstehen verschiedene Produktvarianten (Templates), die jeweils unterschiedliche Capture-Modi kombinieren — z.B.:

- **Exit-Readiness-Analyse** (Nachfolger von Blueprint): Fragebogen + Mirror-Befragung fuer Firmen-Owner
- **Immobilien-Onboarding:** Datensammlung + Dokumenten-Upload fuer Immobilien-Verkaeufer
- **Mitarbeiter-Discovery:** Interview + Voice-Transkription fuer Team-Integration

Neue Templates lassen sich spaeter ohne Code-Aenderung anlegen.

## Deployment-Modelle

Die Plattform ist bewusst fuer drei Betriebsmodelle ausgelegt:

1. **Multi-Tenant SaaS** — viele Kunden, ein Server, Isolation ueber Row-Level-Security
2. **Single-Tenant SaaS** — ein Kunde, eigener Server, gleicher Docker-Stack
3. **On-Premise** — Kunde erhaelt Docker-Compose-Paket und hostet selbst

## Tech Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase self-hosted (PostgreSQL + Auth + Storage)
- Docker Compose
- Hetzner + Coolify

## Development

```bash
npm install
npm run dev
```

Dev-Server laeuft auf `localhost:3000`.

## Running Tests

Die Test-Infra (Vitest + pg-Client) laeuft gegen eine echte Postgres-Instanz mit geladenem Onboarding-Schema. Jeder Test startet eine Transaktion, fuehrt Assertions aus und rollt zurueck — der DB-Zustand wird nie geaendert.

### Voraussetzung

Eine erreichbare Postgres-DB mit dem Onboarding-Schema. Optionen:

**a) Hetzner-DB via SSH-Tunnel (empfohlen fuer Dev)**

```bash
ssh -L 5433:127.0.0.1:5432 root@159.69.207.29 \
  -o 'ExitOnForwardFailure=yes' \
  docker exec -i supabase-db-bwkg80w04wgccos48gcws8cs-083715570318 \
  socat TCP-LISTEN:5432,reuseaddr,fork TCP:127.0.0.1:5432
```

Alternativ: Coolify-Port fuer den Supabase-DB-Container temporaer exposen und dann einen einfachen `ssh -L 5433:localhost:<port> root@159.69.207.29` nutzen.

**b) Tests direkt auf dem Hetzner-Server ausfuehren**

```bash
ssh root@159.69.207.29
cd /path/to/onboarding
npm install
TEST_DATABASE_URL=postgresql://postgres:<password>@localhost:5432/postgres npm run test
```

### ENV-Konfiguration

Lege `.env.test` im Repo-Root an (nicht committen, liegt in `.gitignore`):

```
TEST_DATABASE_URL=postgresql://postgres:<password>@localhost:5433/postgres
```

### Test-Kommandos

```bash
npm run test            # einmaliger Lauf
npm run test:watch      # Watch-Mode
npm run test:coverage   # Coverage-Report (text + html)
```

Coverage-HTML-Report liegt danach unter `coverage/index.html`.

### Was die Tests abdecken

- **RLS-Isolation** (`src/lib/db/__tests__/rls-isolation.test.ts`): 2-Tenant-Szenarien fuer `capture_session`, `knowledge_unit`, `validation_layer`. Verifiziert, dass `tenant_admin` von Tenant A niemals Rows von Tenant B sieht und auch nicht Cross-Tenant schreiben kann.

### Test-Konventionen

- Tests leben co-located in `__tests__/`-Ordnern neben dem getesteten Code.
- Shared Helpers unter `src/test/` (DB-Connection, JWT-Claim-Context, Fixtures).
- Jeder Test startet in einer Transaktion (`withTestDb`) — ROLLBACK ist Pflicht.
- JWT-Claim-Simulation via `SET LOCAL request.jwt.claims` + `SET LOCAL ROLE authenticated` (`withJwtContext`).

## Dokumentation

- `docs/STATE.md` — Aktueller Projektstand
- `docs/PRD.md` — Product Requirements (Discovery in Arbeit)
- `docs/ARCHITECTURE.md` — Architektur (Discovery in Arbeit)
- `docs/DECISIONS.md` — Entscheidungen
- `CLAUDE.md` — Entwicklungs-Leitfaden fuer KI-gestuetzte Arbeit

## Workflow

Dieses Projekt wird ueber das Strategaize Dev System gesteuert. Siehe `CLAUDE.md` fuer den Skill-Workflow (`/discovery` -> `/requirements` -> `/architecture` -> ...).
