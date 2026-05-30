# FEAT-068 — Strategaize-Freigabe-CTA + Dual-Email-Trigger (BD + StB)

**Version:** V8.1
**Status:** planned
**Created:** 2026-05-30
**Related Backlog:** BL-142
**Related Slice:** to be planned in /slice-planning V8.1

## Purpose

Liefert die **Click-Mechanik** des "Mit Strategaize sprechen"-CTAs aus FEAT-067 Lead-Conversion-Outro. Bei CTA-Klick passiert dreierlei:

1. **Flag-Setzung**: `capture_session.released_for_strategaize_review = true` (DEC-163 Flag existiert seit V8.0 SLC-148 MT-2)
2. **Lead-Email an Strategaize-BD-Inbox**: `bd@strategaizetransition.de` (ENV-Variable `STRATEGAIZE_BD_EMAIL`). Diese Mail landet in der **Business-System-Pipeline** als neuer Lead. Loose-Coupling via Email — kein direkter BS-API-Call in V8.1.
3. **StB-Partner-Notification**: an `partner_organization.contact_email`. Inhalt: "Ihr Mandant X hat Kontakt zu Strategaize aufgenommen" (neutral-informativ, kein Glueckwunsch-Wording).

Distribution-Pfade des CTAs (analog FEAT-067):
- **PDF-CTA**: Magic-Link-URL mit HMAC-SHA256-signiertem Token. Click oeffnet `https://onboarding.strategaizetransition.com/strategaize-anfrage?token=<signed>`, der Endpoint validiert + setzt Flag + sendet 2 Emails + zeigt Bestaetigungs-Page.
- **Web-CTA**: Server-Action direkt im V8-Web-Bericht (Session aus auth.users, kein Token noetig).

Founder-Direktive 2026-05-29: "Vertrauen in uns und Bereitschaft mit uns zu reden steigern."

## Problem

- V8.0-CtaPage ist visuell ein CTA, aber ohne funktionalen Click-Handler. Mandant kann den Bericht heute lesen, hat aber keinen technischen Pfad, um Kontakt zu Strategaize aufzunehmen (ausser Email manuell schreiben).
- Strategaize-BD-Inbox `bd@strategaizetransition.de` ist Empfaenger fuer alle neuen Leads aus der Onboarding-Plattform. Die BD-Pipeline im Business System parst eingehende Leads — V8.1 muss strukturierten Email-Body (HTML + Plain) liefern, der BS automatisch parsen kann (Format-Entscheidung in `/architecture`).
- StB-Partner muss informiert werden, dass sein Mandant Strategaize kontaktiert hat — sonst entsteht Misstrauen (StB faehlt sich uebergangen). Wording-Tonalitaet ist sensibel.
- PDF-Magic-Link-Token muss gegen Brute-Force/Replay sicher sein (HMAC + Expiry + Single-Use-Option).
- Idempotenz bei Mehrfach-Klick: Mandant koennte den PDF-Link mehrfach klicken. Keine doppelten Emails an BD/StB.

## In Scope

### Trigger-Endpoint + Server-Action

1. **HTTP-GET `/strategaize-anfrage` Endpoint** (Magic-Link-Eintritt)
   - Query-Param: `?token=<HMAC-SHA256-signed-payload>`
   - Token-Payload: `{ capture_session_id, mandant_email, partner_organization_id, issued_at, expiry }`
   - Verifikation: HMAC-Check mit `STRATEGAIZE_CTA_TOKEN_SECRET` (ENV-Var, neu), Expiry-Check.
   - Bei valide Token: Flag-Set + Dual-Email + Bestaetigungs-Page rendern.
   - Bei invalide/expired Token: Error-Page mit StB-Kontakt-Hinweis.

2. **Server-Action `triggerStrategaizeFreigabe`** (Web-Bericht-CTA)
   - Input: `capture_session_id`
   - Auth-Check: Session-User muss der Mandant sein (oder strategaize_admin fuer Founder-Test).
   - Idempotenz-Check: wenn Flag bereits `true`, KEINE Email-Sendung (only success-redirect zur Bestaetigungs-Page).
   - Bei first-time: Flag-Set + Dual-Email.

### Token-Generierung (PDF-Side)

3. **`generateCtaMagicLinkToken(captureSession)` Pure-Function**
   - Output: signierter Token-String fuer URL-Embedding.
   - HMAC-SHA256 ueber Payload + Secret.
   - Expiry: Default 90 Tage (analog Diagnose-Bericht-Gueltigkeit, /architecture entscheidet Q-V8.1-B).
   - Single-Use NICHT erzwungen in V8.1 (Idempotenz reicht ueber Flag-Check) — V8.2+ wenn noetig.

### Dual-Email-Versand

4. **Lead-Email an BD-Inbox**
   - Empfaenger: ENV `STRATEGAIZE_BD_EMAIL` (Default `bd@strategaizetransition.de`)
   - Subject: `[OP-Lead] {mandant.firma} — Folgegespraech angefragt`
   - Body: strukturiertes HTML + Plain-Text mit Lead-Daten:
     - Mandant: Name, Firma, Email, Telefon (falls vorhanden)
     - Partner-Organisation: Name, Standort, Branche
     - SUI-Score + 3 niedrigste Module + ausgewaehlte 3 Hebel
     - Link zum Bericht im Strategaize-Admin (`/admin/capture-sessions/[id]/v8-report`)
     - Diagnose-Datum + V8-Version
   - Format-Entscheidung in `/architecture` Q-V8.1-C: strukturierter JSON-Block im HTML-Comment (fuer BS-Parser) oder rein semantisches HTML (BS parst per ML).
   - Reuse: IONOS-SMTP-Adapter aus V4.2 + V7.2 `sendDiagnoseReportByEmail` Pattern.

5. **StB-Partner-Notification**
   - Empfaenger: `partner_organization.contact_email` (Pflicht-Feld seit V6 Migration 090)
   - Fallback: wenn `contact_email` leer ist, KEINE StB-Notification (silent-skip + Audit-Log Eintrag) — /architecture Q-V8.1-D entscheidet Tonalitaet + Fallback-Verhalten.
   - Subject: `Ihr Mandant {mandant.firma} hat Kontakt zu Strategaize aufgenommen`
   - Body: neutral-informativ (3-4 Saetze):
     - "Ihr Mandant {firma} hat ueber den Strategaize-Mandanten-Report ein Folgegespraech mit Strategaize angefragt."
     - "Strategaize meldet sich innerhalb von 2 Werktagen direkt beim Mandanten."
     - "Wir informieren Sie aus Transparenz-Gruenden, damit Sie als Steuerberater im Bilde sind."
     - "Bei Rueckfragen zur Diagnose-Inhalt: kontaktieren Sie uns gerne unter bd@strategaizetransition.de"
   - KEIN Glueckwunsch-Wording ("super, Ihr Mandant ist neugierig!"), KEINE Pricing-Hinweise, KEINE Wettbewerbs-Ton.

### Bestaetigungs-Page

6. **`/strategaize-anfrage/bestaetigung` Page** (statisch, post-CTA)
   - Hero: "Vielen Dank — wir melden uns innerhalb von 2 Werktagen."
   - Body: Reassurance-Text (Strategaize-Wir-Voice)
   - Hinweis: StB ist informiert worden.
   - Kein weiterer CTA, kein Pricing.

### Idempotenz + Audit

7. **Idempotenz ueber Flag-Check**
   - Wenn `capture_session.released_for_strategaize_review` bereits `true`: keine Email-Sendung, nur Bestaetigungs-Page-Redirect.
   - Audit-Log-Eintrag in `error_log` oder neue `cta_event` Tabelle (architecture-Entscheidung).

8. **Audit-Trail**
   - Jeder Trigger-Event wird geloggt: Source (PDF-Magic-Link vs Web-Server-Action), Token-Validity, Email-Sent-Status BD + StB, Timestamp, capture_session_id.

### ENV-Konfiguration

9. **Neue ENV-Variablen**
   - `STRATEGAIZE_BD_EMAIL` (Default `bd@strategaizetransition.de`)
   - `STRATEGAIZE_CTA_TOKEN_SECRET` (Pflicht, Production-Generation, 64 Zeichen min)
   - `STRATEGAIZE_CTA_TOKEN_EXPIRY_DAYS` (Default `90`, optional)

## Out of Scope

- Direkte BS-API-Integration (HTTP-POST an BS-Lead-Endpoint) — V8.2+. V8.1 nutzt loose-coupling via Email an BD-Inbox.
- Multi-Lead-Routing per Partner-Segment (z.B. White-Label-Partner-Vertrieb statt Strategaize-BD) — V8.2+.
- StB-Partner-Notification-Customization (Tonalitaet pro Partner) — V8.2+. V8.1 nutzt eine zentrale Tonalitaet.
- Mandant-Re-Send-Button (Mandant kann nicht 2x kontaktieren) — V8.2+ wenn noetig.
- CAPTCHA / Anti-Spam auf Magic-Link-Endpoint — V8.2+ wenn Spam-Welle.
- A/B-Testing der CTA-Wordings — V8.2+.
- WhatsApp / SMS / Phone-Call-Trigger — V8.2+.
- Calendar-Integration (Folgegespraech-Termin direkt buchbar) — V8.2+ (entspricht aktuell Founder-Direktive "kein Pricing-Druck").

## Constraints

- **DSGVO**: Lead-Email enthaelt PII (Mandant-Name, Email, Firma). Empfaenger BD-Inbox + StB-Partner muessen DSGVO-konform sein. Beide sind etablierte Strategaize-Email-Adressen.
- **Data-Residency**: Email-Versand via IONOS-SMTP (EU-DE Hosting, etablierter Pfad).
- **Token-Security**: HMAC-SHA256 mit min. 64-Zeichen-Secret. Expiry strikt geprueft. Brute-Force durch Length + Cryptographic-Hash unmoeglich in Praxis.
- **Idempotenz Pflicht**: Mehrfach-Klick darf NICHT zu Email-Spam fuehren. Flag-Check als Idempotenz-Token.
- **StB-Partner-Notification Tonalitaet**: neutral-informativ. Verbot von Glueckwunsch-Wording, Pricing-Hinweisen, Wettbewerbs-Ton.
- **Strategaize-Pattern-Reuse Pflicht**: IONOS-SMTP-Adapter (V4.2), Magic-Link-Token-Pattern (V7 Self-Signup-Verify nutzt aehnliches Pattern — pruefen vor Neu-Implementierung).

## Risks / Assumptions

- **R1**: BD-Inbox-Parser im Business System muss strukturierten Email-Body parsen koennen. Wenn BS-Parser noch nicht existiert: Email landet im Posteingang und wird manuell prozessiert (akzeptabel als V8.1-Fallback).
- **R2**: StB-Partner-Notification kann als "Spam" wahrgenommen werden. Wording muss vom Founder freigegeben werden vor Live-Schaltung.
- **R3**: PDF-Magic-Link-Token wird in einem PDF embedded, das Mandanten weiterleiten koennten (StB an Founder, oder Mandant an Wettbewerber). Token ist HMAC-signiert, nicht Single-Use → kann mehrfach verwendet werden, aber Idempotenz verhindert Email-Spam. Risk-Akzeptanz fuer V8.1 (V8.2+ koennte Single-Use ergaenzen).
- **R4**: `partner_organization.contact_email` ist seit V6 Pflicht-Feld — Annahme dass alle aktiven Partner es gesetzt haben. Falls leer: silent-skip StB-Notification (Audit-Log).
- **A1**: V7.2 `sendDiagnoseReportByEmail` Pattern + IONOS-SMTP-Adapter sind reusable.
- **A2**: V7 Magic-Link-Token-Pattern aus Self-Signup-Verify-Endpoint kann uebernommen werden (HMAC + Expiry + State-DB).

## Success Criteria

- AC-FEAT-068-1: PDF-Magic-Link-Token ist HMAC-SHA256-signiert, mit Expiry, im PDF-CTA-Button embedded.
- AC-FEAT-068-2: Klick auf PDF-Magic-Link setzt `released_for_strategaize_review = true` Flag in der DB.
- AC-FEAT-068-3: Web-Server-Action setzt das gleiche Flag bei erstem Klick.
- AC-FEAT-068-4: Lead-Email an `bd@strategaizetransition.de` wird gesendet mit strukturierten Lead-Daten (Mandant + Partner + SUI + 3 Module + Diagnose-Link).
- AC-FEAT-068-5: StB-Partner-Notification an `partner_organization.contact_email` wird gesendet mit neutral-informativer Tonalitaet.
- AC-FEAT-068-6: Mehrfach-Klick fuehrt zu keinem doppelten Email-Versand (Idempotenz ueber Flag-Check).
- AC-FEAT-068-7: Invalide/expired Magic-Link-Token zeigt Error-Page mit StB-Kontakt-Hinweis (keine Flag-Setzung, keine Email).
- AC-FEAT-068-8: Bestaetigungs-Page rendert nach erfolgreicher Flag-Setzung mit Strategaize-Wir-Voice.
- AC-FEAT-068-9: Tonality-Audit-Skript prueft StB-Notification + Lead-Email auf Blacklist (Glueckwunsch, Pricing, Wettbewerb).
- AC-FEAT-068-10: Audit-Trail-Eintrag pro Trigger-Event mit Source + Email-Sent-Status BD + StB.

## Open Questions (fuer /architecture V8.1)

- **Q-V8.1-B**: PDF-Magic-Link-Token-Expiry — 90 Tage (analog Diagnose-Bericht-Gueltigkeit) oder unbeschraenkt? Single-Use ja/nein?
- **Q-V8.1-C**: Lead-Email-Format an BD-Inbox — strukturierter JSON-Block im HTML-Comment (fuer BS-Parser-Maschinen-Lesbarkeit) oder rein semantisches HTML (BS parst per ML)?
- **Q-V8.1-D**: StB-Notification — neutral-informativ wie spec oder Glueckwunsch-Voice ('Glueckwunsch, Ihr Mandant ist neugierig')? Default Empfehlung: neutral-informativ. Plus Fallback-Verhalten wenn `contact_email` leer.
- **Q-V8.1-G**: Token-State-Speicherung — separate `cta_token` Tabelle oder Stateless via HMAC-Self-Validation (kein DB-Lookup)?
