import { createHmac } from "node:crypto";

interface JitsiJwtParams {
  roomName: string;
  userId: string;
  displayName: string;
  email: string;
  isModerator: boolean;
}

/**
 * Generate a Jitsi JWT for meeting authentication (HS256).
 *
 * Uses the same signing approach as the Business System gen-test-jwt.mjs.
 * Requires JITSI_JWT_APP_ID and JITSI_JWT_APP_SECRET env vars.
 */
export function generateJitsiJwt(params: JitsiJwtParams): string {
  const appId = process.env.JITSI_JWT_APP_ID;
  const appSecret = process.env.JITSI_JWT_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      "JITSI_JWT_APP_ID and JITSI_JWT_APP_SECRET must be set"
    );
  }

  const header = { alg: "HS256" as const, typ: "JWT" as const };

  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: appId,
    room: params.roomName,
    sub: "*",
    aud: appId,
    iat: now,
    exp: now + 3600, // 1 hour
    context: {
      user: {
        id: params.userId,
        name: params.displayName,
        email: params.email,
        moderator: params.isModerator,
      },
      features: {
        recording: params.isModerator, // Only moderator can start recording
      },
    },
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = createHmac("sha256", appSecret)
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
}

function base64url(str: string): string {
  return Buffer.from(str, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
