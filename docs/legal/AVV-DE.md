# Auftragsverarbeitungsvertrag (AVV) nach DSGVO Art. 28

> **Stand:** 2026-05-15 (V6.2-Release, SLC-121)
> **System:** Strategaize Onboarding-Plattform
> **Domain:** `onboarding.strategaizetransition.com`
> **Status:** Standardvorlage, Anwalts-Pruefung erforderlich vor Versand an realen Partner.
>
> **Hinweis:** Diese Vorlage ist eine pragmatische technische Standardvorlage und stellt **keine Rechtsberatung** dar. Sie beschreibt das uebliche Geruest eines Auftragsverarbeitungsvertrages nach DSGVO Art. 28 fuer die Zusammenarbeit zwischen Strategaize Transition BV und einer Partner-Kanzlei (oder einem Direktkunden). Vor produktivem Versand an einen realen Vertragspartner ist eine **anwaltliche Pruefung** durch eine qualifizierte Datenschutzbeauftragte/einen qualifizierten Datenschutzbeauftragten erforderlich (BL-104, V6.2-Anwalts-Review).

---

## Praeambel

Dieser Auftragsverarbeitungsvertrag (im Folgenden: **AVV**) regelt die datenschutzrechtlichen Pflichten der Parteien im Zusammenhang mit der Nutzung der Strategaize Onboarding-Plattform durch den Verantwortlichen.

**Vertragsparteien:**

- **Verantwortlicher:** `[Verantwortlicher: Firma, Anschrift, Vertretungsberechtigter, KvK-/Handelsregister-Nummer]`
- **Auftragsverarbeiter:** `[Auftragsverarbeiter: Firma, Anschrift, Vertretungsberechtigter, KvK-/Handelsregister-Nummer]`

**Hinweis zur Rollen-Zuordnung:** Die finale Zuordnung der Rollen "Verantwortlicher" und "Auftragsverarbeiter" wird durch Anwalts-Review (BL-104) festgelegt. Zwei Konstellationen sind moeglich:

- **Variante A** (wahrscheinlich): Partner-Kanzlei ist Verantwortlicher gegenueber ihren Mandanten, Strategaize Transition BV ist Auftragsverarbeiter.
- **Variante B**: Strategaize Transition BV ist Verantwortlicher gegenueber dem Endkunden via Direkt-Vertrag (Self-Signup-Pfad V7+), Partner-Kanzlei ist Vermittler ohne AVV-Rolle.

Dieser AVV setzt **Variante A** voraus. Bei Variante B ist dieser AVV nicht anwendbar.

**Vertragsgrundlage:** Hauptvertrag/Servicevertrag zwischen den Parteien ueber die Nutzung der Strategaize Onboarding-Plattform.

---

## 1. Gegenstand der Verarbeitung

Der Auftragsverarbeiter verarbeitet personenbezogene Daten ausschliesslich im Auftrag des Verantwortlichen im Sinne von DSGVO Art. 28. Gegenstand ist die Bereitstellung der Strategaize Onboarding-Plattform fuer strukturierte Wissenserhebung, KI-gestuetzte Verdichtung und Diagnose-Funnel-Leistungen.

Eine Verarbeitung zu eigenen Zwecken des Auftragsverarbeiters findet nicht statt; ausgenommen sind Verarbeitungen zu Abrechnungs-, Audit- und Sicherheitszwecken im Rahmen der DSGVO-Rechenschaftspflicht (Art. 5(2)).

---

## 2. Art und Zweck der Verarbeitung

Die Verarbeitung erfolgt zu folgenden Zwecken:

- Strukturierte Wissenserhebung ueber Capture-Modi (Fragebogen, Walkthrough, Diagnose-Werkzeug)
- KI-gestuetzte Verdichtung der Antworten zu Knowledge Units (Bedrock Claude Sonnet, eu-central-1)
- Bereitstellung von Diagnose-Berichten an Mandanten
- Optionaler Lead-Push an Strategaize-Business-System nach expliziter Mandanten-Einwilligung (V6 FEAT-046)
- Magic-Link-Invite-Versand fuer Mandanten und Mitarbeiter
- Reminder-Versand bei unvollstaendigen Mitarbeiter-Onboardings (V4.2)

Die Plattform ist KI-first ausgelegt: Bedrock-Aufrufe erfolgen ausschliesslich nach Mandanten-Aktion (Block-Submit, Walkthrough-Upload, Diagnose-Submit), nie automatisch im Hintergrund.

---

## 3. Art der personenbezogenen Daten und Kategorien betroffener Personen

Die im Rahmen dieses AVV verarbeiteten Datenkategorien und Betroffenenkreise sind vollstaendig in [`../COMPLIANCE.md` Sektion 1](../COMPLIANCE.md#1-erhobene-personenbezogene-daten) beschrieben.

**Kurzform:**

- **Datenkategorien:** Auth-Stammdaten, Tenant-Stammdaten, Partner-Branding-Stammdaten, Capture-Antworten, Walkthrough-Aufzeichnungen, Diagnose-Daten, Lead-Push-Consent + Audit-Trail, KI-Job-Audit, funktionale Cookies.
- **Betroffenenkreise:** Mandanten-Geschaeftsfuehrer, Mandanten-Mitarbeiter, Partner-Admin-User, Strategaize-Admin-User.
- **Keine besonderen Kategorien** nach Art. 9 DSGVO (siehe `../COMPLIANCE.md` Sektion 1.10).

---

## 4. Weisungsrecht des Verantwortlichen

Der Auftragsverarbeiter verarbeitet personenbezogene Daten ausschliesslich auf dokumentierte Weisung des Verantwortlichen. Die Erst-Weisung ergibt sich aus diesem AVV und dem zugrundeliegenden Hauptvertrag.

Aenderungen, Ergaenzungen oder Ersetzungen von Weisungen erfolgen in Textform (E-Mail genuegt) durch den Verantwortlichen an den im Hauptvertrag benannten Ansprechpartner des Auftragsverarbeiters.

Ist der Auftragsverarbeiter der Auffassung, dass eine Weisung des Verantwortlichen gegen geltendes Datenschutzrecht verstoesst, hat er den Verantwortlichen unverzueglich darauf hinzuweisen. Bis zur Klaerung kann der Auftragsverarbeiter die Ausfuehrung der betreffenden Weisung aussetzen.

---

## 5. Vertraulichkeit

Der Auftragsverarbeiter verpflichtet alle mit der Verarbeitung personenbezogener Daten befassten Personen schriftlich zur Vertraulichkeit (DSGVO Art. 28(3)(b), Art. 29, Art. 32(4)). Diese Verpflichtung besteht auch nach Beendigung des Beschaeftigungsverhaeltnisses fort.

---

## 6. Technische und organisatorische Massnahmen (TOMs)

Die vom Auftragsverarbeiter umgesetzten technischen und organisatorischen Massnahmen nach DSGVO Art. 32 sind vollstaendig in [`../COMPLIANCE.md` Sektion 8 "Datenschutzkonforme Defaults"](../COMPLIANCE.md#8-datenschutzkonforme-defaults) beschrieben.

**Schwerpunkte:**

- **Row-Level Security (RLS) by Default** mit Default-DENY-Policies und expliziten Tenant-Scoped-Policies (Defense-in-Depth). Pen-Test-Suite mit 96 V6 + 94 Regression Faelle verifiziert Cross-Tenant- und Cross-Partner-Isolation.
- **SECURITY DEFINER mit explicit search_path** (`SET search_path = public, pg_temp`) bei allen privilegierten Datenbank-Funktionen (Schema-Hijacking-Schutz).
- **Privacy-Pflicht-Checkbox** dreifach gesichert (UI-Layer-Lock + Server-Action-Validation + Datenbank-Constraint) bei Walkthrough-Upload und Lead-Push.
- **Pflicht-Footer "Powered by Strategaize"** hardcoded als Server-Component, nicht ueber Konfiguration entfernbar.
- **Self-hosted Supabase-Stack** auf Hetzner Cloud Frankfurt, vollstaendige Datenresidenz innerhalb der EU.
- **Authentifizierung** ueber Supabase-Auth/GoTrue (bcrypt-Hash, Cookie-Sessions httpOnly + secure + sameSite=lax).
- **Logging ohne PII** in `error_log` (Tenant-ID + technische Fehler-Strings, keine Klartext-Daten).
- **Audit-Trail** fuer alle externen LLM-/Speech-Calls in `ai_jobs` und `ai_cost_ledger` mit Anbieter, Region, Modell-ID, Request-ID, Zeitstempel.
- **Kein Tracking** — repo-grep verifiziert: 0 Tracking-Bibliotheken (kein gtag, posthog, plausible, sentry-Browser-SDK). Einziger Cookie ist `sidebar:state` (functional, legitimate-interest Art. 6(1)(f)).

---

## 7. Unterauftragsverarbeiter (Subunternehmer)

Der Verantwortliche erteilt mit Abschluss dieses AVV eine **allgemeine schriftliche Genehmigung** zur Einbindung der nachfolgenden Unterauftragsverarbeiter nach DSGVO Art. 28(2). Jeder Unterauftragsverarbeiter ist EU-gehostet, hat einen Standard-DPA und unterliegt der `data-residency.md`-Rule.

| Unterauftragsverarbeiter | Dienstleistung | Region | DPA |
|---|---|---|---|
| **Hetzner Online GmbH** | Cloud-Hosting (Server + Storage) | Frankfurt (DE) | Standard-DPA Hetzner — `https://www.hetzner.com/de/rechtliches/auftragsverarbeitung` |
| **Amazon Web Services EMEA SARL** | Bedrock LLM (Claude Sonnet, Titan V2 Embeddings) | `eu-central-1` (Frankfurt) | Standard-AWS-DPA — `https://aws.amazon.com/compliance/gdpr-center/` |
| **Microsoft Ireland Operations Ltd.** | Azure OpenAI (Whisper Speech-to-Text) | EU-Region (West Europe / Germany West Central) | Microsoft Online Services DPA |
| **IONOS SE** | SMTP-Versand (Magic-Link, Reminder) | Deutschland | Standard-IONOS-DPA |

Aenderungen oder Ergaenzungen der Unterauftragsverarbeiter-Liste teilt der Auftragsverarbeiter dem Verantwortlichen mindestens **30 Kalendertage vor Wirksamwerden** in Textform mit. Der Verantwortliche kann der Aenderung binnen 15 Kalendertagen aus wichtigem Grund widersprechen. Ohne Widerspruch gilt die Aenderung als genehmigt.

Vollstaendige Beschreibung siehe [`../COMPLIANCE.md` Sektion 5 "Drittanbieter-Liste"](../COMPLIANCE.md#5-drittanbieter-liste).

---

## 8. Unterstuetzungspflichten und Betroffenenrechte

Der Auftragsverarbeiter unterstuetzt den Verantwortlichen bei der Erfuellung der Betroffenenrechte nach DSGVO Kapitel III. Im Einzelnen:

- **Recht auf Auskunft** (Art. 15) — auf Anfrage des Verantwortlichen stellt der Auftragsverarbeiter binnen 14 Kalendertagen einen Daten-Export der relevanten Tabellen bereit.
- **Recht auf Berichtigung** (Art. 16) — der Auftragsverarbeiter passt auf dokumentierte Weisung Daten in der Plattform an oder ermoeglicht dem Verantwortlichen die Selbst-Bearbeitung ueber `/settings` und `/dashboard`.
- **Recht auf Loeschung** (Art. 17) — siehe Klausel 11 und [`../COMPLIANCE.md` Sektion 7](../COMPLIANCE.md#7-loeschkonzept).
- **Recht auf Einschraenkung der Verarbeitung** (Art. 18) — auf Weisung markiert der Auftragsverarbeiter betroffene Datensaetze als gesperrt; eine separate technische Sperr-Markierung steht in V6.2 noch nicht zur Verfuegung, Umsetzung erfolgt operationell.
- **Recht auf Datenuebertragbarkeit** (Art. 20) — Auftragsverarbeiter stellt JSON-Export der Capture-Session und Direct-Download der Walkthrough-Videos bereit.
- **Widerspruchsrecht** (Art. 21) — auf Weisung stoppt der Auftragsverarbeiter die zugehoerige Verarbeitung.
- **Widerruf der Einwilligung** (Art. 7(3)) — Auftragsverarbeiter setzt Widerruf binnen 14 Kalendertagen um (insbesondere Walkthrough-Einwilligung und Lead-Push-Einwilligung).

---

## 9. Meldepflichten und Datenschutzpannen

Der Auftragsverarbeiter teilt dem Verantwortlichen Datenschutzpannen im Sinne von DSGVO Art. 33(2) **unverzueglich, spaetestens innerhalb von 24 Stunden** nach Kenntnis mit, damit der Verantwortliche seine eigene 72-Stunden-Meldepflicht nach Art. 33(1) gegenueber der Aufsichtsbehoerde erfuellen kann.

Die Meldung enthaelt mindestens:

- Beschreibung der Art der Verletzung (Datenkategorien, Anzahl Betroffener, Anzahl Datensaetze)
- Wahrscheinliche Folgen der Verletzung
- Bereits ergriffene oder vorgeschlagene Massnahmen zur Behebung und Schadensminderung
- Name und Kontaktdaten des Ansprechpartners auf Seiten des Auftragsverarbeiters

Der Auftragsverarbeiter dokumentiert alle Datenschutzpannen intern (Art. 33(5)).

---

## 10. Auditrechte

Der Verantwortliche ist berechtigt, die Einhaltung der TOMs durch den Auftragsverarbeiter zu pruefen. Die Pruefung erfolgt:

- Mit einer Vorankuendigung von mindestens **20 Kalendertagen**
- Maximal **einmal pro Kalenderjahr**, ausser bei konkretem Anlass (z. B. nach einer gemeldeten Datenschutzpanne)
- Wahlweise durch den Verantwortlichen selbst oder durch einen vom Verantwortlichen beauftragten unabhaengigen Pruefer, der zur Verschwiegenheit verpflichtet ist
- Auf eigene Kosten des Verantwortlichen, ausser bei nachgewiesenen Verstoessen des Auftragsverarbeiters

Anstelle einer Vor-Ort-Pruefung kann der Auftragsverarbeiter aktuelle Pruefberichte, Zertifizierungen oder Auditierungs-Dokumentationen vorlegen, sofern diese den Pruefungs-Zweck erfuellen.

---

## 11. Rueckgabe und Loeschung nach Vertragsende

Nach Beendigung der Verarbeitungstaetigkeiten loescht der Auftragsverarbeiter alle personenbezogenen Daten des Verantwortlichen, sofern nicht eine Aufbewahrungspflicht nach Unionsrecht oder dem Recht der Mitgliedstaaten besteht.

Die Loeschung erfolgt ueber den dokumentierten Tenant-Delete-Pfad (FK-CASCADE-Kaskade) wie in [`../COMPLIANCE.md` Sektion 7 "Loeschkonzept"](../COMPLIANCE.md#7-loeschkonzept) beschrieben. Die FK-CASCADE-Kette umfasst:

- `tenants` → `capture_session` → `block_checkpoint` + `knowledge_unit` + `validation_layer`
- `walkthrough_session` → `walkthrough_review_mapping`
- `ai_jobs`, `ai_cost_ledger`, `lead_push_consent`, `lead_push_audit`
- `partner_branding_config`, `partner_client_mapping`, `tenant_reminder_state`, `profile`
- `auth.users` ueber Supabase-Auth-Admin-API

Storage-Inhalte (Walkthrough-Aufzeichnungen, Partner-Branding-Assets) werden parallel ueber Storage-Cleanup-Jobs geloescht.

Alternativ zur Loeschung kann der Verantwortliche nach Beendigung einen Daten-Export verlangen (siehe Klausel 8). Auf Wunsch des Verantwortlichen erfolgt eine schriftliche Bestaetigung der vollstaendigen Loeschung.

**Wichtige Einschraenkung:** In V6.2 existiert kein selektiver Tenant-Restore-Pfad. Bei Datenverlust ist nur globales Coolify-DB-Restore moeglich (siehe `../COMPLIANCE.md` Sektion 7.2 und DEC-103). Vor Tenant-Loeschung empfiehlt der Auftragsverarbeiter dem Verantwortlichen ein eigenes Daten-Backup.

**Audit-Trail-Erhalt:** `lead_push_consent` und `lead_push_audit` bleiben als Nachweis der erteilten Einwilligung und der durchgefuehrten Verarbeitung unbegrenzt erhalten (DSGVO-Rechenschaftspflicht Art. 5(2)), auch nach Tenant-Loeschung in pseudonymisierter Form (Tenant-ID-Bezug entfernt, IP-Hash + User-Agent-Hash bleiben).

---

## 12. Haftung, Vertragsdauer und Kuendigung

**Haftung:** Die Haftung der Parteien richtet sich nach DSGVO Art. 82 sowie nach den Regelungen des zugrundeliegenden Hauptvertrags. Ergaenzende Haftungsklauseln werden im Hauptvertrag oder per separater Vereinbarung geregelt.

**Vertragsdauer:** Dieser AVV gilt fuer die Dauer des Hauptvertrags. Bei Beendigung des Hauptvertrags endet automatisch auch dieser AVV.

**Kuendigung:** Eine ordentliche Kuendigung dieses AVV ist nur gemeinsam mit der Kuendigung des Hauptvertrags moeglich. Das Recht zur ausserordentlichen Kuendigung aus wichtigem Grund (z. B. wiederholte schwere Verstoesse gegen DSGVO-Pflichten) bleibt unberuehrt.

**Schriftform:** Aenderungen und Ergaenzungen dieses AVV beduerfen der Textform (E-Mail genuegt). Muendliche Nebenabreden gelten nicht.

**Salvatorische Klausel:** Sollten einzelne Bestimmungen dieses AVV unwirksam sein oder werden, beruehrt dies die Wirksamkeit der uebrigen Bestimmungen nicht. An die Stelle der unwirksamen Bestimmung tritt eine wirksame Regelung, die dem wirtschaftlichen Zweck der unwirksamen Bestimmung am naechsten kommt.

**Gerichtsstand und anwendbares Recht:** Es gilt das Recht der Niederlande (Sitz des Auftragsverarbeiters Strategaize Transition BV). Gerichtsstand ist der Sitz des Auftragsverarbeiters, sofern nicht zwingende Verbraucherschutzvorschriften einen anderen Gerichtsstand vorschreiben.

---

## 13. Unterschriften

**Fuer den Verantwortlichen:**

```
Ort, Datum: ______________________________

Name:       ______________________________

Funktion:   ______________________________

Unterschrift: ____________________________
```

**Fuer den Auftragsverarbeiter:**

```
Ort, Datum: ______________________________

Name:       ______________________________

Funktion:   ______________________________

Unterschrift: ____________________________
```

---

## Cross-References

- [../COMPLIANCE.md Sektion 1](../COMPLIANCE.md#1-erhobene-personenbezogene-daten) — Datenkategorien und Betroffenenkreise
- [../COMPLIANCE.md Sektion 5](../COMPLIANCE.md#5-drittanbieter-liste) — Vollstaendige Unterauftragsverarbeiter-Liste
- [../COMPLIANCE.md Sektion 7](../COMPLIANCE.md#7-loeschkonzept) — Loeschkonzept und FK-CASCADE-Kette
- [../COMPLIANCE.md Sektion 8](../COMPLIANCE.md#8-datenschutzkonforme-defaults) — TOMs nach DSGVO Art. 32
- [../COMPLIANCE.md Sektion 9](../COMPLIANCE.md#9-dpo-bewertung-v62-spezifisch) — DPO-Bewertung Strategaize Transition BV
- [../../strategaize-dev-system/.claude/rules/data-residency.md](../../../strategaize-dev-system/.claude/rules/data-residency.md) — EU-Hosting-Pflicht

---

## Disclaimer

Diese Vorlage ist eine pragmatische technische Standardvorlage und stellt **keine Rechtsberatung** dar. Vor produktivem Einsatz mit echten Partnern oder Vertragspartnern ist eine **anwaltliche Pruefung** durch eine qualifizierte Datenschutzbeauftragte/einen qualifizierten Datenschutzbeauftragten erforderlich. Die Pruefung ist als BL-104 (V6.2-Anwalts-Review) im Backlog gefuehrt und ist User-Pflicht nach /deploy V6.2.

**Stand:** 2026-05-15 (V6.2-Release, SLC-121).
