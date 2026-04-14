// Supported locales for the Blueprint Platform
export const locales = ["de", "en", "nl"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "de";
