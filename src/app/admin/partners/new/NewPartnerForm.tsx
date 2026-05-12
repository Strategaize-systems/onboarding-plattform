"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createPartnerOrganization } from "../actions";

/**
 * V6 SLC-102 MT-3 — Native HTML Form fuer Partner-Anlage.
 *
 * Pattern per feedback_native_html_form_pattern (post-SLC-552-Lehre):
 * native HTML Form + useTransition + Server Action statt react-hook-form.
 *
 * Felder:
 *   - legal_name (required)
 *   - display_name (optional, default = legal_name in der Action)
 *   - contact_email (required, type=email + native HTML5-Validation)
 *   - contact_phone (optional)
 *   - country (required, Select DE/NL)
 */

const ERROR_MESSAGES: Record<string, string> = {
  legal_name_required: "Bitte den vollstaendigen Kanzlei-Namen angeben.",
  invalid_email: "Bitte eine gueltige E-Mail-Adresse angeben.",
  invalid_country: "Bitte ein Land auswaehlen.",
  unauthenticated: "Session abgelaufen. Bitte erneut einloggen.",
  forbidden: "Du hast keine Berechtigung, Partner-Organisationen anzulegen.",
  tenant_insert_failed:
    "Anlegen der Tenant-Zeile fehlgeschlagen. Bitte erneut versuchen.",
  partner_organization_insert_failed:
    "Anlegen der Partner-Stammdaten fehlgeschlagen. Bitte erneut versuchen.",
  unknown_error: "Unbekannter Fehler. Bitte erneut versuchen.",
};

export function NewPartnerForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorKey, setErrorKey] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorKey(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createPartnerOrganization(formData);
      if (!result.ok) {
        setErrorKey(result.error);
        return;
      }
      router.push(`/admin/partners/${result.partnerTenantId}?created=1`);
    });
  }

  return (
    <Card>
      <CardContent className="py-6">
        <form
          onSubmit={onSubmit}
          className="space-y-5"
          aria-busy={isPending}
        >
          <div className="space-y-2">
            <label
              htmlFor="legal_name"
              className="block text-sm font-medium text-slate-900"
            >
              Kanzlei-Name (rechtlich)
              <span className="ml-1 text-red-600" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="legal_name"
              name="legal_name"
              type="text"
              required
              maxLength={200}
              autoComplete="organization"
              placeholder="z.B. Mueller & Partner Steuerberatungsgesellschaft mbH"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPending}
            />
            <p className="text-xs text-slate-500">
              Vollstaendiger rechtlicher Name. Wird im Owner-Login angezeigt.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="display_name"
              className="block text-sm font-medium text-slate-900"
            >
              Anzeigename
              <span className="ml-1 text-slate-400">(optional)</span>
            </label>
            <input
              id="display_name"
              name="display_name"
              type="text"
              maxLength={200}
              autoComplete="off"
              placeholder="z.B. Mueller & Partner"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPending}
            />
            <p className="text-xs text-slate-500">
              Kurzform fuer UI-Anzeige. Falls leer, wird der Kanzlei-Name
              verwendet.
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
                placeholder="kontakt@kanzlei.de"
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
                placeholder="+49 30 123456"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="country"
              className="block text-sm font-medium text-slate-900"
            >
              Land
              <span className="ml-1 text-red-600" aria-hidden="true">
                *
              </span>
            </label>
            <select
              id="country"
              name="country"
              required
              defaultValue=""
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPending}
            >
              <option value="" disabled>
                — Bitte waehlen —
              </option>
              <option value="DE">Deutschland</option>
              <option value="NL">Niederlande</option>
            </select>
          </div>

          {errorKey && (
            <Alert variant="destructive">
              <AlertDescription>
                {ERROR_MESSAGES[errorKey] ?? ERROR_MESSAGES.unknown_error}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/admin/partners")}
              disabled={isPending}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Wird angelegt..." : "Partner anlegen"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
