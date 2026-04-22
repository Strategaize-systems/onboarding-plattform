#!/usr/bin/env node
// SLC-025 MT-3: Zero-dep JWT-Generator fuer Jitsi-Smoke-Test.
// Erzeugt HS256-Token fuer einen Jitsi-Raum. Nicht fuer Produktion —
// Prod-JWT wird in SLC-028 ueber /lib/jitsi/jwt.ts gebaut.
//
// Usage:
//   JITSI_JWT_APP_SECRET=<secret> node scripts/gen-jitsi-jwt.mjs [room]
//
// Default-Raum: "test-room". Token gilt 2h, Moderator=true.

import { createHmac } from "node:crypto";

const base64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

const secret = process.env.JITSI_JWT_APP_SECRET;
if (!secret) {
  console.error("Missing JITSI_JWT_APP_SECRET env var.");
  process.exit(1);
}

const appId = process.env.JITSI_JWT_APP_ID || "onboarding";
const domain = process.env.JITSI_DOMAIN || "meet-onboarding.strategaizetransition.com";
const room = process.argv[2] || "test-room";

const now = Math.floor(Date.now() / 1000);
const payload = {
  aud: appId,
  iss: appId,
  sub: "meet.jitsi",
  room,
  iat: now,
  nbf: now - 10,
  exp: now + 2 * 60 * 60,
  context: {
    user: {
      name: "Smoke Test",
      email: "smoke@strategaizetransition.com",
      moderator: true,
    },
    features: {
      recording: true,
      livestreaming: false,
    },
  },
};

const header = { alg: "HS256", typ: "JWT" };
const segments = [base64url(JSON.stringify(header)), base64url(JSON.stringify(payload))];
const signature = base64url(createHmac("sha256", secret).update(segments.join(".")).digest());
const token = `${segments.join(".")}.${signature}`;

const url = `https://${domain}/${room}?jwt=${token}`;

console.log("\nJitsi Smoke-Test JWT");
console.log("====================");
console.log(`Room:   ${room}`);
console.log(`App:    ${appId}`);
console.log(`Expiry: 2h`);
console.log(`\nToken:\n${token}`);
console.log(`\nMeeting-URL (im Browser oeffnen):\n${url}\n`);
