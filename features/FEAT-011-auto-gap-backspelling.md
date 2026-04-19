# FEAT-011 — Auto-Gap-Backspelling

- Status: planned
- Version: V2
- Created: 2026-04-19

## Purpose
Wenn der Orchestrator (FEAT-010) Wissensluecken nach der KI-Verdichtung erkennt, werden automatisch Nachfragen generiert und dem Kunden im Questionnaire-UI praesentiert. Nach Beantwortung wird der Block automatisch re-verdichtet.

## Why it matters
V1-Luecken werden erst im Debrief-Meeting sichtbar — zu spaet und zu teuer. Mit Backspelling schliesst die Plattform den Feedback-Loop automatisch: KI erkennt Luecke → KI formuliert Nachfrage → Kunde beantwortet → KI verdichtet erneut. Das reduziert Meeting-Zeit und erhoeht KU-Qualitaet, bevor der Berater ueberhaupt involviert wird. Zentrales KI-first-Differenzierungsmerkmal.

## How Backspelling works

### Flow
1. **Trigger:** Orchestrator (FEAT-010) bewertet Block nach A+C-Loop und findet Luecken.
2. **Fragen-Generierung:** Orchestrator erzeugt strukturierte Nachfragen:
   - Frage-Text (natuerlichsprachlich, verstaendlich fuer Nicht-Experten)
   - Kontext (warum diese Frage wichtig ist)
   - Betroffenes Subtopic / KU
   - Prioritaet (required / nice-to-have)
3. **Persistierung:** Nachfragen werden in neuer Tabelle `gap_question` gespeichert:
   - FK zu block_checkpoint (welcher Block)
   - FK zu capture_session
   - FK zu knowledge_unit (welche KU ist betroffen)
   - Status: pending / answered / skipped
4. **Benachrichtigung:** Kunde sieht im Dashboard/Questionnaire einen Hinweis "Nachfragen verfuegbar".
5. **Beantwortung:** Kunde oeffnet Block, sieht Nachfragen-Sektion, beantwortet Fragen.
6. **Re-Verdichtung:** System triggert erneuten A+C+Orchestrator-Loop mit erweiterten Eingabedaten (Original-Antworten + Nachfrage-Antworten).
7. **Update:** Aktualisierte Knowledge Units ersetzen die vorherigen. Versionierung bleibt erhalten (neuer Checkpoint).

### UI-Integration
- Questionnaire-Seite: Neue Sektion "Nachfragen" unterhalb der Block-Fragen (oder als eigener Tab)
- Dashboard: Badge/Indikator auf Bloecken mit offenen Nachfragen
- Debrief-UI: strategaize_admin sieht, welche Bloecke Backspelling durchlaufen haben

### Re-Verdichtung
- Laeuft durch den gleichen Worker-Flow (ai_jobs-Queue)
- Job-Typ: `backspelling_recondense` (unterscheidbar von initialem `condense`)
- Orchestrator bewertet erneut — kann weitere Luecken finden (max 2 Backspelling-Runden)
- Nach 2 Runden: verbleibende Luecken werden als Meeting-Agenda-Punkte markiert

## In Scope
- gap_question-Tabelle mit Status-Tracking
- Nachfragen-UI im Questionnaire (Sektion oder Tab)
- Dashboard-Badge fuer offene Nachfragen
- Re-Verdichtung-Trigger nach Beantwortung
- Backspelling-Runden-Limit (max 2)
- Verbleibende Luecken als Meeting-Agenda

## Out of Scope
- E-Mail-Benachrichtigung bei Nachfragen (V2.1, braucht SMTP-Integration)
- Push-Notification (V2.1)
- Backspelling fuer Evidence-Mode (V2.1, erst Evidence-Flow stabil)
- Backspelling-Fragen manuell durch Berater erstellen (V3)

## Success Criteria
- Nachfragen erscheinen im Questionnaire-UI nach Block-Verdichtung
- Kunde kann Nachfragen beantworten
- Re-Verdichtung laeuft automatisch nach Beantwortung
- Aktualisierte KUs sind im Debrief-UI sichtbar
- Max 2 Backspelling-Runden pro Block
- Verbleibende Luecken werden als Meeting-Punkte markiert

## Dependencies
- FEAT-010 (Orchestrator liefert Gap-Detection-Output)
- FEAT-003 (Questionnaire-UI als Host fuer Nachfragen)
- FEAT-005 (Worker-Pipeline fuer Re-Verdichtung)

## Related
- DEC-004 (KI-first: Luecken werden automatisch geschlossen, nicht manuell)
