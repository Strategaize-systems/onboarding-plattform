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
| FEAT-016 | Template-driven Diagnosis Layer | KI-generierte Analyse pro Unterthema im template-spezifischen Format, Meeting-Vorbereitung, Gate fuer SOP |
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

- **Q6 — Welches zweite Template?** ENTSCHIEDEN: Demo-Template fuer Proof-of-Concept (Thema TBD, z.B. "Mitarbeiter-Wissenserhebung"). Kernziel ist Template-Infrastruktur, nicht spezifisches Fach-Template. Template-Editor-UI fuer freies Zusammenbauen in V3.
- **Q7 — Evidence-Dateiformate V2:** Welche Formate? PDF und DOCX als Minimum. Bilder (OCR)? E-Mail-Dumps (mbox/PST)? E-Mail-Dumps erhoehen Komplexitaet signifikant — ggf. V2.1.
- **Q8 — SOP-Output-Format:** JSON (maschinell) + Markdown (menschlich)? PDF? Template-spezifisch? Entscheidung in /architecture.
- **Q9 — Whisper-Infrastruktur:** ENTSCHIEDEN: Self-hosted Whisper-Docker auf Onboarding-Server (159.69.207.29). Adapter-Pattern (wie Business System DEC-035) fuer spaeteren Provider-Switch (Azure EU, etc.). Kein Shared-Infra, jede Plattform eigenstaendig deploybar. Separate API-Accounts spaeter fuer Kosten-Tracking.
- **Q10 — Backspelling-Benachrichtigung:** Wie erfaehrt der Kunde von Nachfragen? Dashboard-Badge, E-Mail, In-Session-Alert? Entscheidung in /architecture.
- **Q11 — Template-Content-Erstellung:** Wer liefert Bloecke/Fragen? User schreibt manuell, KI generiert Vorschlag, oder beides? Entscheidung vor Implementierung von FEAT-014.

---

## V3 — Dialogue-Mode (Strukturierte Wissenserhebung durch Gespraeche)

### Problem Statement (V3)

V2 liefert drei Capture-Modi: Questionnaire (strukturierter Fragebogen), Evidence (Dokumente + KI-Extraktion) und Voice (Diktat im Questionnaire). Alle drei sind asynchron — der Kunde arbeitet allein, KI verarbeitet, Berater reviewed im Debrief.

In der Realitaet entsteht ein grosser Teil von Unternehmenswissen nicht in Formularen, sondern in **Gespraechen zwischen Menschen**: Chef mit Mitarbeiter, Experte mit Nicht-Experte, Kollege mit Kollege, Knowledge Manager mit Fachabteilung. Dieses Wissen geht heute in fluechtige Meeting-Notizen oder wird gar nicht festgehalten.

Es gibt keinen Capture-Modus, der:
1. Zwei Menschen ein strukturiertes Gespraech fuehren laesst,
2. das Gespraech aufzeichnet und transkribiert,
3. das Transkript gegen eine vorgegebene Struktur verarbeitet (Knowledge Units, Luecken-Erkennung),
4. eine strukturierte Meeting-Summary erzeugt, die beide Parteien reviewen koennen,
5. das Ergebnis in die bestehende Verdichtungs-Pipeline (Diagnose, SOP) einspeist.

### Goal (V3)

Dialogue-Mode als neuer gleichwertiger Capture-Modus: Zwei Menschen fuehren ein Video-Meeting innerhalb der Plattform. Ein vorab definierter Meeting-Guide gibt Struktur. Die Plattform zeichnet auf, transkribiert und verarbeitet das Gespraech zu Knowledge Units und einer Meeting-Summary. Das Ergebnis fliesst in die bestehende Pipeline (Diagnose, SOP, Debrief).

### Target Users (V3)

- **Auftraggeber (strategaize_admin oder tenant_admin):** Definiert Meeting-Guide, weist Teilnehmer zu, reviewed Ergebnis
- **Gespraechspartner A + B:** Fuehren das Gespraech. Konstellationen: GF↔MA, Expert↔Nicht-Expert, Kollege↔Kollege, externer Berater↔interner MA, Knowledge Manager↔Fachabteilung
- **strategaize_admin:** Nutzt Dialogue-Output im Debrief-Meeting wie Questionnaire-Output

### V3 In Scope

| ID | Feature | Zweck |
|----|---------|-------|
| FEAT-017 | Jitsi Meeting Infrastructure | Eigene Jitsi+Jibri-Instanz auf Onboarding-Server, Docker-Compose, JWT-Auth, Recording-Faehigkeit |
| FEAT-018 | Meeting Guide (Basic) | Auftraggeber erstellt strukturierte Gespraechsvorgabe (Themen, Leitfragen, Ziele). Basismässig mit leichter KI-Unterstuetzung |
| FEAT-019 | Dialogue Session (Video-Call + Recording) | Jitsi-Embed in Plattform, zwei Teilnehmer, Jibri-Recording, Meeting-Guide als Referenz im Call |
| FEAT-020 | Recording-to-Knowledge Pipeline | MP4 → Whisper-Transkription → KI-Verarbeitung gegen Meeting Guide → Knowledge Units + Summary + Gap Detection |
| FEAT-021 | Dialogue Pipeline Integration | Dialogue als gleichwertiger Capture-Mode in bestehender V2-Pipeline (Diagnose, SOP, Debrief) |

### V3 Out of Scope

- **Mid-Meeting-KI (Echtzeit-Zusammenfassung, Live-Rueckfragen)** → V3.1. Technisch komplex (Streaming-Transkription), V3 fokussiert Post-Meeting-Processing.
- **Automatisches Follow-up-Meeting aus Luecken** → V3.1. Abhaengig von stabil laufendem Basis-Dialogue.
- **Speaker Diarization (Sprecher-Trennung)** → entscheiden in /architecture. Undifferenziertes Transkript reicht moeglicherweise fuer V3.
- **Template-Editor UI** → V3.1 oder V4. Templates per Migration anlegen (wie V2).
- **Projekt-Management-Cockpit** → V5+. Orchestrierung mehrerer Capture-Methoden pro Wissens-Projekt.
- **Cross-Meeting-Verdichtung** (Erkenntnisse aus mehreren Meetings zusammenfuehren) → V3.1+.
- **Screen-Recording parallel zum Meeting** → V4 (Walkthrough-Mode).
- **Tenant Self-Service Signup** → V3+.
- **Free-Form Capture-Mode** (BL-031) → weiter deferred, Dialogue-Mode deckt den Use-Case besser ab.

### Produkt-Split: Meeting-Vorbereitung Basic vs. Premium

Die Meeting-Vorbereitung (Meeting Guide) hat zwei Tiers — ein **bewusster kommerzieller Split**:

- **Basic (in Onboarding-Plattform V3):** Auftraggeber kann Themen, Leitfragen und Ziele manuell definieren. Leichte KI-Unterstuetzung (Vorschlaege aus Template-Kontext). Auftraggeber macht viel selbst.
- **Premium (Intelligence Platform, separates Produkt):** Volle KI-gestuetzte Vorbereitung — granulare Fragen aus bestehendem Wissen, Learnings, Analyse. Der volle Loop.

Wer das volle Paket will, kauft die Intelligence Platform dazu. Die Onboarding-Plattform verwaessert diesen Wert nicht.

### Success Criteria (V3)

**SC-V3-1 — Eigene Jitsi-Instanz laeuft**
Jitsi+Jibri auf Onboarding-Server (159.69.207.29) deployed. JWT-Auth verifiziert. Test-Meeting mit Recording funktioniert. Unabhaengig von Business System.

**SC-V3-2 — Meeting-Guide kann erstellt werden**
Auftraggeber (strategaize_admin oder tenant_admin) kann pro Capture-Session einen Meeting-Guide erstellen: mindestens Themen, Leitfragen und Ziele. Optionale KI-Vorschlaege aus Template-Kontext.

**SC-V3-3 — Video-Meeting aus der Plattform**
Zwei Teilnehmer koennen aus der Plattform heraus ein Video-Meeting starten (Jitsi-Embed oder Link). Meeting-Guide wird als Referenz angezeigt.

**SC-V3-4 — Recording + Transkription automatisch**
Meeting-Recording (Jibri → MP4) wird automatisch via Whisper transkribiert. Transkript ist als Volltext gespeichert und zurueckverfolgbar.

**SC-V3-5 — KI verarbeitet Transkript zu Knowledge Units**
KI-Verarbeitung des Transkripts gegen den Meeting-Guide extrahiert Knowledge Units pro Thema, erkennt nicht besprochene Themen und generiert eine strukturierte Meeting-Summary.

**SC-V3-6 — Meeting-Summary fuer alle Beteiligten**
Beide Gespraechspartner + Auftraggeber sehen die strukturierte Meeting-Summary und koennen sie reviewen.

**SC-V3-7 — Pipeline-Integration**
Dialogue-Output (KUs, Gaps) fliesst in bestehende V2-Pipeline: Diagnose-Layer kann aus Dialogue-KUs generieren. SOP-Generation funktioniert. Debrief-UI zeigt Dialogue-Sessions gleichwertig.

**SC-V3-8 — Keine V2-Regression**
Alle V1/V1.1/V2-Funktionalitaet bleibt stabil. Bestehende Capture-Sessions werden nicht beeintraechtigt.

### Constraints (V3)

Alle V1/V2-Constraints gelten weiter, zusaetzlich:
- **Eigene Jitsi-Instanz:** Onboarding-Server (159.69.207.29), kein Shared-Infra mit Business System. Plattformen muessen unabhaengig voneinander laufen.
- **Server-Ressourcen:** CPX62 muss Jitsi+Jibri+Whisper+App+Supabase gleichzeitig handlen. Monitoring obligatorisch.
- **DSGVO:** Meeting-Recording ist besonders sensibel. Alle Daten auf EU-Server. Aufnahme-Hinweis im Meeting-UI obligatorisch.
- **Mid-Meeting-KI ist NICHT V3:** Keine Echtzeit-Transkription, keine Live-Zusammenfassung, keine Live-Rueckfragen im Gespraech. Nur Post-Meeting-Processing.
- **Meeting-Guide bleibt basismässig:** Volle KI-Vorbereitung nur mit Intelligence Platform (Produkt-Split).
- **Bedrock-Kosten:** Transkript-zu-KU-Processing ist on-demand (nach Meeting-Ende), nicht streaming. Kosten-Logging pro Dialogue-Session.

### Risks (V3)

- **R10 — Server-Ressourcen (CPX62):** Jitsi+Jibri+Whisper+App+Supabase gleichzeitig ist resourcen-intensiv. Jibri braucht `shm_size: 2gb` und snd-aloop. Mitigation: Server-Monitoring vor/nach Deploy, ggf. Server-Upgrade auf CPX62+ oder Auslagerung von Jibri auf eigenen Container-Server.
- **R11 — Jibri-Setup auf neuem Server:** Die 7 dokumentierten Blocker aus Business System gelten auch hier. Mitigation: jitsi-jibri-deployment Rule existiert im Dev System. Alle 7 Fixes sind vorab bekannt und im Docker-Compose-Template vorweggenommen.
- **R12 — Transkriptions-Qualitaet bei 2-Personen-Dialog:** Whisper wurde bisher nur fuer Diktat (1 Person) getestet. Speaker Diarization bei 2 Personen kann Herausforderung sein. Mitigation: V3 startet mit undifferenziertem Transkript. KI-Processing kann trotzdem Themen extrahieren. Diarization als V3.1-Enhancement evaluieren.
- **R13 — Meeting-Guide-Nutzbarkeit:** "Basic" Meeting-Vorbereitung muss trotzdem nuetzlich genug sein. Zu basic = niemand nutzt es. Mitigation: Template-Kontext fuer KI-Vorschlaege nutzen. Iterativ verbessern.
- **R14 — DSGVO bei Meeting-Recording:** Aufzeichnung von Gespraechen benoetigt explizite Einwilligung beider Teilnehmer. Mitigation: Aufnahme-Hinweis vor Meeting-Start, Consent-UI als Pflichtschritt.

### Open Questions (V3)

- **Q12 — Speaker Diarization:** Soll das Transkript nach Sprecher getrennt werden? Whisper allein kann das nicht (kein built-in Diarization). Optionen: undifferenziertes Transkript (V3), pyannote/NeMo nachgelagert (V3.1), oder als /architecture-Entscheidung. Entscheidung in /architecture.
- **Q13 — Meeting-Teilnehmer-Modell:** Muessen beide Teilnehmer Plattform-Accounts haben? Oder kann einer per Link beitreten (Guest-Mode mit temporaerem JWT)? Entscheidung in /architecture.
- **Q14 — Meeting-Guide KI-Stufe:** Wie "basic" ist basic? Vorschlaege generieren aus bestehenden Template-Fragen und vorhandenen Antworten? Oder komplett manuell mit nur einem Textfeld? Entscheidung in /architecture.
- **Q15 — Recording-Storage:** Jibri-MP4 im Docker-Volume oder in Supabase Storage (analog Evidence)? Entscheidung in /architecture.
- **Q16 — Transkript-Persistence:** Volles Transkript persistent speichern (fuer spaetere Re-Analyse, Cross-Meeting-Verdichtung) oder nur KI-Verarbeitung? Empfehlung: persistent — Rohdaten sind Audit-relevant und ermoeglichen Re-Processing bei besseren Modellen.

---

## V4 — Zwei-Ebenen-Verschmelzung (Mitarbeiter-Capture + Unternehmerhandbuch)

### Strategischer Rahmen
Basis: SOFTWARE-EXECUTION-MAP 2026-04-23, Phase 1. Personal Strategic Model V1 (Vehikel-Modell, Business Enabler). V4 ist der erste Architektur-Sprung der Onboarding-Plattform vom reinen GF-Verdichtungs-Tool zum **Zwei-Ebenen-System**: Geschaeftsfuehrer-Blueprint (Ebene 1, existiert) **plus** Mitarbeiter-Capture mit Unternehmerhandbuch-Output (Ebene 2, neu).

Re-Numerierung Roadmap (2026-04-23): Walkthrough (war V4) ist jetzt V5, Diary (war V5) ist jetzt V6, Queroptionen (war V6+) sind jetzt V7+. Walkthrough und Diary werden Capture-Modi **innerhalb** des Onboarding-Pfades — die Architektur-Hooks dafuer entstehen in V4, der Bau erfolgt spaeter.

### Problem Statement (V4)
V1-V3 erlauben einem Geschaeftsfuehrer (tenant_admin), strukturierte Wissenserhebung selbst durchzufuehren — Questionnaire, Evidence, Voice, Dialogue. Drei zentrale Limitierungen verhindern den Sprung zu einem nutzbaren Unternehmerhandbuch:

1. **Es gibt keine Mitarbeiter als eigenstaendige Nutzerklasse.** Der GF muss alles Wissen selbst eintippen — auch das, was eigentlich nur seine Mitarbeiter haben (Prozesse, Tools, Routinen, taegliche Realitaet). Tenant_member existiert technisch, aber kein durchgaengiger Capture-Flow.
2. **Es gibt keine Bruecke zwischen GF-Blueprint und Mitarbeiter-Wissen.** Aus den GF-Antworten lassen sich heute keine Mitarbeiter-Aufgaben automatisch ableiten. Der GF muesste fuer jeden Mitarbeiter manuell Capture-Sessions zusammenstellen — das macht niemand.
3. **Es gibt keinen Output, den der Kunde anfassen kann.** Das System produziert Knowledge Units, Diagnosen und SOPs als Datenobjekte. Ein lesbares, durchsuchbares, exportierbares **Unternehmerhandbuch** existiert nicht. Der Kunde sieht keinen "fertigen Stand", den er aus der Plattform mitnehmen kann.

V4 schliesst diese drei Luecken auf Architektur-Niveau. V4.1 baut den Unternehmerhandbuch-Output aus, V4.2 das Self-Service-Cockpit.

### Goal (V4)
Ein tenant_admin kann sein Unternehmen so onboarden, dass:
- Mitarbeiter eigene Login-Accounts haben (Rolle `employee`),
- aus seinem Blueprint-Output automatisch Mitarbeiter-Capture-Aufgaben generiert werden,
- jeder Mitarbeiter seine zugewiesenen Aufgaben selbstaendig im Questionnaire-Mode durcharbeitet (gleiche Pipeline wie GF),
- am Ende ein erstes lesbares Unternehmerhandbuch existiert (mindestens als Markdown-Export),
- der Tenant einen einfachen Status-Ueberblick ("wo stehen wir?") sieht — ohne dass der Berater Haendchen halten muss.

### Target Users (V4)

#### Neu in V4
- **Mitarbeiter (`employee`):** Eigener Plattform-Account. Erhaelt vom tenant_admin Capture-Aufgaben zugewiesen, durchlaeuft sie im Questionnaire-Mode selbstaendig. Sieht NUR eigene Aufgaben und eigene Beitraege (NICHT das Gesamthandbuch).

#### Veraendert
- **tenant_admin (Geschaeftsfuehrer):** Bekommt zusaetzlich (a) Mitarbeiter-Verwaltung (einladen, Rollen vergeben), (b) Bridge-Steuerung (welche Mitarbeiter-Aufgaben aus dem Blueprint generiert wurden, freigeben/bearbeiten), (c) Unternehmerhandbuch-Sicht + Export.
- **strategaize_admin:** Bekommt Cross-Tenant-Sicht auf Mitarbeiter-Strukturen + Bridge-Output. Nutzt das Unternehmerhandbuch im Debrief.

#### Unveraendert
- **tenant_member:** Bleibt bestehen. Spaetere Mergung mit `employee` ist offen — ggf. werden die Rollen vereinheitlicht in V5+. Bewusst NICHT in V4 (Scope-Schutz).

### V4 In Scope

| ID | Feature | Zweck |
|----|---------|-------|
| FEAT-022 | Employee Role + RBAC Extension | Neue Rolle `employee`, Auth-Flow (Einladung per E-Mail, eigenes Passwort, eigenes Dashboard), RLS-Erweiterung fuer employee-Sicht |
| FEAT-023 | Blueprint-to-Employee Bridge Engine | Aus GF-Blueprint-Output (Knowledge Units + Diagnose) generiert die Bridge automatisch Mitarbeiter-Capture-Aufgaben. tenant_admin kann sie reviewen/editieren/freigeben |
| FEAT-024 | Employee Capture Workflow | Mitarbeiter-Dashboard (eigene Capture-Sessions), Questionnaire-Mode wie GF (gleiche Pipeline: Verdichtung, Diagnose), eigene Mitarbeiter-Sicht ohne Cross-Mitarbeiter-Zugriff |
| FEAT-025 | Capture-Mode Extension Hooks (Walkthrough + Diary Architecture) | Strukturierte Erweiterungs-Schnittstelle fuer zusaetzliche Capture-Modi (capture_mode-Enum, Mode-spezifische Worker-Hooks, Mode-spezifische UI-Slots). KEIN Bau von Walkthrough/Diary — nur Vorbereitung |
| FEAT-026 | Unternehmerhandbuch Foundation | Datenmodell `handbook_snapshot` + Aggregations-Layer (verdichtet KUs/Diagnosen/SOPs aus E1+E2 in handbuch-strukturierte Sektionen) + minimaler Markdown-Export (ZIP-Download). KEINE In-App-Webview, KEINE Live-Edit (V4.1) |
| FEAT-027 | Self-Service Status Cockpit Foundation | Tenant-Status-View Minimum: Wo stehen wir, was fehlt, naechste Schritte. KEINE Wizards, KEINE Reminders, KEINE Hilfe-Texte (V4.2) |

### V4 Out of Scope

**Bewusst aus V4 ausgeschlossen — verschoben:**
- Unternehmerhandbuch In-App-Webview, Browse, Suche → V4.1
- Unternehmerhandbuch Live-Editor (Pflege in der Plattform) → V4.1
- Versionierte Handbuch-Snapshots mit Diff → V4.1
- Tenant-Onboarding-Wizard (Erste-Schritte, Hilfe-Texte) → V4.2
- Capture-Reminders fuer Mitarbeiter (E-Mail / In-App) → V4.2
- In-App-Hilfe und Tutorials → V4.2
- Walkthrough-Mode Implementation (Screen-Capture) → V5 (nur Hooks in V4)
- Diary-Mode Implementation (Mobile/PWA) → V6 (nur Hooks in V4)
- Mergung von `employee` und `tenant_member` → spaeter (Erfahrung sammeln)
- Tenant-Self-Service-Signup (Anlage neuer Tenants ohne strategaize_admin) → V4.2 oder spaeter
- Multi-Mitarbeiter-Aufgaben (gleiche Aufgabe an mehrere) → spaeter (V4 = 1 Aufgabe : 1 Mitarbeiter)
- Mitarbeiter-Mirror-Modus (Mitarbeiter beantworten dieselben Fragen wie GF, KI vergleicht) → bewusst NICHT V4. Fokus ist Mitarbeiter-EIGENE Wissensbereiche, nicht Mirror

### Core Features (V4 — Detail siehe /features/FEAT-022..027)
Sechs Features, jeweils als Spec-Skelett unter `/features/`. Detaillierte Spezifikation passiert in `/architecture` und `/slice-planning`.

### Constraints (V4)

Alle V1-V3-Constraints gelten weiter, zusaetzlich:

- **Rollen-Modell-Disziplin:** `employee` ist eine NEUE Rolle, kein Override von `tenant_member`. RLS-Policies muessen explizit angepasst werden — schweigende Erweiterung von tenant_member-Policies ist verboten (Sicherheits-Risiko).
- **Bridge-Determinismus:** Die Bridge-Engine darf KI-gestuetzt sein, aber jede generierte Mitarbeiter-Aufgabe MUSS vom tenant_admin freigegeben werden bevor sie dem Mitarbeiter sichtbar wird. Keine Auto-Push-Logik in V4 (Scope-Kontrolle, Vertrauensaufbau, DSGVO-Sauberkeit).
- **Mitarbeiter-Sicht-Perimeter:** Ein Mitarbeiter sieht ausschliesslich eigene zugewiesene Aufgaben + eigene Beitraege. Kein Zugriff auf Blueprint-Output, Diagnose, SOP, Handbuch oder andere Mitarbeiter — RLS-getestet.
- **Bedrock-Kosten:** Bridge-Engine nutzt LLM-Calls. Pro Mitarbeiter-Aufgaben-Generierung ein Logeintrag. tenant_admin sieht aggregierte Bridge-Kosten. On-demand, nicht auto-load.
- **Multi-Use-Architektur:** Exit-Readiness ist ERSTER Template-Schnitt. Die V4-Architektur (Bridge, employee-Rolle, Handbuch-Output) muss ohne Schema-Aenderung fuer weitere Templates (Compliance-Readiness, KI-Readiness, Wachstums-Readiness) funktionieren. Template-Hardcoding ist verboten.
- **Migration-Kompatibilitaet:** V4-Migrations duerfen V1-V3-Daten NICHT brechen. Bestehende Capture-Sessions, KUs, Diagnosen, SOPs bleiben unveraendert. Bridge-Output ist additiv.

### Risks / Assumptions (V4)

#### Risiken
- **R15 — Bridge-Qualitaet:** Wenn die Bridge-Engine nutzlose Mitarbeiter-Aufgaben generiert, wird der tenant_admin sie alle ablehnen und stattdessen manuell zusammenstellen — V4 verfehlt sein Hauptziel. Mitigation: Bridge muss einen Template-Kontext-Layer haben (welche Wissensbereiche pro Template typischerweise mitarbeiterseitig sind), KI generiert nur Verfeinerung. Erste Version mit hoher User-Kontrolle (alles freigabepflichtig). Nach 2-3 Pilotkunden Bridge-Qualitaet evaluieren.
- **R16 — RLS-Komplexitaet steigt:** Mit `employee` kommt eine vierte Rolle dazu. Cross-Tenant-Tests + Cross-Role-Tests werden erheblich komplexer. Mitigation: RLS-Test-Matrix als Pflicht-Bestandteil von /qa pro Slice. Mind. 4x4-Matrix (4 Rollen, 4 Datentypen).
- **R17 — Mitarbeiter-Onboarding-UX:** Mitarbeiter sind keine Berater und keine Tech-Power-User. Wenn das Mitarbeiter-Dashboard verwirrt, wird der Tenant frustriert und der GF muss doch Haendchen halten — V4 verfehlt das "kein Haendchen-Halten"-Ziel. Mitigation: Mitarbeiter-UI radikal einfacher als GF-UI, ein Aufgaben-Strom, Pflicht-Browser-Smoke-Test mit Nicht-Tech-User vor Release.
- **R18 — Unternehmerhandbuch-Erwartungshaltung:** Ein "Markdown-Export" als V4-Output kann den Kunden unterwhelmen ("das ist alles?"). Mitigation: V4-Kommunikation klar machen, dass V4.1 die Webview bringt. Markdown-Export muss aber sehr sauber sein (Struktur, Inhaltsverzeichnis, Cross-Links).
- **R19 — V4 Scope-Inflation:** "Wenn wir das schon machen, koennten wir auch ..." — typischer Killer. Mitigation: Out-of-Scope-Liste oben ist verbindlich. Neue Wuensche → Backlog → V4.1/V4.2/V5.
- **R20 — Re-Numerierung verwirrt zukuenftige Skills:** Walkthrough heisst jetzt V5 statt V4. Skills oder Doku, die "V4 Walkthrough" referenzieren, werden falsch lesen. Mitigation: roadmap.json + PRD V4-Sektion sind Source-of-Truth, alle Old-V4-Walkthrough-Referenzen werden nach und nach geupdated. Wo Konflikt auftritt, gilt PRD.

#### Annahmen
- Mehrere Mitarbeiter pro Tenant ist der Normalfall (5-50). Mitarbeiter-Verwaltung muss skalierbar sein, aber kein Dashboard fuer 1000 Mitarbeiter (Mittelstand-Fokus).
- E-Mail-Versand fuer Mitarbeiter-Einladungen ist verfuegbar (Onboarding-Plattform hat schon Auth-E-Mails). Kein neuer Provider noetig.
- Bedrock-Region Frankfurt + Claude Sonnet bleiben Standard-Provider — keine neuen LLM-Provider in V4.
- Pilotkunden in Phase 2 (laut SOFTWARE-EXECUTION-MAP) liefern Feedback fuer V4.1/V4.2-Priorisierung.
- AWS-Bedrock-Token-Kosten skalieren linear mit Mitarbeiter-Zahl. Bei grossen Tenants kann das spuerbar werden — Cost-Logging ist zwingend.

### Success Criteria (V4)

V4 ist erfolgreich, wenn ALLE folgenden Kriterien erfuellt sind:

**SC-V4-1 — Mitarbeiter kann sich einloggen + zugewiesene Aufgabe machen**
Ein vom tenant_admin eingeladener Mitarbeiter erhaelt eine Einladungs-E-Mail, setzt ein Passwort, loggt sich ein, sieht ein eigenes Dashboard mit zugewiesenen Capture-Sessions, oeffnet eine, durchlaeuft Questionnaire-Mode wie GF, submittet Block. Worker verarbeitet seinen Submit ueber dieselbe Pipeline (Verdichtung, Diagnose).

**SC-V4-2 — Bridge generiert Mitarbeiter-Aufgaben aus Blueprint-Output**
Ein tenant_admin mit fertigem Blueprint (mindestens 1 Block submitted, KUs vorhanden) loest die Bridge aus. Die Bridge generiert mindestens 3 konkrete Mitarbeiter-Aufgaben-Vorschlaege (Block-Vorschlag + Mitarbeiter-Zuordnungs-Vorschlag). tenant_admin kann sie reviewen, editieren, freigeben oder ablehnen. Nur freigegebene Aufgaben sind fuer Mitarbeiter sichtbar.

**SC-V4-3 — Mitarbeiter-Sicht-Perimeter ist dicht**
Ein Mitarbeiter sieht in keinem UI und keinem API-Endpoint:
- Blueprint-Output des GF
- Aufgaben anderer Mitarbeiter
- Diagnose-Layer-Output
- SOPs
- Unternehmerhandbuch
- Andere Tenants

RLS-Test-Matrix in /qa bestaetigt das mit konkreten Failure-Tests.

**SC-V4-4 — Unternehmerhandbuch-Export funktioniert**
Ein tenant_admin kann das Unternehmerhandbuch als Markdown-ZIP herunterladen. Das ZIP enthaelt: Inhaltsverzeichnis, Sektionen pro Wissensbereich (aus E1+E2), KUs als strukturierte Markdown-Listen, Diagnose-Output, SOPs, Cross-Links zwischen Sektionen. Die Markdown-Files sind syntaktisch valide und in einem Standard-Markdown-Viewer lesbar.

**SC-V4-5 — Self-Service-Status-Cockpit zeigt aktuellen Stand**
Ein tenant_admin sieht ohne Berater-Hilfe: (a) wie viele Bloecke insgesamt, (b) wie viele submitted, (c) wie viele Mitarbeiter eingeladen, (d) wie viele Mitarbeiter-Aufgaben offen vs. fertig, (e) welcher naechste Schritt empfohlen ist. Pflicht-Browser-Smoke-Test mit User aus Nicht-Tech-Kontext.

**SC-V4-6 — Capture-Mode-Hooks sind sauber strukturiert**
`capture_mode`-Enum + Worker-Hook-Struktur + UI-Slot-Konvention sind so dokumentiert, dass V5 (Walkthrough) ohne Schema-Aenderung als zusaetzlicher Mode hinzugefuegt werden kann. Architektur-Spike in /architecture validiert das mit Pseudo-Walkthrough-Mode-Eintrag (kein UI noetig).

**SC-V4-7 — Multi-Use-Architektur**
V4-Schema funktioniert mit Exit-Readiness UND einem zweiten Test-Template ohne Schema-Aenderung (Smoke-Test, kein Produktions-Test). Bridge-Engine nutzt Template-Kontext, nicht Hardcode.

**SC-V4-8 — Bridge-Kosten sichtbar**
Pro Bridge-Aufruf entsteht ein Log-Eintrag mit Token-Verbrauch. tenant_admin sieht aggregierte Bridge-Kosten (Anzahl Aufrufe, geschaetzte Kosten in EUR).

**SC-V4-9 — Keine V1-V3-Regression**
Bestehende GF-Capture-Sessions, KUs, Diagnosen, SOPs, Dialogue-Sessions funktionieren unveraendert. Bestehende Bedrock-Kosten-Logs, Auth-Flows, RLS-Policies bleiben stabil.

### Open Questions (V4)

#### Offen, aufzuloesen in /architecture
- **Q17 — Bridge-Engine Generierungs-Mechanismus:** KI-gestuetzte Free-Form-Generierung (LLM bekommt Blueprint-Output + Template-Kontext, generiert Aufgaben-Vorschlaege)? Oder Template-getriebenes Mapping (Template definiert pro Wissensbereich, welche Mitarbeiter-Aufgabe daraus folgen kann, KI verfeinert nur)? Hybrid? Entscheidung in /architecture mit DEC.
- **Q18 — Mitarbeiter-Auth-Flow:** Einladung per Magic-Link (passwortlos, sicherer) oder klassisches Passwort? Auswirkung auf UX und Onboarding-Reibung. Entscheidung in /architecture.
- **Q19 — `employee` vs. `tenant_member` Beziehung:** Sind das parallele Rollen? Erbt employee von tenant_member? Wird tenant_member langfristig durch employee ersetzt? V4 entscheidet: parallel, kein Merge. Spaetere Mergung offen.
- **Q20 — Bridge-Trigger:** Wann darf die Bridge laufen? Nach jedem Block-Submit? Nach komplettem Blueprint? On-demand vom tenant_admin? Empfehlung: on-demand (Cost-Kontrolle, Vertrauen). Bestaetigung in /architecture.
- **Q21 — Unternehmerhandbuch-Aggregation-Logik:** Wie werden KUs/Diagnosen/SOPs aus E1+E2 in eine kohaerente Handbuch-Struktur aggregiert? Template-Schablone definiert die Sektionen? KI generiert die Aggregation? Statisch nach Wissensbereich? Entscheidung in /architecture.
- **Q22 — Mitarbeiter-Aufgaben-Re-Generierung:** Wenn der GF spaeter weitere Bloecke submittet — soll die Bridge automatisch neue Mitarbeiter-Aufgaben vorschlagen oder nur on-demand? Empfehlung: on-demand (Konsistenz mit Q20). Entscheidung in /architecture.
- **Q23 — Capture-Mode-Hook-Granularitaet:** Wie tief muessen die Hooks gehen? Nur Worker-Pipeline-Slot? Oder auch UI-Layout-Slot, Routing-Slot, Permissions-Slot? Mindestumfang in /architecture festlegen, nicht ueber-engineeren.

#### Wird in spaeteren Skills entschieden
- Konkrete Migration-Reihenfolge: /architecture
- Slice-Schnitte und Reihenfolge: /slice-planning
- Konkrete Bridge-Prompts fuer Claude Sonnet: /backend
- Konkrete Mitarbeiter-Dashboard-Layout: /frontend

### Delivery Mode (V4)
**Unveraendert: SaaS Product.** V4 fuegt eine Nutzerklasse hinzu (`employee`) und einen externen Output (Unternehmerhandbuch-Markdown). Multi-Tenant + RLS + Versionierung gelten weiter. SaaS-Level QA- und Release-Rigor.

---

## V4.1 — Handbuch-Reader + Berater-Review-Workflow

### Problem Statement (V4.1)
V4 hat drei harte Reibungspunkte hinterlassen, die im Pilotbetrieb den Berater-Tenant-Workflow ausbremsen:

1. **Handbuch nur als ZIP-Download.** Der Kunde muss das Markdown-ZIP herunterladen, entpacken und in einem externen Viewer oeffnen. Suche, Navigation und Cross-Links liegen ausserhalb der Plattform. Reibung pro Lese-Vorgang ist hoch und vermittelt nicht das Gefuehl eines lebenden Handbuchs.
2. **Mitarbeiter-Output fliesst ungereviewt ins Handbuch.** Heute filtert der Snapshot-Worker rein technisch ueber `min_status='confirmed'`. Es gibt keinen expliziten Berater-Review-Schritt zwischen Mitarbeiter-Antworten und Handbuch-Generation. Der Berater kann nicht block-weise entscheiden, welche Mitarbeiter-Beitraege ins Handbuch fliessen, und es gibt keinen sichtbaren Hinweis im Trigger-Flow, ob Reviews fehlen.
3. **Berater-Workflows sind im Cockpit nicht verlinkt.** Der V2-Debrief-UI unter `/admin/debrief/[sessionId]/[blockKey]` existiert weiter, ist aber vom V4-Cockpit nicht erreichbar — der Berater muss die URL kennen. Es gibt keine Cross-Tenant-Sicht auf "wo sind offene Reviews".

V4.1 schliesst alle drei Luecken in einem Release.

### Goal (V4.1)
- Das Unternehmerhandbuch ist in der Plattform direkt lesbar und durchsuchbar — kein ZIP-Download mehr noetig fuer normale Lesefaelle.
- Der Berater hat einen konsolidierten, block-zentrierten Review-View ueber alle Mitarbeiter-Beitraege und kann Bloecke explizit fuer das Handbuch freigeben.
- Der Handbuch-Trigger zeigt den Review-Status sichtbar an, ohne den Berater zu blockieren.
- Das strategaize_admin-Cockpit verlinkt die Berater-Workflows direkt — Cross-Tenant ("alle offenen Reviews") und pro Tenant.

### V4.1 In Scope

| ID | Feature | Backlog | Zweck |
|----|---------|---------|-------|
| FEAT-028 | Handbuch In-App-Reader | BL-047 | Sidebar-Nav, Markdown-Render, Section-Anchors, Volltext-Suche, Snapshot-Liste mit Timestamps |
| FEAT-029 | Berater-Review + Quality-Gate | BL-049 | `block_review`-Tabelle, konsolidierter Review-View pro Block, weiches Quality-Gate im Trigger-Flow |
| FEAT-030 | Berater-Visibility-Verlinkung | BL-050 | `/admin/reviews` Cross-Tenant + `/admin/tenants/[id]/reviews` Pro-Tenant + Direct-Links zu `/admin/debrief` |

### V4.1 Out of Scope (vorlaeufig)
- **Inline-Editor im Reader (KU/SOP edit)** — wandert nach V4.2 oder spaeter. Editing bleibt in V4.1 ueber den bestehenden `/admin/debrief`-Editor erreichbar; Reader hat Cross-Link dorthin. Begruendung: Editor-Polish ist eine eigene Komplexitaetsstufe (Dirty-State, Re-Snapshot-Trigger, Konflikt-Behandlung) und wuerde V4.1 verdoppeln.
- **Diff-View zwischen Snapshot-Versionen** — Snapshots sind in V4.1 nur als Liste mit Timestamp+Generator-Info sichtbar. Diff-Visualisierung kommt spaeter.
- **KU-Granularer "Im Handbuch enthalten"-Flag** — V4.1 nutzt Block-Approval als Granularitaet. KU-Override kann V4.2 oder spaeter werden, falls ein konkreter Use-Case auftaucht.
- **Hartes Quality-Gate** (Trigger-Button gesperrt bis 100% reviewed) — V4.1 nutzt weiches Gate (Hinweis + Confirm-Dialog). Berater behaelt Hoheit.
- **Berater-Mode-Toggle im Cockpit-Header** — keine Tenant-Impersonation, kein UI-Switcher. Cross-Tenant-Sicht reicht.
- **Reader-Zugriff fuer `tenant_member` und `employee`** — Reader ist in V4.1 admin-only (`strategaize_admin` + `tenant_admin`). Mitarbeiter-Zugriff auf Handbuch ist eigene UX-Frage (V5+).
- **Multi-User-Edit (gleichzeitiges Bearbeiten)** — spaeter
- **Genehmigungs-Workflows mehrstufig (Editor → Approver)** — spaeter, wenn Use-Case auftaucht
- **Externe Verlinkung / Sharing-Links / Public Read-Only** — spaeter

### Core Design Decisions (V4.1)

Die folgenden Entscheidungen wurden im Requirements-Klaerungs-Dialog 2026-04-28 mit dem User getroffen. Sie sind fuer /architecture verbindlich:

- **DEC-V4.1-1 — Reader-Scope:** Reader-Only in V4.1. Editing wird via Cross-Link auf bestehenden `/admin/debrief` delegiert. Kein neuer Live-Editor in V4.1.
- **DEC-V4.1-2 — Reader-Zugriff:** Nur `strategaize_admin` und `tenant_admin`. RLS regelt Tenant-Filter. `tenant_member` und `employee` sehen den Reader nicht.
- **DEC-V4.1-3 — Reader-Route:** `/dashboard/handbook/[snapshotId]` (Tenant-Bereich, dort wo `tenant_admin` standardmaessig landet). `strategaize_admin` navigiert via `/admin/tenants` Drill-Down oder Direct-Link aus `/admin/handbook`. Trigger bleibt unter `/admin/handbook` (Berater-Hoheit).
- **DEC-V4.1-4 — Approval-Granularitaet:** Block-Approval, nicht KU-Granular. Neue Tabelle `block_review` mit Status `pending|approved|rejected`. Worker-Filter ergaenzt `min_status='confirmed'` um `block_review.status='approved'`.
- **DEC-V4.1-5 — Quality-Gate-Mode:** Weich. Trigger-Button immer aktiv, zeigt "X/Y Mitarbeiter-Bloecke reviewed" + Confirm-Dialog wenn nicht alle reviewed. `tenant_admin` und `strategaize_admin` koennen explizit bestaetigen.
- **DEC-V4.1-6 — Konsolidierter Review-View Layout:** Block-zentriert. Eine Seite pro Block, alle Mitarbeiter-KUs gestapelt. Berater haakt Approve/Reject pro Block (Bulk-Aktion mit optionalen KU-spezifischen Notizen).
- **DEC-V4.1-7 — Berater-Visibility ohne Mode-Toggle:** Kein UI-Switcher zwischen tenant_admin- und strategaize_admin-Sicht. Cross-Tenant-Page `/admin/reviews` + Pro-Tenant-Page `/admin/tenants/[id]/reviews` reichen.
- **DEC-V4.1-8 — Pending-Reviews-Sicht-Scope:** Beides. Cross-Tenant-Aggregat `/admin/reviews` (alle Tenants, sortiert nach aeltester pendender Review) + Pro-Tenant-Detail `/admin/tenants/[id]/reviews`.

### Success Criteria (V4.1)

V4.1 ist erfolgreich, wenn ALLE folgenden Kriterien erfuellt sind:

**SC-V4.1-1 — Handbuch ist In-App lesbar (Reader-Pfad)**
Ein `tenant_admin` oeffnet `/dashboard/handbook/[snapshotId]` und sieht: Sidebar-Navigation mit Block-Liste aus dem Snapshot, Markdown-Hauptbereich mit gerenderten Inhalten, Section-Anchor-Links innerhalb des Markdowns, Snapshot-Liste mit Timestamp und Generator-Info (welche Version, wann generiert). Volltext-Suche (Client-Side im aktuellen Snapshot) findet Treffer und scrollt zur Stelle.

**SC-V4.1-2 — Reader respektiert RLS strikt**
`tenant_admin` von Tenant A sieht nur Snapshots von Tenant A. `strategaize_admin` sieht alle Snapshots ueber `/admin/tenants` Drill-Down. `tenant_member` und `employee` bekommen `403`/Redirect bei Direkt-Aufruf der Reader-Route.

**SC-V4.1-3 — Cross-Link Reader → Editor funktioniert**
Im Reader gibt es pro Block-Sektion einen sichtbaren Link "Im Debrief bearbeiten" der `strategaize_admin` zu `/admin/debrief/[sessionId]/[blockKey]` fuehrt. Fuer `tenant_admin` ist der Link nicht sichtbar (RLS — er hat keinen Editor-Zugriff).

**SC-V4.1-4 — Block-Approval persistiert pro Block**
`block_review`-Tabelle existiert mit RLS, jede `(tenant_id, session_id, block_key)`-Kombination hat genau einen Approval-Eintrag. Status wechselt sauber zwischen `pending` (Default), `approved`, `rejected`. Audit-Felder (`reviewed_by`, `reviewed_at`, `note`) sind gesetzt bei jedem Statuswechsel.

**SC-V4.1-5 — Konsolidierter Review-View funktioniert (Berater-Pfad)**
`strategaize_admin` ruft `/admin/blocks/[blockKey]/review?tenant=...` auf und sieht: Block-Header mit Tenant-Name + Block-Titel, alle Mitarbeiter-KUs zu diesem Block gestapelt (mit Mitarbeiter-Quelle pro KU sichtbar), Approve/Reject-Buttons fuer den Block. Approve setzt `block_review.status='approved'` mit Audit-Feldern.

**SC-V4.1-6 — Worker-Filter respektiert Block-Approval**
Snapshot-Worker filtert pro Block: nur wenn `block_review.status='approved'` fliessen Mitarbeiter-KUs ins Handbuch. GF-KUs (Blueprint-Output) sind unabhaengig — der Filter gilt ausschliesslich fuer Mitarbeiter-KUs (`source='employee_questionnaire'`).

**SC-V4.1-7 — Quality-Gate ist sichtbar im Trigger-Flow**
Beim Klick auf "Handbuch generieren" zeigt das System: "X/Y Mitarbeiter-Bloecke reviewed. Y-X Bloecke werden NICHT ins Handbuch fliessen. Trotzdem generieren?". Bei 100% reviewed laeuft der Trigger ohne Confirm-Dialog. Confirm-Click loest Snapshot-Generation aus (V4-Verhalten unveraendert).

**SC-V4.1-8 — Cross-Tenant Pending-Reviews-Sicht funktioniert**
`strategaize_admin` ruft `/admin/reviews` auf und sieht eine Liste aller Bloecke mit `block_review.status='pending'` ueber alle Tenants. Sortiert nach aeltestem `block_session.last_submitted_at`. Jede Zeile linkt direkt auf `/admin/blocks/[blockKey]/review?tenant=...`.

**SC-V4.1-9 — Pro-Tenant Reviews-Sicht funktioniert**
`/admin/tenants/[id]/reviews` zeigt fuer den Tenant die gleiche Liste, gefiltert auf diesen Tenant. Direct-Links zu `/admin/debrief/[sessionId]/[blockKey]` und zum Konsolidierten Review-View.

**SC-V4.1-10 — Cockpit zeigt Quality-Gate-Status**
Die V4-Cockpit-MetricCards (`/dashboard`) zeigen einen neuen Status-Indikator "Mitarbeiter-Bloecke reviewed: X/Y". Card linkt fuer `tenant_admin` auf eine read-only Tenant-Sicht der Review-Status-Liste, fuer `strategaize_admin` auf den Konsolidierten Review-View.

**SC-V4.1-11 — Keine V4-Regression**
V4-Funktionalitaet bleibt stabil: Bridge-Engine, Mitarbeiter-Capture, Handbuch-Trigger, ZIP-Download, Cockpit-Karten. Bestehende Snapshots bleiben lesbar (auch ohne block_review-Eintraege — Worker-Filter gilt nur fuer NEUE Snapshots, alte werden nicht re-filtered).

**SC-V4.1-12 — RLS-Test-Matrix bleibt gruen**
4-Rollen-RLS-Matrix (strategaize_admin, tenant_admin, tenant_member, employee) wird um die neue Tabelle `block_review` erweitert. Matrix bleibt 100% PASS gegen Live-DB. (Erweiterung: 4 Rollen × 1 neue Tabelle = mindestens 8 zusaetzliche Test-Faelle.)

### Constraints (V4.1)

Alle V4-Constraints gelten weiter, zusaetzlich:

- **Worker-Backwards-Compat:** Der Snapshot-Worker muss alte Snapshots ohne `block_review`-Eintraege weiter generieren koennen (Best-Effort: behandelt fehlenden Eintrag wie `approved`, damit V4-Snapshots reproduzierbar sind). Neue Snapshots respektieren das Approval strikt.
- **Reader-Performance:** Das Markdown wird beim ersten Laden komplett serviert (kein Lazy-Render pro Section). Snapshots > 500KB Markdown werden als Warnung im Reader gekennzeichnet — Volltext-Suche bleibt client-side.
- **Search-Scope V4.1:** Volltext-Suche operiert ausschliesslich im aktuellen Snapshot. Cross-Snapshot-Suche oder Full-Tenant-Search ist out-of-scope.
- **Cockpit-Karten-Erweiterung:** Die neue "Mitarbeiter-Bloecke reviewed"-Card darf die V4-Cockpit-Performance nicht beeintraechtigen — Aggregation laeuft als RLS-konformer Single-Query.

### Risks / Assumptions (V4.1)

- **R-V4.1-1 — Block-Approval-Backfill:** Bestehende Tenants haben keine `block_review`-Eintraege. Migration muss einen Default-Status setzen (entweder Backfill als `approved` fuer existierende Sessions, oder als `pending` mit klarer Berater-Aufforderung). Mitigation: Migration als Backfill `approved` fuer Sessions deren Mitarbeiter-Bloecke bereits einen GF-Block haben. Neue Sessions starten als `pending`. Entscheidung wird in /architecture konkretisiert.
- **R-V4.1-2 — Reader-UX vs. Markdown-Komplexitaet:** Generierte Markdown-Snapshots koennen komplexe Strukturen (Tabellen, Cross-Links auf nicht-existente Anchors) enthalten. Mitigation: Reader nutzt etablierte Markdown-Library (react-markdown o.ae.), ungueltige Anchors fuehren zu sichtbarer Warnung statt Crash.
- **R-V4.1-3 — Cross-Link auf Editor durchbricht RLS-Klarheit:** Wenn `tenant_admin` versehentlich einen Cross-Link auf Editor sieht und drauf klickt, soll er sauber `403` bekommen, nicht eine kaputte UI. Mitigation: Link wird per RLS-Check serverseitig gerendert (nur fuer `strategaize_admin`).
- **R-V4.1-4 — Quality-Gate-Bypass per Bestaetigung als Schwachstelle:** Weicher Modus erlaubt Berater bewusst, ohne Reviews zu generieren. Risiko: Vergessene Reviews fliessen nie ins Handbuch. Mitigation: Cockpit-Karte "Mitarbeiter-Bloecke reviewed: X/Y" macht den Status laufend sichtbar. Audit-Log dokumentiert "Snapshot generated with N pending reviews" pro Trigger.
- **A-V4.1-1 — Bestehende Snapshots bleiben unveraendert:** Annahme: Wir re-generieren keine alten Snapshots automatisch nach V4.1-Deploy. User kann manuell re-trigger, dann gilt neuer Filter.

### Open Questions (V4.1)

Die folgenden Fragen werden in `/architecture` V4.1 entschieden:

- **Q-V4.1-A — Backfill-Strategie:** Wie werden existierende Sessions/Bloecke beim Migrations-Run behandelt? `approved` per Default (Backwards-Compat) oder `pending` (zwingt Berater-Review fuer Bestand)? Empfehlung Requirements: `approved` fuer alle V4-Bloecke die vor V4.1-Deploy existierten, `pending` fuer alle neuen. Definitive Entscheidung in /architecture.
- **Q-V4.1-B — Reader-Markdown-Library:** `react-markdown` (de-facto Standard) oder `next-mdx-remote` (mehr Flexibilitaet)? Entscheidung in /architecture mit Tradeoff-Analyse.
- **Q-V4.1-C — Snapshot-Liste-Position:** Im Reader als Sidebar-Element oder als separate Snapshot-Auswahl-Page (`/dashboard/handbook` ohne ID)? Entscheidung in /architecture.
- **Q-V4.1-D — Audit-Felder auf `block_review`:** Reicht `reviewed_by` (UUID) + `reviewed_at` (timestamptz) + `note` (text)? Oder zusaetzlich History-Tabelle fuer Status-Transitionen? Empfehlung Requirements: keine History-Tabelle in V4.1 (validation_layer-Pattern reicht). Definitiv in /architecture.
- **Q-V4.1-E — Cockpit-Karte Implementation:** Eigene Card oder Erweiterung der bestehenden "Mitarbeiter-Aufgaben"-Card? Entscheidung in /frontend, wenn Cockpit-Layout konkret wird.

### Slice-Skizze (informativ, finaler Schnitt in /slice-planning)

| Slice | Scope | Geschaetzt |
|-------|-------|-----------|
| SLC-041 | BL-049 Backend — `block_review`-Tabelle + RLS + Worker-Filter + Backfill-Migration | ~3 MTs |
| SLC-042 | BL-049 Frontend — Konsolidierter Block-zentrierter Review-View + Trigger-Status-Dialog + Cockpit-Card | ~5 MTs |
| SLC-043 | BL-050 Frontend — `/admin/reviews` Cross-Tenant + `/admin/tenants/[id]/reviews` Pro-Tenant + Direct-Links | ~4 MTs |
| SLC-044 | BL-047 Frontend — Reader unter `/dashboard/handbook/[snapshotId]` (Sidebar-Nav, Markdown, Section-Anchors, Snapshot-Liste) | ~6 MTs |
| SLC-045 | BL-047 Frontend — Volltext-Suche (Client-Side) + Cross-Link Reader → Debrief-Editor (RLS-bedingt sichtbar) | ~3 MTs |

5 Slices, ~21 Micro-Tasks, geschaetzt 4-5 Tage Implementation.

Pflicht-Gates fuer V4.1-Implementation:
- 4-Rollen-RLS-Matrix erweitert um `block_review` (mind. 8 zusaetzliche Test-Faelle, Pflicht in /qa pro V4.1-Slice der das Schema beruehrt)
- Browser-Smoke-Test fuer Reader-UX vor V4.1-Release (`tenant_admin` liest Snapshot ohne Berater-Hilfe)
- Worker-Backwards-Compat-Test (alte Snapshots re-generierbar ohne `block_review`-Eintraege)

---

## V4.2 — Tenant Self-Service Onboarding (Wizard + Reminders + In-App-Hilfe)

### Problem Statement (V4.2)
V4 liefert ein minimales Status-Cockpit ("wo stehen wir") und V4.1 liefert Handbuch-Reader + Berater-Review. Was bleibt: jeder neue Tenant braucht heute eine Berater-Einfuehrung, weil

1. **Erste-Login-Erlebnis ist leer.** Ein neu eingeladener `tenant_admin` landet auf `/dashboard` und sieht ein Cockpit ohne Daten — kein klarer Start-Pfad. Ohne Berater erklaert ihm niemand, dass er erst eine Capture-Session starten und dann Mitarbeiter einladen muss.
2. **Mitarbeiter werden vergessen.** Wenn ein `tenant_admin` Mitarbeiter eingeladen hat, gibt es heute keinen Reminder-Mechanismus. Mitarbeiter, die ihre Aufgabe nicht starten, bleiben unsichtbar bis der Berater nachfragt.
3. **In-App-Hilfe fehlt.** Jede Hauptansicht (Dashboard, Capture, Bridge-Review, Handbuch) hat genug Komplexitaet, dass ein Erst-User Tooltips oder eine Inline-Erklaerung braucht. Ohne Berater muss der User raten oder googeln — beides bricht das Self-Service-Versprechen.

V4.2 schliesst diese drei Reibungspunkte fuer den GF-Pfad. Der Berater wird erst beim Block-Review wieder gebraucht — vorher laeuft alles automatisch.

### Goal (V4.2)
Ein neuer `tenant_admin` kann sich nach Invitation einloggen, einen Wizard durchlaufen, das Onboarding selbstaendig starten, Mitarbeiter einladen und das Tool eigenstaendig bedienen. Mitarbeiter-Reminders gehen automatisch raus. In-App-Hilfe ist pro Hauptansicht erreichbar. Der Berater wird in der ersten Onboarding-Phase nicht mehr gebraucht.

### V4.2 In Scope

| ID | Feature | Backlog | Zweck |
|----|---------|---------|-------|
| FEAT-031 | Tenant-Onboarding-Wizard | BL-048 | Mehrstufiger Erst-Login-Wizard fuer `tenant_admin`: Begruessung → Template-Auswahl → erste Mitarbeiter einladen → "Was nun"-Abschluss. State persistent pro Tenant, Skip jederzeit moeglich. |
| FEAT-032 | Capture-Reminders | BL-060 (NEU) | Automatische E-Mail-Reminder an Mitarbeiter mit pendentem Capture-Task (Stufe 1 nach 3 Tagen, Stufe 2 nach 7 Tagen). In-App-Badge fuer `tenant_admin` ("X Mitarbeiter ohne Aktivitaet"). Cron-getrieben, idempotent, Opt-Out pro Mitarbeiter. |
| FEAT-033 | In-App-Hilfe | BL-061 (NEU) | Right-Side Help-Sheet (shadcn `Sheet`) pro Hauptansicht mit kontextuellen Markdown-Inhalten. Tooltips an wichtigen UI-Elementen. Help-Content im Repo unter `/content/help/*.md` (versioniert, Berater-pflegbar via PR). |

### V4.2 Out of Scope (bewusst, V4.3 oder spaeter)

- **Reader-Polish (BL-051..058) und Convention-Migration (BL-059)** → V4.3 als Maintenance-Sammelrelease. Begruendung: anderer Scope (UX-Polish + Hygiene), andere Risiko-Klasse (Regression statt Feature-Acceptance).
- **AI-gestuetzte Hilfe (Chatbot im Tool)** → spaeter (V5+). V4.2 bleibt regelbasiert.
- **Mehrsprachige Hilfe** → spaeter (Tenant-Language gilt; Help-Content ist DE-only in V4.2).
- **Externe Onboarding-Videos / Tutorials-Hosting** → spaeter. Markdown-Hilfe reicht fuer V4.2.
- **Tenant-Self-Service-Signup** (Public-Sign-up ohne Berater-Invite) → bewusst nicht in V4.2. Tenants werden weiter durch `strategaize_admin` angelegt. Self-Service-Signup ist ein Geschaeftsmodell-Wechsel, kein Tooling-Item.
- **Reminder-Eskalation an `tenant_admin` als E-Mail** → V4.2 nutzt In-App-Badge fuer den GF. E-Mail an GF kann V4.3+.
- **Wizard mit KI-Vorschlaegen** (z.B. "fuer eure Branche koennten diese Mitarbeiter relevant sein") → V5+, wenn Branchen-Datenmodell existiert.
- **Help-Content-Editor in der UI** → spaeter, wenn Berater-Inhalte staendig wechseln. PR-Workflow reicht fuer V4.2.

### Core Design Decisions (V4.2 — Empfehlung Requirements)

Die folgenden Entscheidungen wurden im /requirements V4.2-Dialog 2026-04-29 als Empfehlung gesetzt. Sie sind in `/architecture` V4.2 zu bestaetigen oder explizit zu kippen.

- **DEC-V4.2-1 — Wizard-Trigger:** Auto-Open beim ersten Login eines `tenant_admin`, der noch keine Capture-Session hat UND `tenant.onboarding_wizard_state` nicht `skipped` oder `completed` ist. `strategaize_admin` sieht den Wizard nie.
- **DEC-V4.2-2 — Wizard-Schritte (V4.2-Scope):** (1) Begruessung mit Tenant-Name + Berater-Anrede, (2) Template-Auswahl aus aktiven Templates (Default: Exit-Readiness), (3) Erste Mitarbeiter einladen (E-Mail + Anzeigename, 0..N optional), (4) Abschluss "Was nun" mit drei klickbaren Cards (Capture starten, Bridge nutzen, Handbuch generieren). Branche/Firmen-Groesse-Erfassung **nicht** in V4.2 (kein klarer Use-Case in V4.2-Scope).
- **DEC-V4.2-3 — Wizard-State-Speicherung:** Pro Tenant (nicht pro User) auf neuer Spalte `tenant.onboarding_wizard_state` (`pending|started|skipped|completed`) + `tenant.onboarding_wizard_completed_at`. Multi-Admin-Tenant-Szenario: nur der erste Login-Admin sieht den Wizard.
- **DEC-V4.2-4 — Reminder-Empfaenger:** Nur Mitarbeiter (`employee`-Rolle) bekommen E-Mail-Reminder. `tenant_admin` selbst bekommt KEINE E-Mails (User explizit: "kein Berater neben Teilnehmer" — gleiches Prinzip: keine Bevormundung des GFs). GF sieht stattdessen In-App-Badge mit Anzahl pendenter Mitarbeiter-Tasks.
- **DEC-V4.2-5 — Reminder-Schedule:** Stufe 1 nach 3 Werktagen Inaktivitaet (`employee.invitation_accepted_at` + 3d und kein `block_submit`), Stufe 2 nach 7 Werktagen, danach **kein** weiterer Reminder. Idempotent: `reminder_log`-Tabelle verhindert Doppel-Sends.
- **DEC-V4.2-6 — Reminder-Provider:** Bestehender Supabase-Auth-SMTP nutzen (Magic-Link-Pattern). Kein neuer E-Mail-Provider in V4.2. Wenn das ueber Volume nicht reicht, V4.3+ Migration auf dedizierten Provider (Resend, SES).
- **DEC-V4.2-7 — Help-Content-Format:** Markdown-Files unter `/content/help/<page-key>.md`, geladen zur Build-Zeit (Static-Imports). Versionierbar via Git, Berater-pflegbar via PR. **Kein** DB-Schema fuer Help-Content in V4.2.
- **DEC-V4.2-8 — Help-UI-Pattern:** Right-Side `Sheet` (shadcn/ui) mit `?`-Trigger im Header pro Page. Tooltips via shadcn `Tooltip` an spezifischen UI-Elementen (Bridge-Trigger, Reviews-Approve, Snapshot-Generate). Kein Onboarding-Tour-Overlay (zu invasiv).
- **DEC-V4.2-9 — Cron-Infrastruktur:** Bestehender Coolify-Cron-Container nutzen (analog Pattern aus Business System V4.x). Reminder-Job laeuft 1×/Tag um 09:00 Europe/Berlin. Keine eigene Worker-Container in V4.2.

### Success Criteria (V4.2)

V4.2 ist erfolgreich, wenn ALLE folgenden Kriterien erfuellt sind:

**SC-V4.2-1 — Wizard zeigt sich nur fuer Erst-Login**
Ein neu eingeladener `tenant_admin` von Tenant X wird beim ersten Login automatisch in den Wizard gefuehrt (`onboarding_wizard_state` initial `pending`). Skip jederzeit moeglich, danach `state='skipped'` und Wizard erscheint nie wieder fuer diesen Tenant.

**SC-V4.2-2 — Wizard ist 4 Schritte, jederzeit unterbrechbar**
Der Wizard hat genau 4 Schritte (Begruessung, Template-Auswahl, Mitarbeiter-Invite, Was-nun). Jeder Schritt hat einen "Spaeter"-Button und einen "Weiter"-Button. State wird nach jedem Schritt persistiert (Step-Position auf `tenant.onboarding_wizard_step`). Browser-Reload fuehrt den User zum letzten persistierten Schritt zurueck.

**SC-V4.2-3 — Mitarbeiter-Invite aus Wizard heraus funktioniert**
In Schritt 3 kann der User 0..N Mitarbeiter (E-Mail + Name) anlegen. Submit triggert die bestehende `inviteEmployees`-Server-Action (kein neues Backend). Nach Submit zeigt der Wizard "X Mitarbeiter eingeladen" und navigiert zu Schritt 4.

**SC-V4.2-4 — Capture-Reminders gehen automatisch raus**
Cron-Job `capture-reminder-job` laeuft 1×/Tag um 09:00 Europe/Berlin. Mitarbeiter mit `invitation_accepted_at + 3d` ohne `block_submit` bekommen Stufe-1-Reminder. Mitarbeiter mit `invitation_accepted_at + 7d` ohne `block_submit` bekommen Stufe-2-Reminder. `reminder_log`-Tabelle verhindert Doppel-Sends.

**SC-V4.2-5 — Reminder-Opt-Out wirkt**
Ein Mitarbeiter setzt `user_settings.reminders_opt_out=true` (oder unsubscribe-Link in der Mail). Folgende Cron-Runs ueberspringen diesen Mitarbeiter — kein weiterer Reminder geht raus.

**SC-V4.2-6 — In-App-Badge zeigt pendente Mitarbeiter**
Der `tenant_admin` sieht im Cockpit (`/dashboard`) eine neue Card "Mitarbeiter ohne Aktivitaet: X" — gezaehlt: Mitarbeiter mit `invitation_accepted_at` aber ohne `block_submit`. Klick fuehrt zur Mitarbeiter-Liste mit Filter "ohne Aktivitaet".

**SC-V4.2-7 — Help-Sheet ist auf 5 Hauptpages erreichbar**
`?`-Icon im Header oeffnet Right-Side-Sheet mit Markdown-Inhalt. Pages mit Help-Sheet: `/dashboard`, `/capture/[sessionId]`, `/admin/bridge`, `/admin/reviews`, `/dashboard/handbook[/...]`. Help-Content wird aus `/content/help/<page-key>.md` geladen.

**SC-V4.2-8 — Tooltips an kritischen UI-Elementen**
Mindestens 5 spezifische UI-Elemente bekommen einen Tooltip mit kurzem Erklaerungstext: Bridge-Trigger-Button, Approve-Block-Button im Review, Generate-Snapshot-Button, Wizard-"Spaeter"-Button, "Mitarbeiter ohne Aktivitaet"-Badge.

**SC-V4.2-9 — Browser-Smoke-Test mit Nicht-Tech-User**
Ein neuer Tenant wird angelegt. Eine Person, die das Tool nie gesehen hat, wird als `tenant_admin` eingeladen. Ohne Berater-Hilfe + ohne Mausschubsen schafft die Person: (a) Wizard durchlaufen, (b) Mitarbeiter einladen, (c) erste Capture-Session starten, (d) Help-Sheet mindestens einmal oeffnen. Wenn diese Person scheitert, wird die UI angepasst.

**SC-V4.2-10 — Keine V4 / V4.1-Regression**
Bestehende Workflows funktionieren weiter: Bridge-Engine, Mitarbeiter-Capture, Handbuch-Trigger, Reader, Berater-Review. Wizard ueberlagert das nicht. RLS-Test-Matrix bleibt 100% PASS.

**SC-V4.2-11 — RLS-Test-Matrix bleibt gruen**
4-Rollen-RLS-Matrix wird um `reminder_log` und `user_settings` erweitert (mind. 8 zusaetzliche Test-Faelle: 4 Rollen × 2 neue Tabellen).

**SC-V4.2-12 — Reminder-Cost-Audit**
Reminder-Cron loggt pro Run: Anzahl Stufe-1-Reminders, Anzahl Stufe-2-Reminders, Anzahl Skips (Opt-Out, bereits-gesendet). Audit-Log ist im `error_log` (oder neuer `cron_log`-Tabelle) sichtbar.

### Constraints (V4.2)

Alle V4 + V4.1 Constraints gelten weiter, zusaetzlich:

- **E-Mail-Provider Limit:** Supabase-Auth-SMTP hat begrenztes Volume. Cron-Job darf bei `> 50 Reminders/Tag` einen Warning-Log schreiben, damit V4.3+ Migration auf dedizierten Provider getriggert werden kann.
- **Wizard darf den Login-Flow nicht blockieren:** Wenn der Wizard in einem unerwarteten Zustand crasht, faellt der User auf das Standard-Cockpit zurueck (Skip wird automatisch gesetzt). Niemand wird durch einen Wizard-Bug aus dem Tool ausgesperrt.
- **Help-Content-Ladezeit:** Markdown wird statisch zur Build-Zeit gebundelt (max 5 Files × max 5KB = 25KB Bundle-Overhead). Kein Runtime-Fetch fuer Help-Content.
- **Tooltip-Performance:** shadcn `Tooltip` nutzt Radix-Underlying. Keine Custom-Position-Berechnung, keine Animationen ueber CSS-Transition hinaus.
- **Cron-Idempotenz:** Bei Cron-Doppellauf (z.B. Coolify-Restart waehrend Job-Run) darf kein Mitarbeiter zwei Reminders bekommen. `reminder_log` hat Unique-Constraint `(employee_id, reminder_stage, sent_date)`.

### Risks / Assumptions (V4.2)

#### Risiken

- **R-V4.2-1 — Wizard wird als nervig empfunden:** Der GF moechte ggf. das Tool ohne Wizard kennenlernen. Mitigation: jeder Schritt skipbar, plus "Wizard nicht mehr zeigen"-Toggle in Schritt 4. Wizard erscheint nach Skip nie wieder (DEC-V4.2-1).
- **R-V4.2-2 — E-Mail-Reminders landen im Spam:** Self-hosted Supabase-Auth-SMTP hat begrenzten Reputations-Score. Mitigation: SPF/DKIM auf Server-Domain pruefen (eigener Maintenance-Sprint), Reminder-Subject-Lines neutral halten (nicht "Achtung!" / "Letzte Chance" — Spam-Trigger).
- **R-V4.2-3 — Help-Content veraltet schnell:** Markdown-Files driften vom UI-Stand ab. Mitigation: Help-Pages werden nur fuer 5 Haupt-Pages gepflegt. Wenn UI sich aendert, ist Help-Update Pflicht-Item im Slice (Sentry-aehnlicher Lint: kein Merge ohne Help-Update wenn betroffene Page touched).
- **R-V4.2-4 — Cron-Job vergessen wird in Coolify:** Wenn der Cron-Container nicht laeuft, gehen keine Reminders raus — und niemand merkt es. Mitigation: Cron-Run schreibt in `cron_log` mit Timestamp. Cockpit zeigt "Letzter Reminder-Run: vor X Stunden" als operative Sichtbarkeit.
- **R-V4.2-5 — Wizard-State-Konflikt bei Multi-Admin-Tenant:** Wenn Tenant X zwei `tenant_admin` hat und beide gleichzeitig zum ersten Mal einloggen, wer sieht den Wizard? Mitigation: DB-Lock auf `tenant.onboarding_wizard_state` mit `pending → started` (Version-Increment). Zweiter Login sieht direkt das Cockpit.

#### Annahmen

- **A-V4.2-1 — Coolify-Cron-Container ist verfuegbar:** Pattern aus Business System V4.x ist uebertragbar. Wenn nicht, Fallback auf Vercel-Cron oder GitHub-Actions-Cron (aber nicht V4.2-Scope).
- **A-V4.2-2 — Supabase-Auth-SMTP ist konfiguriert:** Magic-Link-E-Mails funktionieren bereits in V1+. Reminder nutzen die selbe SMTP-Konfiguration, kein neuer Setup-Schritt.
- **A-V4.2-3 — Markdown-Render aus V4.1 ist wiederverwendbar:** `react-markdown` aus FEAT-028 wird auch in Help-Sheet genutzt. Keine zweite Markdown-Library.
- **A-V4.2-4 — Bestehende `inviteEmployees`-Server-Action ist Wizard-tauglich:** Wenn nicht, kleine Anpassung waehrend FEAT-031 — kein Architektur-Risiko.

### Open Questions (V4.2)

Die folgenden Fragen werden in `/architecture` V4.2 entschieden:

- **Q-V4.2-A — Wizard-Persistenz-Granularitaet:** Step-genaue Persistenz (User kommt beim Schritt 3 wieder rein) oder nur Pending/Started/Completed-Status (User startet Wizard immer von vorn)? Empfehlung Requirements: Step-genau (DEC-V4.2-3 — User-Convenience-Pflicht). Definitiv in /architecture.
- **Q-V4.2-B — Reminder-Schedule-Werktage vs. Kalendertage:** Wochenenden sollen vermutlich nicht zaehlen (sonst geht Mo-Reminder fuer Fr-Invitation). Empfehlung Requirements: Werktage (DEC-V4.2-5). Holiday-Calendar nicht in V4.2 (zu komplex). Bestaetigung in /architecture.
- **Q-V4.2-C — Help-Content-Lokalitaet:** Markdown-Files unter `/content/help/<page-key>.md` (am Repo-Root) oder unter `src/content/help/`? Convention-Frage, wird in /architecture entschieden.
- **Q-V4.2-D — In-App-Badge-Refresh:** Polling vs. Page-Refresh-only vs. Server-Sent-Events? Empfehlung Requirements: Page-Refresh-only (Cockpit ist nicht Real-Time-Tool). Definitiv in /architecture.
- **Q-V4.2-E — Cron-Job Containerisierung:** Eigener Cron-Container oder via Supabase pg_cron Extension? Empfehlung Requirements: Coolify-Container (gleicher Pattern wie Business System). Definitiv in /architecture.
- **Q-V4.2-F — Tooltip-Persistenz-Hint:** Soll ein Tooltip einen "Verstanden, nicht mehr zeigen"-Toggle haben (per User), oder bleibt er immer? Empfehlung Requirements: immer (Tooltips sind kontextuell, nicht Onboarding-Schritte). Definitiv in /frontend.
- **Q-V4.2-G — `user_settings`-Schema:** Neue eigene Tabelle oder als JSONB-Feld auf `auth.users`? Empfehlung Requirements: eigene Tabelle (RLS-faehig, erweiterbar). Definitiv in /architecture.

### Slice-Skizze (informativ, finaler Schnitt in /slice-planning)

| Slice | Scope | Geschaetzt |
|-------|-------|-----------|
| SLC-046 | FEAT-031 Backend — `tenant.onboarding_wizard_*`-Spalten + RLS-Update + `tenant_admin`-erste-Login-Erkennung-RPC | ~3 MTs |
| SLC-047 | FEAT-031 Frontend — Wizard-Component (4 Schritte) + Step-Persistenz + Skip-Logic + Was-nun-Cards | ~7 MTs |
| SLC-048 | FEAT-032 Backend — `reminder_log` + `user_settings` Tabellen + RLS + Cron-Job-Skript + SMTP-Integration | ~6 MTs |
| SLC-049 | FEAT-032 Frontend — In-App-Badge "Mitarbeiter ohne Aktivitaet" + Mitarbeiter-Liste-Filter + Opt-Out-Toggle | ~3 MTs |
| SLC-050 | FEAT-033 — Help-Content (5 MD-Files) + Help-Sheet-Component + Tooltip-Integration an 5 UI-Elementen | ~5 MTs |

5 Slices, ~24 Micro-Tasks, geschaetzt 5-7 Tage Implementation.

Pflicht-Gates fuer V4.2-Implementation:
- 4-Rollen-RLS-Matrix erweitert um `reminder_log` und `user_settings` (mind. 8 zusaetzliche Test-Faelle).
- Browser-Smoke-Test mit Nicht-Tech-User vor V4.2-Release (SC-V4.2-9, R17 aus V4-Pflicht-Gates).
- Cron-Idempotenz-Test: Doppellauf des Reminder-Jobs darf keine Doppel-Mails ausloesen.

### Delivery Mode (V4.2)
**SaaS Product** — unveraendert seit V1. Keine Aenderung im Delivery-Mode trotz interner Selbstbedienungs-Erweiterung.

---

## V4.3 — Maintenance-Sammelrelease (Reader-Polish + UX + Tooling + ADR)

### Problem Statement (V4.3)
Drei Quellen sammeln V4.x-Schuld an, die nach V4.2-Release (REL-010, 2026-05-01) jetzt gebuendelt abgearbeitet werden soll:

1. **V4.1 Browser-Smoke + Final-Check** lieferte 9 kleinere Items zum Reader und Code-Hygiene (BL-051..059).
2. **V4.2 Gesamt-/qa User-Smoke** entdeckte 2 UX-Findings: Tooltip-Target zu klein (BL-062) + Help-Mechanismen-Konsolidierung (BL-063).
3. **V4.2 /final-check + /doctor-Sessions** entdeckte 4 weitere Items: ESLint-9 flat-config-Migration (BL-064), ADR fuer State-Maschinen-UPDATE-Pattern (BL-065), Investigation Turbopack-Layout-Inlining-Anomalie (BL-066), Berater-Inhalts-Review fuer SLC-050 Help-Files (BL-067).

Insgesamt 15 Items — groesser als V3.1 (3 Items) aber strukturell gleicher Pattern: Maintenance ohne neue Features.

### Goal (V4.3)
Reader-Erlebnis polieren, V4.2-UX-Findings adressieren, Tooling-Gap (ESLint-9) schliessen, State-Maschinen-Pattern als ADR dokumentieren, Investigation Turbopack als Spike abschliessen, Help-Content final mit Berater reviewt. Kein neues Feature, keine Schema-Aenderung.

### V4.3 In Scope (15 Items)

#### A. Reader-UX-Polish (aus V4.1 Browser-Smoke)

| ID | Item | Backlog | Severity |
|----|------|---------|----------|
| V4.3.1 | Reader Active-Section-Scroll-Spy in Sidebar | BL-051 | Medium UX |
| V4.3.2 | Reader Copy-Permalink-Button pro Section | BL-052 | Low UX |
| V4.3.3 | Reader Loading-Skeleton waehrend Snapshot-Wechsel | BL-053 | Low UX |
| V4.3.4 | Reader Cross-Snapshot-Suche und Suche-Historie | BL-054 | Low UX |
| V4.3.5 | Reader Mobile-Polish: h1-Title-Wrap bei 375px | BL-055 | Low Mobile |
| V4.3.8 | Reader Heading-Anchor-Hover am h1-Titel sichtbar | BL-058 | Low UX |

#### B. Worker-Output-Hygiene

| ID | Item | Backlog | Severity |
|----|------|---------|----------|
| V4.3.6 | Worker-Output: TOC-Markdown-Links als In-App-Anchors | BL-056 | Medium Hygiene |
| V4.3.7 | Umlaut-Konsistenz Templates + Worker + UI | BL-057 | Medium Content |

#### C. Tooling-Migrations

| ID | Item | Backlog | Severity |
|----|------|---------|----------|
| V4.3.9 | Next.js 16 `middleware`→`proxy` Convention-Migration | BL-059 | Low Hygiene |
| V4.3.10 | ESLint 9 flat-config-Migration | BL-064 | Low Tooling |

#### D. UX-Findings aus V4.2 Gesamt-/qa

| ID | Item | Backlog | Severity |
|----|------|---------|----------|
| V4.3.11 | Tooltip 1/5 Inactive-Badge Hover-Target zu klein 16x16 | BL-062 | Low UX |
| V4.3.12 | Help-Mechanismen-Konsolidierung (SLC-050 HelpSheet + Learning Center) | BL-063 | Medium UX |

#### E. Architektur-Items

| ID | Item | Backlog | Severity |
|----|------|---------|----------|
| V4.3.13 | ADR fuer State-Maschinen-UPDATE-Pattern (Service-Role vs RLS-Policy) | BL-065 | Medium Doku |
| V4.3.14 | Investigation Next.js 16 Turbopack-Layout-Inlining-Anomalie (Spike) | BL-066 | Low Investigation |

#### F. Content-Pflicht

| ID | Item | Backlog | Severity |
|----|------|---------|----------|
| V4.3.15 | Berater-Inhalts-Review fuer 5 SLC-050 Help-Files | BL-067 | Medium Content |

### V4.3 Out of Scope

- **Neue Features.** V4.3 ist explizit Maintenance — kein neuer Capture-Mode, kein Wizard-Schritt-Erweiterung, kein neuer Reminder-Channel.
- **Privacy/Datenschutz/Impressum-Page.** Wird in eigenem `/compliance`-Sprint behandelt (parallel zu V4.3 oder direkt danach). Begruendung: Legal-Texte schreiben + Layout sind strukturell anders als Maintenance-Sweep.
- **ISSUE-021 (Bridge-Proposal Edit-only-Pfad fehlt) + ISSUE-022 (strategaize_admin /admin/bridge):** Beide sind V4-Pre-existing Feature-Logic-Gaps, die in V5 (Walkthrough-Mode) oder V4.4 als eigene Slice behandelt werden — nicht in Maintenance-Sweep.
- **Cross-Snapshot-Suche mit Backend-Index.** BL-054 wird nur als client-side History-Feature umgesetzt; dedizierter Search-Index ist V5+.
- **Re-Generation aller bestehender Snapshots fuer Umlaut-Konsistenz (BL-057).** User entscheidet manuell, welche Demos re-generiert werden sollen — kein Auto-Migrate.
- **Turbopack-Bug-Fix.** BL-066 ist eine Investigation (Spike timeboxed 4h), kein Fix-Item. Wenn ein genuine Bug bestaetigt wird, wird er beim Next.js-Repo gemeldet — kein Code-Fix in V4.3.
- **AI-gestuetzte Hilfe / Chatbot.** Ist V5+. V4.3 buendelt nur die existing Help-Mechanismen.

### Success Criteria (V4.3)

V4.3 ist erfolgreich, wenn ALLE folgenden Kriterien erfuellt sind:

**SC-V4.3-1 — Alle 15 Items abgearbeitet**
Jedes Item aus V4.3.1..V4.3.15 ist entweder implementiert ODER dokumentiert als "won't-fix" mit Begruendung in KNOWN_ISSUES.md ODER (fuer Investigation BL-066) als ADR/GitHub-Issue-URL dokumentiert.

**SC-V4.3-2 — Reader UX-Browser-Smoke besser als V4.1**
Auf 1280×800 Desktop und 375×667 Mobile keine sichtbaren Layout-Brueche. h1-Title bricht max. 2 Zeilen. Active-Section in Sidebar wird beim Scrollen markiert. Tooltip-Target Inactive-Badge ist End-User-trefffaehig (~24x24+ oder Card-Header als Trigger).

**SC-V4.3-3 — Worker-Output enthaelt In-App-Anchor-Links**
INDEX.md im Snapshot enthaelt `[Title](#section-anchor)` statt `[Title](01_section.md)`. Reader verlinkt direkt, kein components.a-Override mehr noetig.

**SC-V4.3-4 — Convention + Tooling-Migrations ohne Funktions-Verlust**
`src/middleware.ts` ist als `src/proxy.ts` umbenannt + Convention-Anpassungen umgesetzt. Build zeigt keine middleware-Deprecation-Warning mehr. ESLint 9 flat-config aktiv, `npm run lint` laeuft fehlerfrei. Auth-Middleware-Tests bleiben 100% PASS.

**SC-V4.3-5 — RLS-Test-Matrix bleibt gruen**
Keine Schema-Aenderung in V4.3 (additive UI/Hygiene). RLS-Matrix bleibt 100% PASS.

**SC-V4.3-6 — Keine V4.2-Regression**
V4.2-Funktionalitaet (Wizard, Reminders, Help, Bridge, Reader) bleibt stabil. End-to-End Wizard pending → completed funktioniert. Cron-Reminder-Pipeline funktioniert weiter. Help-Sheet auf allen 5 Pages erreichbar.

**SC-V4.3-7 — Help-Konsolidierung loest UX-Verwirrung**
Nach BL-063-Implementation gibt es genau einen erkennbaren Help-Trigger pro Page (kein "zwei `?`-Icons konkurrieren"-Pattern). Konsolidierungs-Variante ist im /architecture V4.3 entschieden + dokumentiert.

**SC-V4.3-8 — ADR State-Maschinen-Pattern (BL-065) ist verbindlich**
DEC-XXX in /docs/DECISIONS.md dokumentiert die Wahl zwischen Service-Role-UPDATE vs RLS-UPDATE-Policy fuer State-Maschinen, mit Sicherheits-Tradeoff-Analyse + verbindlicher Empfehlung fuer kuenftige Slices.

**SC-V4.3-9 — Investigation Turbopack-Anomalie hat Output**
BL-066 produziert entweder eine GitHub-Issue-URL beim Next.js-Repo (genuine Bug) ODER ein Workaround-ADR (Inlining-Verhalten erwartet, Pattern dokumentieren). Kein offenes "wissen wir nicht"-Ende.

**SC-V4.3-10 — Berater-Help-Review-Output**
5 Help-Markdown-Files final reviewt: keine Doppelungen, Begriffs-Konsistenz mit UI, Du-Form, max 250 Worter pro File. Aktualisierte Files commited unter `src/content/help/*.md`.

### Constraints (V4.3)

- **Keine Schema-Aenderungen.** Wenn ein Item DB-Schema beruehrt, ist es kein V4.3-Item.
- **Kein neuer Cron-Job, kein neuer Container.** Maintenance-Release-Disziplin.
- **Keine Feature-Slices, keine Architektur-Aenderungen** ueber das ADR (BL-065) hinaus.
- **Re-Generation von Demo-Snapshots** fuer Umlaut-Konsistenz nur auf User-Trigger.
- **Investigation-Spikes timeboxed.** BL-066 ist 4h-Box; wenn nicht in 4h aufgeklaert → Workaround-ADR + Issue-Sammlung schliessen.

### Risks / Assumptions (V4.3)

#### Risiken

- **R-V4.3-1 — Convention-Migration `middleware`→`proxy` bricht Auth-Flow:** Next.js 16 API-Aenderungen sind nicht trivial. Mitigation: eigener Slice mit dedizierten Tests, Rollback ist 1-Datei-Rename.
- **R-V4.3-2 — Worker-Output-Aenderung bricht alte Reader:** Wenn TOC-Format aendert, muessen alte Snapshots ggf. re-rendered werden. Mitigation: Reader behaelt components.a-Override fuer alte Snapshots; neue Snapshots brauchen ihn nicht.
- **R-V4.3-3 — ESLint-9-Migration hat Regression-Potential:** Wenn `eslint-config-next` 16.x mit flat config nicht voll kompatibel ist, kann Lint-Output sich aendern (mehr/weniger Warnings). Mitigation: Migration als eigener Slice, vorher Snapshot der Lint-Output-Baseline.
- **R-V4.3-4 — Help-Konsolidierung-Decision braucht UX-Sense:** BL-063 hat 3 Optionen (Tab im Learning Center, LC entfernen, neuer LC-Tab "Diese Seite"). Falsche Wahl kann SLC-050 Inhalt unsichtbar machen. Mitigation: /architecture V4.3 macht UX-Decision mit User-Confirmation, kein Implementer-Auto-Choice.
- **R-V4.3-5 — Investigation BL-066 fuehrt zu nichts:** 4h-Box reicht ggf. nicht. Mitigation: ADR mit "kein Root-Cause gefunden, Workaround dokumentiert" ist akzeptables Outcome — kein Open-Ended-Spike.

#### Annahmen

- **A-V4.3-1 — Reader-Komponenten-Architektur ist stabil.** Reader-UX-Polish-Items sind alles inkrementelle CSS/Component-Aenderungen, keine Architektur-Umbau.
- **A-V4.3-2 — Berater-Review-Aufwand ist klein.** 5 Files × ~250 Worter = ~30 min reine Inhaltspflege durch User. Kein Code-Slice noetig.
- **A-V4.3-3 — `react-markdown` aus FEAT-028 reicht weiter.** Keine zweite Markdown-Library noetig fuer Help-Konsolidierung.
- **A-V4.3-4 — Coolify-Cron-Setup aus V4.2 bleibt unveraendert.** V4.3 beruehrt keinen Cron.

### Open Questions (V4.3)

Die folgenden Fragen werden in `/architecture` V4.3 entschieden:

- **Q-V4.3-A — Slice-Bundling:** 4 Slices (Reader-UX + Worker/Templates + Tooling + UX-Findings) ODER 6 Slices (mehr granular)? Empfehlung: 5-6 Slices wegen unterschiedlicher Risiko-Klassen (Migration-Slices brauchen eigene Tests). Definitiv in /slice-planning.
- **Q-V4.3-B — Search-History-Persistenz (BL-054):** localStorage vs. user_settings? Empfehlung: localStorage (Maintenance-Pattern, kein DB-Round-Trip).
- **Q-V4.3-C — Help-Konsolidierungs-Variante (BL-063):** (1) SLC-050 als 3. Tab im Learning Center, (2) Learning Center entfernen + alle Inhalte unter SLC-050, (3) Learning Center bekommt Tab "Diese Seite" mit SLC-050-Content. Empfehlung Requirements: Variante 3 (additiv, behaelt beide Mechanismen-Investments). Definitiv in /architecture V4.3 mit User-Confirmation.
- **Q-V4.3-D — ADR State-Maschinen-Pattern (BL-065) Empfehlung:** Service-Role-UPDATE als Default ODER RLS-UPDATE-Policy pro State-Spalte? Empfehlung Requirements: Service-Role-Default (weil State-UPDATEs immer kontextuell gepruef werden BEFOR sie ausgefuehrt werden — `requireTenantAdmin()` etc.). Definitiv in /architecture mit Sicherheits-Tradeoff.
- **Q-V4.3-E — Investigation Turbopack (BL-066) Reproduktion:** Eigener Branch oder im main? Empfehlung: eigener Branch, weil Reproduktion ggf. Code-Stress-Test braucht der nicht in main soll.
- **Q-V4.3-F — Tooltip-Target-Fix (BL-062) Variante:** (1) h-6 w-6 (24x24px) ODER (2) ganzer Card-Header als Tooltip-Trigger (mit Wrapper-Pattern um den `?`-Button) ODER (3) 44x44 transparenter Hit-Bereich. Empfehlung Requirements: Variante 2 (semantisch sauber: Header-Text ist die Sache, der Trigger). Definitiv in /architecture oder direkt /frontend.

### Slice-Skizze (informativ, finaler Schnitt in /slice-planning)

| Slice | Scope | Items | Geschaetzt |
|-------|-------|-------|-----------|
| SLC-051 | Reader-UX-Bundle: Scroll-Spy + Copy-Permalink + Loading-Skeleton + Mobile-h1 + Heading-Anchor-Hover | BL-051, BL-052, BL-053, BL-055, BL-058 | ~5 MTs |
| SLC-052 | Worker+Templates-Bundle: Anchor-Links + Umlaut-Konsistenz | BL-056, BL-057 | ~4 MTs |
| SLC-053 | Convention-Migration `middleware`→`proxy` + ESLint-9 flat-config | BL-059, BL-064 | ~3 MTs |
| SLC-054 | Cross-Snapshot-Suche client-side + Search-History localStorage | BL-054 | ~3 MTs |
| SLC-055 | UX-Findings-Bundle: Tooltip-Target-Fix + Help-Konsolidierung | BL-062, BL-063 | ~4 MTs |
| SLC-056 | Architektur-Bundle: ADR State-Maschinen + Investigation Turbopack-Spike | BL-065, BL-066 | ~3 MTs (1 ADR + 4h Spike) |
| (kein Slice) | Berater-Help-Review (User direkt, kein Code-Slice) | BL-067 | ~30 min |

6 Slices + 1 Content-Item, ~22 Micro-Tasks, geschaetzt 4-5 Tage Implementation.

Pflicht-Gates fuer V4.3-Implementation:
- Keine Schema-Migration. Wenn ein Slice doch eine wuerde, sofort an User eskalieren.
- ESLint-Migration-Output (Lint-Warnings) muss vor + nach SLC-053 Snapshot dokumentiert werden.
- Investigation BL-066 timeboxed 4h, danach Spike-Abschluss-Pflicht (ADR oder GitHub-Issue).
- Browser-Smoke-Test nach SLC-051 + SLC-055 (Reader-UX + Help-Konsolidierung) auf Desktop + Mobile.

### Delivery Mode (V4.3)
**SaaS Product** — Maintenance-Release-Cadence wie V3.1.

### Sequencing — V4.3 vs `/compliance`-Sprint

Empfehlung: **sequenziell** mit V4.3 first, dann `/compliance`-Sprint.

Begruendung:
- V4.3 ist klein + kontrolliert (~4-5 Tage).
- `/compliance`-Sprint hat eigenen Scope-Charakter (Legal-Texte, Layout, ggf. Footer-Links): besser nicht mit Code-Maintenance gemischt.
- ISSUE-021/022 bleiben in V4.4 oder V5 (Bridge-Workflow ist Walkthrough-Mode-Thema).

## V4.4 — Maintenance-Sammelrelease (Pre-V5-Hygiene)

### Problem Statement (V4.4)
Nach V4.3 (REL-011, 2026-05-05) sind drei kleine Hygiene-Punkte offen, die vor dem Start von V5 (Walkthrough-Mode) abgearbeitet werden sollen, damit V5 auf sauberer Code- und Daten-Basis startet:

1. **BL-067 — Berater-Inhalts-Review der 5 Help-Markdown-Files.** Aus V4.3 verschoben (Content-Only, kein Code-Slice).
2. **BL-068 — Lint-Sweep.** 7 Pre-existing react-hooks-Errors + 6 Warnings im V2-V4.2-Code, sichtbar gemacht durch SLC-053 ESLint-9-Migration. Wochenlang unentdeckt weil `next lint` in Next 16 broken war.
3. **BL-069 — SQL-Backfill 046_seed_demo_template Umlaute.** 328 Vorkommnisse in `templates.blocks` / `sop_prompt` JSONB-Feldern in der Live-DB. SLC-052-Datei-Edit hat keine Wirkung auf bereits stehende Daten — separate UPDATE-Migration noetig.

Pattern: gleiches Vorgehen wie V3.1 (3 Items) und V4.3 (15 Items), nur kleiner — keine neuen Features, keine neuen Container, keine neuen Cron-Jobs, kein Schema-Touch.

### Goal (V4.4)
Drei Hygiene-Items abarbeiten + V4.x-Codebase auf eslint-clean + Live-DB umlaut-konsistent. Output: V5 startet ohne Pre-existing-Lint-Fehler-Schuld + ohne Demo-Daten-Inkonsistenzen.

### V4.4 In Scope (3 Items)

#### A. Code-Hygiene

| ID | Item | Backlog | Severity |
|----|------|---------|----------|
| V4.4.1 | Lint-Sweep — 7 react-hooks-Errors + 6 Warnings im V2-V4.2-Code | BL-068 | Medium Hygiene |

#### B. Daten-Hygiene

| ID | Item | Backlog | Severity |
|----|------|---------|----------|
| V4.4.2 | SQL-Backfill 046_seed_demo_template — 328 Umlaut-Vorkommnisse in templates.blocks/sop_prompt JSONB | BL-069 | Low Daten |

#### C. Content-Pflicht (User-Editor-Workflow)

| ID | Item | Backlog | Severity |
|----|------|---------|----------|
| V4.4.3 | Berater-Inhalts-Review fuer 5 SLC-050 Help-Files (User direkt) | BL-067 | Medium Content |

### V4.4 Out of Scope

- **Neue Features.** V4.4 ist explizit Maintenance — kein neuer Capture-Mode, kein Wizard-Schritt, keine Bridge-UX.
- **ISSUE-021 (Bridge-Proposal Edit-only-Pfad fehlt) + ISSUE-022 (strategaize_admin /admin/bridge):** Beide bleiben in V5 oder spaeter (Bridge-Workflow-Thema, gehoert zum Walkthrough-Capture-Mode-Stack).
- **Privacy/Datenschutz/Impressum-Page.** Bleibt im eigenen `/compliance`-Sprint (Pre-Production-Compliance-Gate, explizit aufgeschoben per User-Decision).
- **Re-Generation aller bestehender Demo-Snapshots nach BL-069-Backfill.** Backfill korrigiert nur templates.blocks/sop_prompt; Demo-Snapshots bleiben in dem Zustand, in dem sie der Worker erzeugt hat. User entscheidet manuell, ob Re-Generation noetig ist.
- **Lint-Regel-Verschaerfung / neue ESLint-Plugins.** V4.4 bringt nur die existing Regeln zum Greenfield-Stand. Plugin-Erweiterung ist V5+.
- **AI-gestuetzte Help-Inhalts-Review.** BL-067 ist vollstaendig User-Editor-Aufgabe.

### Success Criteria (V4.4)

V4.4 ist erfolgreich, wenn ALLE folgenden Kriterien erfuellt sind:

**SC-V4.4-1 — Lint-Output 0 Errors**
Nach BL-068 liefert `npm run lint` 0 Errors. Verbleibende Warnings (FALSE-POSITIVE-Akzeptanz mit Inline-`eslint-disable-next-line`-Kommentar plus Begruendung) sind dokumentiert und auf max. 3 reduziert.

**SC-V4.4-2 — Build/Typecheck/Tests bleiben gruen**
`npm run build`, `npm run typecheck`, `npm run test` laufen weiter ohne Fehler. Keine Regression durch Lint-Fixes (z.B. ungewollte Hook-Reorder, useEffect-Dependency-Aenderung mit Verhaltens-Drift).

**SC-V4.4-3 — Live-DB Umlaut-konsistent**
Nach BL-069 zeigt `audit-umlauts.mjs` (oder vergleichbares SQL-Audit) auf der Live-Coolify-DB **0 Vorkommnisse** in `templates.blocks` und `templates.sop_prompt` fuer das Default-Template (id: Exit-Readiness). Idempotenz: Re-Run der Migration produziert keine doppelten Aenderungen.

**SC-V4.4-4 — Berater-Help-Review-Output**
5 Help-Markdown-Files final reviewt: Begriffs-Konsistenz mit UI, Du-Form, max 250 Worter pro File, keine Doppelungen mit anderen Help-Files. Aktualisierte Files commited unter `src/content/help/*.md`.

**SC-V4.4-5 — Keine V4.3-Regression**
V4.3-Funktionalitaet (Reader, Help-Sheet, Cross-Search, Worker-Anchor-TOC) bleibt stabil. Smoke nach Deploy bestaetigt: alle 5 Help-Pages erreichbar, Reader laedt, Cross-Search liefert Treffer.

**SC-V4.4-6 — Kein Schema-Touch ueber Daten-UPDATE hinaus**
BL-069 ist DML (UPDATE auf JSONB-Felder), kein DDL. Keine `ALTER TABLE`, keine neue Spalte, keine neue Policy.

### Constraints (V4.4)

- **Keine Schema-DDL-Aenderungen.** BL-069 ist reines Daten-UPDATE auf bestehenden JSONB-Feldern.
- **Kein neuer Cron-Job, kein neuer Container, kein neuer Service.** Maintenance-Disziplin.
- **Kein Feature-Slice.** Wenn ein Item User-sichtbares Verhalten aendert, ist es V5-Material.
- **BL-068 darf keine Verhaltens-Aenderung herbeifuehren.** Lint-Fixes sind code-neutral. Bei FALSE-POSITIVE Inline-Disable mit Begruendung.

### Risks / Assumptions (V4.4)

#### Risiken

- **R-V4.4-1 — Lint-Fix produziert Verhaltens-Regression:** `setIframeError() in catch-Block of useEffect` (BL-068 Item 4) ist eine echte react-hooks-Verletzung — Fix-Pattern muss klar sein (z.B. setState aus catch in eigenem useEffect-Cleanup). Mitigation: Pre-Fix-Snapshot der Component-Behavior + Browser-Smoke nach Fix.
- **R-V4.4-2 — JSONB-UPDATE-Migration ist nicht-idempotent geschrieben:** Wenn die Migration ohne `WHERE`-Filter auf bereits-korrigierte Werte laeuft, gibt's keinen Schaden, aber der Audit muss das nachweisen. Mitigation: Migration `WHERE name LIKE '%ae%' OR ...` filtern oder als reversibles Replace (`replace(blocks::text, 'ae', 'ä')` ist nicht safe → besser zielgerichtetes JSONB-Update mit explizitem Mapping).
- **R-V4.4-3 — UPDATE auf templates-Tabelle bricht laufende Sessions:** Wenn ein User gerade ein Template-Block bearbeitet, koennte die UPDATE-Aenderung am Display ankommen ohne Reload. Mitigation: Migration in Off-Peak-Window oder mit User-Ankuendigung.
- **R-V4.4-4 — FALSE-POSITIVE-Identifikation falsch:** Wenn BL-068 Item 7 (`Math.random in useMemo` in shadcn sidebar.tsx) als FALSE-POSITIVE akzeptiert wird, aber der gleiche Pattern in unserem eigenen Code echt waere, droht unbewusste Fehl-Akzeptanz. Mitigation: Inline-Disable nur fuer Library-Code (`shadcn`-Komponenten, generated), niemals in `src/lib/` oder `src/app/`.

#### Annahmen

- **A-V4.4-1 — Lint-Fix-Aufwand bleibt unter 4h gesamt.** 7 Errors × ~30min + 6 Warnings × ~15min = ~5h, aber einige Fixes sind 1-Liner. Realistisch ~3-4h.
- **A-V4.4-2 — BL-069 betrifft nur 1 Default-Template (Exit-Readiness).** Andere Templates wurden nicht aus 046_seed produziert. Wenn weitere Templates Umlaut-Inkonsistenz haben → eigenes Backlog-Item, nicht V4.4-Scope.
- **A-V4.4-3 — Berater-Review-Aufwand ist klein.** 5 Files × ~250 Worter = ~30 min reine Inhaltspflege durch User. Kein Code-Slice.
- **A-V4.4-4 — Coolify-Cron-Setup aus V4.2 bleibt unveraendert.** V4.4 beruehrt keinen Cron.

### Open Questions (V4.4) — RESOLVED in /architecture V4.4 (RPT-152)

- **Q-V4.4-A — BL-068 FALSE-POSITIVE-Policy:** RESOLVED via **DEC-070**. Per-Item-Klassifikation: 6 TRUE-POSITIVE Errors (echte Fixes), 1 TRUE-POSITIVE-aber-Inline-Disable (EvidenceFileList Date.now in render — V4.4 ohne UX-Change), 1 FALSE-POSITIVE (sidebar.tsx Math.random in shadcn-Library-Code), 6 TRUE-POSITIVE Warnings (alle echte Fixes).
- **Q-V4.4-B — BL-069 Migration-Format:** RESOLVED via **DEC-071** + **MIG-030**. PL/pgSQL DO-Block mit curated word-list `replace()` ueber JSONB::text-Roundtrip. Wortliste wird in SLC-062 MT-1 aus audit-umlauts.mjs gegen Live-DB extrahiert. Idempotent. `jsonb_set` per Pfad als nicht-praktikabel verworfen (328 Vorkommnisse), DELETE+Re-INSERT als unsafe verworfen (FK-Constraints).
- **Q-V4.4-C — BL-067 Review-Form:** RESOLVED via **DEC-072**. User editiert direkt im Repo unter `src/content/help/*.md`. Kein Review-Doc-Iteration. Kein Code-Slice.
- **Q-V4.4-D — Slice-Bundling:** RESOLVED via **DEC-073**. 2 Slices: SLC-061 Lint-Sweep + SLC-062 SQL-Backfill. BL-067 ist kein Slice (Content-only). Empfohlene Reihenfolge: SLC-061 first (schneller QA-Loop, kein DB-Touch), SLC-062 second (DB-Apply braucht User + Backup).

### Slice-Skizze (informativ, finaler Schnitt in /slice-planning)

| Slice | Scope | Items | Geschaetzt |
|-------|-------|-------|-----------|
| SLC-061 | Lint-Sweep — alle 7 Errors + 6 Warnings einzeln pruefen, fix oder dokumentierte FALSE-POSITIVE-Akzeptanz | BL-068 | ~6 MTs (1 pro Datei + Verifikation) |
| SLC-062 | SQL-Backfill 046_seed_demo_template Umlaut-Korrektur — Migration + Live-DB-Apply + Audit-Verifikation | BL-069 | ~3 MTs (Migration schreiben + Apply + Re-Run-Idempotenz-Test) |
| (kein Slice) | Berater-Help-Review (User direkt, kein Code-Slice) | BL-067 | ~30 min |

2 Slices + 1 Content-Item, ~9 Micro-Tasks, geschaetzt 1-2 Tage Implementation.

Pflicht-Gates fuer V4.4-Implementation:
- Keine Schema-DDL-Aenderung. Wenn BL-069 doch DDL braucht → eskalieren.
- Vor + nach SLC-061: `npm run lint` Output-Snapshot dokumentieren (Errors + Warnings count).
- Vor + nach SLC-062: `audit-umlauts.mjs`-Output dokumentieren (Vorkommnisse-Anzahl).
- Nach Deploy: V4.3-Regression-Smoke (Reader + Help-Sheet + Cross-Search reachable).
- Berater-Review BL-067 kann jederzeit eingeschoben werden.

### Delivery Mode (V4.4)
**SaaS Product** — Maintenance-Release-Cadence wie V3.1 / V4.3.

### Sequencing — V4.4 → V5

V4.4 ist explizit als Pre-V5-Hygiene scopiert. V5 (Walkthrough-Mode) startet nach V4.4-Release, weil:
- Pre-existing Lint-Errors wuerden in V5 mitwachsen — besser jetzt schliessen.
- Demo-Daten-Inkonsistenz waere fuer V5-Stakeholder-Demos sichtbar — besser jetzt korrigieren.
- Berater-Help-Review schaetzungsweise 30min — kein Grund, V5 dafuer zu blocken, kann auch parallel zu V5 laufen.

---

## V5 — Walkthrough-Mode MVP (Capture + Methodik-Schicht) — **Option 2 (2026-05-06)**

Requirements done 2026-05-05 in /requirements V5 mit User-Sign-Off.
**Re-scoped 2026-05-06 in /requirements V5 Option 2** nach USP-Stress-Test (DEC-079 Strategaize-Dev-System) — Berater-Review von Roh-Walkthroughs faellt, Methodik-Schicht aus V5.1 wird vorgezogen.

### Pivot-Begruendung (2026-05-06)

USP-Stress-Test 2026-05-06 ergab: V5 wie urspruenglich geplant ist 4 Slices Plumbing ohne Strategaize-Methodik-Substanz. Berater-Review eines Roh-Videos (`block_review`-Pattern auf MP4) ist kein Differenzierer — das kann jedes Tool. **Der eigentliche Methodik-Hebel** ist die Schicht zwischen Roh-Aufnahme und Berater-Sicht: PII-Redaction, Schritt-Extraktion und Auto-Mapping zu Subtopics. Erst dort entsteht aus Walkthrough-Capture echtes Domain-Know-how. Daher wird die AI-Pipeline aus V5.1 nach V5 vorgezogen, und der Berater sieht in V5 mapped SOPs statt Roh-Videos.

Strategaize-Suite-Konsistenz: Plattform allein ist kein USP — der Methodik-Aufsatz ist es. V5 muss die Methodik-Schicht beweisen, sonst ist sie nur Loom/Tella-Klon mit Berater-Brille.

### Vision

Walkthrough-Mode ist der **fuenfte Capture-Modus** der Plattform (nach Questionnaire, Evidence, Voice, Dialogue). Mitarbeiter zeichnen am eigenen Bildschirm einen Prozess auf, parallel via Mikrofon erklaert. Daraus extrahiert die Plattform **strukturierte SOP-Schritte gemappt zu Subtopics** des Blueprints — der Berater bekommt nicht das Roh-Video, sondern den fertigen Methodik-Output zur Validierung.

V5 Option 2 baut den **vollen Capture → AI-Pipeline → Methodik-Review-Pfad**. V5.1 verbindet die approved SOPs mit dem Unternehmerhandbuch.

### Problem Statement

Bestehende Capture-Modi erfassen Wissen ueber Tipp-Eingabe (Questionnaire), Datei-Upload (Evidence), kurze Sprach-Notizen (Voice) oder strukturierte Gespraeche (Dialogue). Keiner davon eignet sich fuer **prozessuales, am-Bildschirm-passierendes Wissen** — z.B. "Wie lege ich einen Auftrag im CRM an?" oder "Wie exportiere ich Quartalszahlen aus Datev?". Dieses Wissen ist im Kopf der Mitarbeiter und schwer zu verbalisieren ohne den Bildschirm-Kontext.

Zusaetzlich: Wenn die Plattform nur Roh-Aufnahmen erfasst und einem Berater zur Sichtung vorlegt, entsteht kein Methodik-Wert. Der Berater muss den Walkthrough abspielen, mitschreiben, in Schritte zerlegen, manuell zu Subtopics zuordnen — das ist exakt das Hand-Work, das die Plattform automatisieren soll.

### Goal

Mitarbeiter zeichnet mit einem Klick (kein Install) Bildschirm + Mic auf. Die Plattform extrahiert daraus **automatisch redacted SOP-Schritte gemappt zu Subtopics** des aktiven Blueprints. Berater validiert nur noch den Methodik-Output (Schritt-Liste pro Subtopic + Unmapped-Bucket), korrigiert Zuordnungen und gibt frei. Die Roh-Aufnahme bleibt im Storage als Audit-/Re-Processing-Quelle, ist aber kein Berater-Review-Material.

### Primaere Nutzer

- **Mitarbeiter (primaer)** — zeichnen Routine-Prozesse auf, die sie taeglich am Rechner ausfuehren.
- **Berater (review)** — sehen Aufnahmen, kontrollieren auf sensible Daten, geben Approve fuer Veroeffentlichung im Handbuch.
- **Geschaeftsfuehrer (sekundaer)** — koennen ebenfalls Walkthroughs erstellen (z.B. eigene Steuerungsprozesse).

### Tech-Stack-Entscheidung (V5)

**Web-only via `getDisplayMedia` + `getUserMedia`** — kein Browser-Extension, kein Electron, kein Native-Build.

Begruendung:
- **Null Install-Friction**: Mitarbeiter klickt Link, gibt Bildschirm + Mikrofon frei, faengt an. Wie Loom/Tella.
- **Tool-agnostisch**: getDisplayMedia laesst User Browser-Tab, Anwendungsfenster oder Bildschirm waehlen → erfasst Browser- UND Desktop-Tools in einem.
- **Stack-Reuse**: Whisper (Self-hosted, DSGVO) + Bedrock-Claude (eu-central-1) bereits etabliert.
- **Keine OS-spezifischen Build-Pfade**.

Bewusst weggelassen: Klick-Tracking, DOM-Snapshots, Selektor-Erfassung. Erst bei explizitem Kundenwunsch in V6+ (per Browser-Extension) nachreichen.

### V5 Option 2 — In Scope (4 Features)

#### FEAT-034 Walkthrough Capture-Session (unveraendert, SLC-071 code-side done)
- Walkthrough-Capture-UI als neuer Mode in der Capture-Session-Registry (`capture_mode='walkthrough'`, Migration 067)
- MediaRecorder via `getDisplayMedia` (Screen) + `getUserMedia` (Mic), Format WebM/VP9+Opus
- Storage-Bucket `walkthroughs` mit Tenant-RLS, Pfad `<tenant_id>/<session_id>/recording.webm`
- Max-Dauer 30min (Default in V5 SLC-071, override per `?testAutoStopMs=` Param)
- **Status SLC-071: code-side done (Commit ebb3eaf, RPT-169) — Browser-Smoke offen wegen 404-RLS-Pfad-Issue (siehe Q-V5-F)**

#### FEAT-035 Walkthrough Whisper-Transkription (unveraendert)
- Audio-Spur durch Self-hosted Whisper-Container
- Job-Type `walkthrough_transcribe` in ai_jobs
- Transkript in `knowledge_unit` mit `source='walkthrough_transcript'`
- Status-Maschine `uploaded → transcribing → transcribed`

#### FEAT-037 Walkthrough AI-Pipeline (vorgezogen aus V5.1, Scope erweitert um Auto-Mapping)
- **Stufe 1 PII-Redaction-Worker**: Bedrock-Claude (eu-central-1) maskiert Kundennamen, E-Mail, IBAN, Preise, IDs zu Platzhaltern (`[KUNDE]`, `[EMAIL]`, `[BETRAG]`, `[ID]`, `[INTERN]`). Original bleibt unveraendert in DB; Redacted-Version separater knowledge_unit-Eintrag. Pattern-Library unter `src/lib/ai/pii-patterns/`.
- **Stufe 2 Schritt-Extraktion-Worker**: Bedrock-Claude erzeugt SopStep-Liste (number, action, responsible, timeframe, success_criterion, dependencies) + KU-Liste mit `source='walkthrough'`. Pattern-Reuse aus V2 FEAT-012 SOP-Generation.
- **Stufe 3 Auto-Mapping-Worker (NEU in Option 2)**: Bedrock-Claude mappt extrahierte Schritte zu Subtopics des aktiven Templates/Blueprints (Bridge-Engine-Pattern aus FEAT-023 in Reverse-Direction). Output: Mapping-Tabelle `walkthrough_step → subtopic_id` mit Confidence-Score. Schritte ohne klares Match landen im Unmapped-Bucket.
- **Pipeline-Trigger**: Auto-Trigger nach Whisper-Job-Abschluss. Sequenz: PII → Extraktion → Mapping. Status `transcribed → redacting → extracting → mapping → pending_review`.
- **Audit-Log**: Bedrock-Region, Modell-ID, Stufe, Token-Count, Timestamp pro Pipeline-Run.

#### FEAT-040 Walkthrough Methodik-Review-UI (NEU in Option 2 — ersetzt FEAT-036 Roh-Video-Review)
- Cross-Tenant `/admin/walkthroughs` + Pro-Tenant `/admin/tenants/[id]/walkthroughs` + Detail `/admin/walkthroughs/[id]`
- **Methodik-Review-View**: Subtopic-Tree mit zugeordneten extrahierten Schritten + Unmapped-Bucket + Confidence-Score-Anzeige + Move-Between-Subtopics
- **Pflicht-Checkbox** vor Approve: "Ich habe geprueft: keine kundenspezifischen oder sensitiven Inhalte in den extrahierten SOPs sichtbar"
- **Optional Toggle "Roh-Transkript anzeigen"** mit explizitem Audit-Log-Eintrag (Edge-Case-Pruefung). KEIN Toggle "Roh-Video anzeigen" in V5.
- Pattern-Reuse aus V4 FEAT-023 Bridge-Review-UI + V4.1 FEAT-029 block_review.
- RLS-Matrix: strategaize_admin (full), tenant_admin (eigener Tenant), tenant_member (no access), employee (eigene Sessions Status-only)
- Cockpit-Card "Pending Walkthroughs" (analog block_review-Card)

### Cleanup-Cron-Minimum (gemaess DEC-079)
- Coolify-Scheduled-Task `walkthrough-cleanup-daily`
- Rejected → 30d Retention dann delete
- Failed-Pipeline → 7d Retention
- Stale-Transcribing/Extracting/Mapping > 1h → Status `failed` setzen (Recovery)

### V5 Option 2 — Pflicht-Tests
- Vitest-Unit-Tests fuer alle Server-Actions (Create, Upload, AI-Pipeline-Trigger, Approve, Reject, Move-Step)
- Vitest-Integration-Tests fuer RLS (4-Rollen-Matrix × walkthrough_session + walkthrough_step + walkthrough_review_mapping)
- Bedrock-Adapter-Mocking fuer Pipeline-Tests
- Synthetische PII-Test-Suite (≥90% Recall)
- Auto-Mapping-Test-Suite (≥70% der Schritte mit Confidence ≥0.7 zugeordnet auf Test-Walkthroughs)

### V5 Option 2 — Out of Scope (verschoben in V5.1+)

- **FEAT-038 Walkthrough Handbuch-Integration** (V5.1) — approved mapped SOPs flow into Unternehmerhandbuch-Snapshot
- **FEAT-036 Roh-Video-Audit-View** (deferred, kein V5.x-Pinning) — Roh-Video bleibt im Storage, Berater-UI-Pfad nur bei Edge-Case-Bedarf
- Re-Open-Pfad fuer rejected Walkthroughs (V5.x+)
- Reviewer-Markdown-Notes (V5.x+)
- Retry-Mechanik fuer failed-AI-Pipeline (V5.x+ — V5 hat manuellen Re-Trigger via Cron-Recovery)
- Per-Tenant-PII-Pattern-Konfiguration (V5.x+)
- Mehrsprachige Pipeline (DE only fuer V5)
- Diagnose-Layer-Anbindung der Walkthrough-KUs

### V5 Option 2 — Out of Scope (V6+ falls Bedarf)

- Browser-Extension fuer strukturierte Klick-Erfassung
- DOM-Snapshots / Selektor-Wiedergabe
- Native/Electron-App
- Live-Annotation waehrend Aufnahme
- Multi-User-Walkthrough
- Cross-Walkthrough-Konsistenz-Pruefung
- Process-Mining (V7+)
- Video-Level-PII-Redaction (Computer-Vision) — Pre-Production-Compliance-Gate, aufgeschoben

### V5 Option 2 — Constraints

- **Bedrock-Region**: eu-central-1 (DSGVO, etabliert) — Pflicht fuer alle 3 AI-Pipeline-Stufen
- **Whisper**: Self-hosted Container (etabliert seit V2)
- **Storage**: Self-hosted Supabase-Storage mit RLS
- **Internal-Test-Mode** bleibt aktiv — Pre-Production-Compliance-Gate ist aufgeschoben (User-Decision)
- **Browser-Support**: Chrome/Edge/Firefox (alle aktuell `getDisplayMedia` faehig). Safari eingeschraenkt — V5 dokumentiert "Empfohlen Chrome/Edge/Firefox".
- **Bridge-Engine-Pattern-Reuse**: Auto-Mapping muss konsistent zur FEAT-023-Bridge-Adapter-Konvention sein, damit der Reverse-Pfad (Subtopic-Tree → Step-Mapping) keinen Code-Drift einfuehrt.

### V5 Option 2 — Risks

- **R-V5-1 Datei-Groesse pro Session**: 30min WebM/VP9 ~150-300 MB. Bei 100 Sessions/Monat = 15-30 GB Storage-Wachstum. Mitigation: Max-Dauer-Limit + Cleanup-Cron-Lifecycle-Policy.
- **R-V5-2 Browser-Permissions**: Mitarbeiter koennten Bildschirm-Freigabe verweigern oder falsches Fenster waehlen. Mitigation: klare UI-Anleitung + Vorschau vor Aufnahme. **Aktiv in SLC-071 implementiert.**
- **R-V5-3 PII-Redaction-Recall**: Bedrock-Claude koennte sensitive Daten uebersehen. Mitigation: konservative Pattern-Library + Berater-Pflicht-Checkbox als zweiter Filter + Audit-Log fuer "Roh-Transkript anzeigen"-Toggle.
- **R-V5-4 Whisper-Performance**: 30min Audio = ~3-5min Transkription. Mitigation: asynchrone Worker, Status-Polling-UI.
- **R-V5-5 Codec-Inkompatibilitaet**: WebM/VP9 nicht von allen Players. Mitigation: HTML5-video-Element fuer "Roh-Transkript anzeigen"-Edge-Case (kein Pflicht-Pfad in V5).
- **R-V5-6 Capture-Entry-Point-RLS-Pfad** (NEU, aus SLC-071-Browser-Smoke-Versuch 2026-05-06): Aktuell verhindert die capture_session-RLS fuer `employee`-Rolle den Zugriff auf nicht-zugewiesene Sessions. Bei Aufruf einer Walkthrough-Capture-URL fuer eine andere User-Session liefert die Server-Component HTTP 404. Mitigation siehe Q-V5-F — Architektur-Entscheidung (Bridge-Spawn-Pattern vs. RLS-Relaxation vs. Top-Level-Action) erforderlich vor SLC-071-Browser-Smoke + SLC-074 Entry-Point-UI.
- **R-V5-7 Auto-Mapping-Qualitaet**: Bei unstrukturierten Walkthroughs koennten zu viele Schritte im Unmapped-Bucket landen. Mitigation: Confidence-Schwelle in /architecture entscheiden, Berater-Move-UI als Sicherheitsnetz, Test-Suite mit echten Walkthroughs vor V5-Release.
- **R-V5-8 Bedrock-Kosten**: 30min-Walkthrough = ~5k Tokens × 3 Passes (PII + Extraktion + Mapping) × $0.003/1k = ~$0.045/Walkthrough. Bei 100/Monat = $4.50. Bagatelle.
- **R-V5-9 Pipeline-Reliability**: 3-stufige sequentielle Pipeline = drei Failure-Points. Mitigation: Cleanup-Cron mit Stale-Detection (>1h in einer Stufe → `failed`), klare Status-Maschine, Audit-Log pro Stufe.

### V5 Option 2 — Success Criteria

- **SC-V5-1** Mitarbeiter kann von /employee Capture-Session "Walkthrough" auswaehlen, aufzeichnen, beenden, ohne Tooling-Install. **(SLC-071 code-side erfuellt; Browser-Smoke pending RLS-Pfad-Entscheidung Q-V5-F.)**
- **SC-V5-2** Aufnahme + Whisper-Transkript landen sauber im Storage + DB. Whisper-Pipeline < 1.5x Realtime.
- **SC-V5-3** AI-Pipeline (3 Stufen sequentiell) produziert PII-redacted SOP-Schritte gemappt zu Subtopics. Pipeline-Throughput pro Walkthrough < 10min.
- **SC-V5-4** Berater sieht im /admin/walkthroughs Methodik-Review-View: Subtopic-Tree mit zugeordneten Schritten + Unmapped-Bucket. Approve/Reject mit Pflicht-Checkbox. Move-Between-Subtopics funktioniert. **KEIN** Roh-Video-Pfad im Berater-UI.
- **SC-V5-5** RLS-Matrix-Test: 4 Rollen × Operationen (Create/Read/Update-Mapping/Approve) gruen ueber walkthrough_session + walkthrough_step + walkthrough_review_mapping.
- **SC-V5-6** PII-Redaction-Recall ≥90% auf synthetischer Test-Suite.
- **SC-V5-7** Auto-Mapping ordnet ≥70% der Schritte einem Subtopic mit Confidence ≥0.7 zu (Test-Walkthroughs).
- **SC-V5-8** Code-Quality: 0 Lint-Errors, 0 Lint-Warnings, alle Tests gruen, npm audit --omit=dev = 0 Vulns.

### V5 Option 2 — Open Questions (offen fuer /architecture)

#### Aus Original V5-Requirements (RPT-163)
- **Q-V5-A**: Eigene Tabelle `walkthrough_session` oder Erweiterung von `capture_session`? — **partially settled in SLC-071**: walkthrough_session als eigene Tabelle existiert (MIG-031 deployed). Verbleibt: Beziehung zur capture_session.
- **Q-V5-B**: Storage-Format — WebM/VP9 only oder MP4-Transcoding? Vorschlag: WebM/VP9 only fuer V5 (Roh-Aufnahme bleibt im Storage, kein Berater-UI-Player-Pfad noetig).
- **Q-V5-C**: Max-Dauer-Limit — settled in SLC-071: 30min Default.
- **Q-V5-D**: Upload-Strategie — settled in SLC-071: Direct-Upload via signed URL.
- **Q-V5-E**: Audio-Mix — Mic-only oder Screen-Audio + Mic? Empfehlung: Mic-only.

#### NEU aus V5 Option 2 Pivot
- **Q-V5-F (NEU, kritisch)**: Capture-Entry-Point-RLS-Pfad — Bridge-Spawn-Pattern (FEAT-023-Reuse, employee owns spawned walkthrough-session) vs. RLS-Relaxation fuer `capture_mode='walkthrough'` vs. eigene Top-Level-Action ohne capture_session-Bindung. **Entscheidung blockiert SLC-071 Browser-Smoke + SLC-074 Entry-Point-UI.** Empfehlung: Bridge-Spawn-Pattern (konsistent zu V4).
- **Q-V5-G**: Bedrock-Modell fuer alle 3 AI-Stufen — Sonnet (gleich V2/V3) oder Haiku (Kosten-Optimierung)? Empfehlung: Sonnet fuer PII (Praezision) + Extraktion (Strukturierung), Haiku ggf. fuer Mapping (einfachere Klassifikation).
- **Q-V5-H**: PII-Pattern-Granularitaet — fest vorgegeben fuer V5 oder bereits per-Tenant-konfigurierbar? Empfehlung: fest fuer V5, per-Tenant verschoben in V5.x.
- **Q-V5-I**: Storage-Strategie Original- vs. Redacted-Transkript — beide in DB oder Original im Storage + Redacted in DB?
- **Q-V5-J**: Auto-Mapping-Confidence-Schwelle — ab welchem Score landet ein Schritt im Subtopic vs. Unmapped-Bucket? Vorschlag: Default 0.7, in /architecture validieren.
- **Q-V5-K**: Unmapped-Bucket-Datenmodell — separate Tabelle oder NULL-subtopic_id im walkthrough_step?
- **Q-V5-L**: Methodik-Review-UI Move-Pattern — Drag-Drop oder Select-Move? Empfehlung: Select-Move (einfacher zu testen, Tastatur-tauglich).
- **Q-V5-M**: Confidence-Score-Anzeige im Review-UI — numerisch (0.85) oder ampelfarben (gruen/gelb/rot)? Empfehlung: Ampelfarbe.
- **Q-V5-N**: "Roh-Transkript anzeigen"-Toggle Audit-Detail-Tiefe — nur Aktivierung loggen oder pro angezeigtem Snippet?

### Delivery Mode (V5 Option 2)
**SaaS Product** — wie bisherige Releases.

### Slice-Skizze (informativ, finaler Schnitt in /slice-planning)

| Slice | Scope | Status / Schaetzung |
|-------|-------|--------------------|
| SLC-071 | Walkthrough Foundation: MIG-031 + Capture-UI + Direct-Upload | **Code-side done (Commit ebb3eaf, RPT-169) — Browser-Smoke pending Q-V5-F** |
| SLC-072 | Whisper-Worker `walkthrough_transcribe` | ~5 MTs (unveraendert vom Original V5-Plan) |
| SLC-PII | PII-Redaction-Worker + Pattern-Library + synthetische Test-Suite | ~3-4 MTs (NEU, vorgezogen aus V5.1) |
| SLC-EXT | Schritt-Extraktion-Worker + KU-Persistierung | ~4-5 MTs (NEU, vorgezogen aus V5.1) |
| SLC-MAP | Auto-Mapping-Worker (Bridge-Engine-Pattern-Reuse, Reverse-Direction) | ~3-4 MTs (NEU in Option 2) |
| SLC-REV | Methodik-Review-UI (Subtopic-Tree + Unmapped-Bucket + Pflicht-Checkbox + Cockpit-Card) | ~5-6 MTs (NEU in Option 2 — ersetzt SLC-073 Roh-Video-Review) |
| SLC-CLN | Registry-Update + Cleanup-Cron + 4-Rollen-RLS-Matrix + Release-Gate | ~3-4 MTs (NEU, ersetzt SLC-074) |

**Geschaetzt:** 7 Slices, ~24-32 MTs, ~5-6.5 Tage Implementation (gemaess DEC-079).

**Slice-IDs final in /slice-planning** — bestehende SLC-072..074-Specs muessen ueberarbeitet/ersetzt werden.

---

## V5.1 — Walkthrough Handbuch-Integration (geshrinkt nach V5 Option 2)

### Vision

Nach V5 Option 2 sind alle AI-Pipeline-Schichten und der Berater-Review-Workflow bereits live. V5.1 verbindet die approved mapped SOPs mit dem Unternehmerhandbuch-Snapshot — der approved Methodik-Output landet als neuer Section-Typ im Reader.

### V5.1 — In Scope

- **Handbuch-Renderer-Erweiterung** (FEAT-038)
  - Neuer Section-Typ "Walkthroughs" im Unternehmerhandbuch (analog FEAT-026 Section-Architektur)
  - Pro approved Walkthrough: Schritt-Liste in Markdown + Embed-Link zum Roh-Video (Storage-Proxy-Pattern aus V4.1 ISSUE-025 Resolution, signed URL via Server)
  - Section-Position konfigurierbar pro Template (Default: nach SOPs)
- **Snapshot-Integration**
  - Approved walkthrough-Mapping → automatische Aufnahme in den naechsten Handbuch-Snapshot
  - Backwards-Compat: alte V4-Snapshots ohne Walkthroughs-Section weiter generierbar

### V5.1 — Out of Scope

- Video-Streaming-Optimierung (Adaptive Bitrate, HLS) — V5.1 nutzt einfaches HTML5 video mit signed URL
- Walkthrough-Embedding in andere Section-Typen (z.B. inline in SOP)
- Walkthrough-Suche im Reader (V5.x+)
- Subtitle-Tracks aus Whisper-Transkript

### V5.1 — Risks

- **R-V5.1-1 Section-Position-Konflikte**: Mehrere Templates mit unterschiedlichen Section-Reihenfolgen koennen Renderer-Drift erzeugen. Mitigation: Section-Position als Template-Field, Default-Fallback.
- **R-V5.1-2 Embed-Link-RLS**: Roh-Video-URL muss tenant-isoliert bleiben auch im Reader. Mitigation: Storage-Proxy-Pattern aus V4.1 (signed URL mit kurzer Expiry).

### V5.1 — Success Criteria

- **SC-V5.1-1** Approved mapped Walkthrough erscheint im Handbuch-Snapshot unter Section "Walkthroughs".
- **SC-V5.1-2** Schritt-Liste rendert sauber (Markdown) im Reader.
- **SC-V5.1-3** Embed-Link spielt Roh-Video tenant-RLS-geschuetzt ab.
- **SC-V5.1-4** Backwards-Compat: V4-Snapshots ohne Walkthroughs-Section weiter generierbar.

### V5.1 — Open Questions (fuer /architecture V5.1)

- **Q-V5.1-A**: Section-Position default — nach SOPs oder eigener Position?
- **Q-V5.1-B**: Embed-Player — HTML5 video direkt oder iframe-Sandbox?
- **Q-V5.1-C**: Snapshot-Re-Generation bei nachtraeglichem Walkthrough-Approve — sofort oder nur bei naechstem Snapshot-Trigger?

### Slice-Skizze V5.1 (informativ)

| Slice | Scope | Geschaetzt |
|-------|-------|-----------|
| SLC-V51-1 | Handbuch-Renderer-Erweiterung Section-Typ "Walkthroughs" + Snapshot-Integration | ~5-6 MTs |
| SLC-V51-2 | Embed-Link-Storage-Proxy + Reader-Polish + Tests | ~3-4 MTs |

2 Slices, ~8-10 Micro-Tasks, geschaetzt **3-4 Tage Implementation**.

### Sequencing — V5 Option 2 → V5.1

V5 Option 2 muss deployed sein, weil V5.1 die approved mapped SOPs aus walkthrough_review_mapping als Input nutzt. Geplante Reihenfolge:
1. V5 Option 2 → Release als REL-013 → Post-Launch
2. V5.1 → Release als REL-014

## V6.2 — Compliance-Sprint (Pre-Production-Compliance-Gate)

Requirements done 2026-05-15 (RPT-265). Strategische Vorgabe: 4 deferred Compliance-Gate-Items aus V6+V6.1 Internal-Test-Mode-Release-Klausel (`feedback_compliance_gate_later`) muessen vor erstem echten Live-Partner abgeschlossen sein. V6.2 macht die Onboarding-Plattform-Anteile davon released-fest. Anwalts-Review ist explizit User-Pflicht und wird im finalen Schritt eingeholt.

### Problem
Die Onboarding-Plattform laeuft seit V5.1 im Internal-Test-Mode mit aufgeschobenem Compliance-Gate. Mit V6 ist die Plattform multi-tenant und multi-partner — der naechste Schritt ist erster echter Live-Partner-Steuerberater + Mandant-Diagnose, das geht aber nicht ohne (a) AVV-Vertrag zwischen Strategaize und Partner-Kanzlei, (b) DSGVO-konforme Datenschutzerklaerung auf der Plattform-Domain, (c) gesetzliches Impressum, (d) Anwalts-Review der existierenden Consent-Text-Version v1-2026-05 fuer Modal-Pflicht-Checkbox + Lead-Push.

### Goal V6.2
Die Plattform `onboarding.strategaizetransition.com` und das Strategaize-Sales-Toolkit fuer erste Partner sind nach V6.2 release-fest fuer ersten echten Live-Pilot-Steuerberater (vorbehaltlich Anwalts-Review-Pass).

### V6.2 In Scope (3 Features, 3-4 Slices)

- **FEAT-048 Datenschutz + Impressum Pages (DE)**: Oeffentliche Pages unter `/datenschutz` und `/impressum`, statisches Markdown-Render im bestehenden Layout. Strategaize-Default-Branding (kein Partner-Branding, da pre-auth/public). Footer-Links im globalen `StrategaizePoweredFooter` ergaenzen. Verantwortlicher: **Strategaize Transition BV** (NL-Operativ, KvK + Adresse + Vertretungsberechtigter werden vom User als ENV-Vars oder direkt im Page-Content geliefert).
- **FEAT-049 AVV-Template DE + NL (Markdown)**: Standard-Auftragsverarbeitungsvertrag-Vorlage unter `docs/legal/AVV-DE.md` + `docs/legal/AVV-NL.md`. Strategaize als Verantwortlicher fuer Diagnose-Funnel, Partner-Kanzlei als Auftragsverarbeiter (oder umgekehrt — Anwalts-Review klaert finale Rollen-Zuordnung). NICHT als ausfuehrbare Page, sondern Vertragsvorlage zum Versand an Partner-Kanzleien als PDF (PDF-Generierung kommt nach V6.2 falls noetig, V6.2 liefert das Markdown-Template).
- **FEAT-050 `docs/COMPLIANCE.md` Onboarding-Plattform**: Pattern-Reuse aus Business-System V5.2 `docs/COMPLIANCE.md` (8-Sektionen-Standardvorlage). Inhalt komplett neu fuer Multi-Tenant-SaaS-Realitaet: Erhobene personenbezogene Daten pro Tenant-Klasse (direct_client / partner_organization / partner_client / Mitarbeiter), Datenfluesse, Speicherorte (Hetzner Frankfurt + AWS Bedrock eu-central-1 + Azure Whisper EU), Retention-Policies (Walkthrough 30-Tage-Cleanup, Capture-Sessions tenant-lifecycle, lead_push_audit-Trail), Drittanbieter-Liste, DPA-Status, Loeschkonzept, datenschutzkonforme Defaults. Disclaimer "keine Rechtsberatung" prominent.

### V6.2 Out of Scope (explizit)
- **Datenschutz/Impressum in NL/EN**: NL als V6.3-Folge-Slice vor erstem NL-Pilot. EN bei Bedarf spaeter (kein konkretes Q3-Ziel).
- **Cookie-Consent-Banner**: Es existiert KEIN nicht-essentielles Tracking (kein gtag/posthog/plausible/sentry). Der einzige Cookie (`sidebar:state`) ist functional/legitimate-interest. Banner waere uebersteigert und wuerde DSGVO-Performativitaet ohne Substanz erzeugen. Datenschutzerklaerung erklaert den Cookie textuell.
- **AVV-PDF-Generierung**: V6.2 liefert Markdown-Vorlage. PDF-Konvertierung erfolgt fuer V6.2 manuell (Pandoc, Word-Save-As, o.ae.) durch den User pro Partner-Onboarding.
- **AVV in EN**: NL deckt Q4-2026-Pilot-Bedarf, DE deckt DE-Pilot-Bedarf. EN-AVV folgt wenn EN-Partner konkret.
- **Anwalts-Review-Ausfuehrung selbst**: V6.2 bereitet Texte vor. Review durch qualifizierte/n Datenschutzbeauftragte/n ist User-Pflicht und kann V6.2-Release auf "ready-pending-legal-review"-Status blockieren.
- **Partner-Tier-Compliance-Featurization**: Pro-Partner-konfigurierbare Datenschutz-Texte (etwa wenn Partner-Kanzlei eigene DPO hat) kommt frueheste V7.
- **`/settings/compliance`-Admin-Editor** (analog Business-System): Onboarding-Plattform-Compliance ist Strategaize-zentral verwaltet, kein Editor-UI noetig.

### Core Features V6.2

| ID | Feature | Aufwand grob |
|---|---|---|
| FEAT-048 | Datenschutz + Impressum DE Pages | ~0.5-1 Tag (Routes + Layout-Integration + Footer-Links + DE-Text-Draft) |
| FEAT-049 | AVV-Template DE + NL Markdown | ~0.5-1 Tag (Standard-AVV-Klauseln + Plattform-Spezifika-Anpassung) |
| FEAT-050 | docs/COMPLIANCE.md Onboarding | ~0.5-1 Tag (BS-Pattern-Portierung + Onboarding-Spezifika) |

### Constraints V6.2

- **Verantwortlicher = Strategaize Transition BV** (NL-Rechtspersoenlichkeit). KvK-Nummer + Adresse + Vertretungsberechtigter werden vom User als `STRATEGAIZE_LEGAL_*` ENV-Vars konfiguriert ODER direkt im Page-Source als TBD-Platzhalter eingetragen — Klaerung in /architecture.
- **Datenresidenz**: Per `data-residency.md`-Rule und V6-DEC-100 alle Datenverarbeitung in EU (Hetzner Frankfurt + AWS Bedrock eu-central-1 + Azure Whisper EU). Datenschutzerklaerung muss das transparent ausweisen.
- **Texte als pragmatische Standardvorlage**: V6.2 liefert robuste Standardtexte mit Disclaimer "keine Rechtsberatung". Anwalts-Review macht Texte release-fest.
- **Plattform-Domain ist `onboarding.strategaizetransition.com`**: Impressum-Verantwortlicher entspricht Domain-Inhaber (Strategaize Transition BV) — saubere Linie.

### Risks / Assumptions V6.2

- **Anwalts-Review-Outcome unbekannt**: Anwalt kann substanzielle Aenderungen verlangen, die V6.2-Release verschieben. Risiko-Mitigation: V6.2-Release-Marker setzen wir auf "ready-pending-legal-review", echter erster Live-Partner blockiert auf Review-Pass.
- **Annahme: NL-Anwalt fuer NL-AVV verfuegbar**: User-Pflicht, fuer NL-Pilot Q4 2026 muss ein NL-Datenschutzbeauftragter den NL-AVV reviewen. Falls nicht verfuegbar: NL-Pilot verschiebt sich, V6.2-Release fuer DE-Pilot bleibt unbeeinflusst.
- **Risiko: User-Lieferung Impressums-Daten verspaetet**: KvK-Nummer + Adresse + Vertretungsberechtigter werden ENV-Vars. /architecture klaert die Mechanik. V6.2-Implementation kann mit Platzhaltern starten, ENVs werden vor /deploy gesetzt.
- **Annahme: Pattern-Reuse aus Business-System docs/COMPLIANCE.md spart 60-70% Schreibarbeit**, Restzeit fuer Multi-Tenant-Spezifika.

### Success Criteria V6.2

- `/datenschutz` und `/impressum` extern erreichbar (HTTP 200, korrektes DE-Markup, im Footer verlinkt)
- `docs/legal/AVV-DE.md` + `docs/legal/AVV-NL.md` existieren als reviewbare Standard-AVV-Vorlagen
- `docs/COMPLIANCE.md` deckt alle 8 Standardsektionen ab (analog BS V5.2)
- ESLint + TypeScript + Vitest Quality-Gates clean
- /qa + /final-check + /go-live + /deploy als Release-Markers durch
- V6.2 als REL-017 in `RELEASES.md` mit Disclaimer "ready pending legal review"
- User kann nach V6.2 mit dem fertigen Material zum Anwalt gehen

### Open Questions V6.2 (zur Klaerung in /architecture)

1. **ENV-Var-Layout fuer Impressums-Daten**: 1 monolithische `STRATEGAIZE_LEGAL_BLOCK_HTML` oder mehrere granulare ENVs (`STRATEGAIZE_LEGAL_COMPANY`, `STRATEGAIZE_LEGAL_ADDRESS`, `STRATEGAIZE_LEGAL_KVK`, `STRATEGAIZE_LEGAL_VAT`, `STRATEGAIZE_LEGAL_DIRECTOR`)?
2. **Markdown-Render-Pattern**: Reuse aus Handbuch-Reader (V4.1, mdx-Pattern) oder neu mit `react-markdown`/`@next/mdx`? Reuse bevorzugt per `strategaize-pattern-reuse.md`.
3. **Footer-Links**: Nur "Datenschutz" + "Impressum" oder zusaetzlich "AVV-Download" (PDF-Stub) + "Kontakt" (mailto)?
4. **Sprach-Switch fuer /datenschutz und /impressum**: bei nur-DE in V6.2: routes ueber `/datenschutz` (kein `/de/datenschutz`)? Oder direkt next-intl-konform mit Locale-Prefix vorbereiten fuer V6.3-NL-Erweiterung?
5. **AVV-Distribution-Mechanik**: Wo werden die Markdown-Files dem User zugaenglich? Nur `docs/legal/`-Repo-Files? Oder zusaetzlich Admin-Route `/admin/legal/avv-de` fuer Strategaize-Sales mit Inhalt-Anzeige?
6. **DPO-Pflicht-Check**: Strategaize Transition BV — gibt es DSGVO-Pflicht zur Bestellung eines DPO (>20 Mitarbeiter, regelmaessige+systematische Beobachtung, etc.)? Vermutlich nein bei aktueller Org-Groesse, aber Datenschutzerklaerung muss das deklarieren.

### Delivery Mode V6.2

**SaaS**. Multi-Tenant. Vollabdeckung der V6-Multi-Tenant-Realitaet noetig (Partner-Mandant-Beziehung in `docs/COMPLIANCE.md` ausweisen). Pages sind Public-Routes pre-auth ohne Partner-Branding.

---

## V6 — Multiplikator-Foundation (Steuerberater-Partner-Erweiterung)

Requirements done 2026-05-11 (RPT-209). Strategische Vorgabe verbindlich: [/docs/MULTIPLIER_MODEL.md](../../strategaize-dev-system/docs/MULTIPLIER_MODEL.md) im Strategaize-Dev-System (Konzept entschieden 2026-05-07) + STRATEGY_NOTES_2026-05.md Abschnitt 7 + PLATFORM.md.

### Problem
Direkt-Vertrieb an inhabergefuehrte KMU (2-5 Mio EUR Umsatz) braucht 20-30 Cold-Approach-Kontakte pro qualifiziertem Erstgespraech — fuer Solo-Founder mit ~2-3 h/Woche Vertriebskapazitaet strukturell nicht skalierbar. Multiplikator-Strategie ueber Steuerberater (Beziehungs-Anker) liefert qualifizierte Leads + erfuellt NL-Investor-Substanz-Anforderung Q4 2026.

### Goal V6
Pilot-Steuerberater in NRW (cold start) + NL (warmer Kontakt) sind in Q3 2026 produktiv live, haben jeweils 1-3 Mandanten-Diagnosen abgeschlossen, mindestens 1 Lead-Push ans Business-System erfolgreich.

### V6 In Scope
- **Tenant-Hierarchie**: `tenant_kind` (`direct_client | partner_organization | partner_client`) + `parent_partner_tenant_id` an bestehender `tenants`-Tabelle
- **Neue RLS-Rolle `partner_admin`** mit Defense-in-Depth-Policies + 5-Rollen-Pen-Test-Suite
- **Neue Tabellen**: `partner_organization`, `partner_client_mapping`, `partner_branding_config`, `lead_push_consent`, `lead_push_audit`
- **Diagnose-Werkzeug** als neue Template-Variante des bestehenden `questionnaire`-Modes (NICHT neuer Capture-Mode — Discovery-Korrektur per Reuse-Optimierung)
- **Light-Condensation-Pipeline mit Auto-Finalize Option DGN-A**: deterministische Score-Logik aus Template, KI nur fuer kommentierende Verdichtung, KU werden direkt als `status='accepted'` geschrieben
- **Diagnose-Bericht-Renderer** als neue Server-Component-Familie (Reuse Handbuch-Reader Pattern)
- **Partner-Branding minimal**: Logo + 1 Akzentfarbe + Pflicht-Footer „Powered by Strategaize" (nicht entfernbar)
- **CSS-Custom-Properties Setup** (erstmals in der Plattform)
- **Lead-Push opt-in**: DSGVO-Pflicht-Checkbox + outbound HTTP-Adapter an Business-System Lead-Intake-API + Audit-Log mit UTM-Attribution `partner_<tenant_id>`
- **DSGVO-Audit**: `lead_push_consent` mit Consent-Text-Version + IP + User-Agent

### V6 Out of Scope (nach Folge-Version verschoben)
| Out-of-Scope-Item | Begruendung | Verschoben nach |
|---|---|---|
| Modus-B Webinar-Tooling (Anonymitaets-Layer) | MULTIPLIER_MODEL Achse 5: nach 3-6 Monaten Modus-A-Erfahrung | V7 |
| NL-Sprach-Variante Diagnose-Werkzeug | Inhalt + Translations, architektonisch kostenlos | V6.1 |
| Provisions-Modell + Reporting | Achse 3: V1 keine Provision, aber Attribution-Schema heute mitnehmen | V2/V3 |
| Tier-System | Achse 7: V3 (50-100 Partner) | V8+ |
| Reverse-Channel M&A (M&A-Berater als 2. Typ) | Achse 1: V2 2027 | V8+ |
| Whitelabel (volle Marken-Anpassung) | Achse 2 T5: **niemals** | — |
| Domain-Mapping pro Partner | V6 nur Inline-Branding | V7+ |
| Berater-Personal-Mandanten-Zuordnung im Partner-Tenant | V6 nur 1 Owner-User pro Partner | V7+ |
| Diary-Mode (zeitlich verteilte Mobile-Capture) | War vor 2026-04-23 V5, dann V6 — wird verschoben weil Multiplikator strategisch hoeher priorisiert (NL-Investor-Substanz) | V8 |

### V6 Core Features

| ID | Feature | Slice | Zweck |
|----|---------|-------|-------|
| FEAT-041 | Partner-Tenant Foundation + RLS | SLC-101 | Tenant-Hierarchie + partner_admin-Rolle + Pen-Test-Suite |
| FEAT-042 | Partner-Organisation + Onboarding + Dashboard | SLC-102 | Steuerberater wird angelegt, Owner-User eingeladen, sieht eigene Mandanten |
| FEAT-043 | Partner-Client-Mapping + Mandanten-Einladung | SLC-103 | Steuerberater laedt Mandant ein, Mandant wird Client-Tenant + gemapped |
| FEAT-044 | Partner-Branding + CSS-Custom-Properties | SLC-104 | Co-Branding mit Pflicht-Strategaize-Footer |
| FEAT-045 | Diagnose-Werkzeug Template + Pipeline + Renderer | SLC-105 | Mandanten-Self-Service-Diagnose mit Auto-Finalize-Bericht |
| FEAT-046 | Lead-Push opt-in + Webhook + DSGVO-Audit | SLC-106 | Bei „Ich will mehr"-Klick: Lead ans Business-System mit Attribution |

### V6 Success Criteria (siehe RPT-209 fuer Detail)

- SC-V6-1 Pen-Test-Suite mit 5-Rollen-Matrix PASS
- SC-V6-5 Mandant durchlaeuft Diagnose end-to-end ohne menschlichen Eingriff → Bericht automatisch generiert
- SC-V6-6 Bericht enthaelt deterministischen Score aus Template (kein KI-Score) + KI-Verdichtungs-Kommentar
- SC-V6-7 „Ich will mehr"-Klick mit Pflicht-DSGVO-Checkbox → Lead landet im Business-System mit korrektem UTM-Source
- SC-V6-9 Pflicht-Footer „Powered by Strategaize" auf jeder Partner-/Mandanten-Seite, nicht entfernbar
- SC-V6-10 V5.1-Funktionen regression-frei

### V6 Open Questions (vor /architecture V6 zu klaeren)

- **Q-V6-A Auto-Finalize DGN-A vs DGN-B vs DGN-C** — Empfehlung DGN-A, User-Bestaetigung im /architecture
- **Q-V6-B Versions-Re-Numerierung** — Diary nach V8, V7 = Multiplikator-Folgearbeit (Modus-B Webinar etc.)
- **Q-V6-C NL-Sprach-Variante** — Empfehlung V6.1 direkt nach V6
- **Q-V6-D Tenant-Restore-Faehigkeit** — Empfehlung Voll-Restore-Limit fuer V6, Slice fuer V7+

### V6 Pflicht-Vorbereitung (kein Code, parallel zum V6-Bau)

- **BL-V6-PREP-AVV** AVV-Standard-Template DE + NL — Pflicht vor erstem Live-Pilot
- **BL-V6-PREP-INHALT** Inhalts-Workshop Diagnose-Werkzeug — Stop-Gate fuer /backend SLC-105 (15-25 Fragen + Score-Logik + Pflicht-Output-Aussage)
- **BL-V6-GTM-AKQUISE** Achse 9 Multiplikator-Akquise-Pitch — GTM-Frage, kein Skill-Block, parallel zum V6-Bau

### V6 Delivery Mode

Internal-Test-Mode (analog V4.3..V5.1) bis Pre-Production-Compliance-Gate. Erste Pilot-Steuerberater (cold-start NRW + warmer Kontakt NL) sind Teil der Pilot-Phase. **Kein** allgemein-oeffentliches Self-Service-Sign-up. AVV + Opt-in-Mechanik DSGVO-konform, Pre-Production-Compliance-Gate weiter aufgeschoben.

### Detail-Spec

Siehe `/reports/RPT-209.md` fuer vollstaendige V6-Requirements + Feature-Specs unter `/features/FEAT-04X-*.md`.

## V7 — Mandanten-Self-Signup-Backend (Multiplikator-Skalierungs-Hebel)

### Problem Statement (V7)

V6 hat den Multiplikator-Foundation gebaut (Tenant-Hierarchie + Partner-Branding + Diagnose-Werkzeug + Lead-Push) — aber heute kann ein Mandant nur via Partner-Admin-Invite-Pfad auf die Plattform kommen (Push-Model). Jede neue Mandanten-Anmeldung erfordert eine aktive Berater-Initiative: Partner-Admin loggt in `/admin/partners` ein, legt einen Invite an, schickt manuell den Link weiter. Das blockiert Multiplikator-Skalierung mit Solo-Founder-Kapazitaet — 50 Steuerberater-Partner × 10 Mandanten = 500 manuelle Invite-Aktionen.

Die Vision aus MULTIPLIER_MODEL.md ("Strategaize-Diagnose-Werkzeug das der Steuerberater unter seiner Flagge an seine Mandanten weiterreicht", "Self-Service-First, Berater-Loop als angebotene Option") ist heute UI-seitig nicht abgedeckt: Es gibt keine partner-spezifische Landing-Page, keinen anonymen Signup-Pfad, keine Cross-System-API.

V7 baut die **Backend-Aufnahme-Mechanik** dafuer. Die Landing-Page selbst (Pitch-Content, Co-Branding-Render) lebt im Intelligence-Plattform-Repo (`strategaize-intelligence-studio`) — V7-Onboarding-Plattform liefert nur die API, die die Landing-Page aufruft.

### Goal / Intended Outcome (V7)

Partner-Kanzleien koennen Mandanten via Landing-Page-URL (`intelligence.strategaize.com/p/<partner-slug>`) selbst-onboarden lassen. Mandant fuellt das Signup-Formular aus (Email + Name + DSGVO-Consent) → bekommt Bestaetigungs-Mail → Klick auf Verify-Link provisioniert automatisch einen `partner_client`-Tenant unter dem richtigen Partner-Tenant → Mandant landet direkt im Diagnose-Werkzeug (FEAT-045, V6.3 live). Lead-Push (FEAT-046, V6 live) funktioniert nachgelagert unveraendert.

Erwartung: Berater muss nur 1× pro Mandant einen Link schicken (oder gar via Mass-Outreach in seinem CRM), Strategaize uebernimmt den Rest der Aufnahme.

### Target Users (V7)

- **Primaer: Mandant (End-User)** — Selbst-Onboarding via Landing-Page. Erwartet einfachen Signup (Email + Name + Consent) und sofortigen Diagnose-Werkzeug-Einstieg nach Verify-Klick.
- **Indirekt: Partner-Admin** — Bekommt neue Mandanten in seinem Cockpit ohne aktive Invite-Pflicht. Sieht Self-Signup-Eintraege im `partner_client_mapping` mit `invitation_source='self_signup'` (V7-Spalte) als Abgrenzung zu V6 `partner_invite`.
- **Caller: Intelligence-Plattform-API** (externer Service) — Authentifiziert via Service-Key (`x-strategaize-service-key`), reicht Signup-Aufrufe von Browser-Side der Landing-Page durch.
- **strategaize_admin** — Sieht Self-Signup-Statistik in Admin-Sicht (V7 Backend-Daten, Dashboard-Tile als V7.1/V8).

### V7 In Scope

1. **Public-API Endpoint `POST /api/public/signup`** mit Service-Key-Auth via `x-strategaize-service-key` Header. Body: `{ partner_slug, email, first_name, last_name, company_name?, dsgvo_consent_accepted, dsgvo_consent_text_version }`. Response 202 mit `expires_at` oder strukturierter Error-Code. FEAT-051.
2. **Public-Resolve-Endpoint `GET /api/public/partner/:slug`** ohne Auth fuer Landing-Page-Render. Response 200 mit `display_name`, `logo_url`, `accent_color`, `has_active_diagnostic_template`. Light Rate-Limit (60/h/IP). FEAT-052.
3. **Partner-Slug-Mechanik**: Migration 097 fuegt `partner_organization.slug` UNIQUE hinzu + Backfill aller existierenden Partner. Slug-Generator mit Umlaut-Transliteration + Kollisions-Suffix. Reserve-Liste fuer System-Slugs. FEAT-052.
4. **Email-Verify-Mechanik**: Migration 098 legt `pending_signup`-Tabelle an. POST signup erzeugt Row + sendet Verify-Mail (Strategaize-Brand, deutsch, IONOS-DKIM). Klartext-Token NIE persistiert, nur SHA-256-Hash. 24h TTL, hourly Cleanup-Cron. FEAT-053.
5. **Auto-Tenant-Provisioning**: Verify-Endpoint-Klick triggert transactional Anlage `tenant` (kind=`partner_client`) + `auth.users` + `profiles` (mit `first_name`/`last_name` aus Payload) + `partner_client_mapping` (status=`accepted`, source=`self_signup`). Migration 098 erweitert `partner_client_mapping` um `invitation_source` + DSGVO-Consent-Spalten. FEAT-053.
6. **Anti-Abuse V1**: 3 Signups/h/IP, Email-Domain-Block-Liste statisch in ENV, kein Captcha. Service-Key-Compare timing-safe. Audit-Log nur mit Email-Hash + IP-Hash (DSGVO). FEAT-051.
7. **Pen-Test-Suite-Erweiterung**: Neuer Akteur `unauthenticated_public_signup_caller` mit 4 Sub-Varianten (noKey / wrongKey / validKey / rate_limited). Min. 18 Test-Cases gegen Coolify-DB. FEAT-054.
8. **ISSUE-051 Side-Fix**: Auto-Provisioning setzt `profiles.first_name`/`last_name` korrekt → Lead-Push-Payload (FEAT-046) liefert echten Namen statt Email-Local-Part. Existierende V6-Daten bleiben unbetroffen (Backfill optional in V7.1).
9. **F-1 Side-Fix**: 1-Zeilen-Kommentar-Korrektur in `src/app/dashboard/diagnose/actions.ts:242-243` (kein eigener Slice, mitgenommen in FEAT-053-Backend-Touch).

### V7 Out of Scope

- **Landing-Page-UI** — lebt im Intelligence-Plattform-Repo, nicht hier. V7-Onboarding-Plattform liefert nur Backend-API.
- **Multi-Sprach-Variante** der Signup-Mail oder Error-Bodies (V8+, NL-Markt).
- **Partner-konfigurierbarer Pitch-Inhalt** (V7 Strategaize-zentral konfiguriert).
- **Partner-Approve-Workflow** (Mandant signupt → Partner muss freischalten). V7 = auto-accept. V8+ als optionaler Partner-Tier-Feature.
- **Konkurrenz-Schutz** (Steuerberater A linkt auf Landing-Page B). V7 vertraut auf Anti-Abuse-Defaults + Email-Verify.
- **Captcha-Integration** (hCaptcha/Turnstile). V7 ohne — Rate-Limit + Email-Verify reichen fuer Internal-Test-Mode-Risikoprofil. Bei Spam-Welle: V7.1-Followup.
- **DSGVO-Consent-Versionierung** als eigene Tabelle. V7 speichert nur `_version`-String + Timestamp am `partner_client_mapping`. Audit-Tabelle V8+.
- **Self-Signup-Statistik-Dashboard** fuer Partner-Admin. V7 nur Daten in DB. Dashboard-Tile V8+.
- **Webhook-Notification an Partner-Admin** (Mail bei neuem Self-Signup). V8+.
- **Re-Send-Verify-Mail-Button** auf Pending-Page. V7 hat fixed 24h Expiry. V8+ UX-Erweiterung.
- **Subdomain-Mapping pro Partner** (`<slug>.partner.strategaize.de`). V7+ Backlog-Kandidat.
- **Backfill `first_name`/`last_name` fuer V6-Bestands-Mandanten**. V7.1 Optional-Polish — ISSUE-051 betrifft V6-Daten weiter.

### Core Features (V7 — Detail siehe `/features/FEAT-05X-*.md`)

- **FEAT-051** Public-Signup-API + Service-Key-Auth + Rate-Limit
- **FEAT-052** Partner-Slug + Public-Resolve-Endpoint
- **FEAT-053** Self-Signup Email-Verify + Auto-Tenant-Provisioning (inkl. ISSUE-051-Resolution + F-1-Cleanup)
- **FEAT-054** Pen-Test-Suite-Erweiterung Public-Signup-Caller + Anti-Abuse-Verifikation

### Constraints (V7)

- **No new external dependencies** — Reuse vorhandener Libs (rate-limit.ts In-Memory, github-slugger fuer Slug, IONOS-SMTP-Adapter, supabase-server-client).
- **DSGVO-Konformitaet** — Consent-Akzeptanz dokumentiert in `partner_client_mapping` inkl. Versions-String + Timestamp. Audit-Log nur Hash, kein Klartext-PII.
- **EU-Region** — Daten bleiben in Hetzner-DB Frankfurt. Email-Versand via bestehender SMTP-Adapter (IONOS DKIM in V4.2 verifiziert).
- **Cross-System-Sicherheit** — Service-Key wird NUR in Intelligence-Plattform-ENV gespeichert und NIE im Browser exposed (Server-Side-Call-only von IS-API-Route an Onboarding-Plattform). Timing-safe-Compare-Pflicht.
- **Reuse-Pflicht (strategaize-pattern-reuse Rule)** — `partner_organization`-Schema aus Migration 090 bleibt unveraendert (nur Slug-Spalte hinzu), `rate-limit.ts` wird wiederverwendet, V6 Accept-Invitation-Pattern wird als Vorlage adaptiert, V6 SMTP-Adapter wird wiederverwendet. Kein Re-Build existierender Mechaniken.
- **Reihenfolge-Klausel** — V7 darf erst nach V6.3 (Diagnose-Werkzeug live) gehen. V6.3 ist live seit 2026-05-17, V6.4 STABLE bestaetigt 2026-05-18 (RPT-295) → V7-Start ist freigegeben.
- **Internal-Test-Mode bleibt bis Pre-Production-Compliance-Gate (BL-104 Anwalts-Review)** — V7 RELEASED-Marker = Internal-Test-Mode-Release-Marker. Kein echter Public-Live-Pilot vor Anwalts-OK (User-Pflicht extern, parallel zu V7-Code-Arbeit).

### Risks / Assumptions (V7)

#### Risiken
- **Spam-Welle ohne Captcha**: Spammer mit IP-Rotation koennten viele Pending-Tenants erzeugen. Mitigation: 24h TTL + Hourly-Cleanup-Cron + Domain-Block-Liste. Bei realer Welle: V7.1 Captcha-Followup.
- **Email-Verify-Mail wird als Spam markiert**: IONOS-DKIM laeuft seit V4.2, aber Verify-Mail-Volumen kann auffallen. Mitigation: Monitor erste 20 Signups, ggf. Email-Service-Wechsel zu Resend/SES in V8+.
- **Race-Condition Doppel-Klick auf Verify-Link**: Mandant klickt 2x schnell hintereinander → Doppel-Provisioning. Mitigation: DB-Transaction + `pending_signup.status='verified'`-Lock + UNIQUE-Constraint auf `(partner_tenant_id, email_lower)`.
- **Partner-Slug-Kollision bei Backfill**: Zwei Partner mit gleichem `display_name`. Mitigation: Slug-Generator mit `-2`/`-3`-Suffix, Backfill idempotent.
- **Service-Key-Leakage in Intelligence-Plattform-ENV**: Wenn IS-Container kompromittiert ist, kann Angreifer beliebige Signups triggern. Mitigation: Service-Key-Rotation alle 6 Monate (DEC-Eintrag in /architecture), Audit-Log aller Aufrufe.

#### Annahmen
- Intelligence-Plattform-Repo (`strategaize-intelligence-studio`) existiert oder wird parallel aufgesetzt. Landing-Page-UI ist V7-Onboarding-Plattform-Out-of-Scope.
- IONOS-SMTP-Adapter (V4.2 Reminders Reuse) ist einsatzbereit.
- `partner_organization`-Tenant-Beziehung ist via Migration 090 (V6) korrekt aufgesetzt. Self-Signup nutzt nur existierende `parent_partner_tenant_id`-FK.
- V6.3 Diagnose-Werkzeug (FEAT-045) ist live und kann von neuen Mandanten ohne Wizard-Block aufgerufen werden.

### Success Criteria (V7)

- **SC-V7-1**: Simulierter Cross-System-Self-Signup-Flow (POST signup mit gueltigem Service-Key + valider Slug + neuer Email) liefert 202 + Verify-Mail wird gesendet + Verify-Klick provisioniert korrekt `partner_client`-Tenant + tenant_admin-User.
- **SC-V7-2**: Pen-Test-Suite-Erweiterung deckt min. 18 Negativ-Faelle ab (kein Key / falscher Key / unknown Slug / Reserve-Slug / Rate-Limit / Doppel-Email / Validation / Domain-Block / expired Token / Token-Replay / Race-Condition). Alle PASS.
- **SC-V7-3**: Mandant kann unmittelbar nach Verify-Klick + Set-Password den Diagnose-Werkzeug-Flow starten (FEAT-045-Reuse, kein Onboarding-Wizard-Block).
- **SC-V7-4**: Lead-Push-Payload (FEAT-046) enthaelt korrekten `first_name` + `last_name` fuer Self-Signup-Mandanten (ISSUE-051 fuer Self-Signup-Path resolved).
- **SC-V7-5**: Coolify-DB-Smoke nach Deploy: Migration 097 + 098 sauber appliziert (Slug-UNIQUE, pending_signup-Tabelle, partner_client_mapping-Spalten).
- **SC-V7-6**: Live-Smoke gegen Hetzner: rate-limit haelt 4. Signup-Versuch innerhalb 1h ab (429), 25h spaeter wieder durch.
- **SC-V7-7**: Audit-Log enthaelt KEIN Klartext-Email + KEIN Klartext-IP (DSGVO-Datensparsamkeit) — verifiziert via Pen-Test AC.

### Open Questions (V7)

- **Q-V7-A**: Email-Verify-Token-Mechanik — Custom `pending_signup`-Tabelle (Option A, in FEAT-053 vorgeschlagen) oder GoTrue-`generateLink({type:'signup'})`-Reuse (Option C)? Tradeoff: A = volle Kontrolle, keine `auth.users`-Polution bei Spam, mehr Code; C = bestehende GoTrue-Mechanik, weniger Code, aber bei Spam-Welle wachsen `auth.users` ungebremst. Empfehlung Option A. Entscheidung in /architecture V7.
- **Q-V7-B**: Partner-Slug-Backfill — Automatisch fuer existierende Partner (Internal-Test-Mode ~2-3 Partner-Tenants) oder Strategaize-Admin manuell bestaetigen? Empfehlung: Auto-Slug bei Backfill idempotent. Entscheidung in /architecture V7.
- **Q-V7-C**: TTL fuer Pending-Signups — 24h, 48h, oder 7 Tage? Empfehlung: 24h + optionale Reminder-Mail nach 4h. Entscheidung in /architecture mit Cron-Plan.
- **Q-V7-D**: Rate-Limit-Persistenz — In-Memory reicht fuer V7 (1-Container) oder DB-basiert (Multi-Replica-zukunftssicher)? Empfehlung: In-Memory. Entscheidung in /architecture.
- **Q-V7-E**: Verify-Link Domain — `onboarding.strategaizetransition.com/auth/verify-signup?token=...` oder partner-spezifische Subdomain? Empfehlung: Strategaize-zentral (Partner-Co-Branding erst nach Login sichtbar). Entscheidung in /architecture.
- **Q-V7-F**: Email-Sender-Adresse — `noreply@strategaize.de`, `onboarding@strategaize.de`, oder reply-to: partner_contact_email? Empfehlung: `onboarding@strategaize.de` als From + `reply-to: <partner_contact_email>` als Co-Branding-Hint. Entscheidung in /architecture.
- **Q-V7-G**: Idempotenz bei doppeltem Signup mit gleicher Email + gleichem Partner (Pending oder schon verifiziert) — strikter 409 oder idempotenter 202 (Re-Send-Mail)? Tradeoff: 409 = klare Semantik, kein Re-Send fuer vergessene Mail; 202-Idempotent = freundlicher, aber Spam-Vektor. Empfehlung: 409 mit User-friendly-Error "Bitte Inbox pruefen oder in 24h erneut versuchen". Entscheidung in /architecture.

### Delivery Mode (V7)

**SaaS Product** (konsistent V6/V6.1/V6.2/V6.3/V6.4). Stronger QA + TDD-mandatory fuer Business-Logic (Auto-Provisioning-Transaktion, Service-Key-Auth, Rate-Limit, Token-Hash-Compare). Pen-Test-Suite-Erweiterung Pflicht. Internal-Test-Mode bis Pre-Production-Compliance-Gate (BL-104 Anwalts-Review extern).

### Slice-Skizze (informativ, finaler Schnitt in /slice-planning)

- **SLC-131** Migration 097 + Slug-Generator + Public-Resolve-Endpoint (FEAT-052) ~1d
- **SLC-132** Migration 098 + Public-Signup-API + Service-Key-Auth + Rate-Limit (FEAT-051) ~1.5d
- **SLC-133** Verify-Endpoint + Auto-Tenant-Provisioning + Email-Template + ISSUE-051 Fix + F-1 Fix (FEAT-053) ~2d
- **SLC-134** Pen-Test-Suite-Erweiterung + Coolify-Test-Setup (FEAT-054) ~1d
- **SLC-135** TTL-Cleanup-Cron + Final-Hardening + Live-Smoke (FEAT-053 Operational) ~0.5d

Geschaetzt ~3-5 Code-Side-Tage + Pen-Test-Lauf + Live-Smoke + /post-launch. Architecture-Open-Questions Q-V7-A..G in /architecture V7 entscheiden.

### Detail-Spec

Siehe `/reports/RPT-296.md` fuer V7-Requirements-Completion-Report + Feature-Specs unter `/features/FEAT-05X-*.md`.

## V7.1 — Inline-Text-Override-Foundation + Funnel-Polish + Telemetrie

### Problem Statement (V7.1)

Der SLC-700-Live-Test am 2026-05-20 (Cross-System V-Cross-System-V7) hat den End-to-End-Self-Signup-Funnel erfolgreich verifiziert — aber gleichzeitig fuenf konkrete User-Facing-Schwaechen freigelegt:

1. **Text-Hardcode-Problem**: Saemtliche User-sichtbaren Strings im Diagnose-Funnel (24 Frage-Texte, 6 Block-Titel, Bericht-Layout-Strings, Email-Bodies, Pflicht-Output-Aussage, CTA-Captions, Empty-States) liegen entweder in `template.blocks[]`-Migrations (A+B), im React-Code (D+F), im Email-Adapter (E) oder im KI-System-Prompt (H). Jede Aenderung erfordert Migration oder Code-Deploy. Solo-Founder + Partner-Kanzleien koennen Standardtexte NICHT iterativ verfeinern, ohne den Entwicklungsprozess zu blockieren.
2. **One-Size-Fits-All scheitert**: Verschiedene Steuerberater-Partner haben verschiedene Mandantenkreise (Mittelstand vs. KMU, Branchen-Schwerpunkt, Sprachton). Wenn ein Partner eine Frage als "fuer meine Mandanten zu abstrakt" markiert, gibt es heute keinen Per-Partner-Override-Mechanismus.
3. **Hilfetexte fehlen**: Fragen mit Strategie-Fachbegriffen (z.B. "Wieviele kritische Wissensbereiche gibt es in Ihrer Firma?") koennen Mandanten ohne Berater-Hintergrund nicht beantworten — Conversion-Killer.
4. **Funnel-Telemetrie fehlt**: Es gibt heute keine Daten ueber Drop-off pro Frage, Hilfetext-Klicks, Time-on-Question. Ohne diese Signale ist keine systematische Funnel-Optimierung moeglich (Learning-Loop).
5. **Polish-Defizite**: Look-and-Feel des Diagnose-Funnels ist Internal-Tool-Style (nicht Marketing-Layer-konform), Bericht kann nur via Browser-Print-Dialog als PDF gespeichert werden (kein Email-Versand-Pfad), und auf `/datenschutz` + `/impressum` fehlen Back-Links.

### Goal / Intended Outcome (V7.1)

Strategaize + Partner-Kanzleien koennen alle User-sichtbaren Texte des Diagnose-Funnels **inline editieren** (kleines Pencil-Icon im Render-Tree), mit drei Override-Stufen (global → template → partner). Strategaize iteriert Standardtexte zentral, Partner passen pro Mandantenkreis an. Edit-Aktionen werden audited. Funnel-Telemetrie erfasst Drop-off, Helper-Text-Hits, Time-on-Question — Grundlage fuer datengetriebene Conversion-Optimierung. Hilfetexte mit Beispieldefinitionen machen Fach-Begriffe verstaendlich. Bericht kann per Email an Mandant + Partner verschickt werden. Look-and-Feel folgt Strategaize Style Guide V2.

Erwartung nach V7.1: Solo-Founder muss keinen Code-Deploy mehr ausloesen, um Standardtexte zu iterieren. Partner kann eigene Anpassungen vornehmen ohne Coding-Skills. Erste Conversion-Optimierungs-Hypothesen (Frage X umformulieren, Helper-Text Y erweitern) koennen evidence-based getestet werden.

### Target Users (V7.1)

- **strategaize_admin** — Pflegt Standardtexte (Global-Default-Scope). Sieht zentrale Override-Uebersicht "Welche Texte wurden von welchem Partner ueberschrieben?" und kann Per-Partner-Overrides reviewen. Sieht globale Funnel-Telemetrie (alle Partner aggregiert).
- **partner_admin** — Editiert Per-Partner-Overrides fuer eigenen Mandantenkreis. Sieht Telemetrie der eigenen Mandanten (nicht anderer Partner). Sieht "Standard / Eigener Override" Toggle pro Text.
- **Mandant (End-User)** — Profitiert von verstaendlicheren Fragen (Helper-Texts), professionellerem Look-and-Feel, Email-Versand des Berichts. Sieht KEINE Edit-Icons.
- **partner_employee** — Wie partner_admin, aber Read-Only fuer Texte (keine Edit-Berechtigung in V7.1; spaeter konfigurierbar).

### V7.1 In Scope

1. **FEAT-055 Inline-Text-Override-Foundation** — `text_override`-Tabelle mit `(scope, scope_id, text_key, text_value, locale, updated_by, updated_at, audit_log)`. Drei Scope-Werte: `global`, `template`, `partner`. Hierarchischer `text_key` (z.B. `template.partner_diagnostic.block.wissensmanagement.question.q1.label` oder `diagnose.bericht.cta.ich_will_mehr`). Resolver `resolveText(key, partnerOrgId, locale)` mit O(1)-Map-Cache (Pre-Load aller Overrides bei Server-Render). Audit-Log-Tabelle `text_override_history` mit jedem Edit-Diff (alter Wert + neuer Wert + Editor + Timestamp). RLS: `strategaize_admin` darf global+template+alle-partner, `partner_admin` darf nur eigene partner_organization. Reset-Funktion "auf Standard zuruecksetzen" loescht Override-Row (Default kommt automatisch wieder).
2. **FEAT-056 EditableText-React-Komponente + Text-Migration** — `<EditableText keyPath="..." defaultText="..." scope="..." multiline?={true} />`. Rendert Default-Text + (bei `strategaize_admin`/`partner_admin`) ein kleines Pencil-Icon. Klick oeffnet Inline-Editor (Modal fuer mehrzeilig, Inline-Textarea fuer einzeilig). Save schreibt via Server-Action in `text_override`. Migration aller bestehenden Hardcodes auf EditableText: A (Template-Frage-Texte, Block-Titel, Closing-Statement — bleiben in Migration als Defaults, EditableText laedt sie via Resolver), D (Bericht-Page-Strings: Page-Title, Score-Labels, CTA, Print-Button), E (Email-Templates: Verify-Mail, Reminder-Mail, Invitation-Mail — Subject + Body), F (relevante i18n-Strings im Diagnose-Funnel-Pfad). Coverage-Ziel: ~50-80 Text-Keys. **H (KI-System-Prompt) bleibt out-of-scope** (wird nicht von Partner editiert, technisch sensibel).
3. **FEAT-057 Helper-Texts pro Frage (BL-115)** — Schema-Erweiterung `template.blocks[].questions[].helper_text` + `.examples_md` JSONB-Felder. Info-Icon neben Frage-Label, Klick zeigt Modal mit Definition (helper_text) + 2-3 konkreten Branchen-Beispielen (examples_md, Markdown). Initial-Content fuer alle 24 Fragen des `partner_diagnostic v1`-Templates via Migration-Seed. Helper-Texts sind ueber FEAT-055 editierbar. Cross-Repo-Schema-Sync mit IS V3 Questionnaire Builder (DEC-063 dort) — identische JSONB-Feld-Form, damit IS V3 Builder-Output direkt in OP-Light-Pipeline rendert.
4. **FEAT-058 Diagnose-Funnel-Telemetrie (BL-117)** — Neue Tabelle `diagnose_event` mit `(capture_session_id, tenant_id, event_type, question_key, payload_json, created_at)`. Event-Types: `question_start`, `question_answer`, `question_skip`, `helper_text_open`, `session_paused`, `session_resumed`, `session_abandoned`. Client-Side-Tracker-Lib `src/lib/telemetry/diagnose.ts` mit Browser-Heartbeat (5s-Intervall, beforeunload-Flush). Admin-Analytics-Page `/admin/diagnose-funnel-analytics` zeigt: Drop-off-Prozent pro Frage, Helper-Text-Klick-Rate pro Frage, Median-Time-on-Question. Scope-Filter (alle / pro Partner). DSGVO: Event-Daten anonymisiert (kein Klartext-PII), Aggregation NIE auf Einzel-Mandanten-Ebene exponiert. Strategaize sieht alle, Partner-Admin nur eigene.
5. **FEAT-059 Look-and-Feel-Polish (BL-114)** — Diagnose-Start-Screen + 24-Fragen-Pages + Bericht-Page nach Strategaize Style Guide V2 (Typografie-Hierarchie, Spacing, mehrfarbige Section-Cards-Pattern aus IS-SLC-115, QuickActionRing-Pattern fuer Bericht-Aktionen, Empty-/Error-States). Pre-Condition: FEAT-056 EditableText-Migration durch (sonst Doppelarbeit beim Re-Styling). Page-Level-Visual-Reference-Checklist aus IS-SLC-114-Lehre (siehe `feedback_look_alignment_needs_page_level_scope.md`).
6. **FEAT-060 Bericht-Email mit PDF-Attachment (BL-116)** — Server-Action `sendDiagnoseReportByEmail` nach Bericht-Generierung. Empfaenger-Auswahl: (a) Mandant selbst, (b) Partner-Steuerberater (cc), (c) zusaetzliche Email-Adresse. PDF via `@react-pdf/renderer` server-side gerendert (kein puppeteer — kein Headless-Chrome-Overhead). IONOS-SMTP-Adapter-Reuse aus V4.2. Bestehender Print-CSS bleibt als Browser-Fallback. Email-Subject + Body via FEAT-055 editierbar.
7. **FEAT-061 Back-Link auf /datenschutz + /impressum (BL-113)** — Header-Back-Link "Zurueck" oben links auf beiden Pages. Routes nutzen `document.referrer` mit Fallback `/dashboard`. Quick-Win ~15-30min.

### V7.1 Out of Scope

- **KI-System-Prompt-Edit** (H) — `buildLightPipelinePrompt` in `light-pipeline.ts` bleibt Code. Aenderung erfordert weiter Code-Deploy. Begruendung: Prompt-Engineering ist sensibel, Versions-Kontrolle via Git wichtiger als Live-Edit.
- **Mehrsprachige Overrides** (locale ungleich `de`) — V7.1 nur Deutsch. `locale`-Spalte ist im Schema vorgesehen, aber UI exposed nur `de`. Multi-Sprach-UI ist V8+ (NL-Markt-Vorbereitung).
- **Edit-of-Texts fuer partner_employee** — V7.1 nur `strategaize_admin` + `partner_admin`. Employee-Edit-Berechtigung kommt als optionale Erweiterung V8+.
- **Diff-View "Standard vs. Override"** in UI — V7.1 zeigt nur aktuellen Wert + "Auf Standard zuruecksetzen"-Button. Side-by-Side-Diff ist Polish V7.2+.
- **Bulk-Edit-Mode** (mehrere Text-Keys gleichzeitig editieren) — V7.1 nur Single-Key-Edit pro Klick. Bulk-Edit ist V8+.
- **Telemetrie-Export als CSV/Excel** — V7.1 nur In-App-Analytics-Page. Export ist V8+.
- **Telemetrie pro einzelnen Mandant exponieren** — DSGVO-Risiko, V7.1 nur aggregierte Sicht ab 5 Sessions pro Daten-Cluster. Single-Mandant-Drilldown bleibt V8+ mit Consent-Mechanik.
- **PDF-Branding pro Partner** (Logo, Brief-Vorlage) — V7.1 nur Strategaize-Standard-PDF. Per-Partner-Branding ist V7.2+ Polish.
- **Reminder-Mail "Bericht wartet auf Versand"** — V7.1 nur Manual-Trigger durch Mandant. Auto-Reminder V8+.
- **Conversion-A/B-Test-Mechanik** — V7.1 misst nur. A/B-Variants pro Frage sind IS V3.1 (BL-088 dort) + spaeter OP-Side. Cross-Repo-Bruecke vorgesehen, aber nicht V7.1-Scope.
- **i18n-File Komplett-Migration** — V7.1 migriert nur Diagnose-Funnel-Pfad-Strings auf EditableText. Sidebar, Auth-Pages, Admin-Pages bleiben i18n-File-basiert.
- **Diary-Mode** — bleibt V8.

### Core Features (V7.1 — Detail siehe `/features/FEAT-05X-*.md`)

- **FEAT-055** Inline-Text-Override-Foundation (Tabelle + Resolver + Audit + RLS)
- **FEAT-056** EditableText-React-Komponente + Text-Migration A/D/E/F (~50-80 Keys)
- **FEAT-057** Helper-Texts pro Frage (Schema + Initial-Content + Cross-Repo-Sync IS V3)
- **FEAT-058** Diagnose-Funnel-Telemetrie (diagnose_event + Tracker + Analytics-Page)
- **FEAT-059** Look-and-Feel-Polish nach Style Guide V2 (Start + Run + Bericht)
- **FEAT-060** Bericht-Email mit PDF-Attachment (@react-pdf/renderer)
- **FEAT-061** Back-Link auf /datenschutz + /impressum

### Constraints (V7.1)

- **Kein riesiges Template-System** (User-Direktive 2026-05-20): Eine generische `text_override`-Tabelle + Resolver + Inline-Edit-Komponente. KEINE 5 verschiedenen Edit-UIs pro Text-Klasse, KEINE Page-Builder-Komplexitaet, KEINE Custom-CMS-Workflows.
- **EditableText als Foundation-Pflicht**: BL-114 (Look-Polish) darf erst NACH FEAT-056-Migration laufen (sonst Doppelarbeit beim Re-Styling). Slice-Reihenfolge SLC-136 → SLC-137 → ... ist BLOCKING.
- **No new external dependencies** mit Ausnahme `@react-pdf/renderer` (FEAT-060). Edit-Layer ohne externe Bibliotheken (kein react-quill / draft.js / lexical fuer V7.1 — Plain-Text + Markdown reicht).
- **DSGVO-Konformitaet Telemetrie**: Event-Daten ohne Klartext-PII. Aggregation NIE unter 5 Sessions pro Daten-Cluster exponieren. Mandant-spezifischer Drilldown NICHT in V7.1.
- **Cross-Repo-Schema-Sync mit IS V3** (FEAT-057): `template.blocks[].questions[].helper_text + .examples_md` JSONB-Felder MUESSEN identisch geschnitten sein wie IS V3 Questionnaire-Builder-Output (DEC-063 IS-Repo). Schema-Aenderungen abgestimmt.
- **Reuse-Pflicht (strategaize-pattern-reuse Rule)**: IONOS-SMTP-Adapter aus V4.2 (FEAT-060), partner_organization-Schema aus Migration 090 unveraendert, RLS-Pattern aus V6 reusen, rate-limit.ts wiederverwenden falls Edit-Endpoints rate-limited werden muessen.
- **Audit-Pflicht**: Jeder Edit-Schritt (EditableText.save, Per-Partner-Override-Anlage, Reset-auf-Standard) wird in `text_override_history` festgehalten. DSGVO-Auskunftspflicht-relevant.
- **Performance-Budget**: Resolver-Pre-Load aller Overrides bei Server-Render muss unter 50ms bleiben (50-80 Keys mal 2-3 Scopes = ca. 200 Rows max in V7.1). Wenn das groesser wird, Cache-Refresh on-write.
- **Locale-Forward-Compat**: `text_override.locale` ist Schema-Pflicht (Default `de`), auch wenn V7.1-UI nur Deutsch exponiert. V8+ NL-Variante baut additiv darauf auf.

### Risks / Assumptions (V7.1)

#### Risiken

- **Edit-Foundation-Bloat**: User-Direktive ist "kein riesiges Template-System", aber Inline-Edit ueberall + Audit + Reset + Override-Liste-Page koennten heimlich wachsen. Mitigation: harter SLC-136-Schnitt mit klar definiertem Komponenten-Set (text_override-Tabelle, Resolver, EditableText-Komponente, save-Action, Admin-Liste-Page, History-Tabelle, Reset). Nicht mehr.
- **Text-Key-Schema-Drift**: 50-80 Keys haendisch zuteilen ist fehleranfaellig. Eine vergessene Migration laesst Hardcode zurueck, EditableText-Wrapping ist inkonsistent. Mitigation: SLC-137 startet mit Grep-Audit ueber alle User-facing-Strings im Diagnose-Funnel-Pfad, dann systematisches Mapping `<old-string> -> <key-path>`.
- **Performance-Regression bei Server-Render**: Resolver-Pre-Load fuer jeden Render-Pfad ist potenziell ein N+1-Query-Risiko. Mitigation: Single-Query SELECT pro Partner-Render, Map-Cache pro Request-Context, ggf. React-Context-Provider.
- **Telemetrie-Drop-off-False-Positives**: User schliesst Tab ungleich User bricht ab. Mitigation: `session_paused` (Tab-Switch via visibilitychange) vs. `session_abandoned` (no-event-fuer-30min) explizit unterscheiden. Doku in Analytics-Page-Header.
- **Cross-Repo-Sync-Bruch IS V3**: Wenn IS V3 helper_text-Schema anders schneidet als OP V7.1, ist Builder-Output nicht renderbar. Mitigation: Schema-Sync vor SLC-138-Start explizit cross-checken (Memory-Update + DEC-Eintrag in beiden Repos).
- **PDF-Engine-Limitationen**: `@react-pdf/renderer` rendert nicht alle Tailwind-Klassen. Mitigation: PDF nutzt eigenen Stil-Pfad, KEIN 1:1-Browser-Render. Akzeptierter Tradeoff (PDF ungleich HTML-Print).
- **Telemetrie-Test-Pollution**: SLC-700-Live-Test produziert Test-Events. Mitigation: `diagnose_event.tenant_id` Filter in Analytics-Query auf nicht-Test-Tenants beschraenkt; alternativ `is_test`-Flag pro Event.

#### Annahmen

- IONOS-SMTP-Adapter aus V4.2 ist weiter einsatzbereit (Verify-Mail-Versand in V7-Live-Smoke verifiziert).
- `partner_organization`-Tenant-Hierarchie aus V6 Migration 090 ist stabil.
- IS V3 Questionnaire Builder (DEC-063) implementiert `helper_text + examples_md` als JSONB im Builder-Output — Schema wird in /architecture V7.1 finalisiert.
- Strategaize Style Guide V2 ist aktuelle Quelle der Wahrheit fuer Look-and-Feel (Memory `feedback_style_guide_v2_mandatory.md` + `feedback_v2_sidebar_pflicht.md`).
- Solo-Founder-Kapazitaet erlaubt 6-8 zusammenhaengende Code-Side-Tage fuer V7.1.

### Success Criteria (V7.1)

- **SC-V7.1-1**: `text_override`-Tabelle live appliziert. Insert via Server-Action funktioniert fuer alle drei Scopes (global/template/partner). RLS verbietet partner_admin den Zugriff auf andere partner_organization-IDs (Pen-Test-Case).
- **SC-V7.1-2**: `<EditableText keyPath="..." defaultText="..." />` rendert Default ohne Override-Row, rendert Override wenn vorhanden. Pencil-Icon nur fuer `strategaize_admin` + `partner_admin`-Rollen sichtbar. Klick oeffnet Editor, Save schreibt Override, neuer Render zeigt neuen Text.
- **SC-V7.1-3**: Mindestens 50 Text-Keys im Diagnose-Funnel sind auf EditableText migriert. Grep-Audit `EditableText` mindestens 50 Treffer, Grep-Audit "hardcoded Strings im Diagnose-Pfad" liefert 0 Treffer (mit dokumentierten Ausnahmen).
- **SC-V7.1-4**: `partner_diagnostic v1`-Template hat 24 Fragen mit `helper_text + examples_md` Initial-Content. Frontend rendert Info-Icon, Klick zeigt Modal. Helper-Text-Edit via EditableText funktioniert.
- **SC-V7.1-5**: `diagnose_event`-Tabelle live. Browser-Tracker emittiert mindestens 5 Event-Types in einem End-to-End-Test-Run (question_start, question_answer, helper_text_open, session_paused, session_abandoned). Analytics-Page `/admin/diagnose-funnel-analytics` zeigt Drop-off-Prozent pro Frage fuer mindestens 10 Test-Runs.
- **SC-V7.1-6**: Style-Guide-V2-Konformitaet auf Start + Run + Bericht-Pages verifiziert via Page-Level-Visual-Reference-Checklist. Mindestens 5 Sub-Checks (Spacing, Typography, Section-Cards, QuickActionRing, Empty-States) PASS.
- **SC-V7.1-7**: Server-Action `sendDiagnoseReportByEmail` schickt PDF an Mandant + Partner-Steuerberater. PDF-Attachment ist valide (pdftk-validate o.ae.). IONOS-SMTP-Delivery verifiziert.
- **SC-V7.1-8**: Back-Link auf `/datenschutz` + `/impressum` funktioniert, Fallback `/dashboard` bei fehlendem Referrer.
- **SC-V7.1-9**: Cross-Repo-Schema-Sync mit IS V3 verifiziert via Schema-Compare-Skript oder manueller Cross-Check (helper_text + examples_md identisch in beiden Repos).
- **SC-V7.1-10**: Audit-Log `text_override_history` enthaelt Eintrag fuer jeden Edit-Schritt mit `(text_key, old_value, new_value, editor_id, editor_role, created_at)`.

### Open Questions (V7.1)

- **Q-V7.1-A**: Edit-Modal vs. Inline-Editor — Modal fuer alle Edits (konsistente UX, breakable Layout-Probleme), Inline-Textarea fuer einzeilig + Modal fuer mehrzeilig, oder rein Inline mit Auto-Resize? Empfehlung: Hybrid (Inline fuer bis 80 Zeichen, Modal sonst). Entscheidung in /architecture.
- **Q-V7.1-B**: Markdown-Support in Text-Werten — Plain-Text only, Markdown rendered via remark@15, oder limitierte Markdown-Subset (bold, italic, links)? Empfehlung: limitierte Markdown-Subset, da Helper-Texts + Email-Bodies Markdown wollen, andere Texte Plain. Entscheidung in /architecture.
- **Q-V7.1-C**: Override-Cache-Invalidation — Pro-Request-Refresh (einfach, ggf. langsam), DB-Trigger-Notify (komplex, schnell), Manual-Cache-Bust nach Save (mittel)? Empfehlung: Manual-Cache-Bust nach Save + Cache-TTL 60s als Fallback. Entscheidung in /architecture.
- **Q-V7.1-D**: Text-Key-Namespace-Konvention — Punkt-separiert (`template.partner_diagnostic.block.q1.label`), Slash-separiert (`template/partner_diagnostic/block/q1/label`), oder UUID-basiert? Empfehlung: Punkt-separiert mit fester Hierarchie-Konvention dokumentiert in /architecture.
- **Q-V7.1-E**: Telemetrie-Sampling — Alle Events erfassen (Datenvolumen-Risiko) oder Sample bei hoher Frequenz (z.B. `question_start` 100%, `heartbeat` 10%)? Empfehlung: 100% in V7.1 (Daten-Volumen klein, max 24 Fragen mal ca. 10s Time-on-Question-Heartbeat mal N Mandanten), Sampling V8+. Entscheidung in /architecture.
- **Q-V7.1-F**: PDF-Engine-Choice — `@react-pdf/renderer` (React-API, ohne Headless-Chrome) oder `puppeteer` (HTML-Print exakt, viel mehr Setup)? Empfehlung: `@react-pdf/renderer`, akzeptiert eigenen Stil-Pfad. Entscheidung in /architecture.
- **Q-V7.1-G**: Edit-Audience-Default — `strategaize_admin` und `partner_admin` beide editierbar (Empfehlung) oder erst nur `strategaize_admin` und Per-Partner-Override in V7.2? Tradeoff: weniger RBAC-Komplexitaet vs. weniger Partner-Selbstaendigkeit. Empfehlung: beide editierbar, RBAC ist in V6 schon stabil. Entscheidung in /architecture.
- **Q-V7.1-H**: Cross-Repo-Schema-Sync-Mechanik — Manual Cross-Check vor Schema-Migration (einfach, fehleranfaellig), gemeinsames Schema-Repo (Overhead), oder gespiegelter Schema-File mit md5-Hash-Check im CI? Empfehlung: Manual Cross-Check + DEC-Eintrag in beiden Repos in /architecture-Phase. Entscheidung in /architecture.

### Delivery Mode (V7.1)

**SaaS Product** (konsistent V6.x/V7). Stronger QA + TDD-mandatory fuer Edit-Foundation (Resolver-Logik, RLS-Pen-Test, Text-Key-Resolution), Telemetrie-Schema, Audit-Log-Korrektheit. Pen-Test-Suite-Erweiterung fuer Edit-Endpoints (partner_admin darf nicht andere partner_organization editieren). Internal-Test-Mode bleibt bis Pre-Production-Compliance-Gate (BL-104 Anwalts-Review extern, parallel).

### Slice-Skizze (informativ, finaler Schnitt in /slice-planning)

- **SLC-136** FEAT-055 Edit-Foundation: Migration `text_override` + `text_override_history` Tabellen, RLS, Resolver-Lib, Save-Server-Action, Reset-Funktion ~12-18h
- **SLC-137** FEAT-056 EditableText-Komponente + Text-Migration: React-Komponente, Pencil-Icon-Render, Inline-Editor, ~50-80 Hardcode auf EditableText Coverage ~4-8h
- **SLC-138** FEAT-057 Helper-Texts: Schema-Erweiterung template.blocks[].questions[].helper_text + .examples_md, Initial-Content via Migration fuer 24 Fragen, Info-Icon-UI, Cross-Repo-Schema-Sync mit IS V3 ~6-10h Code + ~3-6h Inhalt
- **SLC-139** FEAT-058 Telemetrie: diagnose_event-Tabelle, Tracker-Lib mit Browser-Heartbeat, Analytics-Page mit Drop-off + Helper-Hits + Time-on-Question ~6-10h
- **SLC-140** FEAT-059 Look-and-Feel-Polish: Style Guide V2 Anwendung auf Start + Run + Bericht-Pages, Page-Level-Visual-Reference-Checklist ~4-8h
- **SLC-141** FEAT-060 Bericht-Email mit PDF: Server-Action, @react-pdf/renderer-Setup, IONOS-SMTP-Reuse, Empfaenger-Auswahl-UI ~4-6h
- **SLC-142** FEAT-061 Back-Link Quick-Win: Header-Component auf /datenschutz + /impressum ~15-30min

Geschaetzt ~36-60h Code-Side + ~3-6h Helper-Texts-Inhalt + Pen-Test-Erweiterung + Live-Smoke + /post-launch. Reihenfolge SLC-136 -> SLC-137 -> SLC-138 -> SLC-139 -> SLC-140 -> SLC-141 -> SLC-142 ist BLOCKING (Foundation zuerst, Look nach Migration).

### Detail-Spec

V7.1-Requirements-Completion-Report wird in dieser Session erstellt + Feature-Specs unter `/features/FEAT-055-*.md` ... `/features/FEAT-061-*.md`.

## V7.4 — App-Shell Touch-Target + Auth-Pages-Polish (1-Slice-Iteration)

### Problem Statement
Aus dem V7.3 Live-Smoke (RPT-337) wurde empirisch belegt, dass alle Mobile-Touch-Target-Violations (<44px) **App-Shell-Pattern** sind, nicht Diagnose-Funnel-Scope: 3 Footer-Links (Datenschutz/Impressum/Aufgesetzt-Strategaize, h=19px) auf jeder Page + 1 shadcn-Default-`Button` in `IchWillMehrCard` (h=40px). Beide sind seit V6/V7.x unveraendert. Im Internal-Test-Mode war das toleriert; vor erstem echten Pilot-Partner mit echtem Mobile-Traffic ist es Reibungs-Punkt im "ersten Anblick"-Eindruck.

Parallel: Auth-Pages (`/login`, `/auth/set-password`, `/accept-invitation/[token]`, `/auth/verify-signup`) sind heute zwar Style-Guide-V2-konformes Card-Layout (Branding-Gradient + StrategAIze-Logo + Card + Form), nutzen aber gleichfalls shadcn-Default-Buttons (h=40px) — selbe Touch-Target-Schwaeche. Eine konsolidierte Polish-Welle behebt beide Themen in einem Slice.

### Goal / Intended Outcome
Touch-Target-Audit auf den 3 Diagnose-Funnel-Pages + den 4 Auth-Pages auf Mobile-Viewport (375px) liefert 0 Violations <44px in den festgelegten Scopes. Auth-Pages bleiben visuell unveraendert (kein Redesign), nur Buttons + ggf. Inputs werden auf Touch-Target-tauglich angehoben.

### Target Users
- **Self-Signup-Mandanten (V7-Mandantentyp partner_client)** — primaere Mobile-Touch-Nutzer beim ersten Anblick (Login → Diagnose-Funnel)
- **Bestehende User aller Tenant-Typen** — sekundaer betroffen ueber `/login`, `/auth/set-password`, `/accept-invitation`
- **Strategaize-Admin** — neutral (Desktop-Workflow)

### V1 (V7.4) Scope
- **App-Shell Footer-Touch-Targets**: `StrategaizePoweredFooter`-Component (3 Links Datenschutz/Impressum/Aufgesetzt-Strategaize) von h=19px auf >=44px anheben — entweder ueber Padding-Vergroesserung (`py-3` o.ae.) oder ueber `min-h`-Class. Bestehende Footer-Position + visuelle Hierarchie bleiben erhalten.
- **shadcn-Button-Default-Size-Polish**: 1 lokale Aenderung am shadcn-Button-Component (Default-Size `h-10` -> `h-11`) ODER selektive `size="lg"`-Prop-Aufhebung an konkreten Usage-Sites (Login-Submit + Set-Password-Submit + Accept-Invitation-Submit + Verify-Signup-Submit + IchWillMehrCard-Trigger + ggf. weitere). **Entscheidung in /architecture (Q-V7.4-A).**
- **Auth-Pages Touch-Target-Verifikation**: `/login`, `/auth/set-password`, `/accept-invitation/[token]`, `/auth/verify-signup` — Mobile-375px Audit aller Buttons + Form-Submit-Elemente.
- **Visual-Regression-Baselines erneuern**: V7.3 hat 9 Playwright-Baselines fuer Diagnose-Funnel angelegt. V7.4 ergaenzt Baselines fuer Auth-Pages (4 Pages x 3 Viewports = 12 zusaetzliche Baselines) ODER fuegt nur Mobile-Baselines hinzu (4 x 1 = 4). **Entscheidung in /architecture (Q-V7.4-B).**

### Out of Scope V7.4
- **EditableText-Migration auf Auth-Pages** — Auth-Pages nutzen `next-intl` (`useTranslations`), Strings sind nicht admin-editierbar. Migration auf FEAT-055-Pattern waere moeglich, aber Auth-Pages werden in der V7-Self-Signup-Reihenfolge (Landing -> Email-Verify -> Set-Password -> /dashboard) nur 1x pro neuem Mandanten beruehrt -> niedriger ROI. Optional spaeter V7.5+.
- **Auth-Pages Layout-Redesign** — heute schon Style-Guide-V2-konformes Card-Layout, keine Schwaeche identifiziert.
- **Admin-Bereich-Polish** — V8+ (DEC-101 + spaetere Pilot-Partner-Feedback-Iterationen).
- **Dark-Mode** — V8+.
- **Input-Felder Touch-Target-Polish** — shadcn-Input-Default ist `h-10` (40px), aber Inputs sind primaer Keyboard-Focus, sekundaer Tap-Target. **Out-of-V7.4-Scope**, in /architecture pruefen ob als Sub-Item zu V7.4 hinzuzufuegen (Q-V7.4-C).
- **F-2 Run-Page Live-E2E-Verifikation mit socat-Tunnel** — RPT-337-Followup, separates Tooling-Setup-Item, kein V7.4-Code-Scope.

### Core Features
- **FEAT-062**: App-Shell Touch-Target + Auth-Pages-Polish (1 Feature, 1 Slice SLC-143).

### Constraints
- **Pre-Conditions ERFUELLT**: V7.3 RELEASED (REL-022, main b88b20d), Playwright im Repo (seit SLC-140 MT-6a), Style-Guide-V2-Konsistenz auf Diagnose-Funnel + Auth-Pages-Layout vorhanden.
- **Surgical-Changes-Disziplin**: V7.4 darf **NUR** Touch-Target-relevante Aenderungen einbringen. Keine "Wenn-wir-schon-dabei-sind"-Refactors am Auth-Layout, kein Re-Skinning von Cards, keine i18n-Strings-Aenderungen.
- **Visual-Regression-Schutz**: Existierende V7.3-Baselines (9 PNGs) muessen entweder PASS bleiben (wenn nur Button-Hoehe sich aendert und das im Baseline-Threshold absorbiert wird) ODER kontrolliert neu generiert werden mit Diff-Doku in Slice-Spec.
- **shadcn-Component-Eigentum**: Falls Default-Size-Override gewaehlt wird (Q-V7.4-A), muss das in einem klar dokumentierten Tailwind-Config- oder Component-Override-Pattern erfolgen, das nicht durch shadcn-CLI-Updates ueberschrieben wird.

### Risks / Assumptions
- **R-V7.4-1**: shadcn-Default-Button-Override-Pfad koennte unbeabsichtigt andere Buttons im Repo (Admin-Cockpit, Diagnose-Funnel) aendern -> Visual-Regression-Risk. Mitigation: vor Implementierung Usage-Audit (Grep auf `<Button` ohne `size="..."`), nach Implementierung Playwright-Baselines-Re-Run mit Diff-Review.
- **R-V7.4-2**: Niedrig-priorisierter Polish-Scope — der Wert ist gering ohne realen User-Traffic-Loss-Beleg. Tradeoff akzeptabel weil 1-Slice-Aufwand klein (~3-5h Code-Side) und vor erstem Pilot-Partner-Onboarding sinnvoller Schritt.
- **A-V7.4-1**: Annahme — Footer-Touch-Target-Anhebung via `py-3` oder `min-h`-Class kollidiert nicht mit Footer-Layout-Symmetrie auf Desktop. Live-Verifikation auf 3 Viewports (375 / 768 / 1280) Pflicht.

### Success Criteria
- **SC-V7.4-1**: Touch-Target-Audit auf Mobile 375px = 0 Violations <44px in folgenden Scopes: (a) Diagnose-Funnel (Start + Run + Bericht — bereits 0 Violations vor V7.4, Regression-Schutz), (b) Auth-Pages (Login + Set-Password + Accept-Invitation + Verify-Signup), (c) App-Shell (Footer auf JEDER Page, IchWillMehrCard auf Dashboard).
- **SC-V7.4-2**: 0 Visual-Regression in V7.3-Diagnose-Funnel-Baselines (9 PNGs) — entweder PASS unveraendert oder mit dokumentiertem Threshold-Update.
- **SC-V7.4-3**: 4 neue Mobile-Baselines fuer Auth-Pages angelegt (Login + Set-Password + Accept-Invitation + Verify-Signup), als Regression-Schutz fuer kuenftige Auth-Refactors.
- **SC-V7.4-4**: Auth-Pages-Inhaltsfunktionalitaet unveraendert (Login funktioniert, Set-Password funktioniert, Accept-Invitation funktioniert, Verify-Signup funktioniert) — Live-Smoke via Playwright-MCP gegen Production-Build.

### Open Questions
- **Q-V7.4-A**: shadcn-Button-Default-Size global anheben (`h-10 -> h-11` im components/ui/button.tsx) ODER selektiv per Usage-Site mit `size="lg"`-Prop? Trade-off: global = einheitlicher + weniger Code-Touch + Regression-Risk; selektiv = praeziser + mehr Code-Touch + niedrigeres Risk.
- **Q-V7.4-B**: Auth-Pages-Baselines nur Mobile (4 PNGs) ODER alle 3 Viewports (12 PNGs)? Trade-off: Mobile-only = schlanker Baseline-Set + auf primaeren Use-Case fokussiert; alle 3 = vollstaendig + mehr Pflege-Aufwand.
- **Q-V7.4-C**: shadcn-Input-Default-Size (h-10) auch anheben? Trade-off: konsistenter mit Button-Polish + Tap-Target-strenger; aber Inputs sind primaer Keyboard-Focus -> Wert-Schwellen niedriger.
- **Q-V7.4-D**: Touch-Target-Audit-Skript (pendant zu `audit-editable-text-coverage.mjs`) als CI-Schutz fuer kuenftige Komponenten-Adds einfuehren JA/NEIN? Trade-off: ja = automatischer Regression-Schutz fuer V7.4+; nein = manueller Audit-Modus, Aufwand-Schluss-Klausel.

### Delivery Mode
**SaaS Product** (konsistent zu V7.x-Linie). Touch-Target >=44px ist W3C-Accessibility-Pflicht (WCAG 2.1 AA Success Criterion 2.5.5) und Apple/Google Mobile-UX-Standard. V7.4 schliesst eine objektive Accessibility-Luecke vor Pilot-Partner-Onboarding.

### Slice-Skizze (informativ, finaler Schnitt in /slice-planning)

- **SLC-143** FEAT-062 App-Shell + Auth-Pages Touch-Target-Polish: 5-7 Micro-Tasks ~3-5h Code-Side. MT-Skizze:
  - MT-1 Pre-Audit (Live-Mobile-Audit Login + Set-Password + Accept-Invitation + Verify-Signup + Footer + IchWillMehrCard, ist-Werte dokumentieren)
  - MT-2 Q-V7.4-A-Decision-Implementation (shadcn-Button Default-Size oder selektiv)
  - MT-3 Footer-Component Touch-Target-Anhebung
  - MT-4 Auth-Pages Visual-Verify (kein Layout-Bruch) + ggf. selektive Input-Polish (per Q-V7.4-C)
  - MT-5 Playwright-Baselines-Update (V7.3 9 PNGs + 4-12 neue Auth-Baselines per Q-V7.4-B)
  - MT-6 Records-Update (FEAT-062 + SLC-143 + STATE)
  - MT-7 (optional, per Q-V7.4-D) Touch-Target-Audit-Skript als CI-Schutz

Geschaetzt **~3-5h Code-Side** ueber 1 Slice. Realistische Session-Anzahl: 1 Mini-Session A (Pre-Audit + Q-V7.4-Klaerung) + 1 Full-Session B (Implementation + /qa + Live-Smoke + Master-Merge).

### Detail-Spec
V7.4-Requirements-Completion-Report wird in dieser Session erstellt als RPT-339. Feature-Spec unter `/features/FEAT-062-app-shell-auth-pages-touch-target-polish.md`. /architecture-Schritt klaert Q-V7.4-A..D und definiert /slice-planning-Vorbereitung.

---

## V8 — Mandanten-Report-Port (10-Prinzipien-Teaser-Diagnose fuer StB-Mandanten)

**Requirements-DONE 2026-05-28.** Versions-Shift dabei: Diary-Mode rutscht von V8 auf V9, Process-Mining-Cluster von V9 auf V10. V8-Slot neu belegt fuer Mandanten-Report-Port.

### Problem Statement

Aktuell laufen in der Onboarding-Plattform zwei Diagnose-Werkzeuge im Vertriebs-Stack:

1. **Exit-Readiness 6-Block-Variante** (FEAT-002 + FEAT-016 LIVE seit V1) — die ausfuehrliche, voll-versionierte Diagnose fuer bestehende Strategaize-Kunden im Mandats-Verhaeltnis. Funktioniert, ist intern marktreif, bleibt erhalten.
2. **Diagnose-Werkzeug 6-Block-Light-Variante** (FEAT-045 LIVE seit V6.3) — Self-Service-Diagnose ueber Steuerberater-Partner-Trichter. Live seit 2026-05-17. Inhalt aus Workshop 2026-05-16, nicht aus Strategaize-Methodik-Vorlage.

**Was fehlt:** Eine Teaser-Diagnose, die die **Strategaize-Methodik (10 Prinzipien der Uebergabefaehigkeit)** abbildet — als greifbare Substanz-Demo gegenueber Steuerberatern und deren Mandanten. Die 10 Prinzipien sind im Dev-System final dokumentiert (`docs/curriculum/v2/EXIT_READINESS_PRINZIPIEN.md`), der finale Mandanten-Report-Prototyp (PDF 17 Seiten + Web-Variante) ist 2026-05-28 freigegeben (`docs/curriculum/v2/MANDANTEN_REPORT_PROTOTYP.html`), und die Stufen-Definitionen pro Modul x 5 Stufen liegen in `docs/curriculum/v2/EXIT_READINESS_LEVELS.md`. Diese Substanz muss in die Onboarding-Plattform portiert werden, damit StB-Mandanten in der Co-Hosting-Plattform einen sichtbaren Strategaize-Wert erleben — nicht eine generische Workshop-Output-Variante.

Die bestehende FEAT-045 V6.3-Variante (24 Fragen + 6 Blocks) ist **nicht** durch die neue 10-Prinzipien-Variante zu ersetzen. Sie deckt einen **anderen** Use-Case ab: knapper Co-Hosting-Entry-Point fuer Partner ohne Strategaize-Branding-Investition. Die V8-Variante ist **substanz-stark** (47 Fragen, Premium-Renderer, Strategaize-Methodik), gedacht fuer:
- StB **selbst** als Eigen-Diagnose (StB als Mandanten-Vertreter — Partner-Erlebnis)
- StB-Mandanten via Co-Hosting-Plattform mit voller Strategaize-Tonalitaet

### Goal / Intended Outcome

Eine zweite vollwertige Teaser-Diagnose in der Onboarding-Plattform, die die Strategaize-10-Prinzipien-Methodik abbildet und mit einem 17-Seiten-Premium-PDF endet. Der Mandant kann den Fragebogen selbststaendig in ~40-55 Minuten beantworten (5 Hygiene-Fragen Ja/Teilweise/Nein + 37 Skala-Fragen 1-5 + 5 Reflexions-Textfelder), erhaelt automatisch einen SUI-Score (Strategaize Uebergabefaehigkeits-Index 0-100) mit Klassifizierung (Strukturluecke / Teil-Reife / Tragbar), und sieht im Bericht pro Modul "Worum es geht / Was es in Ihrer Firma bedeutet / Unsere Empfehlung". Der StB erhaelt automatisch eine Kopie des Berichts (Email-Versand-Pattern aus V7.2 wiederverwendbar). Bestehende V6.3-Variante laeuft parallel weiter, ohne Konflikt.

### Target Users

**Primaer (V8)**
- **StB-Mandant (tenant_admin unter partner_client)** — beantwortet 10-Prinzipien-Teaser-Fragebogen selbststaendig, erhaelt SUI-Bericht als Premium-PDF
- **Steuerberater (partner_admin)** — laedt Mandanten ueber Co-Hosting-Plattform ein, erhaelt Bericht-Kopie, nutzt Bericht als Folgegespraechs-Anker
- **Steuerberater selbst (partner_admin in Eigen-Tenant)** — macht die Eigen-Diagnose um Partner-Erlebnis zu kennen

**Sekundaer (deferred)**
- Verlaufsbeobachtung ueber 6-12 Monate (Re-Erhebung des SUI) — out of scope V8, V8.1+ moegliche Erweiterung

### Scope

#### V8 In Scope

1. **Neuer Template-Datensatz `exit-readiness-teaser-v1`** — eigenes Template-Objekt mit slug + version, 47 Fragen aufgeteilt in Modul 0 (5 Hygiene-Fragen Ja/Teilweise/Nein), Module 1-9 (3-6 Skala-Fragen pro Modul mit 5-Punkt-Reife-Skala 1-5 = Score 0/2/5/8/10), Modul 10 (5 Reflexions-Textfelder, ohne Score). Stufen-Lookup-Inhalt pro Modul x 5 Stufen aus `docs/curriculum/v2/EXIT_READINESS_LEVELS.md` als strukturierte Daten. **Modul 9 doppelt gewichtet (20%)** in SUI-Berechnung — Module 1-8 je 10%. (FEAT-063)

2. **Neue Fragebogen-UI-Komponenten** — drei Antwort-Schemata sauber gerendert: (a) Hygiene-Trichotomie Ja/Teilweise/Nein als Pill-Group fuer Modul 0, (b) 5-Punkt-Reife-Skala mit klaren Labels "Noch gar nicht vorhanden / Erste Ansaetze / Teilweise implementiert / Weitgehend etabliert / Vollstaendig etabliert + belastbar" fuer Module 1-9, (c) Freitext-Reflexion Textareas fuer Modul 10. Reuse: bestehende QuestionFlow.tsx + EditableText (FEAT-056) + HelperTextModal (FEAT-057). (FEAT-064)

3. **Neuer SUI-Score-Engine** — deterministische Berechnung (analog V6.3 DGN-A): Modul-Score = Durchschnitt Fragen-Score (0-10), SUI-Gesamt = gewichtetes Mittel Module 1-9 (Modul 9 doppelt), Klassifizierung in drei Stufen (0-30 Strukturluecke rot, 31-55 Teil-Reife amber, 56-100 Tragbar gruen). Modul 0 (Hausaufgaben) und Modul 10 (Reflexion) fliessen NICHT in den SUI ein, werden separat ausgewiesen. Bestehender Worker-Pipeline-Pfad aus V6.3 (`src/workers/condensation/`) wird ggf. erweitert um Teaser-Variante via `template.metadata.usage_kind=mandanten_report_teaser_v1`. (FEAT-065)

4. **Neuer 17-Seiten-Premium-PDF-Renderer V2** — exakte Layout-Replikation der Master-Vorlage `docs/curriculum/v2/MANDANTEN_REPORT_PROTOTYP.html`: Cover-Page (Titel-Pitch + Wheel-Hintergrund) → SUI-Hero-Page (Score + Klassifizierung + Pitch-Text) → Modul-Profil-Page (Wheel + Legende 9 Module) → 9 Modul-Pages (je 1 A4-Seite mit fokussiertem Wheel-Segment-scale-1.14 links + Text rechts: "Worum es geht / Was es in Ihrer Firma bedeutet / Unsere Empfehlung") → Hausaufgaben-Page (Modul 0 Findings) → 3-Strategie-Hebel-Page → Reflexion-Page (Modul 10 Antworten als Zitat) → CTA-Folgegespraech-Page. Tonalitaet "Unsere Empfehlung" durchgaengig (NICHT "Empfehlung Ihres Steuerberaters", siehe [[feedback-mandanten-empfehlung-unsere-nicht-stb]]). Premium-Look Pflicht ([[feedback-design-premium-look-pflicht]]). (FEAT-066)

5. **Bericht-Email-Versand mit Empfaenger-Auswahl** — Mandant + Partner-StB + optionale Zusatz-Empfaenger. Reuse: bestehende V7.2 `sendDiagnoseReportByEmail` Server-Action + `SendReportByEmailModal` (FEAT-060 LIVE) — nur Template-spezifische Erweiterung, kein Neubau.

6. **Diagnose-Funnel-Telemetrie auch fuer Teaser-Variante** — Reuse bestehende `diagnose_event`-Tabelle aus V7.2 (FEAT-058 LIVE), mit `template_slug='exit-readiness-teaser-v1'` als Filter-Dimension. Admin-Analytics-Page liefert Drop-off + Helper-Hits + TOQ pro Frage auch fuer V8.

#### V8 Out of Scope (explizit)

- **Web-Variante des Reports** (Dashboard mit Hash-URL-Switcher analog `MANDANTEN_REPORT_WEB.html`) — V8.1+, separate Iteration nach PDF-Renderer-Erfolg
- **Replace der V6.3-Variante** — beide Templates laufen parallel, kein Migrations-Pfad fuer bestehende `partner_diagnostic_v1`-Sessions
- **Replace der V1-6-Block-exit-readiness-v1.0.0.json** — bleibt komplett liegen fuer spaetere Voll-Diagnose-Variante (User-Direktive 2026-05-28)
- **StB-Partner-Branding im PDF** (Logo/Farben pro Partner-Organisation) — V8.1+, Reuse Pattern aus V6 Partner-Branding (FEAT-044)
- **Mehrsprachige Reports** (NL/EN) — V8.1+, vorher Pilot-Distribution-Validierung
- **Verlaufsbeobachtung / Re-Erhebung** (2 SUI-Erhebungen vergleichen) — V8.2+
- **PDF-Anpassung im Admin-UI** (EditableText auf Bericht-Inhalt) — nicht in V8, V8.1+ erste Iteration nur fuer Headline-Texte
- **3-Strategie-Hebel-Logik via LLM** — V8 nutzt deterministische Regel (3 Module mit niedrigstem Score), LLM-augmentation V8.1+
- **Pilot-Distribution-Mechanik** (Partner-Org-Setup, Mandant-Einladung) — existiert bereits via V6 Partner-Onboarding + V7 Self-Signup, wird wiederverwendet, kein V8-Scope
- **Migration der Diagnose-Daten in Knowledge-Architektur** (V7.6 SLC-354 Knowledge-Aggregation) — V8 stellt Teaser-Variante bereit, Aggregation-Pfad wird V7.6 / V10+ separat angegangen
- **Diary-Mode** (war V8-alt) — verschoben auf V9

### Core Features (V8)

| ID | Feature | Zweck |
|----|---------|-------|
| FEAT-063 | 10-Prinzipien-Teaser-Template + Stufen-Lookup-Daten | Template-Objekt `exit-readiness-teaser-v1` mit 47 Fragen + Stufen-Inhalt pro Modul x 5 Stufen als strukturierte JSON-Daten (aus EXIT_READINESS_PRINZIPIEN.md + EXIT_READINESS_LEVELS.md) |
| FEAT-064 | Fragebogen-UI-Komponenten (3 Antwort-Schemata) | Hygiene-Trichotomie + 5-Punkt-Reife-Skala + Reflexion-Textareas auf bestehender QuestionFlow.tsx-Basis |
| FEAT-065 | SUI-Score-Engine mit gewichtetem Mittel + Stufen-Klassifizierung | Deterministische Score-Berechnung Module 1-9 mit Modul 9 doppelt gewichtet, Klassifizierung in 3 Stufen, Hausaufgaben + Reflexion separat |
| FEAT-066 | 17-Seiten-Premium-Mandanten-Report-Renderer V2 | Exakte Layout-Replikation Master-Vorlage mit Wheel + 9 Modul-Pages + Hausaufgaben + Hebel + Reflexion + CTA, Tonalitaet "Unsere Empfehlung" |

Detail-Specs pro Feature unter `/features/FEAT-063..066-*.md`.

### Constraints

#### Pflicht-Reuse (kein Neubau)
- **Template-Switcher-UI** (FEAT-014 LIVE seit V2) — neue Template-Variante wird einfach als zweite Auswahl gerendert
- **Capture-Session + Block-Submit-Pattern** (FEAT-003 LIVE seit V1) — Fragebogen-Flow unveraendert
- **Partner-Branding-Infrastructure** (FEAT-044 LIVE seit V6) — minimal CSS-Custom-Properties-Setup bleibt vorbereitet fuer V8.1+
- **Bericht-Email-Versand-Pattern** (FEAT-060 LIVE seit V7.2) — nur Template-Erweiterung
- **Diagnose-Funnel-Telemetrie** (FEAT-058 LIVE seit V7.2) — Reuse via `template_slug`-Dimension
- **Worker-Pipeline-Architektur** (`src/workers/condensation/` aus V1, erweitert V6.3) — Branching ueber `template.metadata.usage_kind`
- **Bedrock-LLM-Adapter** (DEC-006) — falls LLM-Augmentation noetig, EU-Region Pflicht
- **EditableText-Komponente** (FEAT-056 LIVE seit V7.1) — fuer kuenftige Bericht-Text-Anpassbarkeit vorbereitet
- **HelperTextModal** (FEAT-057 LIVE seit V7.1) — fuer Fragen-Tooltips wenn Helper-Texts gefuellt
- **Style-Guide-V2** ([[feedback-style-guide-v2-mandatory]]) + V2-Sidebar-Layout ([[feedback-v2-sidebar-pflicht]]) Pflicht
- **"Unsere Empfehlung"-Tonalitaet** ([[feedback-mandanten-empfehlung-unsere-nicht-stb]])
- **Premium-Look** ([[feedback-design-premium-look-pflicht]])
- **Cumulative-Single-Branch-Pattern** ([[feedback-cumulative-single-branch-pattern]]) bei strikt-abhaengigen Slice-Sequenzen
- **Master-Merge nur am Slice-Ende** ([[feedback-slice-merge-at-end]])
- **Live-Smoke vor /qa-PASS** bei Output-aendernden Slices ([[feedback-deferred-live-smoke-completion]])

#### Technische Constraints
- **Data-Residency:** alle LLM-Calls ueber Bedrock eu-central-1 (Frankfurt), kein OpenAI-Direkt (DEC-006, `.claude/rules/data-residency.md`)
- **PDF-Renderer-Wahl:** offene Frage (Q-V8-A), Wechsel von `@react-pdf/renderer` auf Puppeteer/Playwright HTML-zu-PDF ist substanzielle Architektur-Entscheidung
- **DB-Schema:** moeglichst additiv — neue Template-Row in `public.template` + JSONB-Blocks-Erweiterung + neuer Renderer-Endpunkt
- **Bedrock-Kosten-Kontrolle** ([[feedback-bedrock-cost-control]]): KI-Features on-click oder Block-Submit-getriggert, nicht auto-load
- **Auto-Deploy OFF, manueller Deploy ueber Coolify** ([[feedback-manual-deploy]])
- **Coolify-Cron via node:22-Sidecar oder Coolify-Scheduled-Task** ([[feedback-async-always-coolify-cron]])

#### Inhaltliche Constraints
- **Tonalitaet:** "Unsere Empfehlung" durchgaengig, NICHT "Empfehlung Ihres Steuerberaters"
- **Strategaize-Branding:** Strategaize-Name NICHT namentlich im Mandanten-Output (StB-Branding hat Vorrang im Cover-Footer); Strategaize-Sicht-Position aber stark sichtbar in "Unsere Empfehlung"-Sektionen
- **Stufen-Inhalt:** Die Stufen-Definitionen pro Modul x 5 Stufen sind verbindliche Strategaize-Substanz, KEIN LLM-Generierung — werden 1:1 aus `EXIT_READINESS_LEVELS.md` als Daten gespiegelt

### Risks / Assumptions

#### Risiken
- **R1 — PDF-Renderer-Komplexitaet bei 17 Seiten + Wheel-SVG:** `@react-pdf/renderer` hat eingeschraenkte SVG-Unterstuetzung, Wheel-Rendering nicht trivial. Mitigation: in /architecture Q-V8-A entscheiden (Reuse vs. Puppeteer/Playwright-HTML-zu-PDF). Bei Puppeteer: neuer Dependency, hoehere Bundle-Size, aber Wheel-SVG aus HTML-Prototyp direkt portierbar.
- **R2 — Inhaltlich-Datenpflege Stufen-Lookup:** 9 Module x 5 Stufen x 2 Perspektiven ("Was es in Ihrer Firma bedeutet" + "Unsere Empfehlung") = 90 Inhalts-Bloecke aus `EXIT_READINESS_LEVELS.md`. Zusaetzlich 9 "Worum es geht"-Texte. Migration-Aufwand: substantiell, aber liegt als strukturierter Markdown bereits vor — Parser/Import-Skript faktisch ein Datentransformations-Job.
- **R3 — Template-Switcher-Konflikt:** FEAT-014 ist live aber wurde nie unter Last mit zwei aktiven Templates getestet. Mitigation: in /architecture pruefen, ob Switcher-UI auf Start-Page eine Auswahl zwischen V6.3 Template (24 Fragen, 6 Blocks) und V8 Template (47 Fragen, 11 Module + SUI) ermoeglicht.
- **R4 — Score-Engine-Plausibilitaet:** Modul 9 doppelt gewichtet ist eine inhaltliche Strategaize-Festlegung (nicht trivial nachvollziehbar). User-Review nach erster End-to-End-Diagnose zwingend.
- **R5 — Tonalitaets-Drift:** "Unsere Empfehlung" muss in 90+ Texten konsistent sein, nicht "wir empfehlen" oder "der Berater empfiehlt". Lint-Skript / Audit-Skript fuer Content-Validierung sinnvoll.

#### Annahmen
- StB-Pilot-Partner ist parallel zum V8-Bau aktiv (V6 Partner-Onboarding existiert seit V6 RELEASED 2026-05-14)
- Die 4 Pflicht-Vorlagen (HTML-Prototyp + PRINZIPIEN.md + LEVELS.md + bestehender V7.2-Renderer als Reuse-Basis) bleiben stabil
- Bedrock-Kosten fuer ~50 Wheel-Renders pro Bericht (falls Wheel ueber LLM-augmented Text generiert wird) liegen unter $0.10/Bericht — vermutlich aber Wheel ist SVG-statisch, kein LLM-Call
- Erste echte Diagnose-Erhebung kommt vom Founder selbst als Test-Mandant

### Success Criteria (V8)

**SC-V8-1 — End-to-End-Flow funktioniert (Teaser-Mandant)**
Ein neu eingeladener tenant_admin unter einem partner_client kann den Teaser-Fragebogen `exit-readiness-teaser-v1` selbststaendig durchlaufen: alle 5 Hygiene-Fragen Ja/Teilweise/Nein, alle 37 Skala-Fragen 1-5, alle 5 Reflexions-Textfelder. Per Block-Submit-Pattern werden Antworten gespeichert. Sessionende loest Score-Berechnung aus.

**SC-V8-2 — SUI-Score-Engine berechnet plausibel**
Aus 37 Skala-Antworten + Gewichtungs-Logik (Module 1-8 je 10%, Modul 9 zu 20%) entsteht ein SUI-Gesamt-Score 0-100 mit Klassifizierung Strukturluecke / Teil-Reife / Tragbar. Pro Modul wird ein Modul-Score 0-100 berechnet und korrekt der Stufe 1-5 zugeordnet. Hausaufgaben aus Modul 0 (Status Nein/Teilweise) werden als separate Liste aufbereitet. Modul 10 Reflexionen werden als Zitat-Sammlung gespeichert.

**SC-V8-3 — 17-Seiten-Premium-PDF wird gerendert**
Nach Session-Finalize entsteht ein 17-Seiten-PDF mit Cover + SUI-Hero + Modul-Profil-Wheel + 9 Modul-Pages (fokussiertes Wheel-Segment + 3-Sektionen-Text) + Hausaufgaben + 3-Hebel + Reflexion + CTA. Layout visuell identisch mit HTML-Prototyp `MANDANTEN_REPORT_PROTOTYP.html`. Tonalitaet "Unsere Empfehlung" durchgaengig.

**SC-V8-4 — Parallel-Coexistenz zur V6.3-Variante haelt**
Bestehende `partner_diagnostic_v1`-Sessions (V6.3-Variante) laufen unberuehrt weiter. Neue Sessions mit `exit-readiness-teaser-v1`-Template laufen ueber den V8-Pfad. Keine Schema-Aenderung in bestehenden Tabellen, die V6.3 brechen wuerde.

**SC-V8-5 — Email-Versand funktioniert (mit Empfaenger-Auswahl)**
Bericht-Email-Modal aus V7.2 (FEAT-060) zeigt fuer V8-Template-Berichte das neue 17-Seiten-PDF als Attachment. Mandant + Partner-StB + optionale Zusatz-Empfaenger werden zuverlaessig erreicht.

**SC-V8-6 — Telemetrie liefert Funnel-Daten fuer V8-Template**
Admin-Analytics-Page (FEAT-058) zeigt Drop-off + Helper-Hits + TOQ pro Frage fuer V8-Template separat von V6.3-Template (Filter via `template_slug`).

### Open Questions fuer /architecture V8

- **Q-V8-A — PDF-Renderer-Architektur:** `@react-pdf/renderer` beibehalten (V7.2-Bestand, SVG-eingeschraenkt) oder Wechsel auf Puppeteer/Playwright HTML-zu-PDF (HTML-Prototyp direkt portierbar, Wheel-SVG trivial, aber neue Dependency + Bundle-Risiko)?
- **Q-V8-B — Template-Switcher-Sichtbarkeit:** Bietet die Start-Page dem Mandanten eine Wahl zwischen V6.3-Variante und V8-Variante, oder wird via partner_organization.metadata oder URL-Parameter fest welche Variante ausgespielt?
- **Q-V8-C — Score-Engine-Hybrid-LLM oder rein deterministisch:** SUI + Modul-Scores rein deterministisch (analog V6.3 DGN-A) oder mit LLM-augmentation fuer "Was es in Ihrer Firma bedeutet"-Text-Anpassung pro Modul x Stufe?
- **Q-V8-D — 3-Strategie-Hebel-Auswahl:** Deterministische Regel (3 Module mit niedrigstem Score = 3 Hebel) oder LLM waehlt aus 10 Prinzipien basierend auf Score-Profil + Reflexions-Antworten?
- **Q-V8-E — Hausaufgaben-Block (Modul 0):** Direkt aus Modul-0-Antworten (Nein/Teilweise als Hausaufgabe) gerendert oder LLM-formuliert mit Mandant-spezifischem Kontext?
- **Q-V8-F — Modul-Profil-Wheel-Render-Strategie:** Inline-SVG im PDF (technisch komplex bei @react-pdf/renderer) oder server-side-PNG-Pre-Render via puppeteer/satori oder Wheel direkt in HTML-zu-PDF-Pipeline (impliziert Q-V8-A=Puppeteer)?
- **Q-V8-G — Bericht-Persistenz:** Bericht als generiertes PDF-Asset im Supabase-Storage (analog FEAT-060) oder als strukturierte Daten in DB (knowledge_unit-Records mit metadata.report_type='sui_teaser_v1') oder beides?
- **Q-V8-H — Stufen-Lookup-Daten-Quelle:** Stufen-Inhalt (90+ Texte) als statische JSON-Datei im Repo committed oder als seedbarer DB-Datensatz mit Migration oder als template.metadata-JSONB-Erweiterung im exit-readiness-teaser-v1-Template-Row?

### Delivery Mode

**SaaS Product** — entspricht der bestehenden Onboarding-Plattform-Klassifizierung. Strengste TDD-Disziplin (Tests fuer Score-Engine, Template-Daten-Validierung, Email-Versand-Pfad). Mandatory atomic commits pro Micro-Task ([[git-release]] Rule).

### Slice-Sketch (vorlaeufig, /architecture + /slice-planning entscheiden)

Geschaetzt **3-5 Slices, ~5-8 Sessions** ueber 2-3 Wochen Implementations-Zeit:

- **SLC-148 (geplant) — FEAT-063 + FEAT-065:** Template-Daten + Score-Engine. Migration (additiv) + Template-Seed mit 47 Fragen + Stufen-Lookup-Daten + Pure-Function-Score-Berechnung + Vitest. Backend-only.
- **SLC-149 (geplant) — FEAT-064:** Fragebogen-UI-Komponenten. Hygiene-Trichotomie + 5-Punkt-Skala + Reflexion-Textareas in QuestionFlow.tsx integriert. Frontend.
- **SLC-150 (geplant) — FEAT-066 Phase A:** Renderer-Foundation. PDF-Engine-Wahl (Q-V8-A), Cover + SUI-Hero + Modul-Profil + Wheel-Komponente. Backend + leichte Frontend-Integration (Download-Link).
- **SLC-151 (geplant) — FEAT-066 Phase B:** Modul-Pages (9) + Hausaufgaben + Hebel + Reflexion + CTA. Stufen-Lookup-Render-Logik. Backend.
- **SLC-152 (geplant) — Integration + Telemetrie + Email-Versand-Adapter:** End-to-End Smoke. V7.2-Pattern-Erweiterung fuer Email-Modal. Telemetrie-Filter via template_slug. Live-Smoke + Founder-Test-Diagnose.

Realistische Sessions: 1 Setup-Session (FEAT-063 Template-Seed) + 1-2 Score+UI-Sessions + 2-3 Renderer-Sessions + 1 Integration-Session.

### Detail-Spec
V8-Requirements-Completion-Report wird in dieser Session erstellt als RPT-348 (RPT-347 ist V7.7 Live-Smoke). Feature-Specs unter `/features/FEAT-063..066-*.md`. /architecture-Schritt klaert Q-V8-A..H und definiert /slice-planning-Vorbereitung.

---

## V8.1 — Lead-Conversion-Outro + Strategaize-Freigabe-CTA + Dual-Email-Trigger

**Requirements-DONE 2026-05-30.** Anschluss an V8.0 RELEASED 2026-05-30 (REL-026, main HEAD `875e47d`).

### Problem Statement

Der V8.0-Mandanten-Report endet aktuell mit einer generischen CTA-Page (`src/lib/pdf/mandanten-report-v2/pages/cta.tsx`), die ein 60-Minuten-Folgegespraech mit dem StB-Kontakt-Slot (Fallback Strategaize) anbietet. Das ist visuell intakt, aber strukturell **nicht conversion-optimiert**:

- Es gibt **keine explizite Strategaize-Vorstellung** im Bericht. Mandanten, die ueber StB-Co-Hosting auf die Plattform kommen, kennen die Strategaize-Marke nicht zwingend.
- Es gibt **keine personalisierten Empfehlungen** als Pre-Selling-Element. Die 3-Strategie-Hebel-Page (Page 14) zeigt deterministische Stufen-Lookup-Texte, die fuer Diagnose stark sind, aber fuer Lead-Generierung zu generisch.
- Es gibt **keinen klaren "Mit Strategaize sprechen"-Pfad** mit funktionaler Click-Mechanik. Mandanten muessen Strategaize manuell per Email kontaktieren oder warten, bis der StB es aktiviert.
- Es gibt **keinen Trust-Building-Block** ueber "Wie wir arbeiten" (Video kommt V8.2+, aber Layout-Slot soll bereits V8.1 stehen).

Founder-Direktive 2026-05-29: **"Vertrauen in uns und Bereitschaft mit uns zu reden steigern."**

### Goal / Intended Outcome

Erweiterung des V8.0-Berichts um eine **Lead-Conversion-Outro-Section** mit:
1. Strategaize-Vorstellung 2-3 Absaetze (Wir-Voice, Trust-Building, KEIN Pricing).
2. Drei personalisierte Empfehlungs-Cards basierend auf den 3 niedrigsten Modul-Stufen (selectThreeHebel-Reuse aus V8.0 SLC-148 MT-4), LLM-augmentiert via Bedrock Claude Sonnet eu-central-1, deterministischer Fallback bei LLM-Fail.
3. Video-Block-Platzhalter (statischer Block ohne echtes Video — V8.1 reserviert den Layout-Slot, V8.2+ liefert echtes Video).
4. CTA "Mit Strategaize sprechen" mit funktionalem Click-Handler:
   - **PDF-Pfad**: Magic-Link mit HMAC-SHA256-Token zu `/strategaize-anfrage?token=<signed>`
   - **Web-Pfad**: Server-Action direkt im V8-Web-Bericht (Session-basiert, kein Token)

Bei CTA-Klick:
- `capture_session.released_for_strategaize_review = true` Flag wird gesetzt (DEC-163 Flag existiert seit V8.0).
- **Lead-Email** an Strategaize-BD-Inbox `bd@strategaizetransition.de` (ENV `STRATEGAIZE_BD_EMAIL`) — strukturierte Lead-Daten, landet in der Business-System-Pipeline via Email (loose-coupling, kein BS-API-Call in V8.1).
- **StB-Partner-Notification** an `partner_organization.contact_email` — neutral-informativ ("Ihr Mandant X hat Kontakt zu Strategaize aufgenommen"), kein Glueckwunsch-Wording, KEIN Pricing.
- Mandant sieht Bestaetigungs-Page "Strategaize meldet sich innerhalb von 2 Werktagen".

Idempotenz Pflicht: Mehrfach-Klick fuehrt nicht zu doppelten Emails (Flag-Check als Idempotenz-Token).

### Target Users

**Primaer (V8.1)**
- **StB-Mandant (tenant_admin unter partner_client)** — empfaengt V8.1-erweiterten Bericht, klickt CTA, wird Lead.
- **Strategaize-BD-Team (extern, ueber bd@strategaizetransition.de + Business-System-Pipeline)** — empfaengt Lead-Emails, kontaktiert Mandanten innerhalb 2 Werktagen.
- **Steuerberater (partner_admin)** — empfaengt StB-Notification ueber Mandant-Kontaktaufnahme, behaelt Transparenz.

**Sekundaer**
- **Strategaize-Founder (Test-Mandant)** — Smoke-Test der Dual-Email-Mechanik nach Live-Schaltung.

### Scope

#### V8.1 In Scope

1. **FEAT-067 Lead-Conversion-Outro-Renderer (PDF + Web-Bericht)** — 4-Block-Layout (Strategaize-Vorstellung + 3 Empfehlungs-Cards + Video-Platzhalter + CTA-Slot). Distribution in PDF (@react-pdf v4 Pages) und V8-Web-Bericht (React-Component). Pflicht-Reuse V8.0-Theme + selectThreeHebel-Output.

2. **FEAT-068 Strategaize-Freigabe-CTA + Dual-Email-Trigger** — HTTP-GET `/strategaize-anfrage` Endpoint (Magic-Link-Eintritt mit HMAC-SHA256-Token-Validation) + Server-Action `triggerStrategaizeFreigabe` (Web-Pfad). Beide setzen Flag + senden Lead-Email an BD-Inbox + StB-Partner-Notification. Bestaetigungs-Page nach erfolgreichem Klick. Idempotenz ueber Flag-Check.

3. **FEAT-069 LLM-Augmentation der 3 Empfehlungs-Texte** — Bedrock Claude Sonnet eu-central-1 (Pflicht via `.claude/rules/data-residency.md`). Caching pro `capture_session.metadata.v8_1_llm_augmentation_cache`. Deterministischer Fallback bei LLM-Fail (Timeout, Cost-Cap, Tonality-Drift). Cost-Cap ~$0.02/Session, Hard-Cap $0.05/Session. Audit-Trail via `ai_cost_ledger`.

4. **Tonality-Audit-Erweiterung** — bestehendes Skript `scripts/tonalitaet-audit-v8.mjs` erweitert um V8.1-Outro-Scope (LLM-Output + statische Texte). Blacklist-Patterns: "ich" als Pronomen, "mein Team", "der Founder", Pricing-Begriffe, "Empfehlung Ihres Steuerberaters".

5. **Neue ENV-Variablen**
   - `STRATEGAIZE_BD_EMAIL` (Default `bd@strategaizetransition.de`)
   - `STRATEGAIZE_CTA_TOKEN_SECRET` (Pflicht, Production-Generation, min 64 Zeichen)
   - `STRATEGAIZE_CTA_TOKEN_EXPIRY_DAYS` (Default 90)
   - `BEDROCK_V8_1_MODEL_ID` (optional, Default aktuelles Sonnet)

6. **Audit-Trail** — Trigger-Events (Magic-Link vs Web-Action, Token-Validity, Email-Sent-Status BD + StB, Idempotency-Hit) werden geloggt fuer Founder-Sichtbarkeit + Post-Launch-Analyse.

#### V8.1 Out of Scope (explizit)

- **Echtes Video** — V8.1 reserviert den Layout-Slot mit Strategaize-Brand-Box, V8.2+ liefert das Video.
- **Pricing-Hinweise im Bericht** — explizit nie, in keiner Variante. Pricing kommt erst nach persoenlichem Gespraech.
- **Multi-Lead-Routing per Partner-Segment** (z.B. White-Label-Partner-Vertrieb statt Strategaize-BD) — V8.2+.
- **Direkte BS-API-Integration** (HTTP-POST an BS-Lead-Endpoint statt Email-Inbox-Forwarding) — V8.2+. V8.1 nutzt loose-coupling via Email an `bd@strategaizetransition.de`, BS-Side parst.
- **A/B-Testing der Outro-Variante** — V8.2+ (FEAT-058 Diagnose-Funnel-Telemetrie ist Daten-Foundation).
- **Re-Send-Button** (Mandant kann CTA nicht doppelt triggern) — Idempotenz ueber Flag in V8.1, V8.2+ wenn Re-Send-Use-Case auftaucht.
- **StB-Partner-Notification-Customization** (Tonalitaet pro Partner-Org) — V8.1 nutzt eine zentrale Tonalitaet.
- **Mehrsprachige Outro-Variante** (NL/EN) — V8.2+.
- **CAPTCHA / Anti-Spam** auf Magic-Link-Endpoint — V8.2+ wenn Spam-Welle.
- **Calendar-Integration** (Folgegespraech-Termin direkt buchbar) — V8.2+, entspricht aktuell Founder-Direktive "kein Pricing-Druck".
- **LLM-Augmentation der V8.0-Modul-Pages** (Pages 4-12) — bleibt deterministisch (DEC-159..161 V8.0).
- **LLM-Augmentation der Strategaize-Vorstellungs-Absaetze** — statisch, redaktionell.
- **LLM-Augmentation des CTA-Hero-Wordings** — statisch, redaktionell.
- **LLM-Augmentation der StB-Notification + BD-Lead-Email-Bodies** — statisch, strukturiert.
- **Interner Bedarfs-Mapping-Adminbericht** — eigene Discovery BL-135, kein V8.1-Scope.
- **Founder-Voice-Variante** — Default Strategaize-Wir-Voice, kein Hybrid in V8.1.

### Core Features (V8.1)

| ID | Feature | Zweck |
|----|---------|-------|
| FEAT-067 | Lead-Conversion-Outro-Renderer (PDF + Web-Bericht) | 4-Block-Layout: Strategaize-Vorstellung + 3 Empfehlungs-Cards + Video-Platzhalter + CTA-Slot. Distribution in PDF (@react-pdf v4) und V8-Web-Bericht (React-Component). |
| FEAT-068 | Strategaize-Freigabe-CTA + Dual-Email-Trigger | HMAC-SHA256-Magic-Link (PDF) + Server-Action (Web). Setzt Flag + sendet Lead-Email an BD-Inbox + StB-Partner-Notification. Idempotenz ueber Flag-Check. |
| FEAT-069 | LLM-Augmentation der 3 Empfehlungs-Texte | Bedrock Claude Sonnet eu-central-1. Cache per capture_session. Deterministischer Fallback. Cost-Cap. Tonality-Validation. |

Detail-Specs pro Feature unter `/features/FEAT-067..069-*.md`.

### Constraints

#### Pflicht-Reuse (kein Neubau)
- **V8.0-Theme + Renderer-Foundation** (`src/lib/pdf/mandanten-report-v2/theme.ts` + bestehende Page-Components)
- **selectThreeHebel Pure-Function** (existiert seit SLC-148 MT-4 in `src/lib/sui-engine`)
- **Bedrock-Adapter eu-central-1** (etabliert seit V2, V6.3, bewaehrt)
- **IONOS-SMTP-Adapter** (V4.2 + V7.2 `sendDiagnoseReportByEmail` Pattern)
- **Magic-Link-Token-Pattern** (V7 Self-Signup-Verify-Endpoint nutzt aehnliches HMAC-Pattern — pruefen vor Neu-Implementierung)
- **partner_organization.contact_email** (Pflicht-Feld seit V6 Migration 090)
- **DEC-163 released_for_strategaize_review Flag** (existiert seit V8.0 SLC-148 MT-2)
- **ai_cost_ledger Tabelle** (existiert seit V6, V6.3-Hotfix-Migration 095 hat Constraint-Erweiterung gemacht)
- **Tonality-Audit-Skript** (existiert seit SLC-148 MT-7, V8.1 erweitert es)

#### Pflicht-Tonalitaet
- **Strategaize-Wir-Voice** durchgehend (Default V8-Tonalitaet, NICHT Founder-Voice).
- **Neutral-informativ** fuer StB-Notification (KEIN Glueckwunsch, KEIN Pricing, KEIN Wettbewerb).
- **Strukturiert** fuer BD-Lead-Email (BS-Pipeline-Parser-faehig).
- **Verkaufsorientiert ohne Pricing-Druck** fuer 3 LLM-augmentierte Empfehlungen.

#### Pflicht-Sicherheit
- **HMAC-SHA256-Token** mit min 64-Zeichen-Secret + Expiry-Strict-Check.
- **Idempotenz** ueber Flag-Check verhindert Email-Spam bei Mehrfach-Klick.
- **DSGVO**: Lead-Email + StB-Notification enthalten PII — beide Empfaenger (bd@strategaizetransition.de + StB-Adresse) sind etablierte Strategaize-/Partner-Kanaele.
- **Data-Residency**: Bedrock eu-central-1 Pflicht, IONOS-SMTP EU-DE Pflicht.

### Risks / Assumptions

- **R1** — Strategaize-Vorstellungs-Text muss redaktionell vom Founder freigegeben werden vor Render-Implementierung. Ohne freigegebenen Text kann kein Smoke-PDF generiert werden. (Pre-Slice-Aufgabe in /slice-planning V8.1.)
- **R2** — BS-Inbox-Parser-Existenz unklar. V8.1 nutzt strukturierte Email-Body (HTML + Plain), falls BS-Parser noch nicht existiert: Email landet im BD-Posteingang und wird manuell prozessiert (akzeptabel als V8.1-Fallback).
- **R3** — StB-Partner-Notification kann als unwillkommen wahrgenommen werden. Wording muss vom Founder freigegeben werden vor Live-Schaltung.
- **R4** — PDF-Magic-Link-Token in einem PDF-Anhang ist nicht Single-Use. Mandant koennte Link an Wettbewerber weiterleiten. Risk-Akzeptanz fuer V8.1 (V8.2+ koennte Single-Use ergaenzen).
- **R5** — LLM-Latency 3-8s pro Call x 3 Calls = potentiell 24s bei PDF-First-Render. Caching mitigates. /architecture entscheidet sync vs async-Render-Path.
- **R6** — V8.0-CTA-Page-Position-Kollision (Co-Existenz vs Replacement) — /architecture Q-V8.1-E muss entscheiden.
- **A1** — V8.0 LIVE und 18-24h-Beobachtungs-Window laeuft (bis ~2026-05-31 08:37 UTC). selectThreeHebel-Output ist im V8.0-`report_snapshot` cached und reusable.
- **A2** — partner_organization.contact_email ist seit V6 Pflicht-Feld — Annahme: alle aktiven Partner haben es gesetzt.
- **A3** — Bedrock Claude Sonnet eu-central-1-Adapter existiert seit V2 und ist V6.3-tested.
- **A4** — IONOS-SMTP Adapter + V7.2 sendDiagnoseReportByEmail Pattern sind etabliert und V7.2 LIVE seit ~2 Wochen.

### Success Criteria

- SC-V8.1-1: V8.1-Outro rendert im PDF und V8-Web-Bericht mit allen 4 Bloecken (Strategaize-Vorstellung + 3 Empfehlungs-Cards + Video-Platzhalter + CTA-Slot).
- SC-V8.1-2: Bei CTA-Klick (PDF-Magic-Link oder Web-Action) wird `released_for_strategaize_review = true` Flag gesetzt.
- SC-V8.1-3: Lead-Email an `bd@strategaizetransition.de` wird gesendet mit strukturierten Lead-Daten.
- SC-V8.1-4: StB-Partner-Notification an `partner_organization.contact_email` wird gesendet mit neutral-informativer Tonalitaet.
- SC-V8.1-5: Mehrfach-Klick fuehrt zu keinem doppelten Email-Versand.
- SC-V8.1-6: LLM-Augmentation der 3 Empfehlungs-Texte funktioniert via Bedrock Claude Sonnet eu-central-1 mit deterministischem Fallback bei Fail.
- SC-V8.1-7: Tonality-Audit-Skript erweitert um V8.1-Scope: 0 Treffer auf Blacklist im Smoke-Run.
- SC-V8.1-8: Strategaize-Founder-Smoke-Test (Founder-eigene Diagnose triggert CTA): BD-Email kommt an, StB-Notification kommt an, Bestaetigungs-Page rendert.
- SC-V8.1-9: Smoke-PDF-Output-Pages stimmen mit /architecture-Plan-Decision Q-V8.1-E (Replacement vs Co-Existence) ueberein.
- SC-V8.1-10: Audit-Trail-Eintraege existieren pro Trigger-Event.

### Open Questions (fuer /architecture V8.1)

- **Q-V8.1-A — LLM-Caching-Strategie**: pro capture_session (Default-Vorschlag, analog V8.0 report_snapshot) oder pro (capture_session + model_id + prompt_version)-Tuple? Cache-Invalidation-Strategy bei Modell-Update?
- **Q-V8.1-B — PDF-Magic-Link-Token-Expiry**: 90 Tage (analog Diagnose-Bericht-Gueltigkeit) oder unbeschraenkt? Single-Use ja/nein in V8.1?
- **Q-V8.1-C — Lead-Email-Format an BD-Inbox**: strukturierter JSON-Block im HTML-Comment (fuer BS-Parser-Maschinen-Lesbarkeit) oder rein semantisches HTML (BS parst per ML)?
- **Q-V8.1-D — StB-Notification Tonalitaet + Fallback**: neutral-informativ wie spec oder Glueckwunsch-Voice? Default Empfehlung: neutral-informativ. Plus Fallback-Verhalten wenn `contact_email` leer (silent-skip oder Error?).
- **Q-V8.1-E — Outro-Position im PDF**: vor V8.0-CtaPage (16-17), ersetzt CtaPage komplett, oder eingewoben in CtaPage? Wenn ersetzt: was passiert mit V8.0-Folgegespraech-CTA-Block?
- **Q-V8.1-F — Empfehlungs-Block-Visual-Style**: analog V8.0-Hebel-Block (Page 14 Drei-Spalten/Cards) oder neuer Verkaufs-Style (groesseres Visual pro Card, prominenter CTA)?
- **Q-V8.1-G — Token-State-Speicherung**: separate `cta_token` Tabelle oder Stateless via HMAC-Self-Validation (kein DB-Lookup)?
- **Q-V8.1-H — LLM-Sync-vs-Async-Render**: synchron im PDF-Render-Path (User wartet 24s bei First-Render) oder asynchron via Worker-Job (PDF zeigt deterministische Fallbacks, Cache wird async populated, naechstes Render zeigt LLM-Output)?
- **Q-V8.1-I — Modell-Version-Konfiguration**: hardcoded oder ENV-getrieben? Aktualisierungs-Path bei neuem Sonnet-Release?

### Delivery Mode

**SaaS Product** — unveraendert. Strengste TDD-Disziplin (Token-Generation + Email-Versand-Pfad). Mandatory atomic commits pro Micro-Task ([[git-release]] Rule).

### Slice-Sketch (vorlaeufig, /architecture + /slice-planning entscheiden)

Geschaetzt **3 Slices, ~2-3 Sessions** ueber 1-2 Wochen Implementations-Zeit. Cumulative-Single-Branch-Worktree analog V8.0-Pattern empfohlen.

- **SLC-V8.1-A (geplant) — FEAT-067 + FEAT-069 Backend**: LLM-Adapter-Setup + augmentEmpfehlungsText Pure-Function + Caching-Schema in capture_session.metadata + Bedrock-Smoke-Test gegen Coolify-DB. Deterministischer Fallback. Audit-Trail via ai_cost_ledger.
- **SLC-V8.1-B (geplant) — FEAT-067 Rendering (PDF + Web)**: Outro-Section in PDF (@react-pdf v4 Pages in `src/lib/pdf/mandanten-report-v2/pages/outro.tsx`) + V8-Web-Bericht-Section (`src/app/dashboard/diagnose/[id]/V8OutroSection.tsx`). Visual-Konsistenz beider Pfade. Tonality-Audit-Skript-Erweiterung.
- **SLC-V8.1-C (geplant) — FEAT-068 CTA-Mechanik + Dual-Email**: Magic-Link-Token-Generierung + `/strategaize-anfrage` Endpoint + Web-Server-Action + Dual-Email-Versand BD + StB + Bestaetigungs-Page + Idempotenz + Audit-Trail. ENV-Variablen-Setup. Live-Smoke gegen Founder-Test-Diagnose.

Reihenfolge SLC-V8.1-A vor SLC-V8.1-B (LLM-Output braucht es im Renderer), SLC-V8.1-B vor SLC-V8.1-C (CTA braucht funktionalen Renderer als Trigger-Slot).

Realistische Sessions: 1 LLM-Backend-Session + 1 Renderer-Session + 1 CTA-Mechanik-Session.

### Detail-Spec
V8.1-Requirements-Completion-Report wird in dieser Session erstellt als RPT-364. Feature-Specs unter `/features/FEAT-067..069-*.md`. /architecture-Schritt klaert Q-V8.1-A..I und definiert /slice-planning V8.1-Vorbereitung.

## V9 — Bulk-Import GF-Email -> Pattern-Extraktion -> Handbuch-Vervollstaendigung

Requirements DONE 2026-06-01 via RPT-374, basierend auf /discovery RPT-373 2026-06-01 + V9-Re-Eval RPT-372 (Diary-Mode deferred, V9-Slot neu belegt). V9 ist die erste Plattform-Iteration, die unstrukturierte Email-Korrespondenz als Wissens-Quelle erschliesst. Founder-Pull BL-146: "GF hat hier eine ganze Menge E-Mails, die er täglich hin und her schickt — da ist sehr viel Wissen rauszuziehen."

### Problem Statement

Operatives Wissen (Kunden-Umgang, wiederkehrende Antwort-Muster, Vertriebs-Loesungen, Entscheidungsbegruendungen) liegt zu erheblichen Teilen in Email-Korrespondenz und nicht in strukturierten Quellen. Questionnaire/Evidence/Walkthrough-Modi adressieren das nicht — Email-Inboxes sind too tief und vendor-abhaengig (IMAP, OAuth, PST). Klassischer Inbox-Zugriff ist privacy-tief und scope-breit. V9 oeffnet den Email-Korpus ueber den schmalsten DSGVO-konformen Pfad (Export-Format-Upload, GF kuratiert manuell welcher Folder rein darf).

### Goal / Intended Outcome

GF kann eine `.mbox`-Datei (Gmail-Takeout, Outlook-Export, Thunderbird, Apple Mail) hochladen, durchlaeuft eine KI-gestuetzte 4-Stufen-Pipeline (Pre-Filter -> Thread-Aggregation -> PII-Redaction -> Pattern-Extraktion) und entscheidet im Curation-UI welche extrahierten Pattern als zusaetzliche `knowledge_unit`-Rows in den V4.1-Handbuch-Snapshot fliessen. Mindestens 5 wiederkehrende Antwort-Muster pro 1000-Email-Corpus identifiziert + curated + im Handbuch konsumierbar.

### Target Users (V9.0)

- **GF im eigenen Tenant (tenant_admin)**: einzige Persona V9.0. NICHT Mandant im Multiplikator-Pfad (Privacy-tief, V10+), NICHT Mitarbeiter (V9.2+), NICHT Customer-Service-Mitarbeiter (V10+).
- **strategaize_admin (sekundaer)**: sieht Audit-Trail Cross-Tenant fuer Compliance + Pattern-Quality-Review.

### V9.0 In Scope

1. **Upload + Parser (FEAT-070)**: `.mbox` + `.eml`-Multi-Upload, `mailparser`-Lib, Roh-Datei-Storage Tenant-isoliert, Email-Persistierung mit Pflicht-Headern (message_id, in_reply_to, references), Bulk-Run-Audit-Header.
2. **KI-Pre-Filter (FEAT-071)**: Bedrock Claude Haiku eu-central-1, 6-Label-Klassifikation (content/short_reply/notification/newsletter/private/unclear), Filter-Review-UI mit Bulk-Reclassify, Cost-Tracking pro Run.
3. **Thread-Aggregation + PII-Redaction (FEAT-072)**: RFC-5322-Header-basierte Thread-Bildung, Reuse V5 PII-Pipeline mit Email-spezifischen Patterns (Signaturen, Email-Adressen-Headers), Pseudonymisierung pro Thread.
4. **Pattern-Extraktion + Curation-UI (FEAT-073)**: Bedrock Claude Sonnet eu-central-1, Strict-JSON-Output (themes/patterns/decisions/open_questions), Curation-UI mit Akzeptieren/Ablehnen/Editieren + Section-Zuordnung, Cost-Cap pro Run + pro Tenant/Monat mit Pre-Approval.
5. **Handbuch-Integration + Audit/Cost-Tracking (FEAT-074)**: Idempotente Pattern -> knowledge_unit-Uebersetzung, Source-Attribution-Metadata, Handbuch-Snapshot-Trigger, Source-Attribution-View im Reader, vollstaendiger Audit-Trail pro Run, Cost-Aggregation pro Tenant/Monat.

### V9.0 Out of Scope (verschoben nach V9.1+/V10+)

- **Forward-Bucket-Email (V9.1+)**: Inbound-SMTP-Vendor (Mailgun/SES/Postmark) noetig, IONOS ist nur Outbound. ~1-2 Wochen Setup.
- **Customer-Service-Ticket-Bulk (V9.1+)**: Helpdesk-CSV-Export-Parser, anderes Format.
- **Multi-Mitarbeiter-Upload (V9.2+)**: FEAT-022 Employee-Rolle reuse, Per-User-Bucket + RLS-Erweiterung.
- **IS-Knowledge-Push (V9.1+)**: wartet auf IS V3.5 SLC-352 Knowledge-API LIVE + Anwalts-Sign-off.
- **Auto-Response-Generator (V10+)**: greenfield Konsum-Pfad, eigene Discovery.
- **Sales-Objection-Handling-Bibliothek (V10+)**: greenfield Konsum, eigene Discovery.
- **CRM-Pipeline-Connector (V10+)**: eigene Daten-Quelle.
- **IMAP-Live-Sync (V10+)**: Connection-Pool, Inbox-Watch, Idempotenz-via-Server-UID.
- **Outlook-PST-Format (V10+)**: Outlook-only-Nische.
- **Mandanten-eigene Email-Uploads im Multiplikator-Pfad (V10+)**: Privacy-tief, extra Anwalts-Pass.
- **KI-augmentierte Email-Beantwortung in GF-Inbox (V10+)**: reines Outbound-Tool, raus aus Onboarding-Scope.
- **Pattern-Diff zwischen Mitarbeiter-Bulk und GF-Bulk (V10+)**: Bridge-Engine V2 Use-Case.
- **Attachment-Inhalts-Persistierung (V9.1+)**: nur Metadaten in V9.0.
- **Auto-Akzeptanz ohne GF-Review (V10+)**: jedes Pattern V9.0 muss GF-Approved sein.
- **Pattern-Diff zwischen Bulk-Runs (V10+)**: Cross-Run-Pattern-Konsolidierung.

### Core Features (V9.0)

| ID | Feature | Zweck |
|----|---------|-------|
| FEAT-070 | Bulk-Email-Upload + .mbox/.eml-Parser | Upload-Foundation, Storage-Persistierung, Pflicht-Header-Parsing |
| FEAT-071 | KI-Pre-Filter-Klassifikation (Haiku) + Filter-Review-UI | Volumen-Reduktion ~90%, 6-Label-Klassifikation, GF-Korrektur vor Sonnet-Pass |
| FEAT-072 | Thread-Aggregation + PII-Redaction-Pipeline | Konversations-Threads als Pattern-Einheit, DSGVO-konforme Pseudonymisierung |
| FEAT-073 | Pattern-Extraktion (Sonnet) + Curation-UI | Eigentliche Wert-Hebel: KI extrahiert + GF kuratiert wiederkehrende Pattern |
| FEAT-074 | Handbuch-Integration + Audit/Cost-Tracking | Pattern -> knowledge_unit in V4.1-Handbuch, Source-Attribution, Audit + Cost |

Detail-Specs unter `/features/FEAT-070..074-*.md`.

### Constraints

#### Technologie
- **LLM-Provider**: AWS Bedrock eu-central-1 (Frankfurt) Pflicht (data-residency.md). Haiku fuer Pre-Filter + Sonnet fuer Pattern-Extraktion. KEIN OpenAI direkt, KEIN US-Region.
- **PII-Redaction**: V5-Pipeline-Reuse Pflicht (kein neuer Adapter ohne Begruendung), Email-spezifische Pattern-Erweiterung erlaubt.
- **Storage**: Supabase Storage, Tenant-RLS-isoliert. /architecture entscheidet neuer Bucket vs evidence-Bucket-Reuse (Q-V9-H).
- **Schema**: /architecture entscheidet evidence_chunk-Erweiterung vs neue `email_message` + `email_thread` + `email_pattern` + `email_bulk_run`-Tabellen (Q-V9-B).
- **Reuse-Pflicht** (siehe `.claude/rules/strategaize-pattern-reuse.md`): RLS-Helper-Functions, Bedrock-Adapter, ai_cost_ledger, Multi-File-Upload-Component, V4.1-Snapshot-Mechanik.

#### Organisatorisch
- **GF-Curation-Pflicht (V9.0)**: kein Auto-Import von Pattern ohne GF-Review.
- **Cost-Cap-Pflicht**: pro Bulk-Run Default-Cap (V9.0-Vorschlag 20 EUR) + Pre-Approval-Modal, pro Tenant/Monat Hard-Cap (V9.0-Vorschlag 100 EUR). /architecture entscheidet finale Werte.
- **Audit-Trail-Pflicht (DSGVO + COMPLIANCE.md)**: jeder LLM-Call mit Provider + Region + Modell + Token-Count + Cost. Audit unloeschbar 7 Jahre.

#### Sprache / Inhalt
- V9.0 default deutsch + englisch (V5-PII-Pattern-Stand). Multi-Lingual-Pre-Filter erst V9.1+.

### Risks / Assumptions

#### Risiken
- **R1 — LLM-Kosten-Modell unbestaetigt**: ~0.10 EUR Pre-Filter (Haiku) + ~5 EUR Pattern-Extraktion (Sonnet) pro 1000 Emails sind /discovery-Schaetzungen. /architecture muss mit Test-Email-Corpus + echten Bedrock-Token-Counts validieren bevor /backend startet. Bei Faktor-2-Abweichung: Cost-Cap-Werte anpassen.
- **R2 — PII-Redaction-Pattern V5 ist Walkthrough-zugeschnitten**: Email-Inhalt hat anderen Pattern (Signaturen, Email-Adressen-Headers, eingebettete Kontakte). /architecture pruft ob V5-Pipeline direkt anwendbar oder Email-Adapter zwischen Pflicht.
- **R3 — Pattern-Qualitaet bei nur 100-Email-Corpus**: kleine Korpora liefern evtl. wenig Pattern. Test-Corpus in /architecture validiert Qualitaets-Schwelle.
- **R4 — Bulk-Run-Worker-Performance**: 50.000 Emails Bulk-Run -> 50 Haiku-Batches + 200 Sonnet-Calls + viel Worker-Zeit. /architecture entscheidet Worker-Tier oder Async-Job-Queue-Pattern.
- **R5 — Storage-Kosten**: `.mbox`-Files koennen mehrere GB sein. Tenant-Storage-Quota Pflicht. /architecture entscheidet Quota-Default + Auto-Delete-Pattern.
- **R6 — Curation-UI Fatigue**: 50 Pattern zu kurieren ist viel. Bulk-Aktionen + Confidence-Sortierung helfen, /architecture pruft UX.

#### Annahmen
- GF kann selbst eine `.mbox`-Datei aus seinem Mail-Client exportieren (Gmail-Takeout-Pfad, Outlook-Export-Pfad, Thunderbird-Pfad, Apple-Mail-Pfad alle dokumentiert User-Guide-Pflicht in /go-live).
- V8.1 STABLE-Bestaetigung erfolgt vor V9 /backend-Start (Burn-In-Ende ~2026-06-02 08:00 UTC).
- V4.1 Handbuch-Reader (FEAT-028) bleibt der Konsum-Endpunkt (KEIN neuer Reader fuer V9).
- ai_cost_ledger V5 reicht fuer Audit, evtl. mit Subschema-Erweiterung.

### Success Criteria (V9.0 Gesamt)

- SC-V9-1: GF kann `.mbox`-Datei (Gmail-Takeout-Format) hochladen, Plattform parsed N Emails ohne Datenverlust (Pflicht-Headers + body_text).
- SC-V9-2: Pre-Filter klassifiziert 1000 Emails in <10 Min mit <0.20 EUR Kosten.
- SC-V9-3: GF kann Klassifikationen korrigieren bevor Pattern-Extraktion laeuft.
- SC-V9-4: Thread-Aggregation gruppiert Emails zu Konversations-Threads via RFC-5322-Headers.
- SC-V9-5: PII-Redaction entfernt Klarnamen + Email-Adressen + Telefonnummern (Stichprobe pro Run prueft 10% Threads).
- SC-V9-6: Pattern-Extraktion identifiziert min. 5 wiederkehrende Antwort-Muster aus Test-Corpus (~100 Threads).
- SC-V9-7: Curation-UI erlaubt Akzeptieren/Ablehnen/Editieren von Pattern + Section-Zuordnung.
- SC-V9-8: Akzeptierte Pattern erscheinen als knowledge_unit-Rows in V4.1-Handbuch-Snapshot, im V4.1-Reader konsumierbar.
- SC-V9-9: Source-Attribution belegt fuer jedes Pattern die Email/Thread-Quelle, Pseudonyme-konform.
- SC-V9-10: Audit-Trail-Vollstaendigkeit: Upload + Pre-Filter + Threading + Redact + Pattern + Curation + Import nachweisbar, LLM-Calls dokumentiert mit Region (eu-central-1) + Token-Count + Cost.
- SC-V9-11: Cost-Cap pro Bulk-Run + pro Tenant/Monat enforced, Pre-Approval-Modal funktional.
- SC-V9-12: Tenant-RLS verhindert Cross-Tenant-Read auf alle neuen Tabellen (Pen-Test-Erweiterung Pflicht in /qa).

### Open Questions (fuer /architecture V9)

- **Q-V9-A — PII-Redaction-Pattern Email-Adapter**: V5-Pipeline direkt anwendbar oder Email-spezifischer Adapter Pflicht? Wenn Adapter: welche Pattern (Signaturen, Headers, embedded Kontakte)?
- **Q-V9-B — Schema-Erweiterung vs neue Tabellen**: evidence_chunk + evidence_file erweitern (analoge Foundation) oder neue Tabellen `email_message` + `email_thread` + `email_pattern` + `email_bulk_run` (klarere Trennung, mehr Migration-Arbeit)?
- **Q-V9-C — Worker-Pipeline-Stufen-Sequenz**: synchron (alle Stufen in einem Worker-Job-Lauf) oder asynchron (jeder Stufen-Wechsel triggert naechsten Job, GF kann zwischen Stufen entscheiden)?
- **Q-V9-D — Test-Email-Corpus**: /architecture braucht anonymisierten Test-Corpus (~100 Founder-Emails) als Pre-Step fuer Cost + Pattern-Qualitaets-Validation. Wer liefert + wann?
- **Q-V9-E — Pattern-Extraktion-Trigger**: synchron per "Pattern-Extraktion starten"-Button (GF wartet) vs asynchron via Worker (GF sieht Status, kommt zurueck)?
- **Q-V9-F — Curation-UI Section-Zuordnung**: vorgegebene Sections aus V4.1-Handbuch-Template-Liste vs free-text-Sections mit Auto-Komplett? Default Empfehlung: vorgegebene Sections mit "Andere..."-Option.
- **Q-V9-G — Cost-Cap Hard/Soft + Pre-Approval-Schwelle**: pro Bulk-Run 20 EUR Default + Pre-Approval-Modal? pro Tenant/Monat 100 EUR Hard-Cap? Welche Schwelle triggert Pre-Approval-Modal (5 EUR? 10 EUR? 20 EUR)?
- **Q-V9-H — Storage-Bucket**: neuer `bulk-email`-Bucket vs evidence-Bucket-Reuse? evidence-Reuse: konsistent zur Foundation. neuer Bucket: klarere Storage-Quota pro Capture-Mode.
- **Q-V9-I — Klassifikations-Schema-Customizing**: 6-Labels-Default kanonisch oder pro Tenant erweiterbar (V9.0 nein, V9.2+ ja — bestaetigen)?
- **Q-V9-J — mailparser-Lib-Stabilitaet**: `mailparser` ist Standard fuer Node, /architecture prueft Versionierung + Bekannte-Bugs + Alternativen (z.B. `emailjs-mime-parser`).

### Delivery Mode

**SaaS Product** — unveraendert. Strengste TDD-Disziplin (PII-Redaction-Pipeline + Cost-Cap-Logik + Tenant-RLS). Mandatory atomic commits pro Micro-Task ([[git-release]] Rule). Eigener Worktree (SaaS-Mode-Pflicht).

### Slice-Sketch (vorlaeufig, /architecture + /slice-planning entscheiden)

Geschaetzt **3-5 Slices, ~2-3 Wochen Implementations-Zeit**. Cumulative-Single-Branch-Worktree analog V8.0/V8.1-Pattern.

- **SLC-V9-A (geplant) — FEAT-070 Upload + Parser**: `.mbox`/`.eml`-Upload, mailparser-Wiring, Storage-Bucket-Setup, email_bulk_run + email_message-Tabellen (oder evidence-Erweiterung Q-V9-B), Status-View. Pre-Cond: Test-Corpus von Founder.
- **SLC-V9-B (geplant) — FEAT-071 Pre-Filter Haiku**: Bedrock-Haiku-Adapter, Klassifikations-Worker, Filter-Review-UI mit Bulk-Reclassify, Cost-Tracking-Integration.
- **SLC-V9-C (geplant) — FEAT-072 Thread-Aggregation + PII-Redaction**: Header-basierte Thread-Bildung, V5-PII-Pipeline-Adapter, Pseudonymisierung, email_thread-Tabelle.
- **SLC-V9-D (geplant) — FEAT-073 Pattern-Extraktion + Curation**: Sonnet-Adapter, Pattern-Extraktion-Worker, Strict-JSON-Output, Curation-UI mit Akzeptieren/Ablehnen/Editieren, Cost-Cap-Logik + Pre-Approval-Modal.
- **SLC-V9-E (geplant) — FEAT-074 Handbuch-Integration + Audit**: knowledge_unit-Insert mit Source-Attribution, Snapshot-Trigger, Source-Attribution-View, Audit-Aggregation, Cost-Aggregation, Final-Stats-Anzeige.

Reihenfolge linear (SLC-V9-A -> SLC-V9-B -> SLC-V9-C -> SLC-V9-D -> SLC-V9-E). /architecture pruft ob Slices A+B oder D+E zusammenlegbar (Reduktion auf 3-4 Slices moeglich, abhaengig von Q-V9-B/C/E).

### Pre-Conditions

- V8.1 STABLE-Bestaetigung (Burn-In bis ~2026-06-02 08:00 UTC, /post-launch danach).
- Optional Founder-Final-Tausch ISSUE-084 + ISSUE-085 vor erstem realen V8.1-Lead.
- Test-Email-Corpus (~100 anonymisierte Founder-Emails) bereitgestellt fuer /architecture-Validation (Q-V9-D).

### Detail-Spec
V9-Requirements-Completion-Report wird in dieser Session erstellt als RPT-374. Feature-Specs unter `/features/FEAT-070..074-*.md`. /architecture-Schritt klaert Q-V9-A..J und definiert /slice-planning V9-Vorbereitung. Naechster Schritt nach diesem Skill: /architecture V9.
