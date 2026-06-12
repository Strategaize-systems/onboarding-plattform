# SLC-V9.1-E — Forward-Address Single-Mailbox-Display-Fix (ISSUE-098)

- Feature: FEAT-079 (Setup-UI Conversational-First)
- Version: V9.1 (Patch-Slice, Post-Deploy-Fix)
- Status: in_progress (Code + /qa Code-Side PASS; Deploy + Live-Verify Founder-gated)
- Created: 2026-06-12
- Related: ISSUE-098, DEC-211, RPT-450 (Deploy-Discovery)

## Problem

Die Forward-Setup-UI baute das Weiterleitungs-Ziel hart als
`bulk-<slug>@bulk.strategaizetransition.com` (Catchall-Form). Diese Subdomain hat
keinen MX-Record → Mails dorthin bouncen. As-built (DEC-205/206) ist Single-Mailbox:
alle Weiterleitungen laufen ueber EIN reales IONOS-Postfach
(`bulk@strategaizetransition.com`), das der IMAP-Sync abholt. Die UI fuehrte den
GF damit auf eine nicht-zustellbare Adresse — inkl. der Test-Mail, die garantiert
bounct.

## Scope (in)

- ENV-Modus-Schalter `INBOUND_MAILBOX_ADDRESS` (DEC-211): gesetzt → Single-Mailbox,
  Adresse = reales Postfach; nicht gesetzt → Catchall-Fallback (Zukunft).
- Zentraler Resolver `src/lib/inbound-email/forward-address.ts`
  (`resolveForwardAddress`, `singleMailboxAddress`) — beseitigt die bisherige
  3-Stellen-Drift.
- 3 Call-Sites umgestellt: `page.tsx` (Endpoint-Anzeige), `actions.ts`
  (`createInboundEndpoint` result.address + `sendTestEmail` Ziel-Adresse).
- `ForwardSetupWizard` CreatePhase-Hint branched: Single-Mailbox zeigt die feste
  Adresse statt der irrefuehrenden `@domain`-Vorschau.

## Scope (out)

- Catchall-MX-Einrichtung (`bulk.strategaizetransition.com` MX→IONOS) — Infra,
  spaeterer Multi-Mailbox-Slot.
- Multi-Mailbox-/Slug-Routing (DEC-200, Zukunft).

## Acceptance Criteria

- AC-E-1: Bei gesetztem `INBOUND_MAILBOX_ADDRESS` zeigt die Setup-UID
  (SetupTokenDisplay + MailClientInstructions) das reale Postfach als
  Weiterleitungs-Adresse — slug-unabhaengig. ✅ (resolveForwardAddress, Unit-Tests)
- AC-E-2: `sendTestEmail` mailt im Single-Mailbox-Modus an das reale Postfach,
  nicht an die bouncende Catchall-Adresse. ✅ (actions.test.ts ISSUE-098-Case)
- AC-E-3: Ohne ENV bleibt das bisherige Catchall-Verhalten erhalten (Rueckwaerts-
  kompatibel, Zukunfts-Pfad). ✅ (Catchall-Tests gruen, unveraendert)
- AC-E-4: tsc (touched files) + ESLint = 0, keine Regression in den
  inbound-email/bulk-email-import-Suiten. ✅ (154 Tests gruen)
- AC-E-5 (Live, Founder-gated): nach `INBOUND_MAILBOX_ADDRESS`-Set + Redeploy zeigt
  die Live-UI die reale Adresse; Test-Mail kommt im Postfach an (received=true).
  ⏳ offen — Teil von /post-launch V9.1.

## Live-Verification-Plan

- Founder setzt `INBOUND_MAILBOX_ADDRESS=bulk@strategaizetransition.com` in Coolify
  (identisch zu IMAP_USER) + Redeploy.
- Setup-UI oeffnen → "Weiterleitungs-Adresse" muss `bulk@strategaizetransition.com`
  zeigen (nicht `bulk-<slug>@bulk…`).
- Test-Mail senden → `received: true` (vorher garantiert false).
- Hinweis: Redeploy ersetzt den Burn-In-Container; daher gebuendelt mit/nach
  /post-launch V9.1, nicht waehrend des laufenden T+24h-Fensters.
