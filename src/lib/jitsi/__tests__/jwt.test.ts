import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateJitsiJwt } from "../jwt";

describe("Jitsi JWT Generator", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.JITSI_JWT_APP_ID = "test-app";
    process.env.JITSI_JWT_APP_SECRET = "test-secret-key-for-jwt-signing-1234";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("generates a valid 3-part JWT string", () => {
    const jwt = generateJitsiJwt({
      roomName: "test-room",
      userId: "user-123",
      displayName: "Max Mustermann",
      email: "max@example.com",
      isModerator: true,
    });

    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);

    // All parts should be base64url encoded (no +, /, =)
    for (const part of parts) {
      expect(part).not.toMatch(/[+/=]/);
    }
  });

  it("sets correct header (HS256)", () => {
    const jwt = generateJitsiJwt({
      roomName: "test-room",
      userId: "user-123",
      displayName: "Test User",
      email: "test@example.com",
      isModerator: false,
    });

    const header = JSON.parse(
      Buffer.from(jwt.split(".")[0], "base64url").toString()
    );
    expect(header.alg).toBe("HS256");
    expect(header.typ).toBe("JWT");
  });

  it("sets correct payload fields", () => {
    const jwt = generateJitsiJwt({
      roomName: "my-room",
      userId: "user-456",
      displayName: "Anna Schmidt",
      email: "anna@example.com",
      isModerator: true,
    });

    const payload = JSON.parse(
      Buffer.from(jwt.split(".")[1], "base64url").toString()
    );

    expect(payload.iss).toBe("test-app");
    expect(payload.aud).toBe("test-app");
    expect(payload.room).toBe("my-room");
    expect(payload.sub).toBe("*");
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(payload.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 1);

    expect(payload.context.user.id).toBe("user-456");
    expect(payload.context.user.name).toBe("Anna Schmidt");
    expect(payload.context.user.email).toBe("anna@example.com");
    expect(payload.context.user.moderator).toBe(true);
    expect(payload.context.features.recording).toBe(true);
  });

  it("non-moderator has recording disabled", () => {
    const jwt = generateJitsiJwt({
      roomName: "room",
      userId: "user",
      displayName: "User",
      email: "u@e.com",
      isModerator: false,
    });

    const payload = JSON.parse(
      Buffer.from(jwt.split(".")[1], "base64url").toString()
    );

    expect(payload.context.user.moderator).toBe(false);
    expect(payload.context.features.recording).toBe(false);
  });

  it("JWT expires in 1 hour", () => {
    const jwt = generateJitsiJwt({
      roomName: "room",
      userId: "user",
      displayName: "User",
      email: "u@e.com",
      isModerator: false,
    });

    const payload = JSON.parse(
      Buffer.from(jwt.split(".")[1], "base64url").toString()
    );

    const diff = payload.exp - payload.iat;
    expect(diff).toBe(3600);
  });

  it("throws when JITSI_JWT_APP_ID is missing", () => {
    delete process.env.JITSI_JWT_APP_ID;

    expect(() =>
      generateJitsiJwt({
        roomName: "room",
        userId: "user",
        displayName: "User",
        email: "u@e.com",
        isModerator: false,
      })
    ).toThrow("JITSI_JWT_APP_ID and JITSI_JWT_APP_SECRET must be set");
  });

  it("throws when JITSI_JWT_APP_SECRET is missing", () => {
    delete process.env.JITSI_JWT_APP_SECRET;

    expect(() =>
      generateJitsiJwt({
        roomName: "room",
        userId: "user",
        displayName: "User",
        email: "u@e.com",
        isModerator: false,
      })
    ).toThrow("JITSI_JWT_APP_ID and JITSI_JWT_APP_SECRET must be set");
  });

  it("signature is deterministic for same input", () => {
    const jwt1 = generateJitsiJwt({
      roomName: "room",
      userId: "user",
      displayName: "User",
      email: "u@e.com",
      isModerator: false,
    });

    const jwt2 = generateJitsiJwt({
      roomName: "room",
      userId: "user",
      displayName: "User",
      email: "u@e.com",
      isModerator: false,
    });

    // Signatures should match if generated in the same second (same iat/exp)
    // Since both run in same test, iat should be identical
    const sig1 = jwt1.split(".")[2];
    const sig2 = jwt2.split(".")[2];
    expect(sig1).toBe(sig2);
  });
});
