#!/usr/bin/env python3
# Generator MIG-128 — StB Fachmodul-Seed (16 Module, Welle 3-5)
# SLC-170b (FEAT-092 StB-Vertikale, DEC-234 / DEC-242) — Modus A /module-author
#
# Erzeugt deterministisch sql/migrations/128_v10_stb_fachmodule_seed.sql aus den
# 16 abgenommenen Quellen docs/stb-vertikale/M-<xx>-seed-source.md.
# (M-04 = MIG-125, M-BP = MIG-126 sind bereits geseedet und NICHT hier enthalten.)
#
# Determinismus:
#   - uuid5(NAMESPACE_URL, "strategaize/template/<slug>/<kind>/<id>")
#     -> NS enthaelt den Slug: Frage-IDs distinkt pro Modul + vs. exit_readiness.
#   - json.dumps(ensure_ascii=False, indent=2) -> stabiler, lesbarer Output.
#   - Re-Run erzeugt byte-identisches SQL. PARSER statt Hand-Transkription:
#     die seed-source.md sind die abgenommene Single-Source; der Generator liest
#     §1 (Row), §3 (Themenbaum), §4 (Fragebogen), §5 (KI-Hebel).
#
# Reproduzieren:  python docs/stb-vertikale/gen-mig128-fachmodule-seed.py

import json
import re
import sys
import uuid
from pathlib import Path

NS = uuid.NAMESPACE_URL
DOCS = Path(__file__).resolve().parent

# Reihenfolge = Seed-Reihenfolge in der Migration (Führung→Finanzen→Vertrieb→
# Marketing→HR→Recht→IT→Wissen→Persönlich; ohne M-04/M-BP).
MODULES = [
    "M-01", "M-02", "M-03",
    "M-06", "M-07",
    "M-08",
    "M-15", "M-16",
    "M-26", "M-27", "M-28",
    "M-35",
    "M-36", "M-38",
    "M-39",
    "M-42",
]


# ─── Markdown-Helfer ────────────────────────────────────────────────────────
def cells(line: str):
    """'| a | b | c |' -> ['a','b','c'] (Rand-Leerzellen entfernt)."""
    parts = [c.strip() for c in line.split("|")]
    if parts and parts[0] == "":
        parts = parts[1:]
    if parts and parts[-1] == "":
        parts = parts[:-1]
    return parts


def strip_ticks(s: str) -> str:
    return s.strip().strip("`").strip()


def section(lines, header_prefix):
    """Zeilen einer '## '-Section (bis zur naechsten '## ')."""
    out, active = [], False
    for ln in lines:
        if ln.startswith("## "):
            active = ln.startswith(header_prefix)
            continue
        if active:
            out.append(ln)
    return out


def table_rows(lines):
    """Datenzeilen einer (Single-)MD-Tabelle: Header + Trennzeile verworfen.
    Die Kopfzeile steht direkt vor der '|---|'-Trennzeile — beim Treffer der
    Trennzeile werden alle bis dahin gesammelten (Kopf-)Zeilen verworfen."""
    rows = []
    for ln in lines:
        s = ln.strip()
        if not s.startswith("|"):
            continue
        if re.match(r"^\|[\s:|-]+\|?\s*$", s):  # ---|---|--- Trennzeile
            rows = []  # verwirft die Header-Zeile(n) vor dem Trenner
            continue
        rows.append(s)
    return rows


# ─── Parser pro seed-source.md ──────────────────────────────────────────────
def parse_module(mod_id: str):
    path = DOCS / f"{mod_id}-seed-source.md"
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()

    # §1 Geseedete Row -> slug / version / name / kategorie / modul_key
    s1 = section(lines, "## 1.")
    row = {}
    for r in table_rows(s1):
        c = cells(r)
        if len(c) >= 2:
            row[strip_ticks(c[0]).lower()] = c[1]
    slug = strip_ticks(row["slug"])
    version = strip_ticks(row["version"])
    name = strip_ticks(row["name"])
    kategorie = re.sub(r"\s*\(.*$", "", row["kategorie"]).strip()
    mk = re.search(r"m\d+", strip_ticks(row["metadata.modul_key"]))
    modul_key = mk.group(0) if mk else ""

    # §3 Themenbaum -> themenmodell[{key,name,unterpunkte[]}]
    s3 = section(lines, "## 3.")
    themen, cur = [], None
    for r in table_rows(s3):
        c = cells(r)
        if len(c) < 4:
            continue
        bereich, bname, _schluessel, unterthema = c[0], c[1], c[2], c[3]
        if bereich and bname:  # neuer Bereich (Folgezeilen haben leere Zellen)
            cur = {"key": bereich, "name": bname, "unterpunkte": []}
            themen.append(cur)
        if cur is not None and unterthema:
            cur["unterpunkte"].append(unterthema)

    # §4 Fragebogen -> Kern / Vertiefung
    s4 = section(lines, "## 4.")
    kern, vert, bucket = [], [], None
    for ln in s4:
        s = ln.strip()
        if s.startswith("### Stufe 1"):
            bucket = "kern"
            continue
        if s.startswith("### Stufe 2"):
            bucket = "vert"
            continue
        if not s.startswith("|") or bucket is None:
            continue
        if re.match(r"^\|[\s:|-]+\|?\s*$", s):
            continue
        c = cells(s)
        if len(c) < 4 or not re.match(r"^F-M?\d", c[1]) and not c[1].startswith("F-"):
            continue  # Header/Fußnote überspringen
        try:
            pos = int(c[0])
        except ValueError:
            continue
        entry = (pos, c[1].strip(), strip_ticks(c[2]), c[3].strip())
        (kern if bucket == "kern" else vert).append(entry)

    # §5 KI-Hebel -> ki_hebel[{hebel_id,name,beschreibung,reifegrad,referenz}]
    s5 = section(lines, "## 5.")
    hebel = []
    for r in table_rows(s5):
        c = cells(r)
        if len(c) < 4 or not c[0].startswith("H-"):
            continue
        raw_name = c[1].strip()
        m = re.match(r"^(.*?)\s*\((.*)\)\s*$", raw_name)
        if m:
            hname, hbeschr = m.group(1).strip(), m.group(2).strip()
        else:
            hname, hbeschr = raw_name, ""
        try:
            reifegrad = int(re.search(r"\d", c[2]).group(0))
        except (AttributeError, ValueError):
            reifegrad = 1
        hebel.append({
            "hebel_id": c[0].strip(),
            "name": hname,
            "beschreibung": hbeschr,
            "reifegrad": reifegrad,
            "referenz": c[3].strip(),
        })

    return {
        "mod_id": mod_id, "slug": slug, "version": version, "name": name,
        "kategorie": kategorie, "modul_key": modul_key,
        "themen": themen, "kern": kern, "vert": vert, "hebel": hebel,
    }


# ─── JSON-Aufbau (Shape 1:1 zu MIG-125 / template-queries.ts) ───────────────
def qid(slug, frage_id):
    return str(uuid.uuid5(NS, f"strategaize/template/{slug}/q/{frage_id}"))


def bid(slug, key):
    return str(uuid.uuid5(NS, f"strategaize/template/{slug}/block/{key}"))


def question(slug, pos, frage_id, unterbereich, text, ebene):
    return {
        "id": qid(slug, frage_id),
        "frage_id": frage_id,
        "text": text,
        "ebene": ebene,
        "unterbereich": unterbereich,
        "position": pos,
        "owner_dependency": False,
        "deal_blocker": False,
        "sop_trigger": False,
        "ko_hart": False,
        "ko_soft": False,
    }


def build_blocks(m):
    slug = m["slug"]
    kern_q = [question(slug, p, fid, ub, txt, "Kern") for (p, fid, ub, txt) in m["kern"]]
    vert_q = [question(slug, p, fid, ub, txt, "Vertiefung") for (p, fid, ub, txt) in m["vert"]]
    return [
        {
            "id": bid(slug, "stufe1_kern"),
            "key": "stufe1_kern",
            "title": {"de": "Stufe 1 – Kern", "en": "Stage 1 – Core", "nl": "Fase 1 – Kern"},
            "description": "Pflicht-Kernfragen.",
            "order": 1,
            "required": True,
            "weight": 1.0,
            "questions": kern_q,
        },
        {
            "id": bid(slug, "stufe2_vertiefung"),
            "key": "stufe2_vertiefung",
            "title": {"de": "Stufe 2 – Vertiefung", "en": "Stage 2 – Deep-dive", "nl": "Fase 2 – Verdieping"},
            "description": "Optionale Vertiefungsfragen.",
            "order": 2,
            "required": False,
            "weight": 1.0,
            "questions": vert_q,
        },
    ]


def build_metadata(m):
    return {
        "modul_id": m["mod_id"],
        "modul_key": m["modul_key"],
        "modul_kategorie": m["kategorie"],
        "output_contract": {
            "kinds": ["entscheidung", "standard", "implementierungsschritt"],
            "ki_hebel_kind": "ki_hebel",
            "reifegrad_range": [1, 4],
            "beschreibung": (
                f"Aus den {m['mod_id']}-Antworten leitet der Synthese-Worker "
                "(module_output_synthesis) je relevantes Thema ein Liefer-Triple ab: "
                "Entscheidung (was zu entscheiden ist) / Standard (welche Norm/Routine gilt) / "
                "Implementierungsschritt (konkreter naechster Schritt). KI-Hebel werden als "
                "output_kind='ki_hebel' mit reifegrad 1-4 ausgegeben. "
                "Werte gemaess modul_output.output_kind-CHECK (MIG-124)."
            ),
        },
        "themenmodell": m["themen"],
        "ki_hebel": m["hebel"],
    }


def description(m):
    nk, nv, nh = len(m["kern"]), len(m["vert"]), len(m["hebel"])
    return (
        f"{m['name']} — StB-KERN-Cut (DEC-242). {nk + nv} Fragen "
        f"({nk} Kern / {nv} Vertiefung), {nh} KI-Hebel (Reifegrad 1-4). "
        f"Quelle: docs/stb-vertikale/{m['mod_id']}-seed-source.md (SLC-170b, Modus A /module-author)."
    )


def dq(tag, obj):
    return f"${tag}$" + json.dumps(obj, ensure_ascii=False, indent=2) + f"${tag}$"


def sql_escape(s):
    return s.replace("'", "''")


# ─── Emit ───────────────────────────────────────────────────────────────────
def main():
    mods = [parse_module(mid) for mid in MODULES]

    # Sanity-Checks (Fail-fast, kein halbes Seed)
    seen_slug, seen_qid = set(), set()
    for m in mods:
        assert m["slug"] and m["modul_key"], f"{m['mod_id']}: slug/modul_key fehlt"
        assert m["slug"] not in seen_slug, f"Doppelter Slug {m['slug']}"
        seen_slug.add(m["slug"])
        assert m["kern"], f"{m['mod_id']}: keine Kern-Fragen geparst"
        assert m["hebel"], f"{m['mod_id']}: keine KI-Hebel geparst"
        assert m["themen"], f"{m['mod_id']}: kein Themenbaum geparst"
        for blk in build_blocks(m):
            for q in blk["questions"]:
                assert q["id"] not in seen_qid, f"UUID-Kollision {q['frage_id']}"
                seen_qid.add(q["id"])

    total_q = sum(len(m["kern"]) + len(m["vert"]) for m in mods)
    total_h = sum(len(m["hebel"]) for m in mods)

    out = []
    out.append("-- ============================================================================")
    out.append("-- MIG-128 — StB Fachmodul-Seed (16 Module, Welle 3-5)")
    out.append("-- SLC-170b (FEAT-092 StB-Vertikale, DEC-234 / DEC-242) — Modus A /module-author")
    out.append("--")
    out.append(f"-- Seedet {len(mods)} template-Rows (M-04=MIG-125, M-BP=MIG-126 separat):")
    out.append("--   " + ", ".join(m["mod_id"] for m in mods))
    out.append(f"-- Summe: {total_q} Fragen (2 Blocks/Modul: stufe1_kern required + stufe2_vertiefung),")
    out.append(f"--        {total_h} KI-Hebel (Reifegrad 1-4) in metadata.ki_hebel.")
    out.append("--")
    out.append("-- Content-Quelle: docs/stb-vertikale/M-<xx>-seed-source.md (v1.0, abgenommen).")
    out.append("-- Shape 1:1 zu MIG-125 (M-04): template-queries.ts (TemplateBlock/Question) +")
    out.append("--   module-context.ts (ModuleMetadataSchema). Scoring-Flags = false (Delivery-Schicht).")
    out.append("-- Determinismus: uuid5(NAMESPACE_URL, 'strategaize/template/<slug>/<kind>/<id>'),")
    out.append("--   json.dumps(ensure_ascii=False). Generator: docs/stb-vertikale/gen-mig128-fachmodule-seed.py")
    out.append("--")
    out.append("-- IDEMPOTENZ: INSERT ... ON CONFLICT (slug, version) DO UPDATE. Zweiter Apply =")
    out.append("--   0 neue Rows, Content-Update (blocks/metadata/description/name). uuid5 -> stabil.")
    out.append("--")
    out.append("-- APPLY (sql-migration-hetzner.md): base64 -> /tmp, dann")
    out.append("--   docker exec -i <supabase-db> psql -U postgres -d postgres < /tmp/128_...sql")
    out.append("-- VERIFY:")
    out.append("--   SELECT slug, jsonb_array_length(blocks) AS blocks,")
    out.append("--     (SELECT COUNT(*) FROM jsonb_array_elements(blocks) b,")
    out.append("--       jsonb_array_elements(b->'questions') q) AS questions,")
    out.append("--     jsonb_array_length(metadata->'ki_hebel') AS hebel, metadata->>'modul_key' AS mk")
    out.append("--   FROM public.template WHERE slug LIKE 'stb_modul_%' AND slug NOT IN ('stb_modul_m04')")
    out.append("--   ORDER BY slug;")
    out.append(f"--   -- erwartet: {len(mods)} Rows (+ m04 aus MIG-125), je blocks=2, mk gesetzt.")
    out.append("-- ============================================================================")
    out.append("")
    out.append("BEGIN;")
    out.append("")

    for m in mods:
        blocks = build_blocks(m)
        meta = build_metadata(m)
        nk, nv, nh = len(m["kern"]), len(m["vert"]), len(m["hebel"])
        out.append(f"-- ── {m['mod_id']} · {m['slug']} · {nk} Kern / {nv} Vertiefung / {nh} KI-Hebel ──")
        out.append("INSERT INTO public.template (slug, name, version, description, blocks, metadata)")
        out.append("VALUES (")
        out.append(f"  '{sql_escape(m['slug'])}',")
        out.append(f"  '{sql_escape(m['name'])}',")
        out.append(f"  '{sql_escape(m['version'])}',")
        out.append(f"  '{sql_escape(description(m))}',")
        out.append(f"  {dq('blocks', blocks)}::jsonb,")
        out.append(f"  {dq('metadata', meta)}::jsonb")
        out.append(")")
        out.append("ON CONFLICT (slug, version) DO UPDATE SET")
        out.append("  name        = EXCLUDED.name,")
        out.append("  description = EXCLUDED.description,")
        out.append("  blocks      = EXCLUDED.blocks,")
        out.append("  metadata    = EXCLUDED.metadata,")
        out.append("  updated_at  = now();")
        out.append("")

    out.append("COMMIT;")
    out.append("")

    sql = "\n".join(out)
    target = DOCS.parent.parent / "sql" / "migrations" / "128_v10_stb_fachmodule_seed.sql"
    target.write_text(sql, encoding="utf-8")

    # Report an stderr (nicht ins SQL)
    print(f"[gen-mig128] {len(mods)} Module, {total_q} Fragen, {total_h} KI-Hebel", file=sys.stderr)
    for m in mods:
        print(f"  {m['mod_id']:5} {m['slug']:16} kern={len(m['kern']):2} vert={len(m['vert']):2} "
              f"hebel={len(m['hebel']):2} themen={len(m['themen'])} mk={m['modul_key']}", file=sys.stderr)
    print(f"[gen-mig128] -> {target}", file=sys.stderr)


if __name__ == "__main__":
    main()
