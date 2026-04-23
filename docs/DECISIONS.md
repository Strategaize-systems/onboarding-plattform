# Decisions

## DEC-001 — Code-Basis aus Blueprint V3.4 uebernommen
- Status: accepted
- Reason: Blueprint V3.4 ist produktiv, erprobt und bringt vollstaendigen Stack mit (Auth, Supabase, Docker, UI-Bibliothek, Deployment). Neu-Bau von Infrastruktur waere Zeitverschwendung.
- Consequence: Blueprint-spezifische Features (questionnaires, mirror, debrief) liegen zunaechst im Code und werden in spaeteren Slices entweder als erstes Template gekapselt oder auf generische Konzepte umgebaut.

## DEC-002 — Deployment-Flexibilitaet als harte Architektur-Regel
- Status: accepted
- Reason: Kunden-Anforderungen reichen von kleinen Multi-Tenant-Szenarien ueber dedizierte Server bis hin zu On-Premise-Lizenzen. Die Plattform muss alle drei Modelle aus einer Codebasis bedienen koennen.
- Consequence: Keine Hardcoded Domains/Tenants/Kunden-Namen. Konfiguration ausschliesslich ueber Environment-Variablen. Strikte RLS-Isolation. Docker-Compose als portables Deployment-Artefakt.

## DEC-003 — Template-ready, aber nicht Template-first
- Status: accepted
- Reason: Ein echtes Template-System ab V1 waere Ueberengineering. Gleichzeitig darf V1 kein Schema etablieren, das spaeter ein Template-System blockiert.
- Consequence: Kernobjekte werden generisch benannt und modelliert. Blueprint-spezifische Begriffe (z.B. "questionnaire") bleiben vorerst als konkrete Auspraegung bestehen, werden aber in /architecture auf Erweiterbarkeit geprueft.

## DEC-004 — KI-first Grundprinzip (Mensch nur im Meeting-Review)
- Status: accepted
- Reason: Das Geschaeftsmodell der Plattform beruht darauf, dass Consultant-Zeit skalierbar wird. Das funktioniert nur, wenn KI die Hauptarbeit (Wissenssammeln, Verdichten, Mustererkennung, Luecken-Detektion) uebernimmt und Menschen ausschliesslich im definierten Meeting-Review-Punkt pro Block taetig werden. Jedes Feature, das einen Berater als Durchfuehrer vorsieht, unterwandert das Modell.
- Consequence: Weder V1 noch spaetere Versionen sehen eine Rolle vor, in der ein Strategaize-Mitarbeiter neben dem Kunden sitzt und beim Beantworten hilft. Die Wissenserhebung ist immer Kunde+KI allein. Der Berater kommt erst nach Block-Submit + KI-Verdichtung in einem Meeting zum Einsatz, um den verdichteten Stand durchzugehen und zu finalisieren.

## DEC-005 — Operating-System-Code wird portiert, nicht neu gebaut
- Status: superseded
- Superseded by: DEC-014
- Reason: Das strategaize-operating-system-Repo hat eine weitgehend fertige Ebene-1-Verdichtung (block_sessions, debrief_items, Worker, Import-Endpoint, Query-Layer), die zu 80–100% portierbar ist. Neu-Bau waere Zeitverschwendung.
- Consequence: (Urspruenglich: Single-Pass-Verdichtung fuer V1. Revidiert durch DEC-014 — der 3-Agenten-Loop kommt in V1, nicht erst V2.)

## DEC-006 — LLM-Provider ist AWS Bedrock (Claude), kein Ollama
- Status: accepted
- Reason: Ollama lokal haette geringe Qualitaet fuer Verdichtung und wuerde spaeter den 3-Agenten-Loop limitieren. Claude ueber AWS Bedrock (Frankfurt) ist im Blueprint/Business-System-Stack bereits eingefuehrt und liefert die fuer KI-first Wissensextraktion erforderliche Qualitaet. Kosten sind kontrollierbar ueber on-click KI-Features und Volume-Management (siehe feedback_bedrock_cost_control).
- Consequence: Die aus dem OS portierten Worker (heute Ollama-basiert) werden auf Bedrock-SDK umgestellt. Keine duale Provider-Strategie in V1. Die `ollama-client.ts` aus dem OS wird nicht portiert, stattdessen wird der bestehende Bedrock-Client aus Blueprint V3.4 uebernommen. Prompt-Templates werden fuer Claude Sonnet optimiert.

## DEC-007 — Verdichtung laeuft in separatem Worker-Container via ai_jobs-Queue
- Status: accepted
- Reason: Single-Pass-Verdichtung dauert typisch 5–30 Sekunden pro Block — zu lange fuer einen synchronen HTTP-Request im Next.js/Coolify-Proxy-Setup. Das OS hat bereits einen Polling-Worker gegen eine `ai_jobs`-Queue (SKIP LOCKED, atomic claim), der direkt portierbar ist. Alternativen (Supabase Edge Functions, HTTP-Worker mit Trigger) waeren in V1 Overhead gegenueber dem bereits vorhandenen Muster.
- Consequence: Docker-Compose bekommt einen zweiten Service `worker` neben `app`. Worker laeuft auf Node, pollt `ai_jobs` (Default 2000 ms), ruft Bedrock auf, schreibt Knowledge Units via RPC. Kein HTTP-Endpoint, nur DB-Verbindung via Service-Role. Block-Submit enqueued einen Job per INSERT, Worker picked ihn auf. Der Worker-Code wird aus `strategaize-operating-system/src/workers/ai/blueprint-block-draft-worker.ts` portiert (Umbenennung + Bedrock-Umbau).

## DEC-008 — Confidence-Indikator ist 3-Stufen-Enum (low / medium / high)
- Status: accepted
- Reason: Eine Float-Skala 0.0–1.0 klingt praezise, ist aber LLM-unstabil — Claude liefert Enum-Werte reproduzierbarer als fein abgestufte Zahlen. Das Debrief-UI muss fuer strategaize_admin in Sekunden lesbar sein; drei Kategorien reichen fuer den Review-Flow. Eine feinere Skala kann spaeter additiv eingefuehrt werden.
- Consequence: `knowledge_unit.confidence text CHECK (confidence IN ('low','medium','high'))`. Prompt-Template verlangt Enum-Output. Debrief-UI rendert Ampel-Icons pro Stufe. Aggregation bleibt qualitativ — kein statistisches Scoring in V1.

## DEC-009 — V1-Export ist ausschliesslich JSON
- Status: accepted
- Reason: JSON ist billig zu generieren, maschinenlesbar und deckt den V1-Einsatzfall ab (User-interner Test + erster Pilotkunde). PDF mit gestyltem Layout ist ein separates Arbeitspaket (Layout, Branding, Print-CSS), das in V1 keinen Business-Wert liefert. Markdown waere billig, aber bis zum ersten echten Export-Bedarf wissen wir nicht, welches Target-Format Kunden brauchen — besser warten.
- Consequence: FEAT-006 liefert nur `GET /api/export/checkpoint/{id}` mit `application/json`. Markdown / PDF / Template-Report-Generierung bleiben V2+.

## DEC-010 — Rolle heisst kanonisch `tenant_admin` (Blueprint-Rolle `tenant_owner` wird umbenannt)
- Status: accepted
- Reason: Das PRD und die Discovery verwenden durchgaengig `tenant_admin`. Der Blueprint-Code verwendet aus historischen Gruenden `tenant_owner` (aus Zeiten, als "Owner" als Begriff diskutiert wurde). Zwei Bezeichner fuer die gleiche Rolle sind eine Wartungs-Falle und wuerden spaeter Docs/Schema auseinanderdriften lassen. Die Onboarding-Plattform ist der richtige Moment, einen sauberen Rollen-Namen einzufuehren.
- Consequence: Die erste eigene Migration der Onboarding-Plattform (Migration 021) enthaelt einen UPDATE auf bestehende Auth-User-Metadaten und eine Anpassung der `auth.user_role()`-Helper-Funktion. Alle RLS-Policies der neuen Tabellen verwenden `tenant_admin`. Der Blueprint-Code, der noch auf `tenant_owner` referenziert, wird in Slice SLC-002 konsequent umbenannt.

## DEC-011 — Seed-User via Supabase-Admin-API statt direkter INSERT in auth.users
- Status: accepted
- Reason: SLC-002b muss `strategaize_admin` + Demo-`tenant_admin` anlegen, um echten Login-Smoketest zu ermoeglichen. Zwei Wege: (1) SQL-Migration mit direktem INSERT in `auth.users` samt bcrypt-Hash via pgcrypto, oder (2) One-Shot-Node-Script via `supabase.auth.admin.createUser`. Weg 1 ist fragil: `auth.users` ist Supabase-internes Schema (aud, instance_id, confirmation_token, zugehoerige `auth.identities`-Row), Bcrypt-Round-Count-Mismatch zwischen pgcrypto und GoTrue ist bekannte Support-Falle, Postgres-Custom-Config `-c onboarding.seed_...` fuer ENV-Pass leakt Credentials in pg_stat_activity. Weg 2 nutzt den stabilen Supabase-Vertrag (handled bcrypt + identities + email_confirm + Metadaten) und passt zum manuellen Coolify-Deploy-Rhythmus.
- Consequence: `sql/migrations/027_seed_demo_tenant.sql` legt nur die Demo-Tenant-Row an (public-Schema, fixe UUID `00000000-0000-0000-0000-0000000000de`). `scripts/seed-admin.mjs` laeuft per `docker exec <onboarding-app> npm run seed:admin` einmalig nach dem ersten Deploy und legt die zwei User plus Profile-Reconcile an. Seed-User sind nicht als versionierte Migration getrackt, sondern operativer Zustand ueber `docs/RUNBOOK.md`. Credential-Rotation erfolgt ueber `supabase.auth.admin.updateUserById` (RUNBOOK dokumentiert den Weg).

## DEC-012 — Owner-Profile wird aus V1 vollstaendig entfernt, V2+ template-spezifisch wieder eingefuehrt
- Status: accepted
- Reason: Der Blueprint-geerbte Owner-Profile-Flow (owner_profiles-Tabelle, /profile-UI, API, Prompt-Personalisierung an 6 Call-Sites) war fuer den M&A-Exit-Readiness-Use-Case gedacht. Die Onboarding-Plattform ist produkt-agnostisch und hostet mehrere Templates (Exit-Readiness, ImmoCheckheft, ggf. weitere). Ein generisches Owner-Profil mit fixer Struktur (Alter, Ausbildung, Fuehrungsstil, DISC-Typ, Jahre-als-Inhaber, freie Vorstellung) passt nicht zu jedem Template. Zusaetzlich hat sich in SLC-002b gezeigt, dass die owner_profiles-Tabelle gar nicht in der Onboarding-DB angelegt war (Migrations 012 + 014 nicht im Runner) → der Flow war silent broken und hat den Login-Smoketest blockiert (ISSUE-009).
- Consequence: SLC-002d entfernt den kompletten Blueprint-Owner-Profile-Flow (UI, API, DB-Lookups, Sidebar-Link, i18n-Keys). Migration 028 droppt owner_profiles-Tabelle idempotent. `buildOwnerContext` + `OwnerProfileData` bleiben als ungenutzter Dead Code in `src/lib/llm.ts` — wird in V2+ wiederverwendet, wenn die Template-spezifische Owner-Erhebung (in Form von Fragen im Questionnaire oder als Template-Feld) eingefuehrt wird. V2+ Template-Varianten entscheiden selbst, ob und welche Owner-Metadaten erhoben werden. `/mirror/profile` bleibt unveraendert, weil das ein separater Flow (Operational-Reality-Mirror) aus der OS-Portierung ist.

## DEC-013 — Antworten als JSONB-Spalte auf capture_session, nicht separate Tabelle
- Status: accepted
- Reason: Autosave (Debounce 500ms) erzeugt haeufige Schreibvorgaenge. Eine separate `capture_answer`-Tabelle wuerde N UPSERTs pro Save-Vorgang bedeuten und RLS-Policies fuer eine zweite Tabelle erfordern. JSONB auf Session-Ebene ist ein einziger UPDATE-Merge pro Save. V1 hat keine Multi-User-Gleichzeitigkeit pro Session (nur owner_user_id arbeitet), daher kein Row-Level-Locking-Problem. Der Key-Pattern `"${blockKey}.${questionId}"` erlaubt spaetere Migration in eine separate Tabelle, falls V2+ Multi-User-Capture oder granulare RLS benoetigt.
- Consequence: Migration 030 fuegt `answers jsonb NOT NULL DEFAULT '{}'::jsonb` auf `capture_session` hinzu. Autosave merged per `jsonb_concat` (jsonb || jsonb). Lesen: ein SELECT auf capture_session liefert alle Antworten. Kein neues RLS-Policy-Set noetig — die bestehende capture_session-RLS schuetzt automatisch.

## DEC-014 — Multi-Agent-Loop (Analyst+Challenger) statt Single-Pass in V1
- Status: accepted
- Supersedes: DEC-005 (Verdichtungs-Teil)
- Reason: DEC-005 stufte den 3-Agenten-Loop als "nur Idee im OS" ein. Tatsaechlich existieren alle drei Skills vollstaendig spezifiziert im Operating System (blueprint-analyze 301 Zeilen, blueprint-challenge 274 Zeilen, blueprint-loop 455 Zeilen). OS DEC-002 verwarf den Single-Pass-Ansatz explizit als unzureichend fuer Exit-Readiness-Beratung. Die Praemisse von DEC-005 war faktisch falsch. Single-Pass-Verdichtung produziert unkontrollierte KI-Ergebnisse, die dem KI-first-Qualitaetsanspruch (DEC-004) widersprechen. Der Worker (SLC-008) ist noch nicht gebaut — Umstellung verursacht null Rework.
- Consequence: FEAT-005 wird umbenannt von "Single-Pass AI Condensation" zu "Multi-Agent AI Condensation (Analyst+Challenger Loop)". SLC-008 implementiert den Analyst→Challenger→Convergence-Loop (2-8 Iterationen) im Worker-Container. Prompts werden aus den OS-Skills portiert und auf Bedrock-Format umgestellt. Kosten-Schaetzung: $0.10-$0.40 pro Block, $0.90-$3.60 pro Session — fuer B2B-SaaS akzeptabel. DB-Schema (ai_jobs, block_checkpoint, knowledge_unit) bleibt unveraendert.

## DEC-015 — SLC-007 Exception-Mode reverted, Blueprint-Chat-Flow in SLC-008 integriert
- Status: accepted
- Reason: Live-Test 2026-04-17 zeigte: (1) Exception-Feld ("Ausnahmen & Ergaenzungen") hat keinen Use-Case — im Onboarding-Modell arbeitet der Teilnehmer allein mit KI, kein Berater sitzt daneben. (2) Die Questionnaire-UI divergierte massiv vom Blueprint-Flow: falsches Direkt-Textarea rechts, fehlende Summary/Memory-Features. User hat explizit klargemacht: Blueprint-UI 1:1 replizieren, nichts Neues erfinden.
- Consequence: SLC-007 komplett reverted (exception-field.tsx, Tests, submit-action-Integration, Direkt-Textarea entfernt). FEAT-004 Status reverted. SLC-008 erweitert um Teil A (Blueprint-Chat-Flow: Bedrock-Client, Chat-API mit Memory, Zusammenfassung, UI-Umbau auf Blueprint-Referenz) zusaetzlich zu Teil B (Worker + Verdichtung). Micro-Tasks MT-A1..A6 hinzugefuegt.

## DEC-016 — Manuell hinzugefuegte Knowledge Units erhalten source='manual'
- Status: accepted
- Reason: Im Debrief-Meeting kann der strategaize_admin eigene Beobachtungen, Erkenntnisse oder Massnahmen ergaenzen, die nicht aus dem Fragebogen oder der KI-Verdichtung stammen. Diese brauchen eine eigene Source-Kennzeichnung, um im Audit-Trail und in der UI klar von KI-generierten oder Fragebogen-basierten KUs unterscheidbar zu sein. Der Wert 'manual' existiert bereits im CHECK-Constraint von knowledge_unit.source (Migration 021).
- Consequence: RPC `rpc_add_knowledge_unit` (Migration 037) setzt `source = 'manual'` fuer alle vom Admin manuell erstellten KUs. Confidence wird auf 'medium' gesetzt (Admin-Input, nicht KI-validiert). Die UI zeigt 'Manuell' als Source-Badge. Validation-Layer erhaelt einen initialen 'comment'-Eintrag bei Erstellung.

## DEC-017 — Orchestrator und alle neuen V2-Job-Types laufen im bestehenden Worker-Container
- Status: accepted
- Reason: V1 hat einen einzelnen Worker-Container mit Polling-Loop gegen ai_jobs (SKIP LOCKED). Dieser Ansatz skaliert horizontal (mehrere Worker-Instanzen koennen parallel claimen) und ist einfach zu debuggen. Einen separaten Orchestrator-Service zu bauen wuerde die Deployment-Komplexitaet erhoehen (3 Services statt 2), ohne in V2-Volumen einen Vorteil zu bringen. Die 4 neuen Job-Types (orchestrator_assessment, recondense_with_gaps, sop_generation, evidence_extraction) sind alle I/O-bound (Bedrock-Calls, File-Processing), nicht CPU-bound — kein Grund fuer Service-Trennung.
- Consequence: Worker handle-job.ts bekommt einen Dispatcher, der nach job_type auf verschiedene Handler delegiert. Alle Handler teilen denselben Bedrock-Client und dieselbe DB-Verbindung. Wenn spaeter ein Job-Type problematisch wird (z.B. Evidence-Extraction blockiert andere Jobs), kann ein zweiter Worker-Container gestartet werden, der nur diesen Type claimed — ohne Code-Aenderung (nur ENV AI_WORKER_JOB_TYPES).

## DEC-018 — Self-hosted Whisper Docker + Adapter-Pattern fuer Onboarding-Plattform
- Status: accepted
- Reason: (1) Onboarding-Plattform muss eigenstaendig deploybar sein — kein Shared-Infra mit Business System. (2) Separate API-Accounts pro Plattform fuer Kosten-Tracking spaeter. (3) Whisper-Container existiert bereits im Docker-Compose (Blueprint-Erbe, onerahmet/openai-whisper-asr-webservice). (4) DSGVO: Self-hosted auf eigenem EU-Server ist die sauberste Variante fuer Kundendaten. (5) Adapter-Pattern ermoeglicht spaeteren Switch auf Azure EU oder anderen Provider ohne Code-Rewrite — analog zu Business System DEC-035.
- Consequence: Whisper-Container wird reaktiviert (ASR_MODEL via ENV konfigurierbar, Default: medium). Neues Adapter-Pattern unter /src/lib/ai/whisper/ (provider.ts Interface, local.ts, azure.ts, factory.ts). ENV WHISPER_PROVIDER=local|azure steuert den Provider. Transkriptions-Endpoint POST /api/capture/[sessionId]/transcribe. Audio wird nach Transkription NICHT persistiert.

## DEC-019 — Evidence-Dateien in Supabase Storage mit tenant-isolierten Pfaden
- Status: accepted
- Reason: Supabase Storage ist bereits Teil des Stacks (Container laeuft, File-Backend konfiguriert). Alternatives Vorgehen waere ein eigener S3-Bucket oder ein separater File-Service — beides waere Infrastruktur-Sprawl ohne V2-Nutzen. Storage-Pfad-Pattern {tenant_id}/{session_id}/{filename} garantiert Tenant-Isolation auf Dateisystem-Ebene. Bucket-Policies ergaenzen RLS auf Storage-API-Ebene.
- Consequence: Neuer Bucket 'evidence' (nicht public, 20MB Limit, definierte MIME-Types). Worker laedt Dateien via Service-Role aus Storage herunter fuer Extraktion. Keine direkte Browser→Storage-Verbindung fuer Evidence (Upload laeuft ueber API-Route fuer Validierung + Logging).

## DEC-020 — SOP-Generation ist on-demand, nicht automatisch
- Status: accepted
- Reason: Automatische SOP-Generierung nach jedem Block-Submit wuerde Bedrock-Kosten verdoppeln, ohne dass der Berater die SOP in jedem Fall braucht. SOPs sind ein Mehrwert-Feature fuer das Meeting, nicht ein Muss fuer die Verdichtung. On-demand per Button im Debrief-UI gibt dem strategaize_admin die Kontrolle ueber Kosten und Timing.
- Consequence: SOP-Generierung wird nur ausgeloest, wenn der strategaize_admin im Debrief-UI den Button klickt. Server Action enqueued ai_job mit type=sop_generation. Worker generiert SOP + speichert in sop-Tabelle. Kein automatischer Trigger nach Verdichtung.

## DEC-021 — Demo-Template fuer V2 PoC, Template-Editor in V3
- Status: accepted
- Reason: V2 muss die Template-Flexibilitaet beweisen (SC-3), braucht aber keinen visuellen Template-Editor. Templates per Migration anlegen reicht fuer V2 (ein Demo-Template + das bestehende Exit-Readiness). Der Template-Editor ist ein eigenes Feature mit signifikantem UI-Aufwand (Block-Builder, Frage-Editor, Drag-and-Drop), das den V2-Scope sprengen wuerde. V3 ist der richtige Zeitpunkt.
- Consequence: FEAT-014 liefert: template.sop_prompt + template.owner_fields Spalten, Template-Switcher-Dropdown bei Session-Erstellung, ein Demo-Template "Mitarbeiter-Wissenserhebung" (4-5 Bloecke) per Migration. Template-Erstellung bleibt Migration-only in V2.

## DEC-022 — Diagnose folgt on-demand-Pattern (wie SOP, nicht automatisch)
- Status: accepted
- Reason: Konsistent mit DEC-020 (SOP on-demand). Admin kontrolliert, wann Diagnose generiert wird. Vermeidet unnoetige Bedrock-Kosten. Diagnose ist erst sinnvoll, nachdem KUs reviewed sind — automatische Generierung nach Verdichtung waere zu frueh und wuerde ungepruefte KUs als Basis nutzen. Timing-Kontrolle bleibt beim strategaize_admin.
- Consequence: Button-Klick im Debrief → Server Action enqueued ai_job mit type='diagnosis_generation' → Worker generiert Diagnose → Ergebnis in block_diagnosis-Tabelle. Kein automatischer Trigger nach Verdichtung oder nach Orchestrator-Assessment.

## DEC-023 — diagnosis_schema + diagnosis_prompt als JSONB-Spalten auf template-Tabelle
- Status: accepted
- Reason: Folgt dem etablierten Pattern (sop_prompt, owner_fields sind bereits JSONB-Spalten auf template). Keine separaten Tabellen fuer Template-Metadaten. Jedes Template definiert seine eigene Diagnose-Struktur und seinen eigenen Prompt. 5 JSONB-Spalten auf einer Tabelle mit <10 Zeilen ist performant und wartbar.
- Consequence: ALTER TABLE template ADD COLUMN diagnosis_schema JSONB, ADD COLUMN diagnosis_prompt JSONB. Exit-Readiness-Template bekommt das erste konkrete diagnosis_schema (13 Bewertungsfelder, ~30 Subtopics ueber 9 Bloecke) und den ersten diagnosis_prompt per UPDATE-Migration. Andere Templates koennen voellig andere Felder definieren.

## DEC-024 — SOP-Gate ist einfacher Status-Check auf block_diagnosis
- Status: accepted
- Reason: block_diagnosis.status = 'confirmed' ist ein ausreichender Gate-Mechanismus. Kein separater Gate-Mechanismus, kein Event-System, kein Trigger noetig. Der Debrief-Page laedt block_diagnosis ohnehin — ein einfacher Status-Check steuert die SOP-Button-Sichtbarkeit. KISS-Prinzip.
- Consequence: Debrief Page laedt block_diagnosis neben sop. SOP-Sektion prueft diagnosisConfirmed-Flag. Gate ist UI-seitig in V2. API-Level-Gate (CHECK in rpc_create_sop) kann in V3 nachgeruestet werden, wenn externe API-Caller relevant werden. Bestehender SOP-Code bleibt unveraendert — nur Button-Sichtbarkeit wird bedingt.

## DEC-025 — Eigene Jitsi+Jibri-Instanz auf Onboarding-Server (kein Shared-Infra)
- Status: accepted
- Reason: Die Onboarding-Plattform muss unabhaengig vom Business System laufen. Unterschiedliche Server (159.69.207.29 vs. 91.98.20.191), unabhaengiges Deployment, eigene JWT-Konfiguration. Plattformen als eigenstaendige Kauf-Einheiten erfordern eigenstaendige Infrastruktur.
- Consequence: 5 neue Docker-Services (jitsi-web, prosody, jicofo, jvb, jibri) im Onboarding-Compose. Eigene Jitsi-Secrets. Eigene DNS-Subdomain. Server-RAM wird enger (CPX62 ~10.5 GB von 16 GB). Monitoring nach Deploy essential, Upgrade auf CPX72 moeglicherweise noetig.

## DEC-026 — Keine Speaker Diarization in V3
- Status: accepted
- Reason: Undifferenziertes Transkript reicht fuer V3. KI-Processing mappt Inhalte auf Meeting-Guide-Themen, nicht auf Sprecher. Diarization (pyannote/NeMo) wuerde GPU oder signifikante CPU erfordern plus eine neue Dependency. Die bestehende Whisper-Installation liefert keinen built-in Speaker-Tag.
- Consequence: Transkript ist ein Fliesstext ohne Sprecher-Kennzeichnung. KI-Extraktion arbeitet themenbasiert, nicht sprecherbasiert. V3.1-Enhancement wenn Sprecherzuordnung benoetigt wird.

## DEC-027 — Beide Meeting-Teilnehmer brauchen Plattform-Accounts
- Status: accepted
- Reason: JWT-Auth fuer Jitsi erfordert User-Identitaet. RLS braucht Tenant-Zuordnung. Guest-Link-Mode (temporaerer JWT ohne Account) wuerde einen neuen Auth-Flow erfordern. Auftraggeber kann zweiten Teilnehmer als tenant_member anlegen — minimaler Overhead.
- Consequence: Beide Teilnehmer werden per user_id in dialogue_session referenziert. JWT wird aus Plattform-User generiert. Guest-Link-Mode ist V3.1-Erweiterung.

## DEC-028 — Recording-Storage via Supabase Storage Bucket 'recordings'
- Status: accepted
- Reason: Konsistent mit Evidence-Pattern (DEC-019). Jibri schreibt MP4 in Docker-Volume, Finalize-Script verschiebt in Supabase Storage. Vorteile: Tenant-Isolation per Pfad-Pattern, API-basierter Zugriff fuer Worker, zentrales Retention-Management, keine separaten Volume-Mounts zwischen Jibri und Worker noetig.
- Consequence: Neuer Storage-Bucket 'recordings' (nicht public, 500 MB Limit, video/mp4 + audio/wav). Pfad-Pattern: {tenant_id}/{dialogue_session_id}/recording.mp4. Worker laedt per Service-Role aus Storage herunter. Finalize-Script nutzt Webhook an App fuer Upload-Trigger.

## DEC-029 — Volles Transkript persistent gespeichert
- Status: accepted
- Reason: Audit-relevant (DSGVO-Nachweis was verarbeitet wurde). Ermoeglicht Re-Processing bei besseren Modellen. Basis fuer Cross-Meeting-Analyse in V3.1+. Quellen-Verifikation fuer extrahierte Knowledge Units.
- Consequence: dialogue_session.transcript TEXT speichert den vollstaendigen Transkriptionstext. Transcript-Laenge bei 60min Meeting: ~17.000 Tokens / ~70 KB Text. Kein signifikanter Speicher-Impact.

## DEC-030 — Meeting Guide als separate Tabelle (1:1 mit capture_session)
- Status: accepted
- Reason: Meeting Guide hat eigene CRUD-Logik (Editor, Drag-and-Drop Topics, KI-Vorschlaege) und eigene Lebenszyklus-Semantik (erstellt vor Meeting, referenziert waehrend Meeting, genutzt bei Extraktion). JSONB-Spalte auf capture_session wuerde die capture_session-Tabelle weiter aufblaehenund die Guide-Logik mit Session-Logik vermischen.
- Consequence: Neue Tabelle meeting_guide mit UNIQUE(capture_session_id). Topics als JSONB-Array mit block_key fuer Template-Block-Zuordnung. RLS: tenant_admin Read+Write eigener Tenant, strategaize_admin Full.

## DEC-031 — Dashboard-Daten server-seitig laden statt client-seitig
- Status: accepted
- Reason: Browser-Supabase-Client konnte die interne Docker-URL `http://supabase-kong:8000` nicht erreichen. Der Next.js-Rewrite-Proxy `/supabase/:path*` funktioniert, hat aber Probleme mit Auth-Headers bei RLS-Queries (beobachtet im V3 Smoke-Test 2026-04-22). Server-seitiges Laden umgeht das komplett.
- Consequence: Dashboard laedt Sessions server-seitig in page.tsx und uebergibt als Props an DashboardClient. Gilt als Pattern fuer alle zukuenftigen Seiten mit Supabase-Queries. Client-seitiges Supabase ist nur fuer Mutations (Server Actions) und Realtime zulaessig.

## DEC-032 — /admin-Routing fuer tenant_admin geoeffnet
- Status: accepted
- Reason: Dialogue- und Meeting-Guide-Seiten liegen unter /admin/session/..., tenant_admin braucht aber Zugriff. Layout-Check auf beide Rollen oeffnen ist minimal-invasiv. Per-Page-Checks fuer strategaize_admin-only (Tenants, Debrief) sichern die weiter restriktiven Seiten ab.
- Consequence: /admin-Layout akzeptiert tenant_admin + strategaize_admin. Tenant_admin sieht DashboardSidebar (via TenantAdminShell), strategaize_admin sieht AdminSidebar. Tenants-Page prueft zusaetzlich auf strategaize_admin, Debrief-Pages ebenfalls.

## DEC-033 — Tenant-Language ist Source of Truth, kein User-Facing Language-Switcher
- Status: accepted
- Reason: Die Plattform ist B2B-Onboarding. User eines Tenants arbeiten konsistent in der Sprache, die beim Tenant-Onboarding festgelegt wird (Deutsch, Englisch oder Niederlaendisch). Ein User wechselt nicht spontan die Sprache, in der er antwortet — die Tenant-Sprache ist eine organisatorische Konfiguration, keine persoenliche Praeferenz. Ein User-Facing Language-Switcher wuerde (a) die Middleware-Logik brechen, die `NEXT_LOCALE` bei jedem Request auf `tenants.language` synchronisiert, und (b) Inkonsistenz zwischen UI-Sprache und gespeicherten Antworten erzeugen.
- Consequence: Die Sprache wird ausschliesslich ueber `tenants.language` gesetzt (zentral durch strategaize_admin oder tenant_admin via `/admin/tenants`). Die Middleware in `src/lib/supabase/middleware.ts` erzwingt diese Sprache auf jedem Page-Load. Kein User-Facing Language-Switcher in der Sidebar oder an anderen Stellen. ISSUE-016 ist als `wontfix` markiert. Falls sich die Anforderung aendert (z.B. internationale Tenants mit mehrsprachigen Teams), erfolgt die Implementierung ueber einen separaten `user_language_override`-Cookie und Middleware-Ausnahme-Logik — nicht durch direktes Ueberschreiben von `NEXT_LOCALE`.

## DEC-034 — Bridge-Engine ist Hybrid (Template-Standard + KI-Verfeinerung + max 3 Free-Form-Slots)
- Status: accepted
- Reason: Q17-Entscheidung. Reine KI-Free-Form-Generierung haette R15 (nutzlose Mitarbeiter-Aufgaben) maximiert — Output zu varianzreich, schwer zu evaluieren, jeder Pilotkunde wuerde anderes Bridge-Verhalten erleben. Reines Template-Mapping waere zu starr — neue Themen ausserhalb des Templates wuerden nie auftauchen, was R15 in die andere Richtung kippt. Hybrid liefert ~80% deterministische Bridge-Vorschlaege ueber Template-Schablonen plus einen begrenzten Free-Form-Slot (max 3 Vorschlaege pro Lauf) fuer unbekannte Themen. Multi-Use-Constraint (Compliance-Readiness, KI-Readiness als spaetere Templates) ist erfuellt, weil neue Templates nur eigene `employee_capture_schema` brauchen — die Engine bleibt gleich.
- Consequence: Neue JSONB-Spalte `template.employee_capture_schema` mit Struktur `{ subtopic_bridges: [...], free_form_slot: { max_proposals: 3, system_prompt_addendum: "..." } }`. Worker-Job `bridge_generation` macht 2 Pfade: pro Subtopic-Bridge ein kleiner Bedrock-Call ($0.01-$0.03) fuer Mitarbeiter-Auswahl + Wortlaut-Verfeinerung, plus ein Free-Form-Call ($0.05-$0.10) am Ende. Bridge-Output landet in `bridge_proposal`-Rows mit `proposal_mode='template'` oder `'free_form'`. tenant_admin reviewed jeden Proposal einzeln. Free-Form-Limit kann in V4.2+ konfigurierbar werden, bleibt in V4 hartkodiert.

## DEC-035 — Mitarbeiter-Auth via klassisches Passwort (kein Magic-Link in V4)
- Status: accepted
- Reason: Q18-Entscheidung. Magic-Link waere passwortlos und sicherer, aber Mitarbeiter sind keine Tech-Power-User (R17). Magic-Link-Probleme (E-Mail-Spam-Filter, Link-Verfall, mobile E-Mail-Apps die Links ungewollt vorab oeffnen) sind real und schwer zu debuggen. Klassisches Passwort ist vertrauter, robuster gegen E-Mail-Verzoegerungen, und konsistent zur bestehenden tenant_admin-Auth (gleicher Login-Flow). Magic-Link bleibt fuer V4.2 als Evaluations-Option.
- Consequence: `employee_invitation`-Tabelle haelt Token + Status. E-Mail an Mitarbeiter enthaelt Link `/accept-invitation/[token]`. Auf der Annahme-Seite setzt der Mitarbeiter ein Passwort, der RPC `rpc_accept_employee_invitation` erzeugt `auth.users` + `profiles.role='employee'` + setzt invitation status auf `accepted`. Login danach identisch zu tenant_admin (E-Mail + Passwort via Supabase Auth). Token ist 32 Bytes random, 14 Tage gueltig, einmalig nutzbar.

## DEC-036 — `employee` und `tenant_member` sind parallele Rollen, kein Merge in V4
- Status: accepted
- Reason: Q19-Entscheidung. tenant_member existiert seit V1 fuer "weitere Tenant-User mit eingeschraenktem Capture-Zugriff" — das passt nicht 1:1 auf den V4-Mitarbeiter-Capture-Flow. employee bekommt eine eigene RLS-Policy-Familie (sieht NUR eigene Sessions, NICHT Bridge/Diagnose/SOP/Handbuch), waehrend tenant_member breitere Rechte hat. Eine Sofort-Mergung waere riskant (Sicherheits-Regressionen bei bestehenden tenant_member-Setups, Schema-Migration-Fragen). Nach 2-3 Pilotkunden mit V4 wird Mergung re-evaluiert.
- Consequence: 4 parallele Rollen in `profiles.role` CHECK: `strategaize_admin`, `tenant_admin`, `tenant_member`, `employee`. Migration `065_employee_role.sql` erweitert den CHECK additiv. RLS-Policies werden pro Tabelle explizit fuer alle 4 Rollen definiert — kein impliziter Fallback. RLS-Test-Matrix in /qa: 4 Rollen × N Tabellen mit Pflicht-Failure-Tests fuer den employee-Sicht-Perimeter. Mergung-Diskussion erfolgt nach Pilot-Feedback in V5+ (mit eigenem ADR).

## DEC-037 — Bridge-Trigger ist on-demand (tenant_admin loest aus, kein Auto-Run)
- Status: accepted
- Reason: Q20-Entscheidung. Konsistent zu DEC-020 (SOP on-demand) und DEC-022 (Diagnose on-demand). Auto-Trigger nach Block-Submit haette drei Probleme: (1) Bedrock-Kosten bei jedem Submit, auch wenn der GF noch weitere Bloecke plant — Verschwendung. (2) Bridge-Output basiert auf der Diagnose, die selbst on-demand ist — Auto-Bridge wuerde ggf. ohne Diagnose-Input laufen. (3) Vertrauensaufbau: tenant_admin will explizit triggern, nicht von der Plattform "ueberrascht" werden.
- Consequence: UI-Button "Bridge ausfuehren" im Self-Service-Cockpit + im Mitarbeiter-Verwaltungs-Tab. RPC `rpc_trigger_bridge_run` erzeugt `bridge_run`-Row + enqueued `ai_jobs`. Bridge laeuft asynchron im Worker. tenant_admin sieht Status (running/completed/failed/stale). Konsequenz fuer DEC-039: Wenn der GF nach Bridge-Lauf weitere Bloecke submittet, wird der bestehende bridge_run als `stale` markiert — kein Auto-Re-Run, sondern nur UI-Hinweis "Bridge-Lauf veraltet, neu ausfuehren?".

## DEC-038 — Handbuch-Aggregation ueber `template.handbook_schema` (deterministischer Code, kein LLM in V4)
- Status: accepted
- Reason: Q21-Entscheidung. KI-generierte Aggregation (Option C) haette R18 (Handbuch-Erwartungshaltung) verletzt: jeder Snapshot saehe anders aus, Audit-Trail-Sauberkeit waere kaputt, Re-Export waere nicht reproduzierbar, Kosten waeren signifikant ($1-$5 pro Snapshot). Statisches Code-Hardcoding (Option A) waere multi-template-feindlich — neue Templates braeuchten Code-Aenderungen. Template-Schablone (Option B) folgt dem etablierten DEC-023-Pattern (diagnosis_schema), erfuellt den Multi-Use-Constraint, ist audit-faehig (deterministisch), reproduzierbar (gleicher Input = gleicher Output) und kostenlos (kein LLM-Call). KI-Polish-Layer fuer Sektion-Intros bleibt fuer V4.1 evaluiert — Inhaltsumformulierung explizit nicht.
- Consequence: Neue JSONB-Spalte `template.handbook_schema` mit Struktur `{ sections: [{ key, title, order, sources: [...], render: {...} }], cross_links: [...] }`. Worker-Job `handbook_snapshot_generation` ist deterministischer Code — laedt Schema, queryt KUs/Diagnosen/SOPs nach Filter, rendert Markdown, packt ZIP, uploaded in Storage Bucket `handbook`. Kein Bedrock-Call. handbook_snapshot-Tabelle haelt Status + storage_path. Download via signierte Storage-URL (5 Min Gueltigkeit). Multi-Snapshot-Versionierung kommt in V4.1 (Diff-View + Snapshot-Historie).

## DEC-039 — Bridge-Re-Generierung ist on-demand mit `stale`-Hinweis (kein Auto-Re-Run)
- Status: accepted
- Reason: Q22-Entscheidung. Konsistent zu DEC-037. Auto-Re-Run bei jedem neuen Block-Submit waere teuer und ueberraschend. Manuelles Re-Run gibt tenant_admin Kontrolle ueber Timing und Kosten. Aber: Wenn neue Bloecke submitted wurden, ist der bestehende Bridge-Lauf objektiv unvollstaendig — das soll sichtbar sein, nicht stillschweigend.
- Consequence: Trigger-Funktion `bridge_run_set_stale`: nach jedem INSERT auf `block_checkpoint` (mit checkpoint_type='questionnaire_submit') wird der juengste `bridge_run` der gleichen `capture_session_id` auf `status='stale'` gesetzt, sofern aktuell `'completed'`. UI im Bridge-Review-Tab zeigt orange Banner "Neue Bloecke wurden submitted seit dem letzten Bridge-Lauf — Bridge neu ausfuehren?" mit Re-Run-Button. Stale-Lauf bleibt sichtbar (nicht geloescht), Re-Run erzeugt einen neuen `bridge_run`. Alte Proposals bleiben in der DB (Audit-Trail), werden in der UI per Default ausgeblendet (Toggle "Vorgaengerlauf zeigen"). Diff-View zwischen alten und neuen Vorschlaegen kommt in V4.1 wenn Bedarf.

## DEC-040 — Capture-Mode-Hook-Granularitaet ist Worker-Pipeline-Slot + UI-Slot-Konvention (kein Routing-/Permissions-Slot in V4)
- Status: accepted
- Reason: Q23-Entscheidung. SC-V4-6 verlangt, dass V5 (Walkthrough) und V6 (Diary) ohne Schema-Aenderung als Capture-Modes andocken koennen. Dafuer reichen 2 Hook-Punkte: (a) Worker-Pipeline-Slot (Job-Type-Naming-Konvention `{mode}_processing`, Handler unter `src/workers/capture-modes/{mode}/`) und (b) UI-Slot (Komponente unter `src/components/capture-modes/{mode}/`, Eintrag in CAPTURE_MODE_REGISTRY). Tiefere Hooks (Routing, Permissions, eigene Sub-Schemas) sind ueber-engineert: Routing bleibt unter `/capture/[sessionId]`, Permissions folgen der Rollen-Matrix, neue Mode-Tabellen bekommen Standard-RLS. V5/V6 koennen bei Bedarf eigene Migrations adden, aber das ist additive Erweiterung — nicht Teil des V4-Hook-Vertrags.
- Consequence: `capture_session.capture_mode` CHECK-Constraint wird additiv erweitert (`employee_questionnaire`, `walkthrough_stub` in V4; spaeter `walkthrough`, `diary` in V5/V6). CAPTURE_MODE_REGISTRY-Map in `src/components/capture-modes/registry.ts` ist die zentrale Eintrittsstelle. Architektur-Spike `walkthrough_stub` validiert das in V4: Ein Pseudo-Mode mit Worker-Stub + UI-Stub + Registry-Eintrag wird produktiv eingebaut, nicht beworben — dient als Beweis und Doku-Vorlage. SLC-038 baut den Spike + dokumentiert "How to add a new Capture-Mode" in ARCHITECTURE.md.
