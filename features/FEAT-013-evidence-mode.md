# FEAT-013 — Evidence-Mode + Bulk-Import

- Status: planned
- Version: V2
- Created: 2026-04-19

## Purpose
Neuer Capture-Mode neben dem bestehenden Questionnaire. Kunden koennen Dokumente, Berichte und Archiv-Materialien hochladen. KI extrahiert relevante Inhalte und mappt sie automatisch auf Template-Fragen. Sowohl Einzeldateien als auch Bulk-Import ganzer Dokumentenbestaende.

## Why it matters
Nicht alles Wissen steckt in den Koepfen der Kunden. Vieles ist bereits dokumentiert — in Handbuecher, E-Mails, Berichten, Vertraegen. Den Kunden zu zwingen, alles noch einmal im Fragebogen zu tippen, ist ineffizient und widerspricht dem KI-first-Prinzip. Evidence-Mode holt bestehendes Wissen automatisch in die Plattform.

## How Evidence-Mode works

### Single-Upload Flow
1. **Upload:** Kunde waehlt pro Block ein Dokument (PDF, DOCX, Bilder).
2. **Extraktion:** Server extrahiert Text aus dem Dokument:
   - PDF: pdf-parse oder pdf.js
   - DOCX: mammoth oder docx-parser
   - Bilder: Tesseract OCR (optional, V2 nur wenn machbar)
3. **Chunking:** Extrahierter Text wird in Chunks aufgeteilt (~500-800 Tokens).
4. **KI-Mapping:** Bedrock-Prompt analysiert Chunks und mappt relevante Inhalte auf Template-Fragen:
   - Pro Chunk: "Relevant fuer Frage X" + Confidence
   - Output: Mapping-Vorschlaege mit Quellenreferenz
5. **Review:** Kunde sieht Mapping-Vorschlaege im Evidence-UI:
   - Pro Frage: vorgeschlagene Evidence-Texte
   - Kunde kann bestaetigen, ablehnen oder editieren
6. **Integration:** Bestaetigte Mappings fliessen als zusaetzliche Antwortdaten in den Block-Submit und damit in die Verdichtungs-Pipeline.

### Bulk-Import Flow
1. **Upload:** Mehrere Dateien oder ein Archiv (ZIP) auf einmal.
2. **Pre-Processing:**
   - Relevanz-Klassifikation (geschaeftlich vs. privat, relevant vs. irrelevant)
   - Deduplizierung (gleicher Inhalt aus verschiedenen Quellen)
   - Extraktion + Chunking pro Datei
3. **Batch-Mapping:** KI mappt alle relevanten Chunks auf Template-Fragen.
4. **Review:** Kunde sieht aggregierte Vorschlaege, kann batch-bestaetigen.

### Storage
- Dateien in Supabase Storage (tenant-isoliert per Bucket-Policy)
- Extrahierter Text + Chunks in neuer Tabelle `evidence_chunk`
- Mapping-Ergebnisse als JSONB auf `evidence_chunk` oder eigene Tabelle

## In Scope
- File-Upload-UI (Einzel + Multi/ZIP)
- Text-Extraktion: PDF, DOCX
- KI-Mapping auf Template-Fragen
- Review-UI fuer Mapping-Vorschlaege
- Integration in Block-Submit / Verdichtungs-Pipeline
- Supabase-Storage fuer Dateien (RLS-isoliert)
- evidence_chunk-Tabelle
- Kosten-Logging pro Evidence-Processing

## Out of Scope
- OCR fuer Bilder (V2.1, erhoehte Komplexitaet)
- E-Mail-Dump-Import (mbox/PST/IMAP) (V2.1, eigene Integrations-Arbeit)
- Evidence-Versioning (V2 nur aktueller Stand)
- Evidence-basierte Backspelling-Fragen (V2.1)
- Video/Audio-Evidence (V3+)

## File Type Support (V2)
| Format | Methode | Prioritaet |
|--------|---------|-----------|
| PDF (Text) | pdf-parse | Must-have |
| DOCX | mammoth | Must-have |
| ZIP (Archiv) | node:zlib + Rekursion | Must-have |
| PDF (Scanned/Image) | Tesseract OCR | Nice-to-have |
| TXT/CSV | Direkt-Lesen | Must-have |

## Success Criteria
- Kunde kann PDF/DOCX pro Block hochladen
- KI mappt Inhalte auf Template-Fragen mit Confidence
- Mapping-Vorschlaege sind reviewbar (bestaetigen/ablehnen)
- Bestaetigte Mappings fliessen in die Verdichtung
- Bulk-Upload (multi-file, ZIP) funktioniert
- Dateien sind tenant-isoliert in Supabase Storage
- Upload-Limits werden eingehalten (20 MB/Datei, 100 MB/Bulk)

## Cost Estimate
- 1-2 Bedrock-Calls pro Chunk (Mapping)
- ~5-20 Chunks pro Dokument
- Geschaetzt: $0.05-$0.20 pro Dokument
- Bulk (10 Dokumente): $0.50-$2.00

## Dependencies
- Supabase Storage (bereits in Stack, nicht genutzt in V1)
- FEAT-003 (Questionnaire-Integration fuer bestaetigte Mappings)
- FEAT-005 (Verdichtungs-Pipeline akzeptiert Evidence als zusaetzlichen Input)

## Related
- BL-020 (Evidence-Bulk-Import aus Backlog)
- DEC-004 (KI-first: Evidence wird automatisch gemappt, nicht manuell zugeordnet)
