"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { updatePartnerStammdaten } from "../actions";

/**
 * V6 SLC-102 MT-5 — Native HTML Form fuer Partner-Stammdaten-Edit.
 *
 * Pattern per feedback_native_html_form_pattern: native HTML Form +
 * useTransition + Server Action statt react-hook-form.
 *
 * Felder (alle initial vorbefuellt aus DB):
 *   - display_name (required)
 *   - contact_email (required, type=email)
 *   - contact_phone (optional)
 */

const ERROR_MESSAGES: Record<string, string> = {
  display_name_required: "Bitte einen Anzeigenamen angeben.",
  invalid_email: "Bitte eine gueltige E-Mail-Adresse angeben.",
  unauthenticated: "Session abgelaufen. Bitte erneut einloggen.",
  forbidden: "Du hast keine Berechtigung, Stammdaten zu aendern.",
  no_tenant: "Dein Profil ist keiner Partner-Organisation zugeordnet.",
  partner_not_found:
    "Partner-Organisation nicht gefunden. Bitte Seite neu laden.",
  update_failed: "Speichern fehlgeschlagen. Bitte erneut versuchen.",
  unknown_error: "Unbekannter Fehler. Bitte erneut versuchen.",
};

export function EditStammdatenForm({
  initialDisplayName,
  initialContactEmail,
  initialContactPhone,
}: {
  initialDisplayName: string;
  initialContactEmail: string;
  initialContactPhone: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorKey, setErrorKey] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorKey(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await updatePartnerStammdaten(formData);
      if (!result.ok) {
        setErrorKey(result.error);
        return;
      }
      router.push("/partner/dashboard/stammdaten?updated=1");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5"
      aria-busy={isPending}
    >
      <div className="space-y-2">
        <label
          htmlFor="display_name"
          className="block text-sm font-medium text-slate-900"
        >
          Anzeigename
          <span className="ml-1 text-red-600" aria-hidden="true">
            *
          </span>
        </label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          required
          maxLength={200}
          autoComplete="organization"
          defaultValue={initialDisplayName}
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
        />
        <p className="text-xs text-slate-500">
          Wird Mandanten und in deinem Partner-Bereich angezeigt.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor="contact_email"
            className="block text-sm font-medium text-slate-900"
          >
            Kontakt-E-Mail
            <span className="ml-1 text-red-600" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="contact_email"
            name="contact_email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            defaultValue={initialContactEmail}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor="contact_phone"
            className="block text-sm font-medium text-slate-900"
          >
            Telefon
            <span className="ml-1 text-slate-400">(optional)</span>
          </label>
          <input
            id="contact_phone"
            name="contact_phone"
            type="tel"
            maxLength={40}
            autoComplete="tel"
            defaultValue={initialContactPhone}
            placeholder="+49 30 123456"
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
          {isPending ? "Wird gespeichert..." : "Stammdaten speichern"}
        </Button>
      </div>
    </form>
  );
}
