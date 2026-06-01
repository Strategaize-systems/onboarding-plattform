import { describe, it, expect } from "vitest";

import { computeFileHash } from "../file-hash";

describe("computeFileHash", () => {
  it("returns a 64-char lowercase hex SHA-256 digest", () => {
    const hash = computeFileHash(Buffer.from("hello world", "utf8"));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    // Known SHA-256 of "hello world"
    expect(hash).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    );
  });

  it("is deterministic — identical buffers produce identical hashes", () => {
    const a = Buffer.from("some bytes", "utf8");
    const b = Buffer.from("some bytes", "utf8");
    expect(computeFileHash(a)).toBe(computeFileHash(b));
  });

  it("is collision-sensitive — different buffers produce different hashes", () => {
    const a = computeFileHash(Buffer.from("alpha", "utf8"));
    const b = computeFileHash(Buffer.from("beta", "utf8"));
    expect(a).not.toBe(b);
  });

  it("accepts Uint8Array as input", () => {
    const bytes = new Uint8Array([0x68, 0x69]); // "hi"
    const hash = computeFileHash(bytes);
    expect(hash).toBe(
      "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4",
    );
  });

  it("handles empty buffers", () => {
    const hash = computeFileHash(Buffer.alloc(0));
    // Known SHA-256 of empty input
    expect(hash).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
