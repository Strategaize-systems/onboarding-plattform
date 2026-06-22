import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  STB_VERTICAL_ENV_FLAG,
  isStbVerticalEnabled,
} from "../feature-gate";

// Hermetischer Guard-Test (SLC-171 MT-2, AC-171-4): OFF blockt, ON erlaubt.
// Manipuliert ausschliesslich den Env-Flag und stellt ihn danach wieder her.
describe("isStbVerticalEnabled — Env-Gate (Default OFF, fail-closed)", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[STB_VERTICAL_ENV_FLAG];
    delete process.env[STB_VERTICAL_ENV_FLAG];
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env[STB_VERTICAL_ENV_FLAG];
    } else {
      process.env[STB_VERTICAL_ENV_FLAG] = original;
    }
  });

  it("ist false wenn der Flag fehlt (Default OFF)", () => {
    expect(isStbVerticalEnabled()).toBe(false);
  });

  it("ist true NUR bei exakt 'true'", () => {
    process.env[STB_VERTICAL_ENV_FLAG] = "true";
    expect(isStbVerticalEnabled()).toBe(true);
  });

  it("ist false bei 'false'", () => {
    process.env[STB_VERTICAL_ENV_FLAG] = "false";
    expect(isStbVerticalEnabled()).toBe(false);
  });

  it("ist false bei leerem String", () => {
    process.env[STB_VERTICAL_ENV_FLAG] = "";
    expect(isStbVerticalEnabled()).toBe(false);
  });

  it("ist false bei '1' (kein truthy-coercion)", () => {
    process.env[STB_VERTICAL_ENV_FLAG] = "1";
    expect(isStbVerticalEnabled()).toBe(false);
  });

  it("ist false bei 'TRUE' (case-sensitive)", () => {
    process.env[STB_VERTICAL_ENV_FLAG] = "TRUE";
    expect(isStbVerticalEnabled()).toBe(false);
  });
});
