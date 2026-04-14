# Architecture

## Status
Noch nicht festgelegt. Wird in /architecture nach Abschluss von /discovery und /requirements erarbeitet.

## Vorgeplante Architektur-Prinzipien (Pre-Discovery)

Diese Prinzipien gelten unabhaengig vom spaeteren Detail-Entwurf und wurden am 2026-04-14 als harte Leitplanken festgelegt:

### 1. Deployment-Flexibilitaet
Die Plattform muss in drei Modi deploybar sein, ohne Code-Forks:
- **Multi-Tenant SaaS** — viele Kunden, ein Server, Isolation via Row-Level-Security
- **Single-Tenant SaaS** — ein Kunde, eigener Server, gleicher Docker-Stack
- **On-Premise** — Kunde erhaelt Docker-Compose-Paket und hostet selbst

Konsequenz: Keine Hardcoded Domains, Tenant-IDs oder Kunden-Annahmen im Code. Alles ueber Environment-Konfiguration.

### 2. Tenant-Isolation auf DB-Ebene
Strikte Trennung ueber Supabase Row-Level-Security (RLS). Keine Applikations-seitige Filterung als alleinige Isolation.

### 3. Template-ready Architektur
Das Datenmodell und die Kernmodule muessen so gebaut sein, dass spaeter ein Template-System (in der DB verwaltet, nicht im Code) ergaenzt werden kann. V1 muss kein echtes Template-System liefern, aber darf kein Schema etablieren, das Templates unmoeglich macht.

### 4. Capture-Modi als austauschbare Module
Die verschiedenen Erfassungsarten (Fragebogen, Meeting, Voice, etc.) werden als voneinander unabhaengige Module entworfen, damit Templates spaeter Modi kombinieren koennen.

## Stack (aus Blueprint uebernommen)
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (self-hosted via Docker)
- Docker Compose
- Hetzner + Coolify

## Datenmodell
Wird in /architecture festgelegt.

## Module
Wird in /architecture festgelegt.

## Integrationen
Wird in /architecture festgelegt.
