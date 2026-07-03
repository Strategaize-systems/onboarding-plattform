#!/usr/bin/env python3
# Generator MIG-129 — StB Scoring-Flag-Seed (17 Fachmodule inkl. M-04).
# SLC-177 (FEAT-096 Phase 1, V10.1, DEC-253/B/E) — /module-delivery Design-Time-Autoring.
#
# Erzeugt deterministisch sql/migrations/129_v101_module_delivery_flags_seed.sql aus:
#   - module-blocks-snapshot.json  = frozen Live-blocks der 17 stb_modul_*-Rows
#     (post-MIG-125/128, exakt der Content, auf den die Flags gelegt werden).
#   - module-delivery-flags.json   = Founder-approvte Flag-Map (Sonnet-4-Klassifikation,
#     Bedrock Frankfurt, "alles ok" 2026-07-03). Nur true-Flags; Rest = false.
#
# Prinzip (SKILL.md §Phase 3): Snapshot-Blocks tief kopieren, je Frage die 5 flachen
# Flag-Felder auf die approvten Werte setzen (Default false), UPDATE der blocks-JSONB.
# Voll-Rebuild aus dem Live-Snapshot => beweisbar NUR-Flags-Diff (Content byte-gleich),
# kein fragiles jsonb_set-Pfad-Chirurgie-Risiko (R-177-1 entschaerft).
#
# WICHTIG: Flags sind FLACHE boolean-Felder an der Frage (question.owner_dependency, ...),
# KEIN verschachteltes "flags"-Objekt (TemplateQuestionSchema, template-queries.ts:11-15).
#
# Determinismus: Snapshot + Flag-Map sind eingefroren; Re-Run => byte-identisches SQL.
# Reproduzieren:  python docs/stb-vertikale/gen-mig129-flag-seed.py

import copy
import json
import sys
from pathlib import Path

DOCS = Path(__file__).resolve().parent
FLAG_KEYS = ["owner_dependency", "deal_blocker", "sop_trigger", "ko_hart", "ko_soft"]


def load(name):
    return json.loads((DOCS / name).read_text(encoding="utf-8"))


def dq(tag, obj):
    return f"${tag}$" + json.dumps(obj, ensure_ascii=False, indent=2) + f"${tag}$"


def sql_escape(s):
    return s.replace("'", "''")


def main():
    snapshot = load("module-blocks-snapshot.json")     # [{slug,name,version,blocks}]
    flagmap = load("module-delivery-flags.json")["modules"]  # {slug: {frage_id: {flag:true}}}

    rows = sorted(snapshot, key=lambda r: r["slug"])    # deterministische Reihenfolge

    # Sanity: jede Flag-Map-Frage muss im Snapshot existieren (Tippfehler-Guard).
    snap_ids = {r["slug"]: {q["frage_id"] for b in r["blocks"] for q in b["questions"]}
                for r in rows}
    for slug, qmap in flagmap.items():
        assert slug in snap_ids, f"Flag-Map slug {slug} nicht im Snapshot"
        for fid in qmap:
            assert fid in snap_ids[slug], f"{slug}: Flag-Map frage_id {fid} nicht im Snapshot"
        for fid, flags in qmap.items():
            for fk in flags:
                assert fk in FLAG_KEYS, f"{slug}/{fid}: unbekanntes Flag {fk}"

    total_set = 0
    total_true_fields = 0
    out = []
    out.append("-- ============================================================================")
    out.append("-- MIG-129 — StB Scoring-Flag-Seed (17 Fachmodule inkl. M-04)")
    out.append("-- SLC-177 (FEAT-096 Phase 1, V10.1, DEC-253/B/E) — /module-delivery Autoring")
    out.append("--")
    out.append(f"-- Setzt die 5 Scoring-Flags an den {len(rows)} stb_modul_*-template-Rows:")
    out.append("--   " + ", ".join(r["slug"] for r in rows))
    out.append("-- Reiner Daten-Seed (KEIN DDL): UPDATE nur der flachen Flag-Felder in")
    out.append("--   blocks[].questions[]. Content (Fragetext/Themen/KI-Hebel/Counts) unveraendert")
    out.append("--   (Voll-Rebuild aus Live-Snapshot module-blocks-snapshot.json).")
    out.append("--")
    out.append("-- Flag-Quelle: docs/stb-vertikale/module-delivery-flags.json (Sonnet-4-Klassifikation")
    out.append("--   Bedrock Frankfurt eu-central-1, Founder-approved 'alles ok' 2026-07-03).")
    out.append("-- Shape 1:1 zu MIG-125/128 (TemplateQuestion flache Flags). Generator:")
    out.append("--   docs/stb-vertikale/gen-mig129-flag-seed.py (Re-Run => byte-identisch).")
    out.append("--")
    out.append("-- IDEMPOTENZ: reines UPDATE ... WHERE slug/version. Zweiter Apply = identische")
    out.append("--   Flags (deterministisch). Kein INSERT, keine neue Row.")
    out.append("--")
    out.append("-- APPLY (sql-migration-hetzner.md): base64 -> /tmp, dann")
    out.append("--   docker exec -i <supabase-db> psql -U postgres -d postgres < /tmp/129_...sql")
    out.append("-- VERIFY (nur-Flags gesetzt, Content unveraendert):")
    out.append("--   SELECT t.slug, count(*) FILTER (WHERE (q->>'owner_dependency')::bool OR")
    out.append("--     (q->>'deal_blocker')::bool OR (q->>'sop_trigger')::bool OR")
    out.append("--     (q->>'ko_hart')::bool OR (q->>'ko_soft')::bool) AS flagged,")
    out.append("--     count(*) AS questions")
    out.append("--   FROM public.template t, jsonb_array_elements(t.blocks) b,")
    out.append("--     jsonb_array_elements(b->'questions') q")
    out.append("--   WHERE t.slug LIKE 'stb_modul_%' GROUP BY t.slug ORDER BY t.slug;")
    out.append("-- ============================================================================")
    out.append("")
    out.append("BEGIN;")
    out.append("")

    for r in rows:
        slug = r["slug"]
        version = r["version"]
        qmap = flagmap.get(slug, {})
        blocks = copy.deepcopy(r["blocks"])
        row_set = 0
        for b in blocks:
            for q in b["questions"]:
                set_flags = qmap.get(q["frage_id"], {})
                for fk in FLAG_KEYS:
                    val = bool(set_flags.get(fk, False))
                    q[fk] = val
                    if val:
                        total_true_fields += 1
                if any(set_flags.get(fk) for fk in FLAG_KEYS):
                    row_set += 1
        total_set += row_set
        nq = sum(len(b["questions"]) for b in blocks)
        out.append(f"-- ── {slug} · {nq} Fragen · {row_set} geflaggt ──")
        out.append("UPDATE public.template SET")
        out.append(f"  blocks     = {dq('blocks', blocks)}::jsonb,")
        out.append("  updated_at = now()")
        out.append(f"WHERE slug = '{sql_escape(slug)}' AND version = '{sql_escape(version)}';")
        out.append("")

    out.append("NOTIFY pgrst, 'reload schema';")
    out.append("")
    out.append("COMMIT;")
    out.append("")

    sql = "\n".join(out)
    target = DOCS.parent.parent / "sql" / "migrations" / "129_v101_module_delivery_flags_seed.sql"
    target.write_text(sql, encoding="utf-8")

    print(f"[gen-mig129] {len(rows)} Rows, {total_set} geflaggte Fragen, "
          f"{total_true_fields} true-Flag-Felder", file=sys.stderr)
    for r in rows:
        slug = r["slug"]
        qmap = flagmap.get(slug, {})
        print(f"  {slug:16} geflaggt={len(qmap):2}", file=sys.stderr)
    print(f"[gen-mig129] -> {target}", file=sys.stderr)


if __name__ == "__main__":
    main()
