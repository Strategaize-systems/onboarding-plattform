#!/usr/bin/env node
/**
 * SLC-002b — Seed strategaize_admin + Demo-tenant_admin via Supabase Admin API.
 *
 * Strategieentscheidung (DEC-011, 2026-04-16):
 * - Tenant-Row kommt aus SQL-Migration 027 (public-Schema, fix UUID).
 * - Auth-User (auth.users + profiles) kommen aus diesem Script via
 *   supabase.auth.admin.createUser. Das vermeidet direkten INSERT in
 *   auth.users (bcrypt-Risiko, identities-Row, Supabase-Upgrade-Brueche).
 *
 * Ausfuehrung (innerhalb des app-Containers):
 *   docker exec -e SEED_ADMIN_EMAIL=... -e SEED_ADMIN_PASSWORD=... \
 *     <onboarding-app-container> node scripts/seed-admin.mjs
 *
 * Alternativ, wenn die ENV-Vars im Container gesetzt sind:
 *   docker exec <onboarding-app-container> npm run seed:admin
 *
 * Idempotent: Wird der Script-Lauf wiederholt, werden existierende User
 * erkannt und uebersprungen. Keine Duplikate, keine Fehler.
 *
 * Verifikation: Nach Lauf zeigt der Script die profiles-Eintraege
 * (role, tenant_id) der beiden User. Error-Exit mit Code 1 bei Problem.
 */

import { createClient } from "@supabase/supabase-js";

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

async function main() {
  const supabaseUrl = optionalEnv("SUPABASE_URL") || requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const adminEmail = requireEnv("SEED_ADMIN_EMAIL");
  const adminPassword = requireEnv("SEED_ADMIN_PASSWORD");
  const tenantAdminEmail = requireEnv("SEED_DEMO_TENANT_ADMIN_EMAIL");
  const tenantAdminPassword = requireEnv("SEED_DEMO_TENANT_ADMIN_PASSWORD");

  console.log("seed-admin: starting");
  console.log(`seed-admin: supabase url = ${supabaseUrl}`);
  console.log(`seed-admin: strategaize_admin email = ${adminEmail}`);
  console.log(`seed-admin: demo tenant_admin email = ${tenantAdminEmail}`);
  console.log(`seed-admin: demo tenant id = ${DEMO_TENANT_ID}`);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Verify demo tenant exists (Migration 027 must have run).
  const { data: tenantRow, error: tenantErr } = await admin
    .from("tenants")
    .select("id, name")
    .eq("id", DEMO_TENANT_ID)
    .maybeSingle();

  if (tenantErr) {
    console.error("seed-admin: tenant lookup failed:", tenantErr.message);
    process.exit(1);
  }
  if (!tenantRow) {
    console.error(
      `seed-admin: demo tenant ${DEMO_TENANT_ID} not found — run migration 027 first`
    );
    process.exit(1);
  }
  console.log(`seed-admin: demo tenant ok (${tenantRow.name})`);

  // 2. Seed strategaize_admin.
  await ensureUser(admin, {
    email: adminEmail,
    password: adminPassword,
    userMetadata: { role: "strategaize_admin" },
    expectedRole: "strategaize_admin",
    expectedTenantId: null,
    label: "strategaize_admin",
  });

  // 3. Seed demo tenant_admin.
  await ensureUser(admin, {
    email: tenantAdminEmail,
    password: tenantAdminPassword,
    userMetadata: { role: "tenant_admin", tenant_id: DEMO_TENANT_ID },
    expectedRole: "tenant_admin",
    expectedTenantId: DEMO_TENANT_ID,
    label: "demo tenant_admin",
  });

  // 4. Final verification — profiles-Projection der beiden Seed-User.
  const { data: profiles, error: profilesErr } = await admin
    .from("profiles")
    .select("email, role, tenant_id")
    .in("email", [adminEmail, tenantAdminEmail])
    .order("role");

  if (profilesErr) {
    console.error("seed-admin: profiles verification failed:", profilesErr.message);
    process.exit(1);
  }
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
 * patcht danach profile.role + profile.tenant_id (der handle_new_user-Trigger
 * setzt die Werte aus raw_user_meta_data, aber wir wollen auf der Profile-Row
 * bestehen, falls der Trigger-Schreibweg spaeter aendert).
 */
async function ensureUser(
  admin,
  { email, password, userMetadata, expectedRole, expectedTenantId, label }
) {
  const existing = await findUserByEmail(admin, email);

  if (existing) {
    console.log(`seed-admin: ${label} exists (id=${existing.id}) — skip create`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    });
    if (error) {
      console.error(`seed-admin: create ${label} failed:`, error.message);
      process.exit(1);
    }
    console.log(`seed-admin: ${label} created (id=${data.user?.id})`);
  }

  // Profile-Reconciliation: Der handle_new_user-Trigger liest
  // raw_user_meta_data und setzt role + tenant_id korrekt. Falls der Trigger
  // in einer spaeteren Schema-Version anders reagiert oder der User vor der
  // Trigger-Aktivierung angelegt wurde, gleichen wir hier explizit ab.
  const user = await findUserByEmail(admin, email);
  if (!user) {
    console.error(`seed-admin: ${label} not found after create — aborting`);
    process.exit(1);
  }

  const { error: upsertErr } = await admin
    .from("profiles")
    .update({ role: expectedRole, tenant_id: expectedTenantId })
    .eq("id", user.id);

  if (upsertErr) {
    console.error(
      `seed-admin: profile reconcile for ${label} failed:`,
      upsertErr.message
    );
    process.exit(1);
  }
}

/**
 * Durchsucht auth.users-Liste nach E-Mail. listUsers ist paginiert;
 * fuer V1 reicht die erste Seite (perPage 100), da V1 Seeds < 10 User hat.
 */
async function findUserByEmail(admin, email) {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 100,
  });
  if (error) {
    console.error("seed-admin: listUsers failed:", error.message);
    process.exit(1);
  }
  return (data?.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase()
  );
}

main().catch((err) => {
  console.error("seed-admin: unexpected failure:", err);
  process.exit(1);
});
