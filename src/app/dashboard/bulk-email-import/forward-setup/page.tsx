// V9.1 SLC-V9.1-D MT-1 — Forward-Bucket-Email Setup-Page (Conversational-First).
//
// Server-Component mit Auth-Gate (tenant_admin), laedt den bestehenden Inbound-
// Endpoint des Tenants (falls vorhanden) inkl. Allowlist und uebergibt ihn an den
// Client-Orchestrator ForwardSetupWizard. Ohne Endpoint startet der Wizard in der
// Anlage-Phase (Assistent + Formular).
//
// Pattern-Reuse: Auth/Profile-Read + Card-Header-Layout aus
// src/app/dashboard/bulk-email-import/page.tsx (V9 SLC-165). RLS-scoped Read
// ueber email_inbound_endpoint_tenant_select (MIG-057/112).

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Inbox } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  resolveForwardAddress,
  singleMailboxAddress,
} from "@/lib/inbound-email/forward-address";

import {
  ForwardSetupWizard,
  type ExistingEndpoint,
} from "./ForwardSetupWizard";

export const metadata = {
  title: "Email-Weiterleitung einrichten | Strategaize",
  description:
    "Posteingang fuer automatische Email-Weiterleitung per Assistent einrichten.",
};

const VALID_STATUS = ["pending_setup", "active", "paused", "revoked"] as const;
type EndpointStatus = (typeof VALID_STATUS)[number];

function normalizeStatus(raw: unknown): EndpointStatus {
  return VALID_STATUS.includes(raw as EndpointStatus)
    ? (raw as EndpointStatus)
    : "pending_setup";
}

export default async function ForwardSetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, role")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/login");
  if (profile.role !== "tenant_admin") redirect("/dashboard");

  // Bestehenden Endpoint laden (RLS-scoped). Bei mehreren: den juengsten nehmen.
  const { data: endpointRow } = await supabase
    .from("email_inbound_endpoint")
    .select("id, slug, status, display_name")
    .eq("tenant_id", profile.tenant_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let endpoint: ExistingEndpoint | null = null;
  if (endpointRow) {
    const { data: allowlistRows } = await supabase
      .from("email_forward_allowlist")
      .select("id, pattern, pattern_type, enabled")
      .eq("endpoint_id", endpointRow.id)
      .order("created_at", { ascending: true });

    endpoint = {
      id: endpointRow.id as string,
      slug: endpointRow.slug as string,
      status: normalizeStatus(endpointRow.status),
      displayName: (endpointRow.display_name as string | null) ?? null,
      address: resolveForwardAddress(endpointRow.slug as string),
      allowlist: (allowlistRows ?? []).map((r) => ({
        id: r.id as string,
        pattern: r.pattern as string,
        patternType: (r.pattern_type as "domain" | "email_exact") ?? "domain",
        enabled: (r.enabled as boolean) ?? true,
      })),
    };
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <div>
        <Link
          href="/dashboard/bulk-email-import"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurueck zum Bulk-Email-Import
        </Link>
      </div>

      <header className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary/10">
          <Inbox className="h-5 w-5 text-brand-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Email-Weiterleitung einrichten
          </h1>
          <p className="text-sm text-slate-500">
            Richte einen Posteingang ein, an den du Emails weiterleitest — sie
            werden automatisch in dein Strategaize-Cockpit uebernommen.
          </p>
        </div>
      </header>

      <ForwardSetupWizard
        inboundMailboxAddress={singleMailboxAddress()}
        endpoint={endpoint}
      />
    </main>
  );
}
