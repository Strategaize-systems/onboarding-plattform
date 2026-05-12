import { getTranslations } from "next-intl/server";

export default async function StrategaizePoweredFooter() {
  const t = await getTranslations("branding");
  const url = process.env.STRATEGAIZE_FOOTER_URL ?? "https://strategaize.com";

  return (
    <footer className="py-4 text-center text-sm text-gray-500 border-t">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:underline"
      >
        {t("poweredByStrategaize")}
      </a>
    </footer>
  );
}
