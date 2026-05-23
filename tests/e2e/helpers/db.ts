// Direkte pg-Client-Helper fuer Test-Daten-Setup gegen Coolify-Supabase-DB.
// Pattern aus reference_coolify_test_setup (node:20 + TEST_DATABASE_URL).

import { Client } from "pg";

export async function withDb<T>(
  databaseUrl: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
