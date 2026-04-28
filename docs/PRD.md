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

## V4.2 — Self-Service-Cockpit ausgebaut

### Problem Statement (V4.2)
V4 liefert ein minimales Status-Cockpit ("wo stehen wir"). Wenn der Kunde tiefer einsteigen will, braucht er den Berater — V4 ist kein Self-Service-Werkzeug, sondern nur ein Status-Display. V4.2 macht es zum echten Self-Service-Cockpit.

### Goal (V4.2)
Ein neuer tenant_admin kann sich anmelden und ohne Berater-Hilfe das gesamte Onboarding starten und durchziehen. Mitarbeiter-Erinnerungen passieren automatisch. Hilfe ist im Tool, nicht im Kopf des Beraters.

### V4.2 In Scope (Skizze, Detail kommt mit eigenem /requirements V4.2)
- Tenant-Onboarding-Wizard (Erste-Schritte, Begruessung, Template-Auswahl, erste Mitarbeiter einladen)
- In-App-Hilfe pro Hauptansicht (Sidebar-Help, Tooltips)
- Capture-Reminders (E-Mail an Mitarbeiter, In-App-Badge fuer GF)
- Status-Dashboards mit naechsten empfohlenen Schritten
- Eventuell: Tenant-Self-Service-Signup (offene Frage, evtl. spaeter)

### V4.2 Out of Scope (vorlaeufig)
- AI-gestuetzte Hilfe (Chat-Bot im Tool) → spaeter
- Mehrsprachige Hilfe → spaeter (Tenant-Language gilt)
- Externe Onboarding-Videos / Tutorials-Hosting → spaeter
