# FEAT-089 — Tag-Export-Propagation

- Version: V9.8
- Backlog: BL-505
- Status: planned
- Created: 2026-06-18

## Was
Die im Bulk-Lauf erarbeiteten `themes` werden beim Promote eines `email_synthesized_unit` ins Handbuch verlustfrei + queryable in die zugehoerige `knowledge_unit` uebernommen.

## Warum
Export-Gap (code-verifiziert): `handbook-import.ts::mapSynthesizedUnitToKnowledgeUnit` mappt heute nur `title`, `body` (description + Source-Attribution), `curated_section`→`block_key`, `confidence` — `themes` fallen weg. `knowledge_unit` hat keine `themes`/`tags`-Spalte (nur `metadata` JSONB, Mig 093). Ohne Propagation sind die Tags fuer Handbuch-Suche / Downstream wertlos.

## In Scope
- `themes` aus `email_synthesized_unit` (Mig 119, `text[]`) beim Promote in `knowledge_unit` schreiben.
- Ziel-Spalten-Entscheidung (Q-V9.8-A): dedizierte `knowledge_unit.themes text[]` (Migration, queryable/indexierbar) vs. `metadata` JSONB.
- ggf. Migration (additiv) + Index fuer Tag-Suche.
- Forward-only.

## Out of Scope
- Retroaktives Re-Tagging bereits importierter `knowledge_unit`-Rows.
- Tag-Facetten-Suche-UI im Handbuch (V9.8 stellt nur die Daten bereit).

## Betroffene Bereiche (code-gegroundet)
- `src/lib/bulk-email/handbook-import.ts` (`mapSynthesizedUnitToKnowledgeUnit`)
- `knowledge_unit`-Schema (evtl. neue Spalte + Migration)
- Source: `email_synthesized_unit.themes` (Mig 119)

## Erfolg
- Promote → `themes` verlustfrei + queryable in `knowledge_unit` (SC-1, code- + DB-verifiziert).
- 0 Regression der bestehenden Promote-/Snapshot-Pipeline (SC-5).

## Offene Punkte
Q-V9.8-A (Ziel-Spalte) → /architecture V9.8.
