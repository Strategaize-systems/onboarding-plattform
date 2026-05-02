"use client";

// SLC-051 MT-3 — Copy-Permalink-Button pro h2/h3-Heading.
//
// Klick kopiert den vollen Permalink (origin + pathname + #anchor) in die
// Zwischenablage und zeigt einen Toast. Sichtbar nur bei Hover des Headings,
// analog zum bestehenden Auto-Anchor-Pattern in app/globals.css.
//
// Toast-Library = sonner (Projektkonvention, siehe TriggerBridgeButton). Die
// Slice-Spec nannte shadcn `useToast()`; sonner ist die etablierte Variante.

import { Link2 } from "lucide-react";
import { toast } from "sonner";

interface CopyPermalinkButtonProps {
  headingId: string;
}

// Pure Helper — exportiert fuer Unit-Tests ohne DOM/Browser.
export function buildPermalink(origin: string, pathname: string, hash: string): string {
  // Sanitize: hash ohne fuehrendes '#' annehmen, sauber rebauen.
  const cleanHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const cleanPathname = pathname || "/";
  return `${origin}${cleanPathname}#${cleanHash}`;
}

export function CopyPermalinkButton({ headingId }: CopyPermalinkButtonProps) {
  async function handleClick() {
    if (typeof window === "undefined") return;
    const url = buildPermalink(
      window.location.origin,
      window.location.pathname,
      headingId,
    );
    try {
      // navigator.clipboard ist nur in secure contexts verfuegbar (HTTPS oder
      // localhost). Coolify-Deploys laufen ueber HTTPS.
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        // History-Update: damit der User den Anchor in der URL-Bar sieht.
        window.history.replaceState(null, "", `#${headingId}`);
        toast.success("Permalink kopiert");
      } else {
        toast.error("Kopieren wird vom Browser nicht unterstuetzt.");
      }
    } catch {
      toast.error("Permalink konnte nicht kopiert werden.");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Permalink kopieren"
      title="Permalink kopieren"
      data-testid="reader-copy-permalink"
      className="heading-permalink-button ml-1 inline-flex h-6 w-6 items-center justify-center rounded text-indigo-500 opacity-0 transition-opacity hover:bg-indigo-50 hover:text-indigo-700 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
    >
      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
