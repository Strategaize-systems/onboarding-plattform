# Strategaize Onboarding-Plattform

## Purpose

Vereinte Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Kombiniert mehrere Capture-Modi (Fragebogen, Meeting-Aufzeichnung, Voice-Input, Dokumenten-Upload u.a.) mit einem Template-System, das mehrere Produktvarianten aus einer Codebasis ermoeglicht (z.B. Exit-Readiness, Immobilien-Onboarding, Mitarbeiter-Discovery).

Dieses Projekt wird ueber das Strategaize Dev System gesteuert. Das Dev System Repository (`strategaize-dev-system`) enthaelt alle Rules, Skills und Workflow-Definitionen.

> Self-hosted auf Hetzner. Kein Vercel, kein Supabase Cloud, keine externen Dienste.
> Deployment via Coolify + Docker Compose.

## Tech Stack

- **Framework:** Next.js 15 (App Router), TypeScript
- **Styling:** Tailwind CSS + shadcn/ui (copy-paste components)
- **Backend:** Supabase self-hosted (PostgreSQL + GoTrue Auth + Storage API)
- **Deployment:** Self-hosted auf Hetzner VM via Coolify + Docker Compose
- **Validation:** Zod + react-hook-form
- **State:** React useState / Context API
- **AI-Services:** Claude Sonnet 4 via AWS Bedrock (Frankfurt-Region), Whisper (Transkription)

## Core Principles

- **Deployment-Flexibilitaet:** Multi-Tenant SaaS, Single-Tenant SaaS und On-Premise aus einer Codebasis. Keine Hardcoded Domains/Tenants/Kunden-Namen. Konfiguration ausschliesslich ueber Environment-Variablen.
- **Tenant-Isolation auf DB-Ebene:** PostgreSQL Row Level Security auf jeder tenant-scoped Tabelle. Keine Applikations-seitige Filterung als alleinige Isolation.
- **Template-ready:** Datenmodell und Kernmodule so bauen, dass spaeter ein Template-System (in DB verwaltet) angesetzt werden kann, ohne Schema-Breaks. V1 muss kein echtes Template-System liefern.
- **Capture-Modi als Module:** Verschiedene Erfassungsarten (Fragebogen, Meeting, Voice, etc.) werden als voneinander unabhaengige Module entworfen.
- **Invite-only Auth:** Kein offener Self-Signup. Zugang nur ueber Admin-Einladung.
- **Self-hosted:** Alle Dienste laufen auf kontrollierter Infrastruktur.

## Project Structure

```
src/
  app/              Pages (Next.js App Router) + API Routes
  components/
    ui/             shadcn/ui components (NEVER recreate these)
  hooks/            Custom React hooks
  lib/              Utilities (supabase clients, api-utils, validations)
sql/
  schema.sql        Database tables + views
  rls.sql           RLS policies + grants
  functions.sql     SECURITY DEFINER functions
  migrations/       Versionierte DB-Migrationen
features/           Feature specifications
  INDEX.md          Feature status overview
slices/             Slice tracking
  INDEX.md          Slice status overview
docs/
  STATE.md          Current project state
  PRD.md            Product Requirements Document
  ARCHITECTURE.md   Technical architecture
  DECISIONS.md      Key decisions log
  KNOWN_ISSUES.md   Known problems
  RELEASES.md       Release history
  MIGRATIONS.md     Schema/structural migrations
  SKILL_IMPROVEMENTS.md  Projekt-spezifische Prozess-Verbesserungen
planning/
  roadmap.json      Version roadmap
  backlog.json      Work item backlog
reports/            Skill completion reports (RPT-XXX.md)
```

## Build & Test Commands

```bash
npm run dev        # Development server (localhost:3000)
npm run build      # Production build
npm run lint       # ESLint
npm run start      # Production server
```

## Workflow

Dieses Projekt folgt dem Strategaize Dev System Workflow:

1. `/discovery` (wenn Idee noch grob)
2. `/requirements`
3. `/architecture`
4. `/slice-planning`
5. `/frontend` und/oder `/backend` (pro Slice)
6. `/qa` (nach jedem Slice + Gesamt-QA)
7. `/final-check`
8. `/go-live`
9. `/deploy`
10. `/post-launch`

## Herkunft der Code-Basis

Die initiale Code-Basis wurde am 2026-04-14 aus `strategaize-blueprint-plattform` V3.4 uebernommen. Blueprint-spezifische Features (questionnaires, mirror, debrief, owner-profile) sind zunaechst aktiv im Code und werden in spaeteren Slices entweder auf generische Plattform-Konzepte umgebaut oder als erstes Template gekapselt.

Details: siehe `docs/DECISIONS.md` DEC-001 und DEC-003.

## Project Records

@docs/STATE.md
@docs/PRD.md
@features/INDEX.md

## Key Conventions

- **Feature IDs:** FEAT-001, FEAT-002, etc.
- **Slice IDs:** SLC-001, SLC-002, etc.
- **Commits:** `feat(FEAT-XXX): description`, `fix(FEAT-XXX): description`
- **shadcn/ui first:** NEVER create custom versions of installed shadcn components
- **Single Responsibility:** One feature per spec file, one slice per implementation unit
- **Human-in-the-loop:** Implementation-Slices haben Approval-Checkpoints via /qa
