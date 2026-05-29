#!/usr/bin/env node
// V8 SLC-148 MT-7 — Live-Smoke-Test fuer finalizeMandantenReport-Pipeline.
//
// Testet den vollen Production-Pfad gegen die Coolify-DB OHNE Frontend:
//   1. Resolve V8-Template (slug='exit-readiness-teaser-v1') + Test-Tenant/User
//   2. INSERT capture_session mit komplettem 53-Antworten-Set
//   3. INSERT ai_jobs (knowledge_unit_condensation, payload.capture_session_id)
//   4. POLL bis capture_session.metadata.v8_report_snapshot vorhanden (max 60s)
//   5. VALIDATE Snapshot-Felder (schemaVersion, sui, classification, moduleScores,
//      stufenMapping, hausaufgaben, reflexionen, hebel)
//   6. VALIDATE released_for_strategaize_review = false (DEC-163 AC-SLC-148-6)
//   7. CLEANUP: DELETE capture_session (CASCADE entfernt ai_jobs + checkpoints)
//
// PRE-CONDITION (Founder-Setup, einmalig):
//   In der Coolify-DB muss ein Test-Tenant + ein Test-Owner-User existieren.
//   Quick-Setup-SQL (1x via psql auf Coolify-DB ausfuehren):
//
//     -- Test-Tenant + Test-User fuer V8-Smoke
//     INSERT INTO public.tenants (id, name, tenant_kind, created_at)
//     VALUES ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'V8 Smoke Tenant',
//             'partner_client', now())
//     ON CONFLICT (id) DO NOTHING;
//
//     -- Ein bestehender User aus public.profiles, der zu diesem Tenant
//     -- verschoben oder neu angelegt ist. Beispiel mit bestehendem Profil:
//     UPDATE public.profiles
//       SET tenant_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
//       WHERE email = '<your-test-email>';
//
//   Dann TEST_TENANT_ID + TEST_OWNER_USER_ID setzen.
//
// Aufruf:
//   TEST_DATABASE_URL='postgresql://postgres:PW@HOST:5432/postgres' \
//   TEST_TENANT_ID='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' \
//   TEST_OWNER_USER_ID='<existing-profile-uuid>' \
//     node scripts/live-test-mandanten-report.mjs
//
// Exit-Code: 0 PASS, 1 VALIDATION-FAIL, 2 SETUP-FAIL.

import pg from "pg";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60_000;

// 53 Antworten: 5 Hygiene + 43 Skala + 5 Reflexion.
// Skala alle "3" -> Score 5 -> sui = 5*8 + 5*2 = 50 -> classification = teil_reife
// Hygiene-Mix: 2x "ja", 2x "nein", 1x "teilweise" -> 3 Hausaufgaben erwartet
// Reflexion: 3 ausgefuellt + 2 leer -> 3 Reflexionen erwartet
const ANSWERS = {
  // Modul 0 — Hygiene (5 Fragen)
  "M0.1": "ja",
  "M0.2": "nein",
  "M0.3": "teilweise",
  "M0.4": "nein",
  "M0.5": "ja",
  // Modul 1 — Skalierbares Produkt (4 Fragen)
  "F1.1": "3", "F1.2": "3", "F1.3": "3", "F1.4": "3",
  // Modul 2 — Bewusster Kunden-Fokus (4)
  "F2.1": "3", "F2.2": "3", "F2.3": "3", "F2.4": "3",
  // Modul 3 — Liquiditaet und Zahlen-Steuerung (6)
  "F3.1": "3", "F3.2": "3", "F3.3": "3", "F3.4": "3", "F3.5": "3", "F3.6": "3",
  // Modul 4 — Vertrieb ohne den Inhaber (4 inkl. KI-Erweiterung F4.4)
  "F4.1": "3", "F4.2": "3", "F4.3": "3", "F4.4": "3",
  // Modul 5 — Wiederkehrende Umsaetze (3)
  "F5.1": "3", "F5.2": "3", "F5.3": "3",
  // Modul 6 — Datenbasis und Struktur (6 inkl. KI-Erweiterungen F6.5, F6.6)
  "F6.1": "3", "F6.2": "3", "F6.3": "3", "F6.4": "3", "F6.5": "3", "F6.6": "3",
  // Modul 7 — Eigenes Wissenssystem (4)
  "F7.1": "3", "F7.2": "3", "F7.3": "3", "F7.4": "3",
  // Modul 8 — Fuehrung, Team, Kommunikation (7 inkl. KI-Erweiterung F8.7)
  "F8.1": "3", "F8.2": "3", "F8.3": "3", "F8.4": "3", "F8.5": "3", "F8.6": "3", "F8.7": "3",
  // Modul 9 — Strukturiertes Wertschaffen (5 inkl. KI-Erweiterungen F9.4, F9.5)
  "F9.1": "3", "F9.2": "3", "F9.3": "3", "F9.4": "3", "F9.5": "3",
  // Modul 10 — Reflexion (5 — 3 ausgefuellt, 2 leer)
  "F10.1": "Mein Vermaechtnis: gesundes Unternehmen weitergeben.",
  "F10.2": "",
  "F10.3": "Naechster Schritt: Geschaeftsfuehrer-Vertretung etablieren.",
  "F10.4": "",
  "F10.5": "Persoenliche Reife: gelassener im Loslassen.",
};

const EXPECTED = {
  sui: 50,
  classificationKind: "teil_reife",
  hausaufgabenCount: 3, // 2 nein + 1 teilweise
  reflexionenCount: 3, // 3 non-empty
  hebelCount: 3,
};

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`FEHLER: ENV-Variable ${name} nicht gesetzt.`);
    process.exit(2);
  }
  return v;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const url = requireEnv("TEST_DATABASE_URL");
  const tenantId = requireEnv("TEST_TENANT_ID");
  const ownerUserId = requireEnv("TEST_OWNER_USER_ID");

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  console.log("[live-test] Verbunden mit Coolify-DB.");

  let sessionId = null;
  let exitCode = 0;
  try {
    // 1. Resolve V8-Template
    const { rows: tmplRows } = await client.query(
      "SELECT id, version FROM public.template WHERE slug = $1 ORDER BY version DESC LIMIT 1",
      ["exit-readiness-teaser-v1"],
    );
    if (tmplRows.length === 0) {
      console.error("FEHLER: Template 'exit-readiness-teaser-v1' nicht gefunden.");
      process.exit(2);
    }
    const templateId = tmplRows[0].id;
    const templateVersion = tmplRows[0].version;
    console.log(`[live-test] V8-Template: id=${templateId} version=${templateVersion}`);

    // 2. INSERT capture_session
    const { rows: sessRows } = await client.query(
      `INSERT INTO public.capture_session
        (tenant_id, template_id, template_version, owner_user_id, status,
         capture_mode, answers, metadata)
       VALUES ($1, $2, $3, $4, 'in_progress', 'questionnaire',
               $5::jsonb, '{}'::jsonb)
       RETURNING id`,
      [tenantId, templateId, templateVersion, ownerUserId, JSON.stringify(ANSWERS)],
    );
    sessionId = sessRows[0].id;
    console.log(`[live-test] capture_session erstellt: id=${sessionId}, 53 Antworten geseedet`);

    // 3. INSERT ai_jobs
    const { rows: jobRows } = await client.query(
      `INSERT INTO public.ai_jobs
        (tenant_id, job_type, status, payload)
       VALUES ($1, 'knowledge_unit_condensation', 'pending',
               jsonb_build_object('capture_session_id', $2::text,
                                  'source_kind', 'diagnose'))
       RETURNING id`,
      [tenantId, sessionId],
    );
    const jobId = jobRows[0].id;
    console.log(`[live-test] ai_jobs erstellt: id=${jobId} status=pending`);

    // 4. POLL bis Snapshot vorhanden
    console.log("[live-test] Warte auf Worker-Pipeline (max 60s)...");
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let snapshot = null;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const { rows } = await client.query(
        `SELECT metadata->'v8_report_snapshot' AS snapshot,
                status,
                released_for_strategaize_review AS released
         FROM public.capture_session WHERE id = $1`,
        [sessionId],
      );
      const row = rows[0];
      if (row?.snapshot) {
        snapshot = row.snapshot;
        console.log(`[live-test] Snapshot vorhanden nach ~${POLL_TIMEOUT_MS - (deadline - Date.now())}ms`);
        console.log(`[live-test] session.status=${row.status} released_for_strategaize_review=${row.released}`);
        break;
      }
    }

    if (!snapshot) {
      console.error("FEHLER: Snapshot wurde innerhalb 60s nicht geschrieben.");
      console.error("Pruefen: Laeuft der Worker? Hat er den Job gepickt?");
      const { rows: jobCheck } = await client.query(
        "SELECT id, status, started_at, completed_at FROM public.ai_jobs WHERE id = $1",
        [jobId],
      );
      console.error("ai_job status:", jobCheck[0]);
      exitCode = 1;
      return;
    }

    // 5. VALIDATE Snapshot-Schema
    console.log("\n[live-test] === Snapshot-Validierung ===");
    const checks = [];

    checks.push(["schemaVersion === 1", snapshot.schemaVersion === 1]);
    checks.push([
      "finalizedAt ist ISO-Date",
      typeof snapshot.finalizedAt === "string"
        && /^\d{4}-\d{2}-\d{2}T/.test(snapshot.finalizedAt),
    ]);
    checks.push([
      `sui === ${EXPECTED.sui}`,
      snapshot.sui === EXPECTED.sui,
    ]);
    checks.push([
      `classification.kind === '${EXPECTED.classificationKind}'`,
      snapshot.classification?.kind === EXPECTED.classificationKind,
    ]);
    checks.push([
      "classification hat color, label, meaning",
      typeof snapshot.classification?.color === "string"
        && typeof snapshot.classification?.label === "string"
        && typeof snapshot.classification?.meaning === "string",
    ]);

    const moduleScoreKeys = Object.keys(snapshot.moduleScores ?? {});
    checks.push([
      "moduleScores hat 9 Keys (m1..m9)",
      moduleScoreKeys.length === 9
        && moduleScoreKeys.every((k) => /^m[1-9]$/.test(k)),
    ]);
    checks.push([
      "moduleScores alle === 5 (skala-3 -> Score 5)",
      moduleScoreKeys.every((k) => snapshot.moduleScores[k] === 5),
    ]);

    const stufenKeys = Object.keys(snapshot.stufenMapping ?? {});
    checks.push([
      "stufenMapping hat 9 Keys mit Werten 1-5",
      stufenKeys.length === 9
        && stufenKeys.every((k) => {
          const v = snapshot.stufenMapping[k];
          return Number.isInteger(v) && v >= 1 && v <= 5;
        }),
    ]);

    checks.push([
      `hausaufgaben Array, length === ${EXPECTED.hausaufgabenCount}`,
      Array.isArray(snapshot.hausaufgaben)
        && snapshot.hausaufgaben.length === EXPECTED.hausaufgabenCount,
    ]);
    checks.push([
      "hausaufgaben Items haben frage_id + frage_text + status",
      (snapshot.hausaufgaben ?? []).every(
        (h) => typeof h.frage_id === "string"
          && typeof h.frage_text === "string"
          && (h.status === "nein" || h.status === "teilweise"),
      ),
    ]);

    checks.push([
      `reflexionen Array, length === ${EXPECTED.reflexionenCount}`,
      Array.isArray(snapshot.reflexionen)
        && snapshot.reflexionen.length === EXPECTED.reflexionenCount,
    ]);
    checks.push([
      "reflexionen Items haben frage_id + frage_text + antwort_text",
      (snapshot.reflexionen ?? []).every(
        (r) => typeof r.frage_id === "string"
          && typeof r.frage_text === "string"
          && typeof r.antwort_text === "string"
          && r.antwort_text.length > 0,
      ),
    ]);

    checks.push([
      `hebel Array, length === ${EXPECTED.hebelCount}`,
      Array.isArray(snapshot.hebel)
        && snapshot.hebel.length === EXPECTED.hebelCount,
    ]);
    checks.push([
      "hebel Items haben modul_id + modul_name + score + stufe + empfehlung",
      (snapshot.hebel ?? []).every(
        (h) => /^m[1-9]$/.test(h.modul_id)
          && typeof h.modul_name === "string"
          && h.modul_name.length > 0
          && typeof h.score === "number"
          && typeof h.stufe === "number"
          && typeof h.empfehlung === "string"
          && h.empfehlung.length > 0,
      ),
    ]);

    // 6. VALIDATE Privacy-Flag (AC-SLC-148-6)
    const { rows: privacyRows } = await client.query(
      `SELECT released_for_strategaize_review AS released,
              released_for_strategaize_review_at AS released_at
       FROM public.capture_session WHERE id = $1`,
      [sessionId],
    );
    checks.push([
      "released_for_strategaize_review === false (AC-SLC-148-6)",
      privacyRows[0]?.released === false,
    ]);
    checks.push([
      "released_for_strategaize_review_at IS NULL",
      privacyRows[0]?.released_at === null,
    ]);

    // Output + Exit-Code
    let pass = 0;
    let fail = 0;
    for (const [label, ok] of checks) {
      const mark = ok ? "OK  " : "FAIL";
      console.log(`  [${mark}] ${label}`);
      ok ? pass++ : fail++;
    }
    console.log(`\n[live-test] Result: ${pass}/${checks.length} PASS, ${fail} FAIL`);

    if (fail > 0) {
      console.error("\n[live-test] Snapshot-Dump fuer Debug:");
      console.error(JSON.stringify(snapshot, null, 2));
      exitCode = 1;
    } else {
      console.log("\n[live-test] === ALLE ASSERTIONS PASS ===");
      console.log(`Snapshot: sui=${snapshot.sui} kind=${snapshot.classification.kind}`);
      console.log(`Hebel-Top-3: ${snapshot.hebel.map((h) => `${h.modul_id}(${h.score})`).join(", ")}`);
    }
  } finally {
    // 7. CLEANUP
    if (sessionId) {
      console.log("\n[live-test] Cleanup: DELETE Test-Session + Cascades...");
      await client.query("DELETE FROM public.capture_session WHERE id = $1", [sessionId]);
    }
    await client.end();
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error("[live-test] FEHLER:", err.message);
  if (err.stack) console.error(err.stack);
  process.exit(2);
});
