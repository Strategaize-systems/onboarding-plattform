// V9.1 SLC-V9.1-A MT-R5 — IMAP-Sync-Service (BS-Port + OP-V9.1-Persist-Flow).
//
// Slice: SLC-V9.1-A — Inbound-Foundation + Validation-Layer + IMAP-Sync (REVISION R1)
// Spec:  slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-R5, Flow A R1)
//
// Transport-Loop 1:1 portiert aus
//   strategaize-business-system/cockpit/src/lib/imap/sync-service.ts (DEC-205,
//   Reuse-Quelle BLOCKING per .claude/rules/strategaize-pattern-reuse.md):
//   ImapFlow connect -> last_uid-inkrementeller UID-Fetch -> mailparser.
// Persist-Flow ist OP-V9.1-spezifisch (forward-bucket continuous-Stream):
//   resolveDefaultEndpoint -> tolerante Validation (DEC-R1-3) -> persistRawEml ->
//   rpc_inbound_record_message (atomarer Daily-Roll-Over) -> sync-state-Update.
//
// Idempotenz (R-R1-2): last_uid rueckt nur bei Erfolg ODER Dedup-/Reject-Skip vor;
// bei pro-Mail-Fehler KEIN Vorlauf -> Reprocessing im naechsten Lauf, Dedup via
// message_id verhindert Doppel-Insert.

import { createHash } from "node:crypto";

import { ImapFlow } from "imapflow";

import { captureException, captureInfo } from "../logger";
import { createAdminClient } from "../supabase/admin";
import { parseEmlBuffer } from "../bulk-email/parser";
import { resolveDefaultEndpoint } from "./endpoint-resolver";
import { insertRejectLog } from "./reject-log";
import { buildRawStoragePath, persistRawEml } from "./storage-persist";
import {
  evaluateSenderAllowlist,
  type AllowlistEntry,
} from "./validation/sender-allowlist";
import type { InboundSyncResult, ResolvedEndpoint } from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

const LOG_SOURCE = "email_inbound:imap-sync";
const MAX_INITIAL_SYNC = 500;
const MAX_INCREMENTAL_SYNC = 50;
const INITIAL_SYNC_DAYS = parseInt(
  process.env.IMAP_INITIAL_SYNC_DAYS || "90",
  10,
);

interface SyncStateInit {
  lastUid: number;
  prevTotal: number;
}

/**
 * Zieht neue Mails aus dem IONOS-Default-Postfach und persistiert sie als
 * forward-bucket continuous-Stream (Flow A R1).
 */
export async function syncInboundEmails(): Promise<InboundSyncResult> {
  const admin = createAdminClient();

  // 1. Default-Endpoint aufloesen (DEC-R1-2). Kein Endpoint -> Warning (in
  //    resolveDefaultEndpoint gefeuert) + No-Op.
  const endpoint = await resolveDefaultEndpoint(admin);
  if (!endpoint) {
    return { synced: 0, skipped: 0, errors: 0, lastUid: 0 };
  }

  // 2. Sync-State laden/anlegen, Status -> 'syncing'.
  const { lastUid, prevTotal } = await loadOrCreateSyncState(admin, endpoint);

  // Allowlist einmalig laden (kleiner Set pro Endpoint).
  const allowlist = await loadAllowlist(admin, endpoint.endpointId);

  const client = new ImapFlow({
    host: process.env.IMAP_HOST!,
    port: parseInt(process.env.IMAP_PORT || "993", 10),
    secure: true,
    auth: {
      user: process.env.IMAP_USER!,
      pass: process.env.IMAP_PASSWORD!,
    },
    logger: false,
  });

  let synced = 0;
  let skipped = 0;
  let errors = 0;
  let newLastUid = lastUid;

  try {
    // 3. Connect + Mailbox-Lock.
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // 4. Fetch-Range bestimmen.
      let uids: number[];
      if (lastUid === 0) {
        const since = new Date(
          Date.now() - INITIAL_SYNC_DAYS * 24 * 60 * 60 * 1000,
        );
        uids = await client.search({ since }, { uid: true });
        uids = uids.slice(-MAX_INITIAL_SYNC);
      } else {
        uids = await client.search({ uid: `${lastUid + 1}:*` }, { uid: true });
        // IMAP-Quirk: `N:*` liefert immer min. die hoechste UID, auch < N.
        uids = uids.filter((u) => u > lastUid).slice(0, MAX_INCREMENTAL_SYNC);
      }

      if (uids.length === 0) {
        await finalizeSyncState(admin, endpoint.endpointId, {
          status: "idle",
          lastUid,
          prevTotal,
          synced: 0,
        });
        return { synced: 0, skipped: 0, errors: 0, lastUid };
      }

      // 5.-9. Pro Mail: parse -> dedup -> validate -> persist.
      for await (const msg of client.fetch(
        uids.join(","),
        { source: true, uid: true },
        { uid: true },
      )) {
        try {
          const outcome = await processMessage(
            admin,
            endpoint,
            allowlist,
            msg.source,
          );
          if (outcome === "synced") synced++;
          else skipped++;
          // Erfolg ODER Dedup-/Reject-Skip -> last_uid vorruecken.
          newLastUid = Math.max(newLastUid, msg.uid);
        } catch (err) {
          // Pro-Mail-Fehler bricht den Lauf NICHT ab; kein last_uid-Vorlauf.
          errors++;
          captureException(err, {
            source: LOG_SOURCE,
            metadata: { uid: msg.uid, endpoint_id: endpoint.endpointId },
          });
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    // 10b. Connection-/Protokoll-Fehler -> Status 'error'.
    await markSyncStateError(admin, endpoint.endpointId, err);
    return { synced, skipped, errors: errors + 1, lastUid: newLastUid };
  }

  // 10a. Erfolgreicher Lauf -> Status 'idle' + last_uid + Totals.
  await finalizeSyncState(admin, endpoint.endpointId, {
    status: "idle",
    lastUid: newLastUid,
    prevTotal,
    synced,
  });

  return { synced, skipped, errors, lastUid: newLastUid };
}

/**
 * Verarbeitet eine einzelne Mail. Returnt "synced" (persistiert) oder "skipped"
 * (Dedup oder Allowlist-Reject). Wirft bei Parse-/Persist-Fehlern (Caller skip).
 */
async function processMessage(
  admin: AdminClient,
  endpoint: ResolvedEndpoint,
  allowlist: AllowlistEntry[],
  source: Buffer,
): Promise<"synced" | "skipped"> {
  const parsed = await parseEmlBuffer(source);

  // 5. Dedup via message_id (tenant-scoped).
  const { data: existing, error: dedupErr } = await admin
    .from("email_message")
    .select("id")
    .eq("tenant_id", endpoint.tenantId)
    .eq("message_id", parsed.messageId)
    .limit(1)
    .maybeSingle();
  if (dedupErr) {
    throw new Error(`email_inbound: dedup SELECT failed: ${dedupErr.message}`);
  }
  if (existing) return "skipped";

  // 6. Tolerante Validation (DEC-R1-3): im single_mailbox-Modus wird die
  //    Setup-Token-Schicht uebersprungen (forwarded Mails tragen keinen
  //    X-Strategaize-Forward-Token-Header). Defense = Sender-Allowlist
  //    (Schicht 3, nur wenn >=1 enabled Row) + IONOS-Mailbox-Auth.
  //    Der spaetere catchall-Modus (Slug-Routing) reaktiviert die Setup-Token-
  //    Pruefung — nicht Scope dieses Single-Mailbox-Sync.
  const decision = evaluateSenderAllowlist(parsed.fromAddress, allowlist);
  if (decision.required && !decision.allowed) {
    await insertRejectLog(admin, {
      rejectLayer: "allowlist_mismatch",
      tenantId: endpoint.tenantId,
      endpointId: endpoint.endpointId,
      senderDomain: extractDomain(parsed.fromAddress),
      senderFullEmail: parsed.fromAddress,
      subjectSnippet: parsed.subject,
    });
    return "skipped";
  }

  // 7. Full-Pass: Raw-EML persistieren + atomarer rpc-Roll-Over.
  //    anchor_date = Ingest-Tag (UTC); received_at wird in der rpc auf now()
  //    gesetzt -> der forward-bucket continuous-Run buendelt nach Eingangstag.
  const anchorDateIso = new Date().toISOString().slice(0, 10);
  const storagePath = buildRawStoragePath(
    endpoint.tenantId,
    endpoint.endpointId,
    anchorDateIso,
    parsed.messageId,
  );
  await persistRawEml(admin, storagePath, source);

  const fileHash = createHash("sha256").update(source).digest("hex");

  const { error: rpcErr } = await admin.rpc("rpc_inbound_record_message", {
    p_tenant_id: endpoint.tenantId,
    p_endpoint_id: endpoint.endpointId,
    p_anchor_date: anchorDateIso,
    p_source_file_name: `${parsed.messageId}.eml`,
    p_file_hash: fileHash,
    p_storage_path: storagePath,
    p_message: {
      message_id: parsed.messageId,
      in_reply_to: parsed.inReplyTo,
      references_array: parsed.referencesArray,
      from_address: parsed.fromAddress,
      to_addresses: parsed.toAddresses,
      cc_addresses: parsed.ccAddresses,
      subject: parsed.subject,
      date: parsed.date ? parsed.date.toISOString() : null,
      body_text: parsed.bodyText,
      body_html: parsed.bodyHtml,
      has_attachments: parsed.hasAttachments,
      attachment_metadata: parsed.attachmentMetadata,
      raw_storage_path: storagePath,
    },
  });
  if (rpcErr) {
    throw new Error(
      `email_inbound: rpc_inbound_record_message failed: ${rpcErr.message}`,
    );
  }

  // 8. OP-kanonischer Audit-Pfad.
  captureInfo("email_inbound_received", {
    source: LOG_SOURCE,
    metadata: {
      endpoint_id: endpoint.endpointId,
      tenant_id: endpoint.tenantId,
      message_id: parsed.messageId,
      from_address: parsed.fromAddress,
    },
  });

  return "synced";
}

function extractDomain(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1) : null;
}

/** Laedt die enabled+disabled Allowlist-Rows eines Endpoints (Filterung in evaluateSenderAllowlist). */
async function loadAllowlist(
  admin: AdminClient,
  endpointId: string,
): Promise<AllowlistEntry[]> {
  const { data, error } = await admin
    .from("email_forward_allowlist")
    .select("pattern, pattern_type, enabled")
    .eq("endpoint_id", endpointId);
  if (error) {
    throw new Error(`email_inbound: allowlist SELECT failed: ${error.message}`);
  }
  return (data ?? []) as AllowlistEntry[];
}

/** Holt/erstellt die sync_state-Row fuer den Endpoint und setzt Status 'syncing'. */
async function loadOrCreateSyncState(
  admin: AdminClient,
  endpoint: ResolvedEndpoint,
): Promise<SyncStateInit> {
  const { data, error } = await admin
    .from("email_inbound_sync_state")
    .select("last_uid, emails_synced_total")
    .eq("endpoint_id", endpoint.endpointId)
    .maybeSingle();
  if (error) {
    throw new Error(`email_inbound: sync_state SELECT failed: ${error.message}`);
  }

  if (!data) {
    const { error: insErr } = await admin
      .from("email_inbound_sync_state")
      .insert({
        endpoint_id: endpoint.endpointId,
        tenant_id: endpoint.tenantId,
        folder: "INBOX",
        status: "syncing",
        last_uid: 0,
      });
    if (insErr) {
      throw new Error(
        `email_inbound: sync_state INSERT failed: ${insErr.message}`,
      );
    }
    return { lastUid: 0, prevTotal: 0 };
  }

  const { error: updErr } = await admin
    .from("email_inbound_sync_state")
    .update({ status: "syncing", updated_at: new Date().toISOString() })
    .eq("endpoint_id", endpoint.endpointId);
  if (updErr) {
    throw new Error(
      `email_inbound: sync_state UPDATE(syncing) failed: ${updErr.message}`,
    );
  }

  return {
    lastUid: Number(data.last_uid ?? 0),
    prevTotal: Number(data.emails_synced_total ?? 0),
  };
}

/** Schliesst den Lauf ab: Status 'idle' + last_uid + emails_synced_total. */
async function finalizeSyncState(
  admin: AdminClient,
  endpointId: string,
  args: { status: "idle"; lastUid: number; prevTotal: number; synced: number },
): Promise<void> {
  const nowIso = new Date().toISOString();
  await admin
    .from("email_inbound_sync_state")
    .update({
      status: args.status,
      last_uid: args.lastUid,
      last_sync_at: nowIso,
      emails_synced_total: args.prevTotal + args.synced,
      error_message: null,
      updated_at: nowIso,
    })
    .eq("endpoint_id", endpointId);
}

/** Markiert die sync_state-Row bei Connection-/Protokoll-Fehler als 'error'. */
async function markSyncStateError(
  admin: AdminClient,
  endpointId: string,
  err: unknown,
): Promise<void> {
  await admin
    .from("email_inbound_sync_state")
    .update({
      status: "error",
      error_message: err instanceof Error ? err.message : String(err),
      updated_at: new Date().toISOString(),
    })
    .eq("endpoint_id", endpointId);
}
