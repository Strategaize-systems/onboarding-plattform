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
- Status: accepted
- Reason: Das strategaize-operating-system-Repo hat eine weitgehend fertige Ebene-1-Verdichtung (block_sessions, debrief_items, Worker, Import-Endpoint, Query-Layer), die zu 80–100% portierbar ist. Neu-Bau waere Zeitverschwendung.
- Consequence: V1-Implementierung uebernimmt die OS-Strukturen und passt sie an das neue Knowledge-Unit-Schema und die Onboarding-Plattform-Auth an. Der 3-Agenten-Loop (Analyst+Challenger+Orchestrator) bleibt V2, weil er im OS heute nur Idee ist. Single-Pass-Verdichtung reicht fuer V1, weil der Berater im Meeting die Qualitaets-Luecke schliesst.

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
