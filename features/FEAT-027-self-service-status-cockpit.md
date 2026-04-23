# FEAT-027 — Self-Service Status Cockpit Foundation

**Version:** V4
**Status:** planned
**Created:** 2026-04-23

## Zweck
Minimaler Status-View fuer den tenant_admin: Wo stehen wir, was fehlt, was ist der naechste Schritt — ohne dass der Berater erklaeren muss.

## Hintergrund
Self-Service ist ein Hauptziel von V4 ("kein Haendchen-Halten"). V4 liefert dafuer die Foundation. Wizard, Reminders und Hilfe-Texte kommen in V4.2.

## In Scope
- Status-Dashboard fuer tenant_admin auf Landing-Page (oder eigener Tab)
- Anzeige: (a) Bloecke gesamt, (b) Bloecke submitted, (c) Mitarbeiter eingeladen, (d) Mitarbeiter-Aufgaben offen vs. fertig, (e) empfohlener naechster Schritt (regelbasiert, nicht KI in V4)
- Klickbare Verknuepfung von Status-Einsicht zur entsprechenden Aktion
- Mitarbeiter sieht Status-Cockpit NICHT (eigenes Dashboard, FEAT-024)
- strategaize_admin sieht Cross-Tenant-Status fuer Berater-Zwecke

## Out of Scope
- Onboarding-Wizard (V4.2)
- In-App-Hilfe / Tooltips (V4.2)
- Capture-Reminders an Mitarbeiter (V4.2)
- KI-gestuetzte Empfehlungen (spaeter, V4.2 oder V5)
- Mehrsprachige Status-Texte (Tenant-Language gilt)

## Akzeptanzkriterien (Skizze)
- tenant_admin sieht ohne Klicken: aktuellen Stand (5 Metriken oben)
- empfohlener naechster Schritt ist sichtbar und regelbasiert korrekt
- Browser-Smoke-Test mit Nicht-Tech-User: Person versteht in <2 Min wo sie steht und was als naechstes zu tun ist

## Abhaengigkeiten
- Vorbedingung: FEAT-022..024 (Status-Daten existieren)
- Kann teilweise parallel zu FEAT-026 gebaut werden

## Verweise
- PRD V4-Sektion (SC-V4-5, R17)
