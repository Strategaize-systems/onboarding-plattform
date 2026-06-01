# Onboarding-Plattform → Business-System Lead-Integration

**Owner:** Strategaize Onboarding-Plattform Team
**Status:** Draft (V8.1 SLC-163)
**Last updated:** 2026-06-01

## Zweck

Beschreibt das Format und den Verarbeitungspfad fuer Lead-Daten, die von der
Onboarding-Plattform an das Strategaize Business-System (BS) uebergeben werden,
wenn ein Mandant die V8.1-Lead-Conversion-CTA klickt.

V8.1 nutzt **Email-Based-Integration** (Inbox-Polling im BS) — keine direkte
HTTP-API. Begruendung: BS-Lead-Endpoint existiert noch nicht, Email ist
robuster und auditierbar fuer die ersten Live-Leads. V8.2+ kann auf direkte
HTTP-POST-Integration upgraden.

## Lead-Flow

```
Mandant klickt CTA (PDF-Magic-Link ODER Web-Bericht-Button)
   │
   ▼
Onboarding-Plattform:
   - Atomic-UPDATE capture_session.released_for_strategaize_review = true
   - sendStrategaizeAnfrageEmails (parallel BD + StB)
   │
   ├─► STRATEGAIZE_BD_EMAIL (Default: bd@strategaizetransition.de)
   │       │
   │       └─► Business-System Inbox-Parser:
   │             - Sucht `<!-- STRATEGAIZE_LEAD_V1: {json} -->` im HTML-Body
   │             - Parsed JSON → INSERT in BS-Lead-Tabelle
   │             - Versendet ACK (out of scope V8.1)
   │
   └─► partner.contact_email (StB-Notification, neutral-informativ)
```

## Email-Empfaenger

| Empfaenger-Slot | Default-Wert | Override-Env | Format |
|---|---|---|---|
| BD-Lead | `bd@strategaizetransition.de` | `STRATEGAIZE_BD_EMAIL` | HTML + JSON-Block |
| StB-Notification | `partner_organization.contact_email` | — | HTML (neutral-informativ) |

Wenn `contact_email` leer ist: Silent-Skip + Audit-Log
`source='stb_notification_skipped_no_email'`. BD-Email geht trotzdem raus.

## JSON-Schema STRATEGAIZE_LEAD_V1

Eingebettet im HTML-Body der BD-Email als HTML-Kommentar (unsichtbar fuer
menschliche Reader, leicht extrahierbar fuer Parser):

```html
<!-- STRATEGAIZE_LEAD_V1: {"schema":"STRATEGAIZE_LEAD_V1", ...} -->
```

Auch im Plain-Text-Body am Ende als sichtbarer JSON-Block (fuer Plain-Text-
Reader und Email-Clients ohne HTML-Rendering).

### Schema-Definition

```typescript
interface StrategaizeLeadV1 {
  schema: "STRATEGAIZE_LEAD_V1";

  /** UUID. capture_session.id der Diagnose-Session. */
  capture_session_id: string;

  /** Email des Mandanten (aus capture_session.metadata.v8_report_snapshot.mandant.email). */
  mandant_email: string;

  /** Klartext-Name des Mandanten (z.B. "Max Muster"). */
  mandant_name: string;

  /** Klartext-Firma (z.B. "Muster Maschinenbau GmbH"). */
  mandant_firma: string;

  /** UUID der Partner-Organisation (StB). */
  partner_organization_id: string;

  /** Klartext-Name der Partner-Organisation. */
  partner_organization_name: string;

  /** SUI-Score 0.0..5.0 (gewichtetes Mittel V8-Diagnose). */
  sui_score: number;

  /**
   * 3 Modul-Namen aus selectThreeHebel (V8 SLC-148 MT-4):
   * niedrigste Stufen + Modul-9-Doppelgewicht.
   */
  drei_hebel_modul_namen: string[];

  /** Admin-URL zur Diagnose im OP-Backend (fuer manuelle Folge-Aktionen). */
  diagnose_link_admin: string;

  /** ISO-8601-Timestamp des CTA-Klicks. */
  timestamp_iso: string;

  /** Hardcoded "V8.1" — bumped bei zukuenftigen Schema-Aenderungen. */
  v8_version: "V8.1";
}
```

### Beispiel-Body (BD-Email)

Subject: `[OP-Lead] Muster Maschinenbau GmbH — Folgegespraech angefragt`

HTML-Body (gekuerzt):

```html
<!doctype html>
<html lang="de">
  <body>
    <h1>Strategaize-Lead — Folgegespraech angefragt</h1>

    <h2>Mandant</h2>
    <p>
      <strong>Max Muster</strong><br/>
      Muster Maschinenbau GmbH<br/>
      <a href="mailto:max@example.com">max@example.com</a>
    </p>

    <h2>Partner-Organisation</h2>
    <p>Partner-Steuerberater XYZ (id: po-uuid-001)</p>

    <h2>SUI-Score</h2>
    <p>2.7 / 5.0</p>

    <h2>Drei priorisierte Hebel</h2>
    <ol>
      <li>Modul 4 — Operative Skalierbarkeit</li>
      <li>Modul 7 — Finanzielle Transparenz</li>
      <li>Modul 6 — Vertrieb &amp; Kunden</li>
    </ol>

    <!-- STRATEGAIZE_LEAD_V1: {"schema":"STRATEGAIZE_LEAD_V1","capture_session_id":"cs-uuid-001","mandant_email":"max@example.com","mandant_name":"Max Muster","mandant_firma":"Muster Maschinenbau GmbH","partner_organization_id":"po-uuid-001","partner_organization_name":"Partner-Steuerberater XYZ","sui_score":2.7,"drei_hebel_modul_namen":["Modul 4 — Operative Skalierbarkeit","Modul 7 — Finanzielle Transparenz","Modul 6 — Vertrieb & Kunden"],"diagnose_link_admin":"https://onboarding.strategaizetransition.com/admin/diagnose/cs-uuid-001","timestamp_iso":"2026-06-01T07:00:00.000Z","v8_version":"V8.1"} -->
  </body>
</html>
```

## Parser-Hinweis (BS-Side)

Regex fuer Extraction aus HTML-Body:

```typescript
const m = html.match(/<!--\s*STRATEGAIZE_LEAD_V1:\s*(\{[\s\S]*?\})\s*-->/);
if (m) {
  const lead: StrategaizeLeadV1 = JSON.parse(m[1]);
}
```

Helper-Implementation in OP: `src/lib/email/v8-1/bd-lead.ts` →
`extractBdLeadJsonFromHtml(html)`. Identische Regex kann im BS uebernommen
werden.

## Schema-Versionierung

- `STRATEGAIZE_LEAD_V1` — Initial-Version (V8.1 SLC-163).
- Schema-Aenderungen brauchen NEUE Major-Version (z.B. V2). BS-Parser sollte
  auf bekannte Versions hart matchen, unbekannte Versions zu Dead-Letter-Queue
  oder Founder-Notification routen.

## Idempotenz auf BS-Side

Empfohlen: BS-Parser checkt `capture_session_id` gegen eigene Lead-Tabelle
und skipped Duplicate-Inserts. OP-Side garantiert bereits Idempotency ueber
`released_for_strategaize_review`-Flag (atomic UPDATE), aber doppelte Email-
Zustellung durch SMTP-Retries ist nicht 100% ausgeschlossen.

## Sicherheit + Privacy

- Email-Inhalt geht ueber IONOS-SMTP — TLS in-transit, no end-to-end-Encryption.
- Personenbezogene Daten (Name, Email, Firma) im Email-Body — DSGVO-konformer
  Auftragsverarbeitung-Vertrag mit IONOS existiert (Standard-IONOS-DPA).
- Keine Bankdaten, keine Steuerdaten, keine Diagnose-Antworten im JSON-Block
  — nur Lead-Metadaten + 3 Modul-Namen + SUI-Score.
- Mandant-Einwilligung zur Lead-Versendung implizit via CTA-Klick (FEAT-068
  AC-2: CTA-Page "Lassen Sie uns reden — unverbindlich, ohne Pricing-Druck").

## Audit-Trail (OP-Side)

Alle CTA-Trigger werden in OP-`error_log` mit folgenden Sources geloggt:

| Source | Trigger |
|---|---|
| `cta_strategaize_freigabe` | Erfolgreicher CTA-Klick (PDF oder Web) |
| `cta_invalid_token` | Tampered/Expired/Malformed Magic-Link |
| `cta_idempotent_skip` | 2. Klick auf bereits ausgeloesten CTA |
| `stb_notification_skipped_no_email` | partner.contact_email leer/null |

SELECT: `SELECT * FROM error_log WHERE source LIKE 'cta_%' OR source LIKE 'stb_%';`

## Open Points (V8.2+)

- BS-Parser-Implementation (out of scope V8.1).
- Direct HTTP-POST-Integration statt Email (V8.2+ Performance).
- ACK von BS zurueck zu OP fuer Lead-Status-Tracking (V8.2+).
- StB-Notification-Customization pro Partner-Org (V8.2+).
- Re-Send-Button + Lead-History-Page im OP-Admin (V8.2+).
