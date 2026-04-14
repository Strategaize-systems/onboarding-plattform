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

## Dokumentation

- `docs/STATE.md` — Aktueller Projektstand
- `docs/PRD.md` — Product Requirements (Discovery in Arbeit)
- `docs/ARCHITECTURE.md` — Architektur (Discovery in Arbeit)
- `docs/DECISIONS.md` — Entscheidungen
- `CLAUDE.md` — Entwicklungs-Leitfaden fuer KI-gestuetzte Arbeit

## Workflow

Dieses Projekt wird ueber das Strategaize Dev System gesteuert. Siehe `CLAUDE.md` fuer den Skill-Workflow (`/discovery` -> `/requirements` -> `/architecture` -> ...).
