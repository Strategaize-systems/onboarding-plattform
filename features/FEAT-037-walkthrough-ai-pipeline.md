# FEAT-037 — Walkthrough AI-Pipeline (PII-Redaction + Schritt-Extraktion + Auto-Mapping zu Subtopics)

**Version:** V5 (vorgezogen aus V5.1 per DEC-079, 2026-05-06)
**Status:** planned
**Created:** 2026-05-05
**Updated:** 2026-05-06 — Scope erweitert um Auto-Mapping (Bridge-Engine-Pattern-Reuse)

## Zweck
Whisper-Transkript einer Walkthrough-Session wird durch eine 3-stufige Bedrock-Claude-Pipeline (eu-central-1) zu einer **strukturierten, gemappten SOP-Liste** verdichtet — der Methodik-Output, den der Berater dann reviewt (siehe FEAT-040), nicht das Roh-Video.

Die drei Stufen:
1. **PII-Redaction-Pass** maskiert sensitive Daten (Kundennamen, E-Mail, IBAN, Preise, IDs)
2. **Schritt-Extraktion-Pass** erzeugt strukturierte Schritt-Liste (analog SopStep) + Knowledge Units
3. **Auto-Mapping-Pass** mappt die extrahierten Schritte zu Blueprint-Subtopics (Bridge-Engine-Pattern-Reuse aus FEAT-023, in Reverse-Direction)

## Hintergrund
Per V5 Option 2 (DEC-079) wird die AI-Pipeline aus V5.1 nach V5 vorgezogen, weil sie der eigentliche Strategaize-Methodik-Differenzierer ist — nicht die Roh-Capture-UI. Berater sieht in V5 mapped SOPs, nicht Roh-Walkthroughs.

Stack-Reuse:
- Bedrock-Adapter aus V2 FEAT-005 / FEAT-010 (deployed)
- SOP-Pattern aus V2 FEAT-012 (deployed)
- Bridge-Engine-Pattern aus V4 FEAT-023 (deployed) — fuer Auto-Mapping in Reverse-Direction
- ai_jobs-Queueing aus V4 + V5 SLC-071 (deployed)

## In Scope

### Stufe 1 — PII-Redaction-Worker-Job
- Input: Walkthrough-Transkript (knowledge_unit mit source='walkthrough_transcript')
- Bedrock-Claude-Pass mit konservativer PII-Pattern-Liste
- Output: Redacted-Transkript mit Platzhaltern (`[KUNDE]`, `[EMAIL]`, `[BETRAG]`, `[ID]`, `[INTERN]`)
- Original-Transkript bleibt unveraendert in DB; Redacted-Version landet als separater knowledge_unit-Eintrag
- Pattern-Library unter `src/lib/ai/pii-patterns/` mit synthetischer Test-Suite

### Stufe 2 — Schritt-Extraktion-Worker-Job
- Input: Redacted-Transkript + Walkthrough-Metadaten
- Bedrock-Claude-Pass mit Schritt-Strukturierungs-Prompt (analog V2 SOP-Generation)
- Output: SopStep-Liste (number, action, responsible, timeframe, success_criterion, dependencies) + Knowledge-Unit-Liste mit source='walkthrough'

### Stufe 3 — Auto-Mapping-Worker-Job (NEU in V5 Option 2)
- Input: Extrahierte SopStep-Liste + aktiver Blueprint/Template-Subtopic-Tree des Tenants
- Bedrock-Claude-Pass mit Mapping-Prompt: "Welcher Subtopic des Blueprints passt zu welchem Schritt?"
- Output: Mapping-Tabelle `walkthrough_step → subtopic_id` mit Confidence-Score
- Unmapped-Bucket: Schritte ohne klares Subtopic-Match landen in einem "Unmapped"-Bucket fuer Berater-Review
- Pattern-Reuse: gleiche Bedrock-Adapter-Aufruf-Konvention wie Bridge-Engine in FEAT-023, aber Reverse-Direction (Bridge: Subtopic → spawn Capture-Session; hier: extrahierte Steps → ordne Subtopics zu)

### Pipeline-Trigger
- Auto-Trigger nach Whisper-Transkriptions-Job-Abschluss (`walkthrough_session.status = 'transcribed'`)
- Job-Reihenfolge: PII-Redaction → Schritt-Extraktion → Auto-Mapping (sequenziell, nicht parallel)
- Status-Maschine: `transcribed → redacting → extracting → mapping → pending_review`
- Bei Fehlschlag in einer Stufe: Status `failed`, Audit-Log-Eintrag, kein automatischer Retry (manueller Re-Trigger via Cron oder Berater-UI in V5.x)

### Audit-Log
- Pro Pipeline-Run: Bedrock-Region (eu-central-1), Modell-ID, Stufe, Token-Count, Timestamp, Job-ID
- Audit-Log nutzt bestehende Audit-Konvention aus V5.2 Business-System (DEC-079-Strategaize-Suite-Konsistenz)

## Out of Scope
- Berater-Review-UI (FEAT-040 — separates V5-Feature)
- Video-Level-PII-Redaction (Computer-Vision) — kommt erst bei explizitem Kundenwunsch / Pre-Production-Compliance-Gate
- Mehrsprachige Pattern-Library (DE only fuer V5)
- Cross-Walkthrough-Konsistenz-Pruefung (V6+)
- Per-Tenant-Pattern-Konfiguration (V5.x+)
- Automatischer Retry-Mechanismus bei LLM-Fehlern (V5.x+)

## Akzeptanzkriterien (Skizze)
- PII-Redaction-Pass erkennt mind. 90% synthetischer PII-Beispiele in Test-Suite
- Schritt-Extraktion liefert plausible Schritt-Liste (manuelle Bewertung an mind. 5 Test-Walkthroughs)
- Auto-Mapping ordnet ≥70% der Schritte einem Subtopic mit Confidence ≥0.7 zu (Test-Walkthroughs)
- Unmapped-Bucket existiert und ist im Review-UI (FEAT-040) sichtbar
- Alle drei Worker-Jobs idempotent (Re-Run produziert gleiche Outputs +/- LLM-Variabilitaet)
- Audit-Log enthaelt Bedrock-Region, Modell-ID, Stufe, Token-Count, Timestamp pro Pipeline-Run
- Bedrock-Region eu-central-1 (DSGVO)

## Abhaengigkeiten
- FEAT-034 (Walkthrough Capture-Session) — V5 SLC-071 code-side done
- FEAT-035 (Walkthrough Whisper-Transkription) — V5 SLC-072 next
- Bedrock-Adapter aus V2 FEAT-005 / FEAT-010 (deployed)
- SOP-Pattern aus V2 FEAT-012 (deployed)
- Bridge-Engine-Adapter aus V4 FEAT-023 (deployed) — fuer Auto-Mapping-Pattern-Reuse

## Verweise
- DEC-079 (Strategaize-Dev-System) — V5 Option 2 (2026-05-06)
- PRD V5-Sektion (Option 2)
- /requirements V5 Option 2 RPT-170 (2026-05-06)
- V4 FEAT-023 Bridge-Engine — Mapping-Pattern-Vorlage
- V2 FEAT-012 SOP Generation — Schritt-Extraktions-Pattern-Vorlage
- DEC offen — Q-V5-G (Bedrock-Modell Sonnet vs. Haiku), Q-V5-H (Pattern-Granularitaet), Q-V5-I (Storage-Strategie Original vs. Redacted), Q-V5-J (Auto-Mapping-Confidence-Schwelle), Q-V5-K (Unmapped-Bucket-Datenmodell)
