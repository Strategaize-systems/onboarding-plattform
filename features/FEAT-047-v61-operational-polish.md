# FEAT-047 — V6.1 Operational-Polish (Multi-Network + Branding-Polish)

## Purpose

Sammelfeature fuer V6.1-Operational-Polish-Items, die nach V6 /post-launch (RPT-257 + RPT-258) als notwendig identifiziert wurden. Behebt drei voneinander unabhaengige Probleme:

1. **Latent-Outage-Risiko** durch Multi-Network-Falle in Coolify-Traefik-Setup (ISSUE-072) — bewirkte ~7-15h externen Outage am 2026-05-15 vor User-Hotfix-Redeploy.
2. **UX-Default-Leak** im Mandanten-Welcome-Block bei RPC-Failure-Edge-Case (ISSUE-048) — Anzeige "Ihr Steuerberater: Strategaize" statt korrektem Fallback.
3. **Performance-Inefficient** bei Branding-Resolver-Doppelaufruf pro Request (ISSUE-049) — 2x identische RPC-Aufrufe pro Mandanten-Page-Load.

## Why now

- ISSUE-072 ist BLOCKER fuer ersten echten Live-Partner — Multi-Network-Falle bleibt latent ohne Permanent-Fix
- ISSUE-048 + ISSUE-049 sind als Low-Severity klassifiziert, aber alle 3 lassen sich sehr effizient zusammen umsetzen (~2-2.5h)
- Polish-Sammelrelease vor SLC-105 Diagnose-Werkzeug spart Coolify-Redeploy-Round

## Scope

- 1 Slice: SLC-110 V6.1 Permanent-Fix Polish-Tripel
- 3 Backlog-Items: BL-099 (ISSUE-072), BL-100 (ISSUE-048), BL-101 (ISSUE-049)
- 2 DECs: DEC-114 Multi-Network-Label-Pattern, DEC-115 React-cache fuer Server-Side-Resolver
- 0 Migrations
- 0 neue Container, 0 neue ENVs, 0 neue Cron-Jobs

## Out of Scope

- SLC-105 Diagnose-Werkzeug (eigener V6.1-Hauptscope, BL-095-blockiert)
- NL-Sprach-Variante (SLC-105-Folgearbeit)
- BL-094 AVV-Template + Datenschutz/Impressum (separater Compliance-Track)

## Success Criteria

- ISSUE-072 als Permanent-Fix in Compose-Datei + verifiziert via Multi-Network-Diagnose
- ISSUE-048 als Code-Fix + Vitest-Coverage
- ISSUE-049 als React-cache-Wrap + Vitest dedupe-Test
- 5 Pflicht-Smokes nach Redeploy alle PASS
- Multi-Network-Falle nach 7-Tage-Beobachtungs-Window NICHT mehr beobachtet (kein neuer 504-Outage)

## Status

- Created: 2026-05-15
- Status: planned
- Slice: SLC-110
- Estimate: ~2-2.5h Code-Side + 10-15min User-Pflicht (Coolify) + 15min Post-Launch-Light-Smoke
