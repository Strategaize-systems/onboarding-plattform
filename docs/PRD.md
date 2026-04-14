# Product Requirements Document

## Purpose
Die Strategaize Onboarding-Plattform ist eine KI-first Plattform fuer strukturierte Wissenserhebung und -verdichtung. Der Kunde arbeitet Wissensbereiche selbstaendig durch, waehrend KI die Hauptarbeit uebernimmt (herauskitzeln, verdichten, Muster erkennen, Luecken detektieren). Ein Template-System ermoeglicht mehrere Produktvarianten aus einer Codebasis — erster Use-Case ist Exit-Readiness, spaeter interne Mitarbeiter-Onboardings und weitere Templates.

## Vision
Consultant-Zeit wird skalierbar, indem KI die Wissenserhebung und -verdichtung uebernimmt. Menschen (Berater) kommen nur in definierten Meeting-Review-Punkten ins Spiel — um Richtung zu pruefen, Ergebnisse mit dem Kunden durchzugehen und einen finalen Stand festzuhalten. Das System wird ueber Zeit durch bessere KI-Prompts, Skills und Loops besser — nicht durch mehr menschliche Stunden.

Das langfristige Ziel ist eine Plattform, die End-to-End Knowledge Management liefert: Wissen erheben → strukturieren → verdichten → auswerten → ausgeben. Mehrere Capture-Modi (Questionnaire, Exception, Evidence, Dialogue, Walkthrough, Diary) und mehrere Templates lassen die Plattform von einem Exit-Readiness-Werkzeug zu einem vollwertigen Onboarding-System fuer unterschiedlichste Szenarien wachsen.

## Target Users

### Primaer (V1)
- **Strategaize-Berater (strategaize_admin):** fuehrt den Meeting-Review nach Block-Submit durch, haelt den Stand fest, nutzt verdichtete KI-Ergebnisse als Gespraechsgrundlage
- **Kunden-Geschaeftsfuehrer (tenant_admin):** arbeitet das Onboarding selbstaendig durch, mit KI-Chat als Hilfe, erhaelt am Ende einen verdichteten Bericht plus Meeting-Stand
- **Kunden-Teammitglieder (tenant_member):** koennen auf einzelne Bloecke freigegeben werden und dort beitragen

### Spaeter (V2+)
- Weitere Templates fuer andere Use-Cases (z.B. Immobilien-Onboarding, Mitarbeiter-Discovery intern)
- Interne Kunden-Nutzung (Geschaeftsfuehrer erhebt Wissen von eigenen Mitarbeitern innerhalb der Kundenfirma)

## Scope
V1-Scope-Festlegung siehe /docs/DISCOVERY.md Abschnitt 6 und wird in /requirements detailliert. Kurzform: Fundament + Exit-Readiness-Template + Questionnaire + Exception + Lightweight Single-Pass KI-Verdichtung + portierte OS-Ebene-1 + Debrief-/Meeting-UI fuer den Berater.

## Out of Scope
Siehe /docs/DISCOVERY.md Abschnitt 6 und 9. Kurzform V1-out: 3-Agenten-Loop, SOP-Generation, zweites Template, Evidence-Auto-Mapping, Dialogue/Walkthrough/Diary, Mobile/PWA, neue Consultant-Rolle. Alles ab V2+ geplant und geparkt.

## Success Criteria
Wird in /requirements festgelegt.
