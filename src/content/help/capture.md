# Hilfe — Capture (Block-Submit)

Auf der Capture-Seite beantwortest du Fragen zu deinem Bereich. Deine Antworten fliessen in das Unternehmerhandbuch ein.

## Wie ein Block funktioniert

Ein Block buendelt mehrere zusammengehoerige Fragen (z.B. "Vertrieb" oder "Operative Ablaeufe"). Du kannst Antworten nach und nach speichern und zwischendurch unterbrechen — das System speichert deinen Stand automatisch.

Wenn du einen Block fertig beantwortet hast, klickst du auf **Block submitten**. Erst dann wird der Block an die KI zur Verdichtung uebergeben.

## Was sind Knowledge Units

Beim Submit zerlegt die KI deine Antworten in **Knowledge Units** — kleine, klar abgegrenzte Wissens-Bausteine. Jede Knowledge Unit ist quellen-verlinkt: man sieht spaeter, aus welcher deiner Antworten sie stammt.

## Was passiert nach dem Submit

1. Die Antworten gehen an die Verdichtungs-Pipeline (Claude Sonnet via Bedrock Frankfurt).
2. Knowledge Units werden generiert und an die passenden Stellen im Handbuch zugeordnet.
3. Bei Mitarbeiter-Bloecken: der Berater oder Tenant-Admin reviewt die Bloecke vor der Aufnahme ins Handbuch.

## Wann sollte ich submitten

Submitte erst, wenn du mit deinen Antworten zufrieden bist — kleine Korrekturen nach Submit sind moeglich, aber jeder Submit erzeugt KI-Kosten. Lieber einmal sauber als drei mal halb.
