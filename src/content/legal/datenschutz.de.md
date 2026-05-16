# Datenschutzerklaerung

> **Stand:** 2026-05-15 (V6.2-Release, Anwalts-Review pending vor erstem echten Live-Partner — BL-104)
>
> **Hinweis:** Diese Datenschutzerklaerung ist eine pragmatische technische Standardvorlage. Sie beschreibt, wie die Strategaize Onboarding-Plattform personenbezogene Daten verarbeitet, und stellt **keine Rechtsberatung** dar. Vor dem produktiven Einsatz mit echten Partner-Kanzleien oder Mandanten wird eine anwaltliche Pruefung durch eine qualifizierte Datenschutzbeauftragte/einen qualifizierten Datenschutzbeauftragten erfolgen.

## 1. Verantwortlicher

Verantwortlich fuer die Verarbeitung personenbezogener Daten im Sinne von Art. 4 Nr. 7 DSGVO ist die **Strategaize Transition BV** (NL-Operativ). Vollstaendige Stammdaten — Anschrift, KvK-Nummer, USt-IdNr (BTW), Vertretungsberechtigter und Kontakt-E-Mail — finden Sie im [Impressum](/impressum).

## 2. Welche Daten wir verarbeiten

Die Plattform verarbeitet personenbezogene Daten ausschliesslich zur Steuerung von Wissenserhebungs-, Onboarding- und Vermittlungs-Prozessen. Die folgenden Datenkategorien werden erhoben:

- **Auth-Stammdaten:** E-Mail-Adresse, Passwort (als bcrypt-Hash, nie im Klartext), Anzeigename, Sprache, Rolle, Tenant-Bindung sowie Login-Audit-Felder (Erstell-Datum, letzte Anmeldung).
- **Tenant-Stammdaten:** Firmenname, Tenant-Klasse (`direct_client` / `partner_organization` / `partner_client`) und gegebenenfalls Eltern-Partner-Bindung.
- **Capture-Daten (Wissens-Erhebung):** Antworten auf Template-Fragen, Block-Submit-Checkpoints, verdichtete Knowledge Units, Exception-Eingaben sowie KI-Chat-Verlauf waehrend der Questionnaire-Bearbeitung.
- **Walkthrough-Daten:** Screen- und Mikrofon-Aufzeichnungen (max. 30 Minuten), Transkripte (Roh-Transkript und PII-redigiertes Transkript) sowie Review-Mappings.
- **Diagnose-Daten:** Diagnose-Antworten, deterministischer Score je Frage und KI-Kommentar zum Score.
- **Lead-Push-Daten:** Consent-Eintrag (User-ID, Consent-Text-Version, Datum, IP-Hash, User-Agent-Hash) und Audit-Trail der Push-Versuche.
- **KI-Job-Audit:** Job-Typ, Status, Input/Output, Token-Cost-Ledger (zur Nachvollziehbarkeit der KI-Aufrufe).
- **Funktionale Cookies und Browser-State:** Ein einziger Cookie `sidebar:state` (functional, legitimate-interest) speichert die UI-Praeferenz, ob die Sidebar ein- oder ausgeklappt ist. Zusaetzlich nutzen einzelne Bereiche `localStorage` fuer Such-Historie.

Eine vollstaendige Auflistung mit technischen Details befindet sich in der internen `COMPLIANCE.md` (Sektion 1 — Erhobene personenbezogene Daten). Auszuege werden auf Anfrage zur Verfuegung gestellt.

**Was wir nicht erheben:** Keine besonderen Kategorien personenbezogener Daten (Art. 9 DSGVO). Kein Web-Tracking, kein Drittanbieter-Analytics, kein Werbe-Pixel, kein Profiling-Cookie.

## 3. Rechtsgrundlagen

Die Verarbeitung erfolgt auf Basis der folgenden Rechtsgrundlagen nach Art. 6 DSGVO:

- **Art. 6 Abs. 1 lit. b DSGVO (Vertragserfuellung)** — fuer die Erbringung der Plattform-Leistung gegenueber Mandanten und Partner-Kanzleien (Wissenserhebung, Diagnose, Vermittlung).
- **Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse)** — fuer den Betrieb funktionaler Cookies (UI-State), fuer KI-Job-Audit-Logs zur Sicherstellung der Nachvollziehbarkeit sowie fuer technische Sicherheits-Logs.
- **Art. 6 Abs. 1 lit. a DSGVO (Einwilligung)** — fuer den Lead-Push aus der Onboarding-Plattform in das Strategaize-Business-System (`lead_push_consent` mit Versions-Tracking).
- **Art. 6 Abs. 1 lit. c DSGVO (rechtliche Verpflichtung)** — soweit gesetzliche Aufbewahrungs- und Auskunftspflichten greifen.

## 4. Empfaenger und Drittanbieter

Personenbezogene Daten werden ausschliesslich in der **Europaeischen Union** verarbeitet. Eine Uebermittlung in Drittlaender findet nicht statt. Folgende Sub-Auftragsverarbeiter werden eingesetzt:

| Anbieter | Funktion | Region |
| --- | --- | --- |
| Hetzner Online GmbH | Hosting (Cloud-Server, Datenbank, Storage) | Frankfurt, Deutschland |
| Amazon Web Services (AWS Bedrock) | Large-Language-Model (Anthropic Claude Sonnet) | `eu-central-1` Frankfurt |
| Microsoft Azure Speech | Transkription (Whisper-Modell) | EU-Region |
| IONOS SE | SMTP-Versand (transaktionale System-E-Mails) | Deutschland |

Mit jedem Sub-Auftragsverarbeiter besteht ein Auftragsverarbeitungsvertrag nach Art. 28 DSGVO. Der jeweilige Status ist in der internen `COMPLIANCE.md` (Sektion 6 — DPA-Status) dokumentiert.

## 5. Speicherdauer

Daten werden nur so lange gespeichert, wie es fuer die jeweilige Verarbeitung erforderlich ist oder gesetzliche Aufbewahrungspflichten dies erfordern. Die konkrete Retention-Policy pro Datenkategorie ist in der internen `COMPLIANCE.md` (Sektion 4 — Retention-Policies) dokumentiert. Auszuege werden auf Anfrage zur Verfuegung gestellt.

Auf Anforderung loeschen wir personenbezogene Daten unverzueglich, sofern keine gesetzlichen Aufbewahrungspflichten entgegenstehen (siehe `COMPLIANCE.md` Sektion 7 — Loeschkonzept).

## 6. Ihre Rechte als betroffene Person

Sie haben jederzeit das Recht, die folgenden Rechte gegenueber dem Verantwortlichen geltend zu machen:

- **Auskunft** (Art. 15 DSGVO) ueber die zu Ihnen gespeicherten Daten
- **Berichtigung** (Art. 16 DSGVO) unrichtiger oder unvollstaendiger Daten
- **Loeschung** (Art. 17 DSGVO, "Recht auf Vergessenwerden")
- **Einschraenkung der Verarbeitung** (Art. 18 DSGVO)
- **Datenuebertragbarkeit** (Art. 20 DSGVO) in einem strukturierten, gaengigen, maschinenlesbaren Format
- **Widerspruch** (Art. 21 DSGVO) gegen die Verarbeitung auf Grundlage berechtigter Interessen
- **Widerruf einer Einwilligung** (Art. 7 Abs. 3 DSGVO) mit Wirkung fuer die Zukunft

Zur Wahrnehmung dieser Rechte wenden Sie sich bitte an die im [Impressum](/impressum) angegebene Kontakt-E-Mail.

**Beschwerderecht bei der Aufsichtsbehoerde:** Sie haben unbeschadet anderer Rechtsbehelfe das Recht, sich bei einer Datenschutz-Aufsichtsbehoerde zu beschweren (Art. 77 DSGVO). Zustaendig ist insbesondere die Aufsichtsbehoerde Ihres gewoehnlichen Aufenthalts oder die Autoriteit Persoonsgegevens in den Niederlanden (Sitz des Verantwortlichen).

## 7. Cookies

Die Plattform setzt **einen einzigen funktionalen Cookie** ein:

- `sidebar:state` — speichert die UI-Praeferenz (Sidebar ein- oder ausgeklappt). Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einer konsistenten Bedienoberflaeche).

Es findet **kein Tracking** statt. Es werden **keine Drittanbieter-Cookies** gesetzt. Es werden **keine Marketing- oder Analyse-Cookies** verwendet. Aus diesem Grund wird kein Cookie-Consent-Banner eingeblendet — die DSGVO und die ePrivacy-Richtlinie erfordern fuer rein funktionale Cookies keine vorherige Einwilligung.

Zusaetzlich nutzen einzelne Bereiche der Plattform den browser-seitigen `localStorage` (zum Beispiel fuer die Such-Historie im Handbuch-Reader). Diese Daten verbleiben auf Ihrem Geraet und werden nicht an Strategaize uebertragen.

## 8. Automatisierte Entscheidungen und Profiling

Die Plattform setzt **kein automatisiertes Profiling** im Sinne von Art. 22 DSGVO ein. KI-gestuetzte Verarbeitung (Bedrock Claude Sonnet, Whisper-Transkription, deterministische Diagnose-Scores) erfolgt zur Unterstuetzung der Wissenserhebung und Verdichtung, jedoch nicht zur automatisierten Einzelfall-Entscheidung mit rechtlicher Wirkung gegenueber natuerlichen Personen. Alle KI-Outputs sind Vorschlaege, die in der weiteren Verarbeitung durch den Mandanten oder die Partner-Kanzlei bewertet und gegebenenfalls korrigiert werden.

## 9. Datensicherheit

Die Plattform setzt technische und organisatorische Massnahmen nach Art. 32 DSGVO um, insbesondere:

- TLS-Verschluesselung saemtlicher Verbindungen (HTTPS)
- bcrypt-Hash fuer Passwoerter (Supabase-Auth / GoTrue)
- Row-Level-Security in der Datenbank (Tenant-Isolation, Rollen-Trennung)
- Sub-Auftragsverarbeiter ausschliesslich in der EU mit DSGVO-konformen Auftragsverarbeitungsvertraegen
- regelmaessige Backups innerhalb der EU
- Zugriffsbeschraenkung auf produktive Systeme nach Need-to-know-Prinzip

## 10. Aenderungen dieser Datenschutzerklaerung

Strategaize Transition BV behaelt sich vor, diese Datenschutzerklaerung anzupassen, sofern aenderungen der Rechtslage, technische Aenderungen der Plattform oder organisatorische Aenderungen dies erfordern. Der jeweils aktuelle Stand ist unter `/datenschutz` abrufbar; das Stand-Datum im Kopf dieses Dokuments gibt den letzten Aktualisierungszeitpunkt an.
