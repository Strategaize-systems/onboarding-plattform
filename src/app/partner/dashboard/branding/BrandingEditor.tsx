"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BrandingPreview } from "@/components/partner/BrandingPreview";
import { uploadLogo, updateBranding } from "./actions";

/**
 * V6 SLC-104 MT-8 — Branding-Editor (Client-Component).
 *
 * Pattern per feedback_native_html_form_pattern: native HTML Forms mit
 * useTransition statt react-hook-form. Zwei separate Forms (Logo-Upload
 * vs. Branding-Update), weil File-Upload und JSON-Update unabhaengige
 * Operationen sind und der User eines ohne das andere aendern koennen
 * muss.
 *
 * Live-Preview reagiert auf State-Changes (Color/Logo-Datei) sofort —
 * gespeichert wird erst beim jeweiligen Submit.
 */

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;
const MAX_LOGO_BYTES = 524288;
const ALLOWED_MIMES = ["image/png", "image/svg+xml", "image/jpeg"];

const ERROR_MESSAGES: Record<string, string> = {
  // uploadLogo
  logo_required: "Bitte eine Bilddatei auswaehlen.",
  logo_too_large: "Datei ist zu gross. Maximal 500 KB erlaubt.",
  logo_mime_unsupported: "Nur PNG, SVG oder JPG erlaubt.",
  logo_upload_failed: "Upload fehlgeschlagen. Bitte erneut versuchen.",
  logo_db_update_failed:
    "Datei wurde gespeichert, aber das Branding konnte nicht verknuepft werden. Bitte erneut versuchen.",
  // updateBranding
  primary_color_invalid: "Bitte ein gueltiges Hex-Format wie #4454b8 angeben.",
  secondary_color_invalid:
    "Sekundaerfarbe muss leer oder ein gueltiges Hex-Format wie #4454b8 sein.",
  branding_update_failed: "Speichern fehlgeschlagen. Bitte erneut versuchen.",
  // shared
  unauthenticated: "Session abgelaufen. Bitte erneut einloggen.",
  forbidden: "Du hast keine Berechtigung, das Branding zu aendern.",
  no_tenant: "Dein Profil ist keiner Partner-Organisation zugeordnet.",
  unknown_error: "Unbekannter Fehler. Bitte erneut versuchen.",
};

interface BrandingEditorProps {
  tenantId: string;
  initialLogoSrc: string | null;
  initialPrimaryColor: string;
  initialSecondaryColor: string | null;
  initialDisplayName: string;
}

export function BrandingEditor({
  tenantId,
  initialLogoSrc,
  initialPrimaryColor,
  initialSecondaryColor,
  initialDisplayName,
}: BrandingEditorProps) {
  const router = useRouter();

  // Logo-Form-State
  const [logoSrc, setLogoSrc] = useState<string | null>(initialLogoSrc);
  const [isPendingLogo, startLogoTransition] = useTransition();
  const [errorKeyLogo, setErrorKeyLogo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Branding-Form-State (Live-Preview reagiert direkt darauf)
  const [primaryColor, setPrimaryColor] = useState(initialPrimaryColor);
  const [secondaryColor, setSecondaryColor] = useState(
    initialSecondaryColor ?? "",
  );
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [isPendingBranding, startBrandingTransition] = useTransition();
  const [errorKeyBranding, setErrorKeyBranding] = useState<string | null>(null);

  // Cleanup ObjectURL beim Unmount oder neuem File.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setErrorKeyLogo(null);
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      setErrorKeyLogo("logo_too_large");
      event.currentTarget.value = "";
      return;
    }
    if (!ALLOWED_MIMES.includes(file.type)) {
      setErrorKeyLogo("logo_mime_unsupported");
      event.currentTarget.value = "";
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setLogoSrc(url);
  }

  function handleLogoSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorKeyLogo(null);
    const formData = new FormData(event.currentTarget);
    startLogoTransition(async () => {
      const result = await uploadLogo(formData);
      if (!result.ok) {
        setErrorKeyLogo(result.error);
        return;
      }
      // Reset File-Input + revoke ObjectURL — Server liefert das neue Bild ueber Proxy.
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      router.push("/partner/dashboard/branding?updated=1");
      router.refresh();
    });
  }

  function handleBrandingSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorKeyBranding(null);
    const formData = new FormData(event.currentTarget);
    startBrandingTransition(async () => {
      const result = await updateBranding(formData);
      if (!result.ok) {
        setErrorKeyBranding(result.error);
        return;
      }
      router.push("/partner/dashboard/branding?updated=1");
      router.refresh();
    });
  }

  function handlePrimaryHexInput(value: string) {
    setPrimaryColor(value);
  }

  function handleSecondaryHexInput(value: string) {
    setSecondaryColor(value);
  }

  const primaryHexValid = HEX_REGEX.test(primaryColor);
  const secondaryHexValid = secondaryColor === "" || HEX_REGEX.test(secondaryColor);
  const contrastRatio = primaryHexValid ? contrastAgainstWhite(primaryColor) : null;
  const contrastWarning =
    contrastRatio !== null && contrastRatio < 4.5
      ? `Kontrast gegen weiss ist nur ${contrastRatio.toFixed(2)}:1 (WCAG AA empfiehlt mindestens 4.5:1). Schwer lesbar fuer Mandanten.`
      : null;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr,1fr]">
      {/* LINKS: Forms */}
      <div className="space-y-8">
        {/* Logo */}
        <form
          onSubmit={handleLogoSubmit}
          className="space-y-4"
          aria-busy={isPendingLogo}
          encType="multipart/form-data"
        >
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">Logo</h2>
            <p className="text-xs text-slate-500">
              PNG, SVG oder JPG. Maximal 500 KB.
            </p>
          </div>

          <input
            ref={fileInputRef}
            id="logo"
            name="logo"
            type="file"
            accept=".png,.svg,.jpg,.jpeg,image/png,image/svg+xml,image/jpeg"
            onChange={handleFileChange}
            disabled={isPendingLogo}
            className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border file:border-slate-200 file:bg-slate-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-100 disabled:opacity-60"
          />

          {errorKeyLogo && (
            <Alert variant="destructive">
              <AlertDescription>
                {ERROR_MESSAGES[errorKeyLogo] ?? ERROR_MESSAGES.unknown_error}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-end pt-1">
            <Button type="submit" disabled={isPendingLogo}>
              {isPendingLogo ? "Wird hochgeladen..." : "Logo speichern"}
            </Button>
          </div>
        </form>

        <hr className="border-slate-200" />

        {/* Farben + Anzeigename */}
        <form
          onSubmit={handleBrandingSubmit}
          className="space-y-5"
          aria-busy={isPendingBranding}
        >
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">
              Farben &amp; Anzeigename
            </h2>
            <p className="text-xs text-slate-500">
              Akzentfarbe und Anzeigename werden im Mandanten-Bereich verwendet.
            </p>
          </div>

          {/* Primary */}
          <div className="space-y-2">
            <label
              htmlFor="primary_color_text"
              className="block text-sm font-medium text-slate-900"
            >
              Akzentfarbe
              <span className="ml-1 text-red-600" aria-hidden="true">
                *
              </span>
            </label>
            <div className="flex items-center gap-3">
              <input
                id="primary_color_picker"
                type="color"
                value={primaryHexValid ? primaryColor : "#4454b8"}
                onChange={(e) => handlePrimaryHexInput(e.target.value)}
                disabled={isPendingBranding}
                aria-label="Akzentfarbe Picker"
                className="h-9 w-12 cursor-pointer rounded-md border border-slate-200 bg-white p-1 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <input
                id="primary_color_text"
                name="primary_color"
                type="text"
                required
                pattern="^#[0-9a-fA-F]{6}$"
                value={primaryColor}
                onChange={(e) => handlePrimaryHexInput(e.target.value)}
                disabled={isPendingBranding}
                maxLength={7}
                placeholder="#4454b8"
                className="w-32 rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            {!primaryHexValid && (
              <p className="text-xs text-red-600">
                Bitte ein Hex-Format wie #4454b8 angeben.
              </p>
            )}
            {contrastWarning && (
              <p className="text-xs text-amber-700">{contrastWarning}</p>
            )}
          </div>

          {/* Secondary */}
          <div className="space-y-2">
            <label
              htmlFor="secondary_color_text"
              className="block text-sm font-medium text-slate-900"
            >
              Sekundaerfarbe
              <span className="ml-1 text-slate-400">(optional)</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                id="secondary_color_picker"
                type="color"
                value={
                  secondaryColor && HEX_REGEX.test(secondaryColor)
                    ? secondaryColor
                    : "#ffffff"
                }
                onChange={(e) => handleSecondaryHexInput(e.target.value)}
                disabled={isPendingBranding}
                aria-label="Sekundaerfarbe Picker"
                className="h-9 w-12 cursor-pointer rounded-md border border-slate-200 bg-white p-1 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <input
                id="secondary_color_text"
                name="secondary_color"
                type="text"
                pattern="^#[0-9a-fA-F]{6}$|^$"
                value={secondaryColor}
                onChange={(e) => handleSecondaryHexInput(e.target.value)}
                disabled={isPendingBranding}
                maxLength={7}
                placeholder="leer lassen oder #aabbcc"
                className="w-48 rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            {!secondaryHexValid && (
              <p className="text-xs text-red-600">
                Bitte leer lassen oder ein Hex-Format wie #aabbcc.
              </p>
            )}
          </div>

          {/* Display Name */}
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
              maxLength={120}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={isPendingBranding}
              placeholder="z.B. Steuerkanzlei Mustermann"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p className="text-xs text-slate-500">
              Wird Mandanten in ihrer Onboarding-Sicht angezeigt. Leer lassen,
              um den rechtlichen Namen zu verwenden.
            </p>
          </div>

          {errorKeyBranding && (
            <Alert variant="destructive">
              <AlertDescription>
                {ERROR_MESSAGES[errorKeyBranding] ??
                  ERROR_MESSAGES.unknown_error}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-end pt-1">
            <Button
              type="submit"
              disabled={isPendingBranding || !primaryHexValid || !secondaryHexValid}
            >
              {isPendingBranding ? "Wird gespeichert..." : "Branding speichern"}
            </Button>
          </div>
        </form>
      </div>

      {/* RECHTS: Live-Preview */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">Live-Vorschau</h2>
        <p className="text-xs text-slate-500">
          So sehen deine Mandanten ihre Onboarding-Oberflaeche.
        </p>
        <BrandingPreview
          logoSrc={logoSrc}
          primaryColor={primaryHexValid ? primaryColor : initialPrimaryColor}
          displayName={displayName.trim() || "Strategaize"}
        />
        <p className="text-xs text-slate-400">
          Tenant-ID: <span className="font-mono">{tenantId.slice(0, 8)}…</span>
        </p>
      </div>
    </div>
  );
}

// ============================================================
// WCAG AA Contrast-Heuristik (gegen weissen Hintergrund)
// ============================================================
function contrastAgainstWhite(hex: string): number {
  const lum = relativeLuminance(hex);
  // L_white = 1.0
  return (1.0 + 0.05) / (lum + 0.05);
}

function relativeLuminance(hex: string): number {
  const r = channelLinear(parseInt(hex.slice(1, 3), 16) / 255);
  const g = channelLinear(parseInt(hex.slice(3, 5), 16) / 255);
  const b = channelLinear(parseInt(hex.slice(5, 7), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function channelLinear(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
