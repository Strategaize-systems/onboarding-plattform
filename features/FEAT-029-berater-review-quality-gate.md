# FEAT-029 — Berater-Review + Quality-Gate vor Handbuch

- Version: V4.1
- Backlog: BL-049
- Status: planned
- Created: 2026-04-28

## Was

Ein expliziter Berater-Review-Schritt zwischen Mitarbeiter-Antworten und Handbuch-Generation. Der `strategaize_admin` (Berater) reviewt Mitarbeiter-Beitraege block-weise und entscheidet per Block-Approval, ob sie ins Handbuch fliessen. Der Handbuch-Trigger zeigt den Review-Status sichtbar an und fragt bei pendenden Reviews per Confirm-Dialog nach.

## Warum

V4 filtert Mitarbeiter-Beitraege rein technisch ueber `min_status='confirmed'` im Snapshot-Worker. Es gibt keinen expliziten Berater-Entscheidungspunkt zwischen Mitarbeiter-Capture und Handbuch-Generierung. Das ist fuer Pilotbetrieb akzeptabel, aber nicht produktiv: Der Berater hat heute keine Moeglichkeit zu sagen "Block X ist sauber, Block Y braucht noch Klaerung". Die Quality-Gate-Luecke fuehrt mittelfristig zu Handbuechern mit ungereviewten Inhalten.

V4.1 schliesst die Luecke ueber Block-Approval (DEC-V4.1-4) als minimale Schema-Ergaenzung und einen weichen Quality-Gate-Hinweis im Trigger-Flow (DEC-V4.1-5).

## V4.1-Scope

### In Scope

- **Neue Tabelle `block_review`** mit `(tenant_id, capture_session_id, block_key)` als Composite-Key (oder UNIQUE), Status-Spalte `pending|approved|rejected`, Audit-Felder (`reviewed_by uuid`, `reviewed_at timestamptz`, `note text`). RLS analog zu `block_session`.
- **Worker-Filter-Erweiterung** im Snapshot-Worker: zusaetzlich zu `min_status='confirmed'` wird `block_review.status='approved'` geprueft. Nur dann fliessen Mitarbeiter-KUs (`source='employee_questionnaire'`) ins Markdown des Snapshots. GF-KUs (Blueprint-Output) sind vom Filter unabhaengig.
- **Backfill-Migration** beim ersten Run: Sessions/Bloecke die vor V4.1-Deploy existieren bekommen `block_review.status='approved'` (Backwards-Compat). Neue Sessions starten als `pending`. Definitive Strategie wird in /architecture entschieden (Q-V4.1-A).
- **Konsolidierter Review-View** unter `/admin/blocks/[blockKey]/review?tenant=...&session=...`:
  - Block-Header mit Tenant-Name + Block-Titel
  - Alle Mitarbeiter-KUs zu diesem Block gestapelt (Block-zentriert, DEC-V4.1-6)
  - Pro KU sichtbar: Mitarbeiter-Quelle (Name/E-Mail), Confidence, KU-Inhalt
  - Approve/Reject-Buttons fuer den Block (mit optionalem Note-Feld)
  - History-Anzeige: wer hat wann mit welchem Status entschieden
- **Trigger-Status-Dialog** im Handbuch-Trigger-Flow (`/admin/handbook` Trigger-Button):
  - Bei 100% Approval: Trigger laeuft direkt (V4-Verhalten)
  - Bei <100% Approval: Confirm-Dialog "X/Y Mitarbeiter-Bloecke reviewed. Y-X Bloecke werden NICHT ins Handbuch fliessen. Trotzdem generieren?". Click-Through generiert.
  - Audit-Log-Eintrag pro Trigger: "Snapshot generated with N pending reviews".
- **Cockpit-Card "Mitarbeiter-Bloecke reviewed"** auf `/dashboard`: zeigt `X/Y` als Indikator, linkt fuer `tenant_admin` auf eine read-only Tenant-Sicht der Review-Liste, fuer `strategaize_admin` auf den Konsolidierten Review-View.

### Out of Scope (bewusst, V4.1)

- **KU-granulares "Im Handbuch enthalten"-Flag.** V4.1 nutzt Block-Approval als Granularitaet. Per-KU-Override kommt nur, wenn ein konkreter Use-Case auftaucht (V4.2+).
- **Hartes Quality-Gate** (Trigger-Button gesperrt bis 100% reviewed). V4.1 nutzt weiches Gate (DEC-V4.1-5). Berater behaelt Hoheit.
- **Multi-Stufiger Genehmigungs-Workflow** (Reviewer → Approver). Block-Approval ist single-step in V4.1.
- **History-Tabelle fuer Status-Transitionen.** Audit-Felder reichen, validation_layer-Pattern aus V2 wird nicht doppelt gebaut (Q-V4.1-D).
- **Auto-Trigger nach 100% Approval.** Trigger bleibt manuell.

## Acceptance Criteria

1. `block_review`-Tabelle existiert mit RLS, jede `(tenant_id, capture_session_id, block_key)`-Kombination hat genau einen Eintrag (UNIQUE-Constraint).
2. Backfill-Migration setzt fuer alle vor V4.1 existierenden Sessions/Bloecke den Status `approved` (oder gemaess /architecture-Entscheidung).
3. `strategaize_admin` ruft `/admin/blocks/[blockKey]/review?tenant=...&session=...` auf und sieht alle Mitarbeiter-KUs des Blocks gestapelt.
4. Approve-Click setzt `block_review.status='approved'` mit `reviewed_by=auth.uid()`, `reviewed_at=now()`, optionalem `note`.
5. Reject-Click setzt Status auf `rejected` analog.
6. Snapshot-Worker filtert Mitarbeiter-KUs neu generierter Snapshots: nur wenn `block_review.status='approved'` fliessen sie ins Markdown. GF-KUs unabhaengig.
7. Bestehende V4-Snapshots (vor V4.1-Deploy generiert) bleiben unveraendert lesbar — Worker-Filter gilt nur fuer NEUE Snapshots.
8. Trigger-Button auf `/admin/handbook` zeigt bei <100% Approval einen Confirm-Dialog "X/Y reviewed. Trotzdem generieren?". Click-Through generiert + audit-loggt.
9. Cockpit-Card "Mitarbeiter-Bloecke reviewed" zeigt korrekten X/Y-Stand pro Tenant.
10. RLS-Test-Matrix erweitert um `block_review`: 4 Rollen × Tabelle = mindestens 8 zusaetzliche Test-Faelle, alle gruen.
11. `tenant_admin` kann auf der Cockpit-Card-Detail-Sicht den Review-Status seiner Bloecke read-only sehen, aber NICHT approven/rejecten (Approve/Reject ist `strategaize_admin`-only).

## Abhaengigkeiten

- **V4 Foundation (FEAT-022, FEAT-023, FEAT-024, FEAT-026):** Mitarbeiter-Capture-Pipeline + Snapshot-Worker existieren. V4.1 erweitert ohne Bruch.
- **FEAT-028 (Reader):** Reader zeigt `block_review_summary` an (read-only Konsumer von `block_review`).
- **FEAT-030 (Berater-Visibility):** Cross-Tenant-Sicht `/admin/reviews` aggregiert `block_review.status='pending'` ueber alle Tenants.

## Cross-Refs

- DEC-V4.1-4, DEC-V4.1-5, DEC-V4.1-6 (PRD V4.1-Sektion)
- SC-V4.1-4, SC-V4.1-5, SC-V4.1-6, SC-V4.1-7, SC-V4.1-10, SC-V4.1-11, SC-V4.1-12 (PRD V4.1-Sektion)
- Q-V4.1-A, Q-V4.1-D (offene Architektur-Fragen)
