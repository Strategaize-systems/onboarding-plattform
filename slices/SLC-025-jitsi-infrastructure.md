# SLC-025 — Jitsi Infrastructure

## Goal
Eigene Jitsi+Jibri-Instanz auf dem Onboarding-Server (159.69.207.29) deployen. JWT-Auth, Recording-Faehigkeit, Smoke-Test. Basis fuer alle Meeting-Features.

## Feature
FEAT-017

## In Scope
- Docker-Compose Jitsi-Block (5 Services) in bestehendes Compose integrieren
- Host-Level snd-aloop Setup
- Jitsi-Secrets generieren
- DNS-Record fuer Meeting-Subdomain
- Hetzner Firewall UDP/10000
- JWT-Smoke-Test-Script
- Coolify ENV-Konfiguration

## Out of Scope
- App-Code-Aenderungen (kein Jitsi-Embed, kein JWT aus App)
- Meeting Guide, Dialogue Session
- Finalize-Script (kommt in SLC-030)

## Acceptance Criteria
- AC-1: Alle 5 Jitsi-Container Up (`docker ps --filter name=jitsi`)
- AC-2: XMPP-Auth ok (`Authenticated as` in prosody-Logs)
- AC-3: Externer HTTPS-Zugriff (`curl -sI https://meet.<domain>` → 200)
- AC-4: JWT-Auth verifiziert (Smoke-Test-Script oeffnet Meeting)
- AC-5: Recording funktioniert (Aufnahme starten → MP4 im Volume)
- AC-6: `/dev/snd` in Jibri gemappt

## Dependencies
- Keine (erster V3-Slice, rein infrastrukturell)

## Risks
- R11: Server-RAM-Budget (CPX62 wird eng mit Jibri)
- 7 dokumentierte Blocker aus Business System — alle im Dev System Rule vorweggenommen

## Worktree
Nicht noetig (Infra-Slice, aendert nur docker-compose.yml + Scripts)

### Micro-Tasks

#### MT-1: Docker-Compose Jitsi-Block
- Goal: 5 Jitsi-Services + Volumes + Network im bestehenden docker-compose.yml ergaenzen
- Files: `docker-compose.yml`
- Expected behavior: `docker compose config` validiert ohne Fehler. 5 neue Services, 6 neue Volumes, 1 neues Network sichtbar.
- Verification: `docker compose config | grep jitsi` zeigt alle 5 Services
- Dependencies: none

#### MT-2: Jitsi-Secrets + ENV-Dokumentation
- Goal: 6 Secrets generieren, ENV-Variablen dokumentieren
- Files: `docs/RUNBOOK.md` (oder ENV-Sektion), `.env.example`
- Expected behavior: Alle 6 Jitsi-Secrets als ENV-Variablen definiert. RUNBOOK beschreibt Generierungs-Befehl.
- Verification: `.env.example` enthaelt alle JITSI_* Variablen
- Dependencies: MT-1

#### MT-3: JWT-Smoke-Test-Script
- Goal: Node-Script das einen Test-JWT erzeugt und Meeting-URL ausgibt
- Files: `scripts/gen-jitsi-jwt.mjs`
- Expected behavior: `JITSI_JWT_APP_SECRET=x node scripts/gen-jitsi-jwt.mjs test-room` gibt fertige Meeting-URL aus
- Verification: Script laeuft lokal ohne Fehler, JWT ist gueltig (base64-decodierbar)
- Dependencies: MT-2

#### MT-4: Host-Level Setup + DNS + Firewall
- Goal: snd-aloop laden, DNS-Record setzen, UDP/10000 in Hetzner-Firewall oeffnen
- Files: keine Repo-Dateien (Server-Konfiguration)
- Expected behavior: `lsmod | grep snd_aloop` zeigt Modul geladen. DNS resolves. UDP/10000 offen.
- Verification: `modprobe snd_aloop && ls /dev/snd/` zeigt Audio-Devices
- Dependencies: none (parallel zu MT-1..3)

#### MT-5: Coolify Deploy + Smoke-Test
- Goal: Compose auf Coolify deployen, alle 5 Container verifizieren, Recording testen
- Files: keine (Coolify-UI + SSH)
- Expected behavior: Alle AC-1 bis AC-6 bestanden
- Verification: Verifikations-Checkliste aus jitsi-jibri-deployment Rule durchlaufen
- Dependencies: MT-1, MT-2, MT-3, MT-4
