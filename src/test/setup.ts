import { config as loadEnv } from "dotenv";

// Test-Environment-Variablen aus .env.test laden, falls vorhanden.
// Fallback auf .env.local (fuer Dev) und .env (default).
loadEnv({ path: ".env.test" });
loadEnv({ path: ".env.local" });
loadEnv();

if (!process.env.TEST_DATABASE_URL) {
  console.warn(
    "[vitest] TEST_DATABASE_URL is not set. DB-Tests will fail. " +
      "Siehe README 'Running Tests'."
  );
}
