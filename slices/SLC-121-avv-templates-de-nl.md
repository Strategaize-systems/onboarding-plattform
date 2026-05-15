# SLC-121 — AVV-Templates DE + NL (FEAT-049)

## Goal

**Standard-Auftragsverarbeitungsvertrag-Vorlagen** unter `docs/legal/AVV-DE.md` (Deutsch nach DSGVO Art. 28) und `docs/legal/AVV-NL.md` (Niederlaendisch nach AVG Art. 28). Zweite V6.2-Slice nach SLC-122 — referenziert die TOMs-Sektion von `docs/COMPLIANCE.md` als Cross-Ref-Quelle statt eigene Auflistung.

Reine Markdown-Files, keine Code-Routes, kein Server-State. Distribution erfolgt manuell durch Strategaize-Inhaberin per Mail/Cloud-Link pro Partner-Onboarding (DEC-120). Kein Admin-UI in V6.2.

## Feature

FEAT-049 (AVV-Template DE + NL Markdown).

**Pattern-Reuse:**
- Standard-DSGVO-Art-28-Klausel-Bausteine (Praeambel + 11 Klauseln + Unterschriftsfelder).
- SLC-122 `docs/COMPLIANCE.md` als TOMs-Cross-Ref-Quelle (statt Duplizierung).
- `data-residency.md`-Rule fuer Subunternehmer-Liste.

## In Scope

### `docs/legal/AVV-DE.md`

Standard-Auftragsverarbeitungsvertrag nach DSGVO Art. 28 mit folgenden Klausel-Bausteinen:

1. **Praeambel** — Vertragsparteien, Vertragsgrundlage, Bezug zum Hauptvertrag
2. **Gegenstand der Verarbeitung** — Auftragsverarbeitung im Sinne von DSGVO Art. 28
3. **Art und Zweck der Verarbeitung** — strukturierte Wissenserhebung, KI-gestuetzte Verdichtung, Diagnose-Funnel-Lead-Push (V6)
4. **Art der personenbezogenen Daten + Kategorien betroffener Personen** — siehe Sektion 1 in `docs/COMPLIANCE.md`
5. **Weisungsrecht** — Verantwortlicher gibt Weisungen, Auftragsverarbeiter dokumentiert
6. **Technische und organisatorische Massnahmen (TOMs)** — **Cross-Ref auf `docs/COMPLIANCE.md` Sektion 8** + Verweis auf RLS-by-Default, SECURITY DEFINER mit explicit search_path, Pflicht-Footer, Privacy-Pflicht-Checkbox (DEC-091/099/108)
7. **Subunternehmer** — Liste der EU-gehosteten Sub-Provider (AWS Bedrock eu-central-1, Azure Whisper EU, IONOS SMTP DE, Hetzner Cloud Frankfurt) mit Standard-DPA-Status. Verweis auf `data-residency.md`-Rule.
8. **Unterstuetzungspflichten + Betroffenenrechte** — Auftragsverarbeiter unterstuetzt Verantwortlichen bei Auskunft, Berichtigung, Loeschung, Datenuebertragbarkeit, Widerspruch
9. **Meldepflichten + Datenschutzpannen** — 72h-Meldung nach DSGVO Art. 33
10. **Auditrechte** — Verantwortlicher kann Audit beim Auftragsverarbeiter durchfuehren (Vorlauf, Frequenz, Kostenuebernahme)
11. **Rueckgabe / Loeschung nach Vertragsende** — Tenant-Delete-Kaskade via FK-CASCADE, Verweis auf `docs/COMPLIANCE.md` Sektion 7 (Loeschkonzept)
12. **Haftung + Vertragsdauer + Kuendigung** — Standardklauseln
13. **Unterschriftsfelder** — Verantwortlicher + Auftragsverarbeiter + Datum + Ort

**Header:**
- Disclaimer "keine Rechtsberatung — pragmatische Standardvorlage, Anwalts-Pruefung erforderlich vor Versand an realen Partner" prominent.
- Versionierung "Stand: 2026-05-15 (V6.2-Release)".
- Platzhalter `[Verantwortlicher: ...]` und `[Auftragsverarbeiter: ...]` — Rollen-Zuordnung wird durch Anwalts-Review (BL-104) finalisiert (Strategaize-direkt-Verantwortlicher via Diagnose-Funnel ODER Partner-Kanzlei-Verantwortlicher mit Strategaize-Auftragsverarbeiter).

### `docs/legal/AVV-NL.md`

Analoge NL-Variante (Verwerkersovereenkomst nach AVG Art. 28):
- Klausel-Bausteine 1-13 in NL-Sprache uebersetzt (NICHT Google-Translate, professionelle Standard-NL-Formulierung).
- Subunternehmer-Liste + Cross-Ref auf `docs/COMPLIANCE.md` identisch.
- Disclaimer "geen juridisch advies — standaard sjabloon, juridische toetsing vereist" im NL-Header.
- Versionierung "Datum: 2026-05-15 (V6.2-Release)".

### Verzeichnis-Anlage

- `docs/legal/` als neues Verzeichnis anlegen.
- `.gitignore`-Check: `docs/` ist getrackt. `docs/legal/` ebenfalls tracken (keine Geheimnisse im Template — nur Standardvorlagen ohne befuellte Partner-Daten).
- Beide Markdown-Files unter `docs/legal/AVV-DE.md` + `docs/legal/AVV-NL.md`.

## Out of Scope

- **AVV-EN-Variante** — bei Bedarf wenn EN-Partner konkret, V6.3+ oder V7+.
- **AVV-PDF-Generierung im Code** — V6.2 liefert Markdown. PDF-Konvertierung manuell per Pandoc/Word-Save-As durch User pro Partner-Onboarding (DEC-120).
- **Per-Partner-individualisierte AVV-Varianten** — V1 ist Standard-Template, V2-Featurization spaeter.
- **AVV-Distribution-UI** — `docs/legal/`-Files reichen, Admin-Route `/admin/legal/avv` ist V7+ Backlog (DEC-120).
- **Signatur-/Workflow-Tooling** (DocuSign etc.) — manueller Versand per Mail/Cloud-Link reicht.
- **AVV-Versionierungs-Mechanik im Code** — Versionierung im Markdown-Header-Text, keine separate Tabelle.

## Acceptance Criteria

| AC | Beschreibung |
|---|---|
| AC-1 | `docs/legal/AVV-DE.md` existiert mit allen 13 Klausel-Bausteinen (Praeambel + 11 Klauseln + Unterschriftsfelder). |
| AC-2 | `docs/legal/AVV-NL.md` existiert mit allen 13 Klausel-Bausteinen analog DE, in NL-Sprache. |
| AC-3 | Disclaimer "keine Rechtsberatung" / "geen juridisch advies" prominent im Header beider Files. |
| AC-4 | Platzhalter `[Verantwortlicher: ...]` + `[Auftragsverarbeiter: ...]` in beiden Files (Rollen-Zuordnung pending Anwalts-Review). |
| AC-5 | Subunternehmer-Liste (AWS Bedrock eu-central-1, Azure Whisper EU, IONOS SMTP DE, Hetzner Frankfurt) in beiden Files, konsistent zu `data-residency.md` und `docs/COMPLIANCE.md` Sektion 5. |
| AC-6 | TOMs-Sektion (Klausel 6) verweist per Cross-Link auf `docs/COMPLIANCE.md` Sektion 8 (statt eigene TOMs-Liste). Pruefbar: Klick auf relativen Link `../COMPLIANCE.md#8-datenschutzkonforme-defaults` funktioniert. |
| AC-7 | Versionierung "Stand: 2026-05-15 (V6.2-Release)" / "Datum: 2026-05-15 (V6.2-Release)" in beiden Files. |
| AC-8 | Beide Files lesbar in VS Code Markdown-Preview ohne gebrochene Renderer-State. |
| AC-9 | Beide Files getrackt im Git (kein gitignore-Konflikt). |
| AC-10 | Verweis auf Loeschkonzept (Klausel 11) cross-linkt auf `docs/COMPLIANCE.md` Sektion 7 anstelle eigener Loeschungs-Klausel-Detaillierung. |

## Micro-Tasks

### MT-1: AVV-DE.md erstellen mit allen 13 Klausel-Bausteinen + Cross-Links

- Goal: `docs/legal/AVV-DE.md` mit Header (Disclaimer, Versionierung, Vertragsparteien-Platzhalter) und allen 13 Klausel-Bausteinen befuellen. TOMs- und Loeschkonzept-Klauseln per Cross-Link auf `docs/COMPLIANCE.md` Sektionen 8 und 7. Subunternehmer-Liste hartcoded mit 4 Sub-Providern.
- Files: `docs/legal/AVV-DE.md` (NEU), Verzeichnis `docs/legal/` (NEU).
- Expected behavior: Markdown-Datei mit allen Klauseln vollstaendig. Klausel 4 (Daten-Kategorien) verweist auf `docs/COMPLIANCE.md` Sektion 1 statt Eigen-Auflistung. Klausel 6 (TOMs) verweist auf Sektion 8. Klausel 11 (Loeschung) verweist auf Sektion 7. Cross-Links als relative Pfade (`../COMPLIANCE.md#...`) funktionieren in VS Code Markdown-Preview.
- Verification: VS Code Markdown-Preview rendert sauber, alle Cross-Links anklickbar, Disclaimer prominent oben. Eine Lese-Iteration durch die Datei mit Fokus "ist das Anwalts-Review-bereit" (gut strukturiert, alle Pflicht-Klauseln vorhanden, klar).
- Dependencies: SLC-122 abgeschlossen (Cross-Refs auf `docs/COMPLIANCE.md` Sektionen brauchen die Anker).

### MT-2: AVV-NL.md erstellen als NL-Variante mit allen 13 Klausel-Bausteinen

- Goal: `docs/legal/AVV-NL.md` als analoge NL-Variante (Verwerkersovereenkomst). Klausel-Bausteine 1-13 in NL-Sprache, NL-Standard-Formulierung (NICHT Google-Translate, sondern professionelle juristische NL-Standardformulierung). Cross-Links auf `docs/COMPLIANCE.md` identisch zu DE-Version.
- Files: `docs/legal/AVV-NL.md` (NEU).
- Expected behavior: NL-Markdown-Datei mit allen Klauseln in NL. Disclaimer "geen juridisch advies — standaard sjabloon, juridische toetsing vereist" prominent. Versionierung in NL "Datum: 2026-05-15 (V6.2-Release)". Subunternehmer-Liste identisch zu DE-Version (4 EU-Provider). Cross-Links zu `../COMPLIANCE.md#...` identisch.
- Verification: VS Code Markdown-Preview rendert sauber, alle Cross-Links funktional. NL-Spell-Check (Browser- oder VS Code-NL-Wortbuch) zeigt keine offensichtlichen Tippfehler.
- Dependencies: MT-1 (DE-Version als Strukturvorlage).

## Rollback-Pfad

- Reine Doku-Aenderung. Revert via `git revert <commit>` falls Inhalt grob falsch ist. Kein DB-Effect, kein UI-Effect.
- Anwalts-Review-Outcome kann substantielle inhaltliche Aenderungen verlangen — das ist ein normaler nachgelagerter Edit der `.md`-Datei, kein Rollback.

## DEC-Cross-References

- **DEC-120** — AVV-Distribution nur ueber `docs/legal/`-Files + manuellen Versand, kein Admin-UI in V6.2.
- **DEC-121** — DPO-Bewertung referenziert in TOMs-Klausel als Hinweis auf COMPLIANCE.md Sektion 9.

## Pattern-Reuse-Quellen

- SLC-122 `docs/COMPLIANCE.md` Sektionen 1, 5, 7, 8 als Cross-Ref-Quelle.
- `c:/strategaize/strategaize-dev-system/.claude/rules/data-residency.md` als Anbieter-Liste-Anker.

## Estimated Effort

~60-90 Min Schreiben (MT-1 DE ~40-50min mit allen 11 Klauseln + Cross-Links, MT-2 NL ~30-40min als Uebersetzung der DE-Vorlage). Anwalts-Lese-Review nicht enthalten (User-Pflicht BL-104).
