# FEAT-017 — Jitsi Meeting Infrastructure

## Problem Statement

Die Onboarding-Plattform braucht fuer den Dialogue-Mode eine eigene Video-Meeting-Infrastruktur mit Server-seitigem Recording. Das Business System hat bereits Jitsi+Jibri auf einem separaten Server (91.98.20.191) deployed. Die Onboarding-Plattform muss eine eigenstaendige Instanz betreiben, um unabhaengig vom Business System zu bleiben (unterschiedliche Server, unabhaengiges Deployment, eigene JWT-Konfiguration).

## Goal

Eigene Jitsi+Jibri-Instanz auf dem Onboarding-Server (159.69.207.29) mit JWT-Auth, Recording-Faehigkeit und Docker-Compose-Integration. Basis fuer alle Meeting-basierten Features (FEAT-019, FEAT-020).

## Users

- **DevOps (User/Gruender):** Deployed und wartet die Jitsi-Instanz via Coolify
- **Alle Meeting-Teilnehmer:** Nutzen die Jitsi-Infrastruktur indirekt ueber die Plattform-UI

## Scope

### In Scope

1. **Docker-Compose: 5 Jitsi-Services**
   - jitsi-web (Frontend)
   - jitsi-prosody (XMPP-Hub mit Netzwerk-Aliases)
   - jitsi-jicofo (Konferenz-Fokus)
   - jitsi-jvb (Video-Bridge)
   - jitsi-jibri (Recording, `shm_size: 2gb`, `devices: /dev/snd`)

2. **Host-Level-Setup**
   - `snd-aloop` Kernel-Modul laden und persistieren
   - Hetzner Cloud Firewall: UDP/10000 oeffnen
   - DNS-Record fuer Meeting-Subdomain

3. **JWT-Auth per Tenant**
   - `ENABLE_AUTH=1`, `AUTH_TYPE=jwt`
   - JWT-App-ID + Secret in ENV
   - JWT-Generierung in der Plattform fuer authentifizierte Teilnehmer

4. **Traefik-Integration**
   - Port 80 Service-Label (nicht Port 443)
   - `traefik.docker.network` fuer Multi-Network-Routing
   - Eine Service-Definition, beide Router per `.service=` gelinkt

5. **Recording-Konfiguration**
   - `ENABLE_RECORDING=1` an jitsi-web, jitsi-prosody, jitsi-jicofo
   - `PUBLIC_URL` am jitsi-jibri Container
   - Jibri-Secrets (5 separate Passwoerter)
   - Recording-Volume fuer MP4-Output

6. **XMPP-Aliases auf prosody**
   - meet.jitsi, auth.meet.jitsi, muc.meet.jitsi, internal-muc.meet.jitsi, recorder.meet.jitsi, guest.meet.jitsi

7. **Smoke-Test-Helper**
   - JWT-Generator-Script (analog Business System `scripts/gen-test-jwt.mjs`)

### Out of Scope

- Jitsi-UI-Customizing (Branding, Farben) → V3.1 bei Bedarf
- coturn/TURN-Server fuer NAT-Traversal → bei externen Teilnehmern evaluieren
- Jitsi Clustering (mehrere JVBs) → nicht noetig bei aktuellem Volumen
- Automatisches Jibri-Scaling → V4+

## Acceptance Criteria

**AC-1 — Alle 5 Jitsi-Container laufen**
`docker ps --filter name=jitsi` zeigt alle 5 Services im Status "Up".

**AC-2 — XMPP-Auth funktioniert**
`docker logs jitsi-prosody` zeigt "Authenticated as" fuer focus, jvb und jibri.

**AC-3 — Externer HTTPS-Zugriff**
`curl -sI https://meet.onboarding-domain/` liefert HTTP 200.

**AC-4 — JWT-Auth verifiziert**
Ein mit dem Smoke-Test-Helper generierter JWT oeffnet ein Meeting. Ohne JWT wird der Zugang verweigert.

**AC-5 — Recording funktioniert**
Im Test-Meeting: "Aufzeichnung starten" → Jibri-Recording laeuft → nach Stop: MP4-Datei im Recording-Volume.

**AC-6 — /dev/snd in Jibri gemappt**
`docker exec jitsi-jibri ls /dev/snd/` zeigt Audio-Devices.

**AC-7 — Unabhaengig vom Business System**
Eigene JWT-Secrets, eigene Docker-Compose-Services, eigener DNS-Record. Kein Shared State mit Business System Jitsi.

## Reference

- Dev System Rule: `.claude/rules/jitsi-jibri-deployment.md` (7 dokumentierte Blocker + Fixes)
- Business System: `docker-compose.yml` (Commits d0e6a9a..b01d3f2) als Referenz-Template
- Jitsi-Images: `jitsi/*:stable-9258` (gepinnt)

## Risks

- **R11:** Server-Ressourcen CPX62. Jibri `shm_size: 2gb` + Chrome headless ist RAM-intensiv. Monitoring nach Deploy.
- **Hairpin-NAT:** Bei Teilnehmern auf derselben Infra kann UDP-Paketverlust auftreten. Fuer interne Tests OK, bei externen Teilnehmern evaluieren.
