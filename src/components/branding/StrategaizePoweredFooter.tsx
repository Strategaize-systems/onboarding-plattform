// SLC-120 MT-4 (FEAT-048) - Footer um Datenschutz + Impressum Links erweitert.
// Layout: [Datenschutz] . [Impressum] . [Powered by Strategaize] (DEC-118).
// Server-Component, kein Auth-Wrapper, sichtbar auf allen Routes (auth + non-auth).

import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function StrategaizePoweredFooter() {
  const tBranding = await getTranslations("branding");
  const tFooter = await getTranslations("footer");
  const url = process.env.STRATEGAIZE_FOOTER_URL ?? "https://strategaize.com";

  return (
    <footer className="py-4 text-center text-sm text-gray-500 border-t">
      <Link href="/datenschutz" className="hover:underline">
        {tFooter("privacyPolicy")}
      </Link>
      <span className="mx-2" aria-hidden="true">
        &middot;
      </span>
      <Link href="/impressum" className="hover:underline">
        {tFooter("imprint")}
      </Link>
      <span className="mx-2" aria-hidden="true">
        &middot;
      </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:underline"
      >
        {tBranding("poweredByStrategaize")}
      </a>
    </footer>
  );
}
