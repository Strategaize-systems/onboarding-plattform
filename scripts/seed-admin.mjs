#!/usr/bin/env node
/**
 * SLC-002b — Seed strategaize_admin + Demo-tenant_admin via Supabase Admin API.
 *
 * Strategieentscheidung (DEC-011, 2026-04-16):
 * - Tenant-Row kommt aus SQL-Migration 027 (public-Schema, fix UUID).
 * - Auth-User (auth.users + profiles) kommen aus diesem Script via
 *   POST /auth/v1/admin/users. Das vermeidet direkten INSERT in auth.users
 *   (bcrypt-Risiko, identities-Row, Supabase-Upgrade-Brueche).
 *
 * Warum native fetch statt @supabase/supabase-js:
 *   Next.js-Standalone-Trace erfasst nur Server-Code-Imports. @supabase/storage-js
 *   bringt transitive Deps (iceberg-js ...) die im runtime-Image nicht landen.
 *   Ein reiner REST-Call via fetch hat keine Transitive-Dep-Falle und ist fuer
 *   zwei createUser-Aufrufe ohnehin trivial.
 *
 * Ausfuehrung (innerhalb des app-Containers):
 *   docker exec <onboarding-app-container> node scripts/seed-admin.mjs
 *
 * Idempotent: Wird der Script-Lauf wiederholt, werden existierende User
 * erkannt und uebersprungen. Keine Duplikate, keine Fehler.
 */

const DEMO_TENANT_ID = "00000000-0000-0000-0000-0000000000de";

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    console.error(`ERROR: missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function optionalEnv(name) {
  return process.env[name] ?? "";
}

const SUPABASE_URL = optionalEnv("SUPABASE_URL") || requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const baseHeaders = {
  "Content-Type": "application/json",
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
};

async function supabaseFetch(path, init = {}) {
  const url = `${SUPABASE_URL.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...baseHeaders, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const err = new Error(
      `supabase ${init.method ?? "GET"} ${path} -> ${res.status}: ${
        typeof body === "string" ? body : JSON.stringify(body)
      }`
    );
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function main() {
  const adminEmail = requireEnv("SEED_ADMIN_EMAIL");
  const adminPassword = requireEnv("SEED_ADMIN_PASSWORD");
  const tenantAdminEmail = requireEnv("SEED_DEMO_TENANT_ADMIN_EMAIL");
  const tenantAdminPassword = requireEnv("SEED_DEMO_TENANT_ADMIN_PASSWORD");

  console.log("seed-admin: starting");
  console.log(`seed-admin: supabase url = ${SUPABASE_URL}`);
  console.log(`seed-admin: strategaize_admin email = ${adminEmail}`);
  console.log(`seed-admin: demo tenant_admin email = ${tenantAdminEmail}`);
  console.log(`seed-admin: demo tenant id = ${DEMO_TENANT_ID}`);

  // 1. Verify demo tenant exists (Migration 027 must have run).
  const tenantRows = await supabaseFetch(
    `/rest/v1/tenants?id=eq.${DEMO_TENANT_ID}&select=id,name`
  );
  if (!Array.isArray(tenantRows) || tenantRows.length !== 1) {
    console.error(
      `seed-admin: demo tenant ${DEMO_TENANT_ID} not found — run migration 027 first`
    );
    process.exit(1);
  }
  console.log(`seed-admin: demo tenant ok (${tenantRows[0].name})`);

  // 2. Seed strategaize_admin.
  await ensureUser({
    email: adminEmail,
    password: adminPassword,
    userMetadata: { role: "strategaize_admin" },
    expectedRole: "strategaize_admin",
    expectedTenantId: null,
    label: "strategaize_admin",
  });

  // 3. Seed demo tenant_admin.
  await ensureUser({
    email: tenantAdminEmail,
    password: tenantAdminPassword,
    userMetadata: { role: "tenant_admin", tenant_id: DEMO_TENANT_ID },
    expectedRole: "tenant_admin",
    expectedTenantId: DEMO_TENANT_ID,
    label: "demo tenant_admin",
  });

  // 4. Final verification — profiles-Projection der beiden Seed-User.
  const emails = [adminEmail, tenantAdminEmail]
    .map((e) => `"${e}"`)
    .join(",");
  const profiles = await supabaseFetch(
    `/rest/v1/profiles?email=in.(${emails})&select=email,role,tenant_id&order=role.asc`
  );

  console.log("seed-admin: profiles verification:");
  for (const p of profiles ?? []) {
    console.log(`  - ${p.email}: role=${p.role}, tenant_id=${p.tenant_id ?? "NULL"}`);
  }

  if ((profiles?.length ?? 0) !== 2) {
    console.error(
      `seed-admin: expected 2 profile rows, got ${profiles?.length ?? 0}`
    );
    process.exit(1);
  }

  console.log("seed-admin: done");
}

/**
 * Idempotent user-seed: sucht per listUsers, legt User an falls nicht da,
 * patcht danach profile.role + profile.tenant_id.
 */
async function ensureUser({
  email,
  password,
  userMetadata,
  expectedRole,
  expectedTenantId,
  label,
}) {
  const existing = await findUserByEmail(email);

  let userId;
  if (existing) {
    userId = existing.id;
    console.log(`seed-admin: ${label} exists (id=${userId}) — skip create`);
  } else {
    const created = await supabaseFetch("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      }),
    });
    userId = created?.id;
    if (!userId) {
      console.error(
        `seed-admin: create ${label} returned no id — aborting: ${JSON.stringify(
          created
        )}`
      );
      process.exit(1);
    }
    console.log(`seed-admin: ${label} created (id=${userId})`);
  }

  // Profile-Reconciliation. Der handle_new_user-Trigger liest
  // raw_user_meta_data und setzt role + tenant_id. Falls das Trigger-Verhalten
  // in einer spaeteren Schema-Version aendert oder der User vor Trigger-
  // Aktivierung angelegt wurde, gleichen wir hier explizit ab.
  await supabaseFetch(`/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      role: expectedRole,
      tenant_id: expectedTenantId,
    }),
  });
}

/**
 * Durchsucht auth.users-Liste nach E-Mail. GoTrue-Admin-API ist paginiert;
 * fuer V1 (< 10 User) reicht perPage=100 auf Seite 1.
 */
async function findUserByEmail(email) {
  const data = await supabaseFetch(
    `/auth/v1/admin/users?page=1&per_page=100`
  );
  const users = data?.users ?? [];
  return users.find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase()
  );
}

main().catch((err) => {
  console.error("seed-admin: unexpected failure:", err);
  process.exit(1);
});
