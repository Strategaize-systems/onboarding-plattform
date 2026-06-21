# StB-Vertikale — Modul-Bibliothek (Seed-Source)

> **Zweck:** strukturierte, versionierte Seed-Quelle für die V10-StB-Vertikale (SLC-170 / SLC-170b). Ersetzt die losen Root-IP-Dateien als Build-Input. Quelle: `StrategAIze Module.xlsx` (Dev-System strategy-docs) + B1-Requirements (`STRATEGAIZE_STB_VERTIKALE_B1_REQUIREMENTS_2026-06-21`, dev-system). Stand 2026-06-21 (B1-Abgleich, DEC-242).
> **System-of-Record bleibt** die `template`-Tabelle (Seed via MIG-125 ff.). Diese Datei ist die menschen-lesbare Quell-Spezifikation, gegen die geseedet wird.

## 1. Was geseedet wird

Pro Modul eine `template`-Row mit:
- **`blocks`** — Fragebogen in zwei Stufen: Stufe-1-Kern (`required=true`) + Stufe-2-Vertiefung (`ebene=2`, `required=false`),
- **`metadata.ki_hebel[]`** — KI-/Automatisierungs-Hebel, jeder mit **Reifegrad 1–4**,
- beim **Blueprint** zusätzlich `diagnosis_schema` (Ampel/Reifegrad) + `diagnosis_prompt` + **Modul-Routing**.

Aus den StB-Antworten baut der Synthese-Worker (SLC-174) das Liefer-**Triple** Entscheidung / Standard / Implementierungsschritt. **Garbage in → garbage out:** die Qualität des geseedeten Inhalts = die Qualität des Endprodukts. Deshalb wird Inhalt **nicht erfunden** (Founder-IP), sondern nur geseedet, was auf M-04-Tiefe ausgearbeitet ist.

## 2. Der StB-KERN-Cut (Phase 1) — 18 Module

Branchenschnitt der generischen 46er-Bibliothek auf die Steuerkanzlei (professionelle Dienstleistung unter Nachfolge-/Personal-/KI-Druck). Founder-bestätigt 2026-06-21 (B1).

| # | M-ID | Modul | Kategorie | StB-Begründung | Content-Stand |
|---|---|---|---|---|---|
| 1 | M-BP | Blueprint (Einstiegs-Diagnostik + Routing) | Führung & Struktur | Einstieg beider Eingänge (Nachfolge / KI-Readiness) | **fehlt** (Diagnose-Fragen + Ampel + Routing) |
| 2 | M-01 | Geschäftsmodell & Werttreiber | Führung & Struktur | Erlös-Mix Compliance vs. Beratung, Marge/Zeitfresser | Gerüst |
| 3 | M-02 | Organisationsstruktur & Rollen | Führung & Struktur | Inhaberabhängigkeit, reale vs. formale Struktur | Gerüst |
| 4 | M-03 | Entscheidungsprozesse & Governance | Führung & Struktur | Wer entscheidet, Stellvertretung (Übergabe-relevant) | Gerüst |
| 5 | M-04 | Grundlegende Finanzsteuerung (GuV/Bilanz/Cash) | Finanzen & Controlling | Kanzlei steuert Mandanten, oft nicht sich selbst | **fertig** (26 Fragen, 13 KI-Hebel) |
| 6 | M-06 | Liquiditätsplanung & Zahlungsströme | Finanzen & Controlling | Cash-Reserven, Mandanten-Abhängigkeit | leer (1 Einzeiler) |
| 7 | M-07 | KPI-Set & Reporting-Struktur | Finanzen & Controlling | Kanzlei-Kennzahlen (Realisierung, Umsatz/Kopf) | Gerüst |
| 8 | M-08 | Vertriebsstrategie & Zielkunden | Vertrieb-System | Mandanten-Akquise, Wunschmandate, Fokus | Gerüst |
| 9 | M-15 | Positionierung & Kernbotschaften | Marketing | Kanzlei-Positionierung (Beratung vs. Compliance) | Gerüst |
| 10 | M-16 | Leadgenerierung & Kanäle | Marketing | Mandanten-Gewinnung systematisch | Gerüst |
| 11 | M-26 | Personalstruktur & strateg. Personalbedarf | HR & Personal | **83 %-Problem** + interne Nachfolgeplanung | Gerüst |
| 12 | M-27 | Rekrutierung & Employer Branding | HR & Personal | Personalmangel-Kern, Arbeitgeberattraktivität | Gerüst |
| 13 | M-28 | Onboarding & Einarbeitung | HR & Personal | Wissensaufbau bei Fluktuation | Gerüst |
| 14 | M-35 | Gesellschafts-, Nachfolge- & Gesellschafterverträge | Recht & Verträge | **Der Nachfolge-Eingang (A)** | Gerüst |
| 15 | M-36 | Systemlandschaft & Integrationen | IT, Daten & Tools | DATEV-Verzahnung, KI-Readiness-Kern | Gerüst |
| 16 | M-38 | IT-Sicherheit, Backups & Ausfallrisiken | IT, Daten & Tools | Mandantendaten-Sensibilität (DSGVO) | Gerüst |
| 17 | M-39 | Zentrale Wissensplattform & Dokumenttypen | Wissensmgmt | Kanzlei-Know-how, Playbooks (Übergabe-relevant) | Gerüst |
| 18 | M-42 | Unternehmer-Rolle & Entscheidungsklarheit | Persönlich | Inhaberabhängigkeit/Loslassen = Nachfolge-Kern | Gerüst |

**Zwei bewusste Hochstufungen** (generisch OPTIONAL → StB-KERN): **M-35** (Nachfolgeverträge = A-Eingang), **M-42** (Loslassen/Inhaberabhängigkeit = härtester Übergabe-Hebel).

**Bewusst NICHT im StB-Cut** (generisch KERN, für eine Kanzlei Phase-1-sekundär): **M-05** (Ergebnisrechnung n. Produkten/Segmenten — gestrichen, DEC-242), M-09 Preislogik (StBVV teils gesetzlich), M-10 Pipeline/CRM, M-11 Kundenentwicklung, M-19/M-20 Service/Reklamation, M-22–M-25 Operations, M-29 Personalakten, M-31–M-34 sonstige Verträge, M-37 Datenqualität, M-40 Kommunikationsflüsse, M-12–M-14/M-17/M-18/M-21/M-30/M-41/M-43–M-46.

## 3. Seed-Rollout (content-gated)

| Welle | Inhalt | Gate | Slice |
|---|---|---|---|
| **1 (jetzt)** | **M-04** (vollständig) | Content fertig | **SLC-170** |
| **2** | **Blueprint (M-BP)** | Founder-Autoring (Diagnose + Ampel + Routing) | SLC-170b (Blueprint zuerst — entsperrt SLC-172) |
| **3** | M-06, M-07 (Finanzen komplett) | Founder-Autoring | SLC-170b |
| **4** | M-26/M-27/M-28 (HR), M-35 + M-42 (Nachfolge) | Founder-Autoring | SLC-170b |
| **5** | Rest des 18-Cuts (M-01/02/03, M-08, M-15/16, M-36/38, M-39) | Founder-Autoring | SLC-170b |

**Regel:** Ein Modul wird erst geseedet, wenn es M-04-Tiefe erreicht (siehe §5). Kein KI-erfundenes IP (`nicht raten`, immoscheckheft-Parität-Disziplin). Blueprint hat Vorrang vor weiteren Fach-Modulen, weil er Einstieg + Routing ist (blockt SLC-172).

## 4. Vollständige 46-Modul-Bibliothek (Referenz)

Generische KMU-Bibliothek; **K** = im StB-Cut, leer = Phase-1-sekundär. Generic-Prio aus `StrategAIze Module.xlsx`.

| M-ID | Modul | Kategorie | Generic-Prio | StB-Cut |
|---|---|---|---|---|
| M-BP | Blueprint | Führung & Struktur | KERN | **K** |
| M-01 | Geschäftsmodell & Werttreiber | Führung & Struktur | KERN | **K** |
| M-02 | Organisationsstruktur & Rollen | Führung & Struktur | KERN | **K** |
| M-03 | Entscheidungsprozesse & Governance | Führung & Struktur | KERN | **K** |
| M-04 | Grundlegende Finanzsteuerung (GuV/Bilanz/Cash) | Finanzen & Controlling | KERN | **K** |
| M-05 | Ergebnisrechnung nach Produkten/Segmenten | Finanzen & Controlling | KERN | — (DEC-242) |
| M-06 | Liquiditätsplanung & Zahlungsströme | Finanzen & Controlling | KERN | **K** |
| M-07 | KPI-Set & Reporting-Struktur | Finanzen & Controlling | KERN | **K** |
| M-08 | Vertriebsstrategie & Zielkunden | Vertrieb – Unternehmenssystem | KERN | **K** |
| M-09 | Angebots- & Preislogik, Rabattsystem | Vertrieb – Unternehmenssystem | KERN | — |
| M-10 | Pipeline-Management & CRM-Nutzung | Vertrieb – Unternehmenssystem | KERN | — |
| M-11 | Kundenentwicklung (Bestand, Upsell, Cross-Sell) | Vertrieb – Unternehmenssystem | KERN | — |
| M-12 | Gesprächsführung & Abschlusskompetenz | Vertrieb – persönliche Skills | OPTIONAL | — |
| M-13 | Verhandlungsführung & Konditionen-Management | Vertrieb – persönliche Skills | OPTIONAL | — |
| M-14 | Einwandbehandlung & Preisgespräche | Vertrieb – persönliche Skills | OPTIONAL | — |
| M-15 | Positionierung & Kernbotschaften | Marketing & Leadgenerierung | KERN | **K** |
| M-16 | Leadgenerierung & Kanäle | Marketing & Leadgenerierung | KERN | **K** |
| M-17 | Social Media & Content (z. B. LinkedIn) | Marketing & Leadgenerierung | OPTIONAL | — |
| M-18 | Reputations- & Bewertungsmanagement | Marketing & Leadgenerierung | OPTIONAL | — |
| M-19 | Kundenservice-Struktur & Kontaktpunkte | Kundenservice & Reklamation | KERN | — |
| M-20 | Reklamations- & Beschwerdemanagement | Kundenservice & Reklamation | KERN | — |
| M-21 | Kundenbindung & Retention-Programme | Kundenservice & Reklamation | OPTIONAL | — |
| M-22 | Leistungs-/Produktkatalog & Produktdaten | Operations & Leistungserbringung | KERN | — |
| M-23 | Auftragsabwicklung / Projektabwicklung | Operations & Leistungserbringung | KERN | — |
| M-24 | Qualitätssicherung & Nacharbeit | Operations & Leistungserbringung | KERN | — |
| M-25 | Technisches/Produktwissen & Wissenszugang | Operations & Leistungserbringung | KERN | — |
| M-26 | Personalstruktur & strateg. Personalbedarf | HR & Personal | KERN | **K** |
| M-27 | Rekrutierung & Employer Branding | HR & Personal | KERN | **K** |
| M-28 | Onboarding & Einarbeitung | HR & Personal | KERN | **K** |
| M-29 | Personalakten & HR-Dokumentation | HR & Personal | KERN | — |
| M-30 | Personalentwicklung & Feedbacksysteme | HR & Personal | OPTIONAL | — |
| M-31 | Kundenverträge & AGB | Recht & Verträge | KERN | — |
| M-32 | Lieferanten- & Dienstleisterverträge | Recht & Verträge | KERN | — |
| M-33 | Finanz-, Leasing- & Mietverträge | Recht & Verträge | KERN | — |
| M-34 | Software- & Lizenzverträge | Recht & Verträge | KERN | — |
| M-35 | Gesellschafts-, Nachfolge- & Gesellschafterverträge | Recht & Verträge | OPTIONAL | **K** ↑ |
| M-36 | Systemlandschaft & Integrationen | IT, Daten & Tools | KERN | **K** |
| M-37 | Datenqualität & Zugriffsrechte | IT, Daten & Tools | KERN | — |
| M-38 | IT-Sicherheit, Backups & Ausfallrisiken | IT, Daten & Tools | KERN | **K** |
| M-39 | Zentrale Wissensplattform & Dokumenttypen | Wissensmanagement & Kommunikation | KERN | **K** |
| M-40 | Kommunikationsflüsse & Meetingstruktur | Wissensmanagement & Kommunikation | KERN | — |
| M-41 | Ideen- und Verbesserungsmanagement | Wissensmanagement & Kommunikation | OPTIONAL | — |
| M-42 | Unternehmer-Rolle & Entscheidungsklarheit | Persönliche Kompetenz-Module | OPTIONAL | **K** ↑ |
| M-43 | Führung & Mitarbeitergespräche | Persönliche Kompetenz-Module | OPTIONAL | — |
| M-44 | Vertriebspersönlichkeit & Kommunikationsstil | Persönliche Kompetenz-Module | OPTIONAL | — |
| M-45 | Verhandlungskompetenz (persönlich) | Persönliche Kompetenz-Module | OPTIONAL | — |
| M-46 | Selbstorganisation & Priorisierung | Persönliche Kompetenz-Module | OPTIONAL | — |

## 5. Was ein Modul für M-04-Tiefe braucht (Autoring-Vorlage)

Damit ein Modul seedbar ist (Founder-Autoring je Welle 2–5):

1. **Themenbaum** — 5–7 Bereiche mit je 2–3 Unterthemen.
2. **Fragebogen** — Fragen markiert als Stufe-1-Kern (Pflicht) vs. Stufe-2-Vertiefung (optional).
3. **KI-Hebel-Katalog** — pro Hebel: Name, Beschreibung, **Reifegrad 1–4**.
4. **Output-Contract** — was als Entscheidung / Standard / Implementierungsschritt rauskommt (generische Triple-Definition aus der Workspace-Vorlage reicht als Rahmen).

**Blueprint zusätzlich:** Diagnose-Fragen über die ganze Kanzlei + Ampel-/Reifegrad-Logik + Routing (welche Antwort → welches Modul). DEC-234: neuer StB-Kanzlei-Inhalt, **nicht** Exit-Readiness-Content recyceln (DATEV-Abgrenzung).

## 6. IP-Quellen (Dev-System strategy-docs, untracked)

- `StrategAIze Module.xlsx` — die 46er-Bibliothek (Basis dieser Datei).
- `M-04 – Grundlegende Finanzsteuerung (GuV-Bilanz-Cash).docx` — M-04 volle Spec (26 Fragen, 13 Hebel) → Quelle für SLC-170 MT-2.
- `StrategAIze Workspace.docx` — Liefervorlage (Triple-Output-Rahmen).
