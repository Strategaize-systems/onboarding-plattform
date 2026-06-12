// V9.1 SLC-V9.1-A — Inbound-Email Shared-Types.
//
// Slice: SLC-V9.1-A — Inbound-Foundation + Validation-Layer + IMAP-Sync
// Spec:  slices/SLC-V9.1-A-inbound-foundation-validation.md (REVISION R1)
// REVISION R1 (DEC-205): IMAP-Pull-Reuse supersedes SES-Webhook (DEC-194). Die
//          Vendor-Adapter-Typen (ParsedInboundEvent, InboundEmailVendor) und
//          RejectReason 'hmac_invalid' sind mit MT-R1 entfallen — der IMAP-Pull-
//          Pfad kennt keinen HMAC-signierten Webhook mehr. Die IMAP-Sync-Typen
//          (ResolvedEndpoint, InboundSyncResult) kommen mit MT-R4/R5 hinzu.

/**
 * Reject-Layer-Werte — Spiegel der email_validation_reject_log.reject_layer
 * CHECK-Constraint aus MIG-057 (sql/migrations/112_v91_inbound_foundation.sql).
 * Hinweis: die DB-CHECK-Constraint behaelt 'hmac_invalid' (MIG-057 LIVE,
 * unveraendert); der IMAP-Pull-Pfad produziert diesen Reject-Layer nicht mehr,
 * daher hier entfernt. Bei Erweiterung der CHECK-Constraint diesen Union mitziehen.
 */
export type RejectReason =
  | "tenant_not_found"
  | "endpoint_inactive"
  | "setup_token_missing"
  | "setup_token_invalid"
  | "allowlist_mismatch";

/**
 * Resultat des Tenant-Lookups via Catchall-Local-Part (tenant-lookup.ts).
 * Mirror der relevanten email_inbound_endpoint-Spalten.
 */
export interface TenantLookupResult {
  endpointId: string;
  tenantId: string;
  slug: string;
  setupToken: string;
  status: "active" | "paused" | "revoked";
}

/**
 * Outcome der Validation-Pipeline im Webhook. Bei ok=false traegt reason den
 * passenden reject_layer fuer den email_validation_reject_log-Eintrag.
 */
export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: RejectReason };

/**
 * Resolve-Modus eines Endpoints (DEC-R1-2 / DEC-R1-3). Steuert die tolerante
 * Setup-Token-Logik im IMAP-Sync:
 *   - 'single_mailbox': Default-Postfach-Modus (IONOS bulk@...). Forwarded Mails
 *     tragen keinen X-Strategaize-Forward-Token-Header -> Setup-Token-Schicht
 *     wird uebersprungen (DEC-R1-3). Defense = Sender-Allowlist + Mailbox-Auth.
 *   - 'catchall': spaeterer Slug-Routing-Modus (bulk-<slug>@...). Setup-Token-
 *     Pruefung ist hier wieder aktiv.
 */
export type EndpointResolveMode = "single_mailbox" | "catchall";

/**
 * Aufgeloester Default-Endpoint fuer den IMAP-Sync (endpoint-resolver.ts, MT-R4).
 * Erweitert TenantLookupResult um den Resolve-Modus.
 */
export interface ResolvedEndpoint extends TenantLookupResult {
  mode: EndpointResolveMode;
}

/**
 * Ergebnis eines IMAP-Sync-Laufs (imap-sync.ts, MT-R5). Spiegelt die BS-
 * SyncResult-Struktur (synced/skipped/errors/lastUid).
 */
export interface InboundSyncResult {
  synced: number;
  skipped: number;
  errors: number;
  lastUid: number;
}
