"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { invitePartnerAdmin } from "../actions";

/**
 * V6 SLC-102 MT-3 — Native HTML Form fuer Owner-Admin-Einladung.
 *
 * Pattern per feedback_native_html_form_pattern: native HTML Form +
 * useTransition + Server Action statt react-hook-form.
 *
 * Felder:
 *   - email (required, type=email)
 *   - first_name (optional)
 *   - last_name (optional)
 *
 * Bei emailFailed=true (SMTP-Fehler) wird der Hinweis ueber die Detail-Page
 * angezeigt (Query-Param-Routing) — Resend kommt in V6.1.
 */

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: "Bitte eine gueltige E-Mail-Adresse angeben.",
  invalid_partner_tenant_id: "Ungueltige Partner-ID — bitte Seite neu laden.",
  partner_tenant_not_found:
    "Partner-Organisation nicht gefunden — bitte Seite neu laden.",
  tenant_not_partner_organization:
    "Diese Tenant-ID gehoert zu keinem Partner.",
  unauthenticated: "Session abgelaufen. Bitte erneut einloggen.",
  forbidden: "Du hast keine Berechtigung, Owner einzuladen.",
  duplicate_pending_invitation:
    "Es gibt bereits eine offene Einladung fuer diese E-Mail-Adresse.",
  invitation_insert_failed:
    "Einladung konnte nicht gespeichert werden. Bitte erneut versuchen.",
  unknown_error: "Unbekannter Fehler. Bitte erneut versuchen.",
};

export function InvitePartnerAdminForm({
  partnerTenantId,
}: {
  partnerTenantId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorKey, setErrorKey] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorKey(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("partner_tenant_id", partnerTenantId);

    startTransition(async () => {
      const result = await invitePartnerAdmin(formData);
      if (!result.ok) {
        setErrorKey(result.error);
        return;
      }
      form.reset();
      const params = new URLSearchParams({ invited: "1" });
      if (result.emailFailed) params.set("emailFailed", "1");
      router.push(`/admin/partners/${partnerTenantId}?${params.toString()}`);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4"
      aria-busy={isPending}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor="invite_email"
            className="block text-sm font-medium text-slate-900"
          >
            E-Mail
            <span className="ml-1 text-red-600" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="invite_email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="off"
            placeholder="owner@kanzlei.de"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor="invite_first_name"
            className="block text-sm font-medium text-slate-900"
          >
            Vorname
            <span className="ml-1 text-slate-400">(optional)</span>
          </label>
          <input
            id="invite_first_name"
            name="first_name"
            type="text"
            maxLength={100}
            autoComplete="off"
            placeholder="Anna"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          />
        </div>
      </div>
      <div className="space-y-2">
        <label
          htmlFor="invite_last_name"
          className="block text-sm font-medium text-slate-900"
        >
          Nachname
          <span className="ml-1 text-slate-400">(optional)</span>
        </label>
        <input
          id="invite_last_name"
          name="last_name"
          type="text"
          maxLength={100}
          autoComplete="off"
          placeholder="Mueller"
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
        />
      </div>

      {errorKey && (
        <Alert variant="destructive">
          <AlertDescription>
            {ERROR_MESSAGES[errorKey] ?? ERROR_MESSAGES.unknown_error}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-end pt-1">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Wird verschickt..." : "Einladung verschicken"}
        </Button>
      </div>
    </form>
  );
}
