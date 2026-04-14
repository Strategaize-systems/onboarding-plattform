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
