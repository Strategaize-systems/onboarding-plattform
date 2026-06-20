# FEAT-092 — Blueprint-Diagnostik (eigene Kanzlei)

- Version: V10
- Status: planned
- Backlog: BL-511
- Created: 2026-06-20

## Was
Der Einstiegs-**Blueprint** fuer die eigene Kanzlei des StB: ein diagnostischer Snapshot („da stehst du"), der Strukturen sichtbar macht und in die relevanten Module (V10: M-04/05/06) routet.

## Warum
Der Blueprint ist der Kopf der Liefer-Architektur Blueprint→Modul-Workspace. Er erhebt die operative Realitaet (Schicht 3), die nicht in der Buchhaltung liegt — genau der Capture-Flow, den OP bereits baut.

## In Scope (V10)
- Blueprint-Diagnostik fuer die eigene Kanzlei (StB als Subjekt).
- Routing-Logik: welche Module sind fuer diese Kanzlei relevant (V10: auf die 3 Finanz-Module beschraenkt).
- Strukturen sichtbar (operative Wirk-Schicht, NICHT rueckblickende Zahlen).

## Out of Scope (V10)
- Mandanten-Blueprint (Stufe-2).
- Vollstaendige 46-Modul-Routing-Matrix (nur M-04/05/06 in V10).

## Reuse
OP-Capture/Questionnaire-Maschinerie (FEAT-025 Capture-Mode-Hook), Diagnose-Pattern (V6.3 `partner_diagnostic`, V8 Teaser). **Architektur-Fork:** neuer schlanker Blueprint vs. Reuse bestehende Exit-Readiness-/Partner-Diagnose als Blueprint.

## Success / Acceptance
- Der StB durchlaeuft einen Blueprint fuer die eigene Kanzlei.
- Ergebnis macht Strukturen sichtbar und verweist auf die relevanten Module.
- DATEV-Abgrenzung in Naming/Output gewahrt (operative Wirk-Schicht, kein DATEV-„ReifegradCheck"-Reflex).

> Detail + Constraints: PRD `## V10 — StB-Vertikale Phase 1`. Forks → /architecture V10.
