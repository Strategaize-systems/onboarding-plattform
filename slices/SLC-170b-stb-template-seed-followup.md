# SLC-170b — StB Template-Seed Folge: Blueprint + restlicher 18-Cut (content-gated)

- Version: V10
- Feature: FEAT-091 (Content-Teil) + FEAT-092 (Blueprint)
- Backlog: BL-519 (Blueprint-Autoring) + BL-520 (restl. Module-Autoring)
- Status: planned (content-gated — startet je Modul erst bei Founder-Autoring auf M-04-Tiefe)
- Priority: High
- Created: 2026-06-21 (B1-Abgleich, DEC-242)
- MIG: pro Welle eigene additive Seed-Migration (≥ 126), idempotent `ON CONFLICT (slug, version) DO UPDATE`

## Ziel
Den StB-KERN-Cut über M-04 hinaus seeden — **content-gated**: jedes Modul wird erst als `template`-Row angelegt, wenn der Founder es auf M-04-Tiefe ausgearbeitet hat (Themenbaum + Stufe-1/2-Fragebogen + KI-Hebel-Katalog mit Reifegrad 1-4). Quelle/Cut/Autoring-Vorlage: `docs/stb-vertikale/modul-bibliothek-seed-source.md`. **Kein KI-erfundenes IP** (`nicht raten`, immoscheckheft-Paritaet-Disziplin).

## Rollout-Wellen (Reihenfolge nach Hebel)
1. **Blueprint (`stb_blueprint_kanzlei`)** — ZUERST: Einstieg + Modul-Routing, **entsperrt SLC-172**. Braucht `diagnosis_schema` (Ampel/Reifegrad) + `diagnosis_prompt` + Routing M-04…; `usage_kind` mit SLC-172 abstimmen (Reuse `self_service_partner_diagnostic` falls Shape passt, sonst neuer Branch — SLC-172 R-172-1). DEC-234: neuer StB-Inhalt, NICHT Exit-Readiness recyceln (DATEV-Abgrenzung SC-6).
2. **Finanzen komplett:** M-06 Liquiditaet, M-07 KPI-Set.
3. **HR + Nachfolge:** M-26/27/28 (Personal, 83%-Problem), M-35 (Nachfolgevertraege), M-42 (Unternehmer-Rolle/Loslassen).
4. **Rest 18-Cut:** M-01/02/03 (Fuehrung), M-08 (Vertrieb), M-15/16 (Marketing), M-36/38 (IT), M-39 (Wissensmgmt).

## Akzeptanzkriterien (pro Welle)
- **AC-170b-1:** Je geseedetem Modul 1 `template`-Row mit `blocks` (Stufe-1-Kern `required=true` + Stufe-2-Vertiefung `ebene=2`) + `metadata.ki_hebel[]` (Reifegrad 1-4); Blueprint zusaetzlich `diagnosis_schema`/`diagnosis_prompt`/Routing.
- **AC-170b-2:** Idempotent (`ON CONFLICT (slug, version) DO UPDATE`).
- **AC-170b-3:** Content stammt aus Founder-Autoring (Quell-Mapping je Modul in `docs/stb-vertikale/<M-xx>-seed-source.md`); kein erfundener Inhalt.
- **AC-170b-4:** DB-Sidecar-Test je Welle (Templates ladbar, blocks-Split korrekt, Re-Apply idempotent); `tsc`/`eslint` 0.

## Dependencies / Gate
- Hartes Gate: **Founder-Autoring** je Modul (Stop-Gate analog BL-095-Pattern). Ohne Content kein Seed.
- Blueprint-Welle blockt SLC-172; Modul-Wellen blocken die jeweiligen SLC-173-Capture-Pfade.
- Touch nur `template`-Tabelle (kein Schema). M-05 ist NICHT Teil (DEC-242).

## Out of Scope
M-05 + 27 weitere Nicht-Cut-Module; Modul-Editor-UI; Engine/Schema (SLC-169); Mandanten-Ebene (V11+).
