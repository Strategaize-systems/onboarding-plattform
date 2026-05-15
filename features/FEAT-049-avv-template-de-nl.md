# FEAT-049 — AVV-Template DE + NL (Markdown)

**Version:** V6.2 Compliance-Sprint
**Status:** planned
**Created:** 2026-05-15
**Backlog-Item:** BL-094

## Purpose

Standard-Auftragsverarbeitungsvertrag-Vorlage zum Versand an Partner-Kanzleien. Pflicht vor erstem echten Live-Partner-Steuerberater (kein DE-AVV → kein DE-Pilot, kein NL-AVV → kein NL-Pilot Q4 2026).

## In Scope

- **`docs/legal/AVV-DE.md`** — Standard-AVV nach DSGVO Art. 28, Strategaize Transition BV als eine Vertragspartei, Partner-Kanzlei als andere. Klausel-Bausteine:
  - Praeambel + Gegenstand
  - Art und Zweck der Verarbeitung
  - Art der personenbezogenen Daten + Kategorien betroffener Personen
  - Weisungsrecht
  - Technische und organisatorische Massnahmen (TOMs) — Referenz auf `docs/COMPLIANCE.md` (FEAT-050)
  - Subunternehmer (Hetzner FRA, AWS Bedrock eu-central-1, Azure Whisper EU, IONOS SMTP)
  - Unterstuetzungspflichten + Betroffenenrechte
  - Meldepflichten + Datenschutzpannen
  - Auditrechte
  - Rueckgabe / Loeschung nach Vertragsende
  - Haftung + Vertragsdauer + Kuendigung
  - Unterschriftsfelder
- **`docs/legal/AVV-NL.md`** — analoge NL-Variante (Verwerkersovereenkomst nach AVG/GDPR Art. 28).
- **Platzhalter** fuer Verantwortlichen-Rollen-Zuordnung (klaert Anwalts-Review).
- **Disclaimer** "keine Rechtsberatung — Anwalts-Review pending" prominent.

## Out of Scope V6.2

- AVV-EN (kommt bei Bedarf wenn EN-Partner konkret).
- AVV-PDF-Generierung im Code (V6.2 = Markdown reicht; PDF manuell per Pandoc/Word durch User pro Partner-Onboarding).
- Per-Partner-individualisierte AVV-Varianten (V1 ist Standard-Template, V2 ggf. Partner-Tier-Featurization).
- AVV-Distribution-UI (Admin-Route zur Anzeige/Download) — optional in /architecture klaeren ob das mit reinsoll.
- Signatur-/Workflow-Tooling (DocuSign, etc.) — out of scope, manueller Versand per Mail/Cloud-Link genuegt fuer ersten Live-Partner.

## Constraints

- Markdown nicht ausfuehrbar (keine Page-Route). Dateien liegen in `docs/legal/` und werden manuell distribuiert.
- Texte sind Standardvorlage. Konkrete Bezeichnung von Strategaize Transition BV (Adresse, KvK, Vertretungsberechtigter) wird in der Vorlage als Platzhalter `[Verantwortlicher: ...]` referenziert — Befuellen erfolgt manuell pro Partner-Vertrag.
- Per `data-residency.md` muessen alle Subunternehmer EU-gehostet sein — TOMs/Subunternehmer-Liste muss diesen Stand widerspiegeln.

## Architecture Decisions (entschieden in /architecture V6.2, RPT-266)

- **DEC-120** — AVV-Distribution nur ueber `docs/legal/`-Dateien + manuellen Mail-/Cloud-Link-Versand. KEIN Admin-UI in V6.2. V7+ Backlog falls Partner-Volume >10/Monat erreicht.
- **Rollen-Zuordnung Verantwortlicher vs. Auftragsverarbeiter**: V6.2-Vorlage enthaelt Platzhalter `[Verantwortlicher: ...]` + `[Auftragsverarbeiter: ...]`. Anwalts-Review (BL-104) klaert finale Konstellation (Partner-Kanzlei-Verantwortlicher mit Strategaize-Auftragsverarbeiter ODER Strategaize-Direkt-Verantwortlicher via Diagnose-Funnel-Vertrag mit Mandant).
- **TOMs/Subunternehmer-Referenz**: AVV verweist auf `docs/COMPLIANCE.md` (FEAT-050) statt Doppelung. Subunternehmer-Liste: AWS Bedrock eu-central-1, Azure Whisper EU, IONOS SMTP, Hetzner Frankfurt.
- **AVV-PDF-Konvertierung**: out-of-scope V6.2 (siehe PRD-V6.2). Markdown reicht; PDF-Generierung manuell per Pandoc/Word-Save-As durch User pro Partner-Onboarding.

## Success Criteria

- `docs/legal/AVV-DE.md` deckt alle 11 DSGVO-Art-28-Klausel-Bausteine ab
- `docs/legal/AVV-NL.md` analog
- Disclaimer "keine Rechtsberatung" prominent in beiden Files
- Beide Files lesbar + bearbeitbar fuer User (kein binaeres Format)
