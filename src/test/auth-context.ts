import type { Client } from "pg";

/**
 * Setzt Supabase-JWT-Claims fuer die laufende Transaktion, so dass
 * `auth.uid()` und damit die Security-Definer-Helper `auth.user_role()` /
 * `auth.user_tenant_id()` auf das per `userId` angegebene Profile zeigen.
 *
 * Setzt gleichzeitig die Session-Rolle auf `authenticated`, damit RLS-Policies,
 * die `TO authenticated` einschraenken, tatsaechlich greifen.
 *
 * Am Ende wird der Claim-Context zurueckgesetzt und die Rolle auf `postgres`
 * zurueckgestellt — so dass nachfolgende Queries innerhalb derselben Transaktion
 * wieder Superuser-Zugriff haben (wichtig fuer Teardown).
 */
export async function withJwtContext(
  client: Client,
  userId: string,
  fn: () => Promise<void>
): Promise<void> {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });

  // `SET LOCAL` ist transaktionslokal und wird mit ROLLBACK automatisch verworfen.
  // Single-quote-Escape von JSON is sauber, weil claims keine einzelnen Quotes enthaelt.
  await client.query(`SET LOCAL "request.jwt.claims" = '${claims}'`);
  await client.query(`SET LOCAL ROLE authenticated`);

  try {
    await fn();
  } finally {
    // Superuser-Kontext wiederherstellen, damit Teardown-/Assert-Queries
    // nicht an RLS haengen bleiben.
    await client.query(`RESET ROLE`);
    await client.query(`RESET "request.jwt.claims"`);
  }
}
