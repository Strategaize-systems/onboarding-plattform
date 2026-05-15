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

## Open Questions (zur Klaerung in /architecture)

1. **Rollen-Zuordnung Verantwortlicher vs. Auftragsverarbeiter**: Wenn Partner-Kanzlei seine Mandanten in die Plattform bringt, ist die Kanzlei Verantwortlicher (DSGVO Art. 4 Nr. 7) und Strategaize Auftragsverarbeiter (Art. 4 Nr. 8). ODER ist Strategaize selbst Verantwortlicher fuer den Diagnose-Funnel mit eigener Rechtsgrundlage (Vertrag mit Mandant via Self-Signup)? Klaert Anwalts-Review final, V6.2-Vorlage muss beide Konstellationen unterstuetzen oder eine waehlen.
2. **AVV-Distribution-Mechanik**: nur `docs/legal/`-Files oder zusaetzlich Admin-Route `/admin/legal/avv` fuer Strategaize-Sales-Anzeige? Letzteres ware ~1-2h zusaetzlich.

## Success Criteria

- `docs/legal/AVV-DE.md` deckt alle 11 DSGVO-Art-28-Klausel-Bausteine ab
- `docs/legal/AVV-NL.md` analog
- Disclaimer "keine Rechtsberatung" prominent in beiden Files
- Beide Files lesbar + bearbeitbar fuer User (kein binaeres Format)
