import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// ISSUE-119: listTemplates() darf nicht crashen, wenn eine einzelne template-Row
// nicht dem TemplateRowSchema entspricht (Legacy-Rows partner_diagnostic +
// exit-readiness-teaser-v1: title String/fehlt, keine Block-/Fragen-IDs). Statt
// beim ersten Fehler zu werfen, ueberspringt es ungueltige Rows + loggt eine Warnung.

const captureWarning = vi.fn();
vi.mock("@/lib/logger", () => ({
  captureWarning: (...args: unknown[]) => captureWarning(...args),
  captureException: vi.fn(),
  captureInfo: vi.fn(),
}));

import { listTemplates } from "@/lib/db/template-queries";

function mockClient(rows: unknown[]): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: rows, error: null }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const VALID_ROW = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "exit_readiness",
  name: "Exit-Readiness",
  version: "1.0.0",
  description: "test",
  blocks: [
    {
      id: "b1",
      key: "A",
      title: { de: "Block A" },
      order: 1,
      questions: [],
    },
  ],
  owner_fields: null,
  created_at: "2026-04-17T00:00:00Z",
  updated_at: "2026-04-17T00:00:00Z",
};

// Legacy-Shape wie live: title als String, keine Block-/Fragen-IDs.
const LEGACY_ROW = {
  id: "22222222-2222-2222-2222-222222222222",
  slug: "partner_diagnostic",
  name: "Partner Diagnostic",
  version: "v1",
  description: null,
  blocks: [
    {
      key: "d1",
      title: "Diagnose",
      order: 1,
      questions: [{ frage_id: "X", text: "t", ebene: "Kern", unterbereich: "u", position: 1 }],
    },
  ],
  owner_fields: null,
  created_at: "2026-05-16T00:00:00Z",
  updated_at: "2026-05-16T00:00:00Z",
};

describe("listTemplates — Resilienz gegen Legacy-Rows (ISSUE-119)", () => {
  beforeEach(() => {
    captureWarning.mockClear();
  });

  it("crasht nicht, gibt nur valide Templates zurueck und ueberspringt Legacy-Rows", async () => {
    const client = mockClient([VALID_ROW, LEGACY_ROW]);
    const result = await listTemplates(client);

    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("exit_readiness");
  });

  it("loggt pro uebersprungener Row eine Warnung mit dem slug", async () => {
    const client = mockClient([VALID_ROW, LEGACY_ROW]);
    await listTemplates(client);

    expect(captureWarning).toHaveBeenCalledTimes(1);
    const [, context] = captureWarning.mock.calls[0];
    expect((context as { metadata?: { slug?: string } })?.metadata?.slug).toBe(
      "partner_diagnostic"
    );
  });

  it("gibt leeres Array zurueck, wenn ALLE Rows ungueltig sind (kein Throw)", async () => {
    const client = mockClient([LEGACY_ROW, { ...LEGACY_ROW, slug: "exit-readiness-teaser-v1" }]);
    const result = await listTemplates(client);

    expect(result).toEqual([]);
    expect(captureWarning).toHaveBeenCalledTimes(2);
  });

  it("wirft weiterhin bei echten DB-Fehlern", async () => {
    const client = {
      from: () => ({
        select: () => ({
          order: () => Promise.resolve({ data: null, error: { message: "boom" } }),
        }),
      }),
    } as unknown as SupabaseClient;

    await expect(listTemplates(client)).rejects.toBeDefined();
  });
});
