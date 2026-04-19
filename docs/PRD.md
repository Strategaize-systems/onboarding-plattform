# Product Requirements Document

## Purpose
Die Strategaize Onboarding-Plattform ist eine KI-first Plattform fuer strukturierte Wissenserhebung und -verdichtung. Der Kunde arbeitet Wissensbereiche selbstaendig durch, waehrend KI die Hauptarbeit uebernimmt (herauskitzeln, verdichten, Muster erkennen, Luecken detektieren). Ein Template-System ermoeglicht mehrere Produktvarianten aus einer Codebasis — erster Use-Case ist Exit-Readiness, spaeter interne Mitarbeiter-Onboardings und weitere Templates.

## Vision
Consultant-Zeit wird skalierbar, indem KI die Wissenserhebung und -verdichtung uebernimmt. Menschen (Berater) kommen nur in definierten Meeting-Review-Punkten ins Spiel — um Richtung zu pruefen, Ergebnisse mit dem Kunden durchzugehen und einen finalen Stand festzuhalten. Das System wird ueber Zeit durch bessere KI-Prompts, Skills und Loops besser — nicht durch mehr menschliche Stunden.

Das langfristige Ziel ist eine Plattform, die End-to-End Knowledge Management liefert: Wissen erheben → strukturieren → verdichten → auswerten → ausgeben. Mehrere Capture-Modi (Questionnaire, Exception, Evidence, Dialogue, Walkthrough, Diary) und mehrere Templates lassen die Plattform von einem Exit-Readiness-Werkzeug zu einem vollwertigen Onboarding-System fuer unterschiedlichste Szenarien wachsen.

## Problem Statement
Consultant-gefuehrte Wissenserhebung ist heute eine Zeit-gegen-Geld-Leistung. Jede Stunde, die ein Berater neben dem Kunden sitzt und Fragen stellt, ist nicht skalierbar und kostet den Kunden direkt Beratungsumsatz. Gleichzeitig brauchen typische Strategaize-Use-Cases (Exit-Readiness, interne Prozess-Onboardings, Discovery-Arbeit) eine sehr strukturierte, versionierbare Wissensbasis — nicht nur lose Meeting-Notizen.

Es gibt heute kein Werkzeug, das:
1. Kunden autonom durch definierte Wissensbereiche fuehrt (Block-basiert, versioniert),
2. KI die Hauptarbeit der Verdichtung und Luecken-Erkennung uebernehmen laesst,
3. Berater nur noch in einem klar definierten Meeting-Review-Punkt pro Block braucht,
4. Ergebnisse als strukturierte Knowledge Units speichert, die spaeter weiterverarbeitet werden koennen,
5. aus einer Codebasis heraus mehrere Deployment-Modelle (Multi-Tenant SaaS, Single-Tenant, On-Premise) bedient.

## Goal / Intended Outcome
Eine erste marktreife Version, die Exit-Readiness als vollstaendigen Use-Case liefert. Ein Kunde kann sich einloggen, alle Exit-Readiness-Bloecke selbstaendig (KI-unterstuetzt) durcharbeiten, pro Block einen Submit ausloesen, danach eine KI-verdichtete Knowledge-Unit-Liste sehen, und der Berater kann im Meeting-Review den verdichteten Stand mit dem Kunden durchgehen und als finalen Snapshot festhalten. Alle Ergebnisse sind versioniert, RLS-isoliert und exportierbar.

## Target Users

### Primaer (V1)
- **Strategaize-Berater (strategaize_admin):** fuehrt den Meeting-Review nach Block-Submit durch, haelt den Stand fest, nutzt verdichtete KI-Ergebnisse als Gespraechsgrundlage
- **Kunden-Geschaeftsfuehrer (tenant_admin):** arbeitet das Onboarding selbstaendig durch, mit KI-Chat als Hilfe, erhaelt am Ende einen verdichteten Bericht plus Meeting-Stand
- **Kunden-Teammitglieder (tenant_member):** koennen auf einzelne Bloecke freigegeben werden und dort beitragen

### Spaeter (V2+)
- Weitere Templates fuer andere Use-Cases (z.B. Immobilien-Onboarding, Mitarbeiter-Discovery intern)
- Interne Kunden-Nutzung (Geschaeftsfuehrer erhebt Wissen von eigenen Mitarbeitern innerhalb der Kundenfirma)

## Scope

### V1 In Scope
1. **Fundament-Datenmodell:** Knowledge Unit, Capture Session, Validation Layer, Template-Objekt — generisch benannt, template-ready
2. **Rollen & RLS:** strategaize_admin, tenant_admin, tenant_member uebernommen aus Blueprint-Modell, erweitert auf Knowledge-Unit-Scope
3. **Template "Exit-Readiness" aktiv:** Content-Basis aus Blueprint V3.4, als erste Template-Instanz eingebunden
4. **Questionnaire-Mode:** Block-Submit-Pattern mit versionierten Checkpoints (aus Blueprint portiert)
5. **Exception-Mode:** zusaetzlicher Prompt-Layer fuer "frei heraus" Beitraege waehrend der Questionnaire-Nutzung
6. **Lightweight KI-Verdichtung (Single-Pass):** pro Block-Submit werden Antworten via AWS Bedrock (Claude Sonnet, Frankfurt) zu Knowledge Units verdichtet, inkl. Confidence-Indikatoren
7. **OS-Ebene-1 portiert:** blueprint_block_sessions + blueprint_debrief_items + Query-Layer + Worker + Import-Endpoint, umgebaut auf neue Auth und neue Schema-Namen (capture_session, knowledge_unit)
8. **Debrief-/Meeting-UI:** strategaize_admin sieht verdichteten Block-Stand, haelt Meeting-Stand als versionierten Snapshot fest
9. **Deployment-Flexibilitaet:** ENV-only Config, RLS, Docker-Compose (DEC-002)

### V1 Out of Scope
- 3-Agenten-Loop (Analyst + Challenger + Orchestrator) → V2
- Automatische Rueckfrage-Rueckspielung ins Questionnaire bei Luecken → V2
- SOP-Generierung (Ebene 2) → V2
- Zweites Template und Template-Switcher-UI → V2
- Evidence-Mode mit KI-Auto-Mapping → V2
- Dialogue-Mode (Meeting-Interview) → V3, abhaengig von Business V4.1 Meeting-Pipeline
- Walkthrough-Mode (Screen-Capture) → V4, vorher Technologie-Spike
- Diary-Mode (Mobile/PWA) → V5
- Process-Mining-Connector, kollaborative Annotation, Anomalie-Flagging → V6+
- Neue "consultant"-Rolle fuer Multi-Berater-Szenarien → V2+, je nach Bedarf

## Core Features (V1)

| ID | Feature | Zweck |
|----|---------|-------|
| FEAT-001 | Foundation Data Model & RBAC | Generisches Datenmodell + Rollen + RLS als Basis fuer alle weiteren Features |
| FEAT-002 | Exit-Readiness Template | Erstes aktives Template, Content aus Blueprint V3.4 portiert |
| FEAT-003 | Questionnaire Mode with Block-Submit | Kunde arbeitet Bloecke durch, submittet pro Block, versionierter Checkpoint |
| FEAT-004 | Exception Mode Prompt Layer | Zusatz-Prompt fuer Freitext-Beitraege neben Standard-Questionnaire |
| FEAT-005 | Single-Pass AI Condensation | OS-Ebene-1 portiert, Bedrock-Worker, Import-Endpoint, Knowledge-Unit-Output |
| FEAT-006 | Debrief Meeting Interface | strategaize_admin sieht verdichteten Stand + haelt Meeting-Snapshot fest |

Detaillierte Specs pro Feature liegen unter `/features/FEAT-XXX-*.md`.

## Constraints

### Technologie
- **Code-Basis:** Blueprint V3.4 (DEC-001). Keine Neuentwicklung von Auth, Supabase-Bridge, Docker-Setup, UI-Bibliothek.
- **LLM-Provider:** AWS Bedrock mit Claude Sonnet, Frankfurt-Region (DEC-006). Kein Ollama, keine duale Provider-Strategie.
- **DB:** Self-hosted Supabase auf Hetzner (gleicher Server wie Blueprint, Coolify-gemanagt).
- **Deployment:** Docker Compose via Coolify. Auto-Deploy OFF. Manueller Deploy durch User.
- **Keine Hardcoded Kunden-/Tenant-/Domain-Werte** (DEC-002).

### Organisatorisch
- **KI-first Grundprinzip** (DEC-004): Kein Feature darf eine Rolle einfuehren, in der ein Strategaize-Mitarbeiter beim Wissenssammeln neben dem Kunden sitzt. Verhandelbar ist das nicht.
- **Bedrock-Kosten-Kontrolle:** KI-Features sind on-click oder Block-Submit-getriggert, nicht auto-load (siehe feedback_bedrock_cost_control).
- **Keine lokalen Docker-Tests:** direkt auf Hetzner deployen (siehe feedback_no_local_docker).

### Sprache / Inhalt
- UI und Content primaer Deutsch (Blueprint-Erbe), Content technisch vorbereitet fuer spaetere Mehrsprachigkeit (Template-Struktur).

## Risks / Assumptions

### Risiken
- **R1 — KI-Qualitaet bei Single-Pass:** Single-Pass-Verdichtung ohne Agenten-Loop koennte in komplexen Bloecken schwache Ergebnisse liefern. Mitigation: Berater schliesst im Meeting die Luecke. Wenn Luecken-Feedback in V1-Tests wiederholt auftaucht, wird V2-3-Agenten-Loop priorisiert.
- **R2 — Schema-Umbau-Risiko:** Umbenennung block_session → capture_session und debrief_item → knowledge_unit beruehrt viele Code-Pfade aus dem Blueprint-Erbe. Mitigation: saubere Migrations-Struktur, Query-Layer-Abstraktion, slice-weise Umstellung.
- **R3 — Deployment-Flexibilitaet vs. Implementierungsgeschwindigkeit:** DEC-002 zwingt zu ENV-only und RLS-Disziplin, was kleine Features verlangsamt. Mitigation: akzeptiert, weil Kunden-Szenarien-Optionen es wert sind.
- **R4 — Bedrock-Kosten:** Bei vielen Block-Submits pro Kunde koennen Kosten explodieren. Mitigation: on-click Trigger, Log pro Call, spaeter Quota-System pro Tenant (V2+).

### Annahmen
- Der User betreibt die Plattform ab V1 in einem Multi-Tenant-SaaS-Modus auf Hetzner, mit perspektivischer Option auf On-Premise-Deals.
- Blueprint V3.4 bleibt stabil und wird nicht mehr parallel weiterentwickelt (ab V1-Start der Onboarding-Plattform).
- AWS-Bedrock-Zugang aus Blueprint wird fuer V1 geteilt; eigener IAM-User kann spaeter angelegt werden.
- Erste Echt-Nutzung ist User-interner Test (Eigenanwendung), dann erster externer Kunde.

## Success Criteria (V1)

V1 ist erfolgreich, wenn ALLE folgenden Kriterien erfuellt sind:

**SC-1 — Ende-zu-Ende-Flow funktioniert (Kunde)**
Ein neu eingeladener tenant_admin kann sich einloggen, das Exit-Readiness-Template als laufende Capture Session starten, mindestens einen Block im Questionnaire-Mode komplett durcharbeiten (inkl. Exception-Mode-Eintrag) und per Block-Submit abschliessen. Das System erzeugt einen versionierten Checkpoint.

**SC-2 — Ende-zu-Ende-Flow funktioniert (Berater)**
Nach Block-Submit triggert der Worker eine Single-Pass-Verdichtung via AWS Bedrock. Das Ergebnis ist eine Liste von Knowledge Units mit Confidence-Indikator, sichtbar im Debrief-UI fuer strategaize_admin. Der Berater kann im Meeting-Mode Knowledge Units bestaetigen, aendern oder ergaenzen und einen finalen Meeting-Snapshot erzeugen.

**SC-3 — Datenmodell ist template-ready**
Das Schema verwendet generische Begriffe (capture_session, knowledge_unit, template). Ein zweites Template koennte ohne Schema-Aenderung hinzugefuegt werden (Scope-Test, nicht Produktion-Test).

**SC-4 — RLS-Isolation haelt**
Zwei Test-Tenants sehen niemals Daten des jeweils anderen Tenants. strategaize_admin kann Cross-Tenant-Review durchfuehren, tenant_admin kann NUR eigene Daten lesen/schreiben, tenant_member kann NUR freigegebene Bloecke lesen/schreiben.

**SC-5 — Deployment-Flexibilitaet ist verifiziert**
Ein zweiter Docker-Compose-Deploy der gleichen Codebasis auf einem zweiten Test-Setup laeuft ohne Code-Aenderung nur durch neue ENV-Werte und neue Supabase-Instanz.

**SC-6 — Versionierung haelt**
Block-Submits, KI-Verdichtung und Meeting-Snapshots sind alle versioniert nachvollziehbar (Timestamp + Versions-Hash o.ae.) und koennen in ein historisches Audit-View rekonstruiert werden.

**SC-7 — KI-first Prinzip verletzt keine Rolle**
In keiner V1-UI existiert ein Workflow, in dem ein Berater neben dem Kunden sitzt und Fragen beantwortet. Alle Berater-Interaktionen finden in Debrief/Meeting-Flaechen statt, nicht im Questionnaire-Flow.

**SC-8 — Bedrock-Kosten sind kontrollierbar und sichtbar**
Pro Block-Submit entsteht ein Log-Eintrag mit Token-Verbrauch. Der User kann monatliche Kosten mindestens manuell aggregieren.

## Open Questions

### Offen, nicht V1-blockierend
- **Q1 — Finaler Produktname:** "Onboarding-Plattform" ist Arbeitstitel. Entscheidung nach erstem Kunden-Test.
- **Q2 — Export-Format fuer Knowledge Units:** V1 braucht mindestens JSON-Export. PDF/Markdown wird in /architecture beleuchtet.
- **Q3 — Worker-Trigger-Mechanismus:** Cron-basiert (wie Blueprint) vs. Event-basiert. Wird in /architecture entschieden.
- **Q4 — Confidence-Indikator-Skala:** 0-1 float vs. 3-Stufen-Enum (low/medium/high). Wird in /architecture entschieden.
- **Q5 — Onboarding-Flow fuer neue Tenants:** manuell durch strategaize_admin angelegt (V1) vs. Self-Service-Signup (V2+). V1 geht von manueller Anlage aus.

### Wird in spaeteren Skills entschieden
- Konkrete Migration-Reihenfolge und RPC-Naming: /architecture
- Slice-Schnitte und Reihenfolge: /slice-planning
- Prompt-Templates fuer Claude Sonnet: /backend

## Delivery Mode
**SaaS Product.** Begruendung: produktiv nutzbare Plattform mit externen Kunden als Zielgruppe, Multi-Tenant-Modell, Rollen-basierte Zugriffssteuerung, Versionierung und Audit-Anforderungen. SaaS-Level QA- und Release-Rigor gilt. Deployment-Flexibilitaet (Single-Tenant, On-Premise) ist eine zusaetzliche architektonische Anforderung, aendert aber nichts am SaaS-Grundcharakter fuer V1.

---

## V1.1 — Maintenance Release

### Problem Statement (V1.1)
V1 wurde aus einem Blueprint-Fork aufgebaut. Dabei blieben ~41 tote Dateien, 17 nicht-ausfuehrbare Legacy-Migrations, ein nicht-funktionales Dashboard und eine fehlende error_log-Tabelle zurueck. Diese Altlasten behindern die Code-Hygiene, die Entwickler-Orientierung und die Observability. Vor dem ersten Kundenkontakt muessen diese Defizite beseitigt werden.

### Goal (V1.1)
Saubere Codebasis ohne Blueprint-Altlasten, funktionales Dashboard fuer tenant_admin, und funktionierende Fehler-Protokollierung. Kein neues Feature — reine Hygiene und Stabilisierung.

### V1.1 In Scope

| ID | Feature | Zweck | Loest Issue |
|----|---------|-------|-------------|
| FEAT-007 | Blueprint-Legacy-Cleanup | ~41 tote Dateien + 17 Legacy-Migrations entfernen | ISSUE-011, ISSUE-006 |
| FEAT-008 | Dashboard Capture-Sessions | Dashboard zeigt aktive Capture-Sessions statt leere Blueprint-Runs | ISSUE-012 |
| FEAT-009 | Error-Logging | error_log-Tabelle erstellen, logger.ts funktionsfaehig machen | ISSUE-013 |

### V1.1 Mitgenommen (kein eigenes Feature)
- **ISSUE-003:** `npm install` lokal ausfuehren, damit Type-Check und Lint verfuegbar sind. Wird als Teil des ersten Slice erledigt.

### V1.1 Out of Scope
- **ISSUE-014 Voice-Input:** Braucht eigenen Whisper-Transkriptions-Endpoint fuer Capture-Sessions. Eigenes Feature, gehoert in V2.
- **ISSUE-007 JWT-Refresh:** Kein realer Impact (keine Bestandssessions). Akzeptiert, kein Fix noetig.
- Neue Features, neue Capture-Modi, neue Templates, 3-Agenten-Loop — alles V2.

### Success Criteria (V1.1)

**SC-V1.1-1 — Keine Blueprint-Legacy-Dateien mehr**
`grep -r "from.*runs\|from.*questions\|from.*evidence_items\|from.*mirror_profiles\|from.*run_memory\|from.*run_feedback" src/` liefert 0 Treffer (ausser bewusst erhaltene Dateien wie llm.ts buildOwnerContext). Verzeichnisse `/src/app/runs/`, `/src/app/admin/runs/`, `/src/app/admin/catalog/`, `/src/app/api/tenant/runs/`, `/src/app/api/tenant/mirror/`, `/src/app/api/admin/runs/` existieren nicht mehr.

**SC-V1.1-2 — Keine Legacy-Migrations**
`sql/migrations/` enthaelt nur Migrations 021+ (Onboarding-eigene). Keine Blueprint-Nummern 003-020.

**SC-V1.1-3 — Dashboard zeigt Capture-Sessions**
tenant_admin sieht nach Login eine Liste seiner aktiven Capture-Sessions mit Status, Template-Name und letztem Update. Klick fuehrt zur Session.

**SC-V1.1-4 — Error-Logging funktioniert**
Ein absichtlich provozierter Fehler (z.B. ungueltige API-Anfrage) erzeugt einen Eintrag in der error_log-Tabelle. `SELECT count(*) FROM error_log` liefert > 0.

**SC-V1.1-5 — Build + Tests gruen**
`npm run build` und `npm run test` laufen ohne Fehler durch.

### Risks (V1.1)
- **R1 — Unentdeckte Abhaengigkeiten:** Legacy-Dateien koennten von aktiven Dateien importiert werden. Mitigation: Grep-Audit vor Loeschung, Build-Verifikation nach jedem Schritt.
- **R2 — Dashboard-Umbau beruehrt Layout:** dashboard-client.tsx ist die Haupt-Landing-Page. Aenderungen muessen getestet werden. Mitigation: minimaler Umbau, nur Datenquelle aendern.

---

## V2 — Intelligence Upgrade + Evidence + Template-Expansion

### Problem Statement (V2)
V1 liefert einen funktionierenden End-to-End-Flow: Questionnaire → KI-Verdichtung (Analyst+Challenger) → Debrief-Meeting. Fuenf zentrale Limitierungen bleiben:

1. **Keine automatische Luecken-Schliessung:** Wenn die KI-Verdichtung Luecken erkennt, gibt es keinen Rueckkanal zum Kunden. Luecken werden erst im Meeting sichtbar — zu spaet fuer effiziente Nacharbeit.
2. **Nur ein Capture-Mode:** Kunden koennen Wissen nur ueber den Fragebogen eingeben. Bestehende Dokumente, E-Mail-Archive oder Evidenz-Materialien koennen nicht eingespeist werden.
3. **Nur ein Template:** Die Template-Flexibilitaet (SC-3) wurde architektonisch vorbereitet, aber nie produktiv bewiesen. Kein zweites Template, kein Template-Switcher.
4. **Kein Voice-Input:** Spracheingabe ist deaktiviert (ISSUE-014). Fuer natuerliche Wissenserhebung braucht es Diktat-Faehigkeit.
5. **Keine strukturierten SOPs:** Knowledge Units sind Analyse-Output. Fuer operative Handlungsplaene fehlt eine zweite Verdichtungsebene (SOP-Generation).

### Goal (V2)
Die Onboarding-Plattform wird vom reinen Fragebogen-Verdichtungs-Tool zum intelligenten Wissens-System:
- Der 3-Agent Orchestrator erkennt Luecken automatisch und schickt Nachfragen zurueck an den Kunden.
- Evidence-Mode ermoeglicht Wissenserhebung aus bestehenden Dokumenten und Archiven.
- SOP-Generation liefert operative Handlungsplaene als zweite Verdichtungsebene.
- Ein zweites Template beweist die Template-Flexibilitaet in der Praxis.
- Voice-Input macht die Eingabe natuerlicher und schneller.

### V2 In Scope

| ID | Feature | Zweck |
|----|---------|-------|
| FEAT-010 | 3-Agent Orchestrator Loop | Orchestrator steuert A+C-Loop intelligent, Qualitaets-Gates, systematische Luecken-Erkennung |
| FEAT-011 | Auto-Gap-Backspelling | Erkannte Luecken als Nachfragen zurueck an Kunden, Re-Verdichtung nach Beantwortung |
| FEAT-012 | SOP Generation (Level 2) | Aus verdichteten Knowledge Units werden Standard Operating Procedures generiert |
| FEAT-013 | Evidence-Mode + Bulk-Import | Neuer Capture-Mode: Dokumente/Archive hochladen, KI mappt Inhalte auf Template-Fragen |
| FEAT-014 | Second Template + Switcher UI | Zweites Template + Template-Auswahl-UI, template-spezifische Owner-Erhebung (DEC-012) |
| FEAT-015 | Voice Input (Whisper) | Spracheingabe im Questionnaire via Server-side Whisper-Transkription |

### V2 Out of Scope
- Free-Form Capture-Mode (BL-021) → evaluieren gegen V3 Dialogue-Mode, bewusst deferred
- Dialogue-Mode (2-Personen-Interview) → V3, abhaengig von Jitsi+Whisper Meeting-Pipeline
- Walkthrough-Mode → V4
- Diary-Mode → V5
- PDF/Markdown-Export fuer Knowledge Units → V2.1 bei Bedarf
- Tenant Self-Service Signup → V3+
- Quota-System pro Tenant → V2.1 wenn Kosten auffaellig werden
- Prompt-Admin-UI → V2.1 oder V3
- Cross-Block-Verdichtung (block-uebergreifende Analyse) → V3
- Process-Mining-Connector, kollaborative Annotation → V6+
- Neue Rollen (consultant fuer Multi-Berater) → V3+ bei Bedarf

### Success Criteria (V2)

**SC-V2-1 — Orchestrator steuert den Loop intelligent**
Der Orchestrator entscheidet per Qualitaets-Assessment, ob weitere A+C-Iterationen noetig sind. Break-Kriterien basieren auf inhaltlicher Qualitaet, nicht nur auf Challenger-Verdict-Count. Orchestrator-Entscheidungen sind im Iterations-Log nachvollziehbar.

**SC-V2-2 — Luecken werden automatisch erkannt**
Nach Abschluss des A+C-Loops identifiziert der Orchestrator konkrete Wissensluecken pro Block. Luecken werden als strukturierte Nachfragen formuliert (Frage, Kontext, betroffenes Subtopic).

**SC-V2-3 — Backspelling-Flow funktioniert Ende-zu-Ende**
Nachfragen erscheinen im Questionnaire-UI des Kunden. Kunde beantwortet sie. System re-verdichtet den Block unter Einbezug der neuen Antworten. Aktualisierte Knowledge Units sind im Debrief-UI sichtbar.

**SC-V2-4 — SOPs werden aus Knowledge Units generiert**
Pro Block kann eine SOP generiert werden. SOPs enthalten: Ziel, Schritte, Verantwortlichkeiten, Zeitrahmen. SOP-Output ist strukturiert und exportierbar (JSON, spaeter weitere Formate).

**SC-V2-5 — Evidence-Mode Single funktioniert**
Kunde kann pro Block ein Dokument (PDF, DOCX, Bild) hochladen. KI extrahiert relevante Inhalte und mappt sie auf Template-Fragen. Mapping ist als KI-Vorschlag sichtbar, Kunde kann bestaetigen oder korrigieren.

**SC-V2-6 — Evidence-Bulk-Import funktioniert**
Mehrere Dokumente oder ein Archiv koennen auf einmal hochgeladen werden. Pre-Processing klassifiziert Relevanz und dedupliziert. Ergebnisse fliessen in die normale Verdichtungs-Pipeline.

**SC-V2-7 — Zweites Template ist live**
Ein zweites Template (inhaltlich festzulegen — siehe Q6) ist verfuegbar. Template-Switcher in der UI ermoeglicht strategaize_admin, beim Erstellen einer Capture-Session das Template auszuwaehlen. Template-spezifische Bloecke/Fragen werden korrekt geladen.

**SC-V2-8 — Voice-Input funktioniert im Questionnaire**
Mic-Button im Questionnaire ist aktiv. Sprache wird via Whisper transkribiert und als Antworttext eingefuegt. Transkription dauert < 10 Sekunden fuer 60 Sekunden Audio.

**SC-V2-9 — Keine V1-Regression**
Alle V1/V1.1-Funktionalitaet bleibt stabil. Bestehende Capture-Sessions werden nicht beeintraechtigt.

### Constraints (V2)

Alle V1-Constraints gelten weiter, zusaetzlich:
- **Bedrock-Kosten:** Orchestrator + SOP + Evidence = signifikant mehr LLM-Calls pro Session. Alle neuen KI-Features bleiben on-click/on-submit (nicht auto-load). Kosten-Logging pro Feature-Typ.
- **Evidence-Dateigroesse:** Upload-Limit pro Datei (z.B. 20 MB) und Bulk-Limit (z.B. 100 MB). Exact limits TBD in /architecture.
- **Whisper-Infrastruktur:** Muss DSGVO-konform in EU laufen (Azure Whisper EU oder self-hosted auf Hetzner). Kein OpenAI-API direkt.
- **Template-Content:** Zweites Template braucht fachlichen Content (Bloecke, Fragen, Bewertungskriterien). Source: User definiert Thema, KI generiert Erstentwurf, User validiert.

### Risks (V2)

- **R5 — Orchestrator-Komplexitaet:** Drei Agenten koordinieren ist signifikant komplexer als zwei. Mitigation: Orchestrator als schrittweise Erweiterung des bestehenden Worker-Loops, nicht als Komplett-Rewrite.
- **R6 — Evidence File-Processing:** PDF/Bild-Extraktion braucht zusaetzliche Libraries (pdf-parse, tesseract o.ae.). Mitigation: Start mit PDF-Text-Extraktion, Bild-OCR als Folgeschritt.
- **R7 — Bedrock-Kosten-Explosion:** Orchestrator + SOP + Evidence verdreifachen die LLM-Calls. Mitigation: Kosten-Logging pro Feature, Orchestrator-Iterations begrenzt, SOP nur on-demand.
- **R8 — Template-Content-Qualitaet:** Zweites Template braucht Fach-Wissen fuer die Fragen. Mitigation: KI-gestuetzter Erstentwurf + User-Review.
- **R9 — Whisper-Server-Ressourcen:** Onboarding-Server (CPX62) hat eventuell nicht genug RAM/CPU fuer Whisper + App + Supabase. Mitigation: Ressourcen pruefen, ggf. Server-Upgrade oder shared Whisper.

### Open Questions (V2)

- **Q6 — Welches zweite Template?** Immobilien-Onboarding (Synergie ImmoCheckheft-Vision), Mitarbeiter-Discovery (generischer Use-Case), oder User-definiertes Thema? Entscheidung vor /architecture.
- **Q7 — Evidence-Dateiformate V2:** Welche Formate? PDF und DOCX als Minimum. Bilder (OCR)? E-Mail-Dumps (mbox/PST)? E-Mail-Dumps erhoehen Komplexitaet signifikant — ggf. V2.1.
- **Q8 — SOP-Output-Format:** JSON (maschinell) + Markdown (menschlich)? PDF? Template-spezifisch? Entscheidung in /architecture.
- **Q9 — Whisper-Infrastruktur:** Auf Onboarding-Server (159.69.207.29) deployen oder Business-System-Whisper (91.98.20.191) cross-server nutzen? Shared Infra per DEC-036 (Business System) ist moeglich. Entscheidung in /architecture.
- **Q10 — Backspelling-Benachrichtigung:** Wie erfaehrt der Kunde von Nachfragen? Dashboard-Badge, E-Mail, In-Session-Alert? Entscheidung in /architecture.
- **Q11 — Template-Content-Erstellung:** Wer liefert Bloecke/Fragen? User schreibt manuell, KI generiert Vorschlag, oder beides? Entscheidung vor Implementierung von FEAT-014.
