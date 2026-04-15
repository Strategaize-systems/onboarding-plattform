import { Client } from "pg";

export interface TestClient extends Client {}

/**
 * Oeffnet eine pg-Connection, startet eine Transaktion und rollt sie am Ende
 * zurueck. Jeder Test-Lauf hinterlaesst damit eine saubere DB. `TEST_DATABASE_URL`
 * muss auf eine echte Postgres-Instanz mit geladenem Onboarding-Schema zeigen.
 *
 * Beispiel:
 *   await withTestDb(async (client) => {
 *     await client.query("INSERT INTO tenants (name) VALUES ($1)", ["A"]);
 *     // ...weitere Assertions
 *   });
 */
export async function withTestDb<T>(
  fn: (client: TestClient) => Promise<T>
): Promise<T> {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Tests require a reachable Postgres instance. " +
        "See README > Running Tests."
    );
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    return result;
  } finally {
    // Rollback is mandatory — even on success — damit Tests idempotent sind.
    try {
      await client.query("ROLLBACK");
    } catch {
      // Transaction bereits beendet (z.B. durch doppeltes ROLLBACK in fn). Ignorieren.
    }
    await client.end();
  }
}
