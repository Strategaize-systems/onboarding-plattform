-- Migration 081 — V4.4 BL-069 / MIG-030 — Umlaut-Backfill fuer Demo-Template
--
-- Zweck:
--   Korrigiert ~41 Umlaut-Vorkommnisse in `template.blocks` und `template.sop_prompt`
--   JSONB-Feldern fuer slug='mitarbeiter_wissenserhebung'. Wortliste extrahiert aus
--   Live-DB-Audit (SLC-062 MT-1, audit-umlauts-livedb.mjs, 49 Unique-Worte gescannt,
--   30 TRUE-POSITIVE, 19 FALSE-POSITIVE manuell gefiltert).
--
-- Format: PL/pgSQL DO-Block per DEC-071. JSONB->text-Roundtrip + curated word-list
--         replace(). Idempotent: Re-Apply matcht 0 Source-Strings → 0 zusaetzliche Aenderungen.
--
-- Pre-Apply-Backup-Empfehlung:
--   docker exec <db-container> psql -U postgres -d postgres \
--     -c "\copy (SELECT id, slug, blocks, sop_prompt FROM template WHERE slug='mitarbeiter_wissenserhebung') TO '/tmp/pre-mig-030.csv' WITH CSV HEADER"
--
-- Apply-Pattern (per sql-migration-hetzner.md):
--   base64 -w 0 sql/migrations/081_v44_umlaut_backfill_demo_template.sql      (lokal)
--   echo '<BASE64>' | base64 -d > /tmp/081_v44.sql                           (server)
--   docker exec -i <db-container> psql -U postgres -d postgres < /tmp/081_v44.sql
--
-- Post-Apply-Audit:
--   COPY (SELECT blocks::text FROM template WHERE slug='mitarbeiter_wissenserhebung') TO STDOUT > blocks.txt
--   COPY (SELECT sop_prompt::text FROM template WHERE slug='mitarbeiter_wissenserhebung') TO STDOUT > sop.txt
--   node scripts/audit-umlauts-livedb.mjs   → erwartet: TRUE-POSITIVE-Worte = 0 Vorkommnisse
--   FALSE-POSITIVE-Worte (Wissen, Prozesse, etc.) bleiben — das ist korrektes Deutsch.

DO $mig030$
DECLARE
  v_blocks  text;
  v_sop     text;
  v_count   int;
  v_pre_blocks_md5  text;
  v_pre_sop_md5     text;
  v_post_blocks_md5 text;
  v_post_sop_md5    text;
BEGIN
  -- Idempotenz-Guard: skip if template missing.
  SELECT count(*) INTO v_count FROM template WHERE slug = 'mitarbeiter_wissenserhebung';
  IF v_count = 0 THEN
    RAISE NOTICE 'MIG-030 SKIP: Template mitarbeiter_wissenserhebung not found.';
    RETURN;
  END IF;

  -- Snapshot pre-state for diff-logging.
  SELECT blocks::text, sop_prompt::text
    INTO v_blocks, v_sop
    FROM template
    WHERE slug = 'mitarbeiter_wissenserhebung';

  v_pre_blocks_md5 := md5(v_blocks);
  v_pre_sop_md5    := md5(coalesce(v_sop, ''));

  -- "ae" → "ä" (14 unique source strings)
  v_blocks := replace(v_blocks, 'Ablaeufe',                   'Abläufe');
  v_blocks := replace(v_blocks, 'aendern',                    'ändern');
  v_blocks := replace(v_blocks, 'eigenstaendig',              'eigenständig');
  v_blocks := replace(v_blocks, 'Erklaerungen',               'Erklärungen');
  v_blocks := replace(v_blocks, 'Gespraech',                  'Gespräch');
  v_blocks := replace(v_blocks, 'laeuft',                     'läuft');
  v_blocks := replace(v_blocks, 'regelmaessig',               'regelmäßig');  -- inkl. ss → ß
  v_blocks := replace(v_blocks, 'Rollenverstaendnis',         'Rollenverständnis');
  v_blocks := replace(v_blocks, 'Staerken',                   'Stärken');
  v_blocks := replace(v_blocks, 'taeglich',                   'täglich');
  v_blocks := replace(v_blocks, 'Verbesserungsvorschlaege',   'Verbesserungsvorschläge');
  v_blocks := replace(v_blocks, 'waere',                      'wäre');         -- handles waere + waeren
  v_blocks := replace(v_blocks, 'Zugaenge',                   'Zugänge');

  -- "oe" → "ö" (6 unique source strings)
  v_blocks := replace(v_blocks, 'Behoerden',                  'Behörden');
  v_blocks := replace(v_blocks, 'koennte',                    'könnte');       -- handles koennte + koennten
  v_blocks := replace(v_blocks, 'moechten',                   'möchten');
  v_blocks := replace(v_blocks, 'Passwoerter',                'Passwörter');
  v_blocks := replace(v_blocks, 'persoenlich',                'persönlich');
  v_blocks := replace(v_blocks, 'woechentlich',               'wöchentlich');

  -- "ue" → "ü" (6 unique source strings)
  v_blocks := replace(v_blocks, 'Abkuerzungen',               'Abkürzungen');
  v_blocks := replace(v_blocks, 'fuer',                       'für');          -- handles fuer + wofuer (substring)
  v_blocks := replace(v_blocks, 'Fuer',                       'Für');
  v_blocks := replace(v_blocks, 'muessen',                    'müssen');
  v_blocks := replace(v_blocks, 'ueber',                      'über');         -- handles ueber + uebernimmt (prefix)
  v_blocks := replace(v_blocks, 'wuerde',                     'würde');        -- handles wuerde + wuerden

  -- Apply identical replacements to sop_prompt.
  v_sop := replace(v_sop, 'Ablaeufe',                   'Abläufe');
  v_sop := replace(v_sop, 'aendern',                    'ändern');
  v_sop := replace(v_sop, 'eigenstaendig',              'eigenständig');
  v_sop := replace(v_sop, 'Erklaerungen',               'Erklärungen');
  v_sop := replace(v_sop, 'Gespraech',                  'Gespräch');
  v_sop := replace(v_sop, 'laeuft',                     'läuft');
  v_sop := replace(v_sop, 'regelmaessig',               'regelmäßig');
  v_sop := replace(v_sop, 'Rollenverstaendnis',         'Rollenverständnis');
  v_sop := replace(v_sop, 'Staerken',                   'Stärken');
  v_sop := replace(v_sop, 'taeglich',                   'täglich');
  v_sop := replace(v_sop, 'Verbesserungsvorschlaege',   'Verbesserungsvorschläge');
  v_sop := replace(v_sop, 'waere',                      'wäre');
  v_sop := replace(v_sop, 'Zugaenge',                   'Zugänge');
  v_sop := replace(v_sop, 'Behoerden',                  'Behörden');
  v_sop := replace(v_sop, 'koennte',                    'könnte');
  v_sop := replace(v_sop, 'moechten',                   'möchten');
  v_sop := replace(v_sop, 'Passwoerter',                'Passwörter');
  v_sop := replace(v_sop, 'persoenlich',                'persönlich');
  v_sop := replace(v_sop, 'woechentlich',               'wöchentlich');
  v_sop := replace(v_sop, 'Abkuerzungen',               'Abkürzungen');
  v_sop := replace(v_sop, 'fuer',                       'für');
  v_sop := replace(v_sop, 'Fuer',                       'Für');
  v_sop := replace(v_sop, 'muessen',                    'müssen');
  v_sop := replace(v_sop, 'ueber',                      'über');
  v_sop := replace(v_sop, 'wuerde',                     'würde');

  v_post_blocks_md5 := md5(v_blocks);
  v_post_sop_md5    := md5(coalesce(v_sop, ''));

  -- Idempotenz-Logging: zeigt md5-Diff. Bei Re-Apply sind pre+post identisch.
  RAISE NOTICE 'MIG-030 blocks md5: pre=% post=% (changed=%)',
    v_pre_blocks_md5, v_post_blocks_md5, (v_pre_blocks_md5 IS DISTINCT FROM v_post_blocks_md5);
  RAISE NOTICE 'MIG-030 sop_prompt md5: pre=% post=% (changed=%)',
    v_pre_sop_md5, v_post_sop_md5, (v_pre_sop_md5 IS DISTINCT FROM v_post_sop_md5);

  UPDATE template
     SET blocks = v_blocks::jsonb,
         sop_prompt = v_sop::jsonb
   WHERE slug = 'mitarbeiter_wissenserhebung';

  RAISE NOTICE 'MIG-030 DONE: template mitarbeiter_wissenserhebung umlaut-backfill applied.';
END;
$mig030$;
