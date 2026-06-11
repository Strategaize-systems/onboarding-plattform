// V9.1 SLC-V9.1-C MT-1 — Vitest fuer deleteStorageObject.
// Hermetisch: Mock von admin.storage.from(bucket).remove([path]).

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { deleteStorageObject, BULK_EMAIL_BUCKET } from "../storage-delete";

function makeAdmin(
  result: { error: { message: string } | null },
) {
  const remove = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ remove });
  const client = { storage: { from } };
  return { client: client as unknown as SupabaseClient, from, remove };
}

describe("deleteStorageObject", () => {
  it("ruft remove([path]) auf bulk-email-Bucket auf", async () => {
    const { client, from, remove } = makeAdmin({ error: null });
    await deleteStorageObject(client, "tenant/run/msg.eml");
    expect(from).toHaveBeenCalledWith(BULK_EMAIL_BUCKET);
    expect(remove).toHaveBeenCalledWith(["tenant/run/msg.eml"]);
  });

  it("kein Throw bei Erfolg (error=null)", async () => {
    const { client } = makeAdmin({ error: null });
    await expect(
      deleteStorageObject(client, "p.eml"),
    ).resolves.toBeUndefined();
  });

  it("wirft bei echtem Storage-Fehler", async () => {
    const { client } = makeAdmin({ error: { message: "timeout" } });
    await expect(deleteStorageObject(client, "p.eml")).rejects.toThrow(
      /remove\('p\.eml'\) failed: timeout/,
    );
  });
});
