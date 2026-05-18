/**
 * V7 SLC-133 MT-3 — Verify-Signup Server-Component (FEAT-053).
 *
 * Pattern aus src/app/accept-invitation/[token]/actions.ts (V6 SLC-103)
 * via .claude/rules/strategaize-pattern-reuse.md.
 *
 * URL: /auth/verify-signup?token=<klartext-64-hex>
 *
 * Branches (per Slice AC-7..AC-11 + Architecture-Diagramm Line 6285-6336):
 *   1. Token-Format ungueltig oder fehlt → InvalidLinkPage
 *   2. Hash unbekannt in pending_signup → InvalidLinkPage
 *   3. pending_signup.status='verified' → redirect /login?info=already_verified
 *   4. pending_signup.status='expired' ODER expires_at < now → ExpiredLinkPage
 *   5. status='pending' UND not expired → Auto-Provisioning + Magic-Link
 *      → redirect /auth/callback?token_hash=...&type=magiclink (Session-Cookie)
 *      → /auth/callback redirected weiter zu /auth/set-password
 *
 * Audit-Log: jeder Branch schreibt einen Eintrag in error_log mit
 * category='public_signup_verify', Hash-Only-Metadata (kein Klartext-Email,
 * kein Klartext-Token, keine Klartext-IP) gemaess AC-13 + AC-14.
 *
 * DSGVO: Token-Klartext aus URL nie loggen. SHA-256-Hash dient als
 * Lookup-Key + als email_hash-Variante fuers Audit-Log.
 *
 * Force-Dynamic: Page nimmt searchParams entgegen — Next.js erkennt das
 * automatisch, aber wir setzen `dynamic = 'force-dynamic'` explizit fuer
 * Klarheit (Build-Output zeigt das als `ƒ` dynamic).
 */

import { redirect } from "next/navigation";

import { hashWithSha256 } from "@/lib/auth/service-key";
import {
  findByTokenHashAnyStatus,
  type PendingSignupRow,
} from "@/lib/signup/pending-signup-repo";
import { provisionSelfSignupTenant } from "@/lib/signup/auto-provision";
import { generateMagicLinkSession } from "@/lib/signup/magic-link";
import { captureException, captureInfo } from "@/lib/logger";

import { InvalidLinkPage } from "./_components/InvalidLinkPage";
import { ExpiredLinkPage } from "./_components/ExpiredLinkPage";
import { ErrorPage, type ErrorReason } from "./_components/ErrorPage";

export const dynamic = "force-dynamic";

const SOURCE = "auth/verify-signup";
const TOKEN_REGEX = /^[a-f0-9]{64}$/i;

interface VerifySignupSearch {
  token?: string;
}

export default async function VerifySignupPage(props: {
  searchParams: Promise<VerifySignupSearch>;
}) {
  const search = await props.searchParams;
  const token = typeof search.token === "string" ? search.token : "";

  // ── Branch A — Token-Format ungueltig ──────────────────────────────────
  if (!token || !TOKEN_REGEX.test(token)) {
    captureInfo("public_signup_verify invalid_token_format", {
      source: SOURCE,
      metadata: {
        category: "public_signup_verify",
        reason: "invalid_token_format",
        status: 400,
      },
    });
    return <InvalidLinkPage />;
  }

  const tokenHash = hashWithSha256(token);

  // ── Lookup pending_signup (any status) ─────────────────────────────────
  let pending: PendingSignupRow | null;
  try {
    pending = await findByTokenHashAnyStatus(tokenHash);
  } catch (e) {
    captureException(e, {
      source: SOURCE,
      metadata: {
        category: "public_signup_verify",
        reason: "pending_lookup_failed",
        status: 500,
      },
    });
    return <InvalidLinkPage />;
  }

  // ── Branch B — Hash unbekannt ──────────────────────────────────────────
  if (!pending) {
    captureInfo("public_signup_verify token_not_found", {
      source: SOURCE,
      metadata: {
        category: "public_signup_verify",
        reason: "token_not_found",
        status: 404,
      },
    });
    return <InvalidLinkPage />;
  }

  const emailHash = hashWithSha256(pending.email_lower);

  // ── Branch C — Already verified (Doppel-Klick auf gleichen Link) ───────
  if (pending.status === "verified") {
    captureInfo("public_signup_verify already_verified", {
      source: SOURCE,
      metadata: {
        category: "public_signup_verify",
        reason: "already_verified",
        email_hash: emailHash,
        partner_tenant_id: pending.partner_tenant_id,
        pending_signup_id: pending.id,
        status: 200,
      },
    });
    redirect(`/login?info=already_verified`);
  }

  // ── Branch D — Expired ─────────────────────────────────────────────────
  // Date.now() ist hier am Request-Boundary — Server-Component wird pro
  // Request frisch ausgefuehrt, deterministic-per-request reicht aus.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const expiresMs = new Date(pending.expires_at).getTime();
  const isExpired = pending.status === "expired" || expiresMs < nowMs;
  if (isExpired) {
    captureInfo("public_signup_verify expired", {
      source: SOURCE,
      metadata: {
        category: "public_signup_verify",
        reason: "expired",
        email_hash: emailHash,
        partner_tenant_id: pending.partner_tenant_id,
        pending_signup_id: pending.id,
        status: 410,
      },
    });
    return <ExpiredLinkPage />;
  }

  // ── Branch E — pending + valid → Auto-Provisioning ─────────────────────
  const provisionResult = await provisionSelfSignupTenant({
    pending_signup_id: pending.id,
    partner_tenant_id: pending.partner_tenant_id,
    email_lower: pending.email_lower,
    first_name: pending.first_name,
    last_name: pending.last_name,
    company_name: pending.company_name,
    dsgvo_consent_text_version: pending.dsgvo_consent_text_version,
    dsgvo_consent_accepted_at: pending.dsgvo_consent_accepted_at,
  });

  if (!provisionResult.ok) {
    captureException(new Error(provisionResult.error), {
      source: SOURCE,
      metadata: {
        category: "public_signup_verify",
        reason: provisionResult.error,
        email_hash: emailHash,
        partner_tenant_id: pending.partner_tenant_id,
        pending_signup_id: pending.id,
        status: 500,
      },
    });
    return <ErrorPage reason={provisionResult.error as ErrorReason} />;
  }

  // ── Magic-Link erzeugen → Redirect zur Session-Cookie-Setting-Route ───
  const magic = await generateMagicLinkSession({ email: pending.email_lower });
  if (!magic.ok) {
    captureException(new Error("magic_link_generation_failed"), {
      source: SOURCE,
      metadata: {
        category: "public_signup_verify",
        reason: "magic_link_failed",
        email_hash: emailHash,
        partner_tenant_id: pending.partner_tenant_id,
        new_tenant_id: provisionResult.new_tenant_id,
        new_user_id: provisionResult.new_user_id,
        status: 500,
      },
    });
    // Tenant + User existieren bereits — Mandant kann via Passwort-Vergessen
    // weitermachen. ErrorPage gibt den Hint.
    return <ErrorPage reason="magic_link_failed" />;
  }

  // ── Audit-Log Erfolg ───────────────────────────────────────────────────
  captureInfo("public_signup_verify success", {
    source: SOURCE,
    metadata: {
      category: "public_signup_verify",
      reason: "success",
      email_hash: emailHash,
      partner_tenant_id: pending.partner_tenant_id,
      new_tenant_id: provisionResult.new_tenant_id,
      new_user_id: provisionResult.new_user_id,
      pending_signup_id: pending.id,
      pending_already_verified: provisionResult.pending_already_verified,
      status: 200,
    },
  });

  redirect(magic.verify_url);
}
