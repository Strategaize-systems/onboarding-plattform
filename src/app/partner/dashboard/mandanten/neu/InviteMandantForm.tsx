"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { inviteMandant } from "../actions";

/**
 * V6 SLC-103 MT-5 — Native HTML Form fuer Mandanten-Einladung.
 *
 * Pattern per feedback_native_html_form_pattern: native HTML Form +
 * useTransition + Server Action statt react-hook-form.
 *
 * Felder (alle required):
 *   - mandant_company_name
 *   - mandant_email (type=email)
 *   - mandant_first_name
 *   - mandant_last_name
 */

const ERROR_MESSAGES: Record<string, string> = {
  mandant_company_name_required: "Bitte den Firmennamen angeben.",
  invalid_mandant_email: "Bitte eine gueltige E-Mail-Adresse angeben.",
  mandant_first_name_required: "Bitte den Vornamen angeben.",
  mandant_last_name_required: "Bitte den Nachnamen angeben.",
  unauthenticated: "Session abgelaufen. Bitte erneut einloggen.",
  forbidden: "Du hast keine Berechtigung, Mandanten einzuladen.",
  no_tenant: "Dein Profil ist keiner Partner-Organisation zugeordnet.",
  partner_not_found:
    "Partner-Organisation nicht gefunden. Bitte Seite neu laden.",
  duplicate_check_failed:
    "Duplikatpruefung fehlgeschlagen. Bitte spaeter erneut versuchen.",
  mandant_already_invited:
    "Dieser Mandant wurde bereits eingeladen und die Einladung ist noch offen.",
  tenant_insert_failed:
    "Mandanten-Tenant konnte nicht angelegt werden. Bitte erneut versuchen.",
  mapping_insert_failed:
    "Mandanten-Verknuepfung konnte nicht angelegt werden. Bitte erneut versuchen.",
  invitation_insert_failed:
    "Einladung konnte nicht angelegt werden. Bitte erneut versuchen.",
  unknown_error: "Unbekannter Fehler. Bitte erneut versuchen.",
};

export function InviteMandantForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorKey, setErrorKey] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorKey(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await inviteMandant(formData);
      if (!result.ok) {
        setErrorKey(result.error);
        return;
      }
      const emailFailed = "emailFailed" in result && result.emailFailed === true;
      router.push(
        `/partner/dashboard/mandanten?invited=1${emailFailed ? "&emailFailed=1" : ""}`,
      );
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" aria-busy={isPending}>
      <div className="space-y-2">
        <label
          htmlFor="mandant_company_name"
          className="block text-sm font-medium text-slate-900"
        >
          Firmenname
          <span className="ml-1 text-red-600" aria-hidden="true">
            *
          </span>
        </label>
        <input
          id="mandant_company_name"
          name="mandant_company_name"
          type="text"
          required
          maxLength={200}
          autoComplete="organization"
          placeholder="Mustermann GmbH"
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="mandant_email"
          className="block text-sm font-medium text-slate-900"
        >
          E-Mail des Mandanten
          <span className="ml-1 text-red-600" aria-hidden="true">
            *
          </span>
        </label>
        <input
          id="mandant_email"
          name="mandant_email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          placeholder="kontakt@mustermann.de"
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
        />
        <p className="text-xs text-slate-500">
          An diese Adresse senden wir den Magic-Link.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor="mandant_first_name"
            className="block text-sm font-medium text-slate-900"
          >
            Vorname
            <span className="ml-1 text-red-600" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="mandant_first_name"
            name="mandant_first_name"
            type="text"
            required
            maxLength={80}
            autoComplete="given-name"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor="mandant_last_name"
            className="block text-sm font-medium text-slate-900"
          >
            Nachname
            <span className="ml-1 text-red-600" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="mandant_last_name"
            name="mandant_last_name"
            type="text"
            required
            maxLength={80}
            autoComplete="family-name"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          />
        </div>
      </div>

      {errorKey && (
        <Alert variant="destructive">
          <AlertDescription>
            {ERROR_MESSAGES[errorKey] ?? ERROR_MESSAGES.unknown_error}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-end pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Wird versandt..." : "Magic-Link versenden"}
        </Button>
      </div>
    </form>
  );
}
