/**
 * Strategaize Blueprint Plattform — Secret Generator
 *
 * Dieses Skript generiert ALLE Secrets, die fuer das Deployment noetig sind.
 * Ausfuehren: node scripts/generate-secrets.mjs
 *
 * Ausgabe: Eine komplette .env-Datei, die du auf den Server kopieren kannst.
 */

import crypto from "crypto";

// 1. Zufaellige Secrets generieren
const JWT_SECRET = crypto.randomBytes(32).toString("hex");
const REALTIME_SECRET = crypto.randomBytes(64).toString("hex");
const POSTGRES_PASSWORD = crypto.randomBytes(24).toString("hex");

// 2. JWT-Token generieren (Anon Key + Service Role Key)
function base64url(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function createJWT(payload, secret) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${data}.${signature}`;
}

const iat = Math.floor(Date.now() / 1000);
const exp = iat + 10 * 365 * 24 * 60 * 60;

const ANON_KEY = createJWT({ role: "anon", iat, exp }, JWT_SECRET);
const SERVICE_ROLE_KEY = createJWT({ role: "service_role", iat, exp }, JWT_SECRET);

// 3. Ausgabe
const envContent = `# Strategaize Blueprint Plattform — Production Environment
# Generiert am: ${new Date().toISOString()}
# Diese Datei als .env auf den Hetzner-Server kopieren.

# === App ===
NEXT_PUBLIC_APP_URL=https://blueprint.strategaizetransition.com

# === Supabase (intern via Kong im Docker-Netzwerk) ===
NEXT_PUBLIC_SUPABASE_URL=http://supabase-kong:8000

# === JWT Secret ===
JWT_SECRET=${JWT_SECRET}

# === Supabase API Keys (signiert mit JWT_SECRET) ===
NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}

# === Database ===
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# === Realtime ===
REALTIME_SECRET=${REALTIME_SECRET}

# === SMTP (fuer GoTrue Einladungs-Emails) ===
# DIESE WERTE MUSST DU MANUELL EINTRAGEN:
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=dein_smtp_user
SMTP_PASS=dein_smtp_passwort
SMTP_FROM=noreply@strategaizetransition.com

# === Storage ===
STORAGE_FILE_SIZE_LIMIT=209715200
`;

console.log("Strategaize Blueprint Plattform — Secrets generiert!");
console.log("");
console.log("Kopiere den folgenden Block in eine .env Datei auf dem Server:");
console.log("==============================================================");
console.log(envContent);
console.log("==============================================================");
console.log("WICHTIG: SMTP-Werte musst du noch manuell eintragen!");
