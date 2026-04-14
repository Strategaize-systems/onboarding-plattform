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
