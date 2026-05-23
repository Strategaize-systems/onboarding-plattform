// Pattern aus reference_magic_link_smoke_pattern + reference_coolify_test_setup.
// Validiert die fuer E2E-Visual-Regression benoetigten ENV-Variablen.
// Bei fehlenden ENVs werfen Tests test.skip() — kein Crash, klare Diagnose.

export type E2EEnv = {
  baseUrl: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  testDatabaseUrl: string;
};

export type E2EEnvCheck =
  | { ok: true; env: E2EEnv }
  | { ok: false; missing: string[] };

export function checkE2EEnv(): E2EEnvCheck {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "";

  const missing: string[] = [];
  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!testDatabaseUrl) missing.push("TEST_DATABASE_URL");

  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    env: { baseUrl, supabaseUrl, serviceRoleKey, testDatabaseUrl },
  };
}

export function skipReason(missing: string[]): string {
  return `E2E ENVs missing: ${missing.join(", ")}. Set them in .env.local before running test:e2e.`;
}
