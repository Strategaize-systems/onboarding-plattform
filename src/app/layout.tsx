import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import StrategaizePoweredFooter from "@/components/branding/StrategaizePoweredFooter";
import { resolveBrandingForCurrentRequest } from "@/lib/branding/resolve-server";
import "./globals.css";

export const metadata: Metadata = {
  title: "StrategAIze Onboarding",
  description: "Strukturierte Wissenserhebung mit KI-gestützter Verdichtung",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const branding = await resolveBrandingForCurrentRequest();

  const rootVars = [
    `--brand-primary: ${branding.primaryColor};`,
    `--brand-primary-rgb: ${branding.primaryColorRgb};`,
    branding.secondaryColor ? `--brand-secondary: ${branding.secondaryColor};` : null,
    branding.logoUrl ? `--brand-logo-url: url('${branding.logoUrl}');` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <html lang={locale}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: `:root { ${rootVars} }` }} />
      </head>
      <body className="antialiased">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
        <StrategaizePoweredFooter />
        <Toaster />
      </body>
    </html>
  );
}
