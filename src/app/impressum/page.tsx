// SLC-120 MT-3 (FEAT-048) - Oeffentliches Impressum nach TMG/DDG Par. 5 + DSGVO Art. 13.
// Server-Component: liest 9 Impressum-Stammdaten aus ENV-Variablen (DEC-116).
// Layout pre-auth, kein Locale-Prefix per DEC-119 - direkt unter src/app/.
//
// Default-Werte nur fuer COMPANY und COUNTRY. Alle anderen Pflicht-ENVs werden
// zur Render-Zeit geprueft und werfen Server-Error bei fehlendem Wert. Build
// laeuft trotzdem durch, weil ENVs erst im Request-Handler gelesen werden.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Impressum | StrategAIze Onboarding",
  description:
    "Impressum und Anbieterkennzeichnung der Strategaize Transition BV.",
};

const PROSE_CLASSES = [
  "prose prose-slate max-w-3xl mx-auto py-12 px-4",
  "prose-headings:scroll-mt-24",
  // Mobile-friendly h1: shrink auf 375px (Konsistenz zu /datenschutz)
  "prose-h1:text-2xl sm:prose-h1:text-3xl prose-h1:[text-wrap:balance] prose-h1:[word-break:break-word]",
].join(" ");

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `${name} ENV missing - required by /impressum route. Set in .env.local or Coolify secrets.`,
    );
  }
  return value;
}

function readEnvWithDefault(name: string, fallback: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    return fallback;
  }
  return value;
}

export default function ImpressumPage() {
  const company = readEnvWithDefault(
    "IMPRESSUM_COMPANY",
    "Strategaize Transition BV",
  );
  const country = readEnvWithDefault("IMPRESSUM_COUNTRY", "Niederlande");
  const street = readRequiredEnv("IMPRESSUM_STREET");
  const zip = readRequiredEnv("IMPRESSUM_ZIP");
  const city = readRequiredEnv("IMPRESSUM_CITY");
  const kvk = readRequiredEnv("IMPRESSUM_KVK");
  const vat = readRequiredEnv("IMPRESSUM_VAT");
  const director = readRequiredEnv("IMPRESSUM_DIRECTOR");
  const email = readRequiredEnv("IMPRESSUM_EMAIL");

  return (
    <main className={PROSE_CLASSES}>
      <h1>Impressum</h1>
      <p>
        Angaben gemaess Par. 5 TMG/DDG sowie nach Art. 13 DSGVO fuer die
        Onboarding-Plattform unter <code>onboarding.strategaizetransition.com</code>.
      </p>

      <h2>Anbieter</h2>
      <p>
        <strong>{company}</strong>
        <br />
        {street}
        <br />
        {zip} {city}
        <br />
        {country}
      </p>

      <h2>Vertretungsberechtigter</h2>
      <p>{director}</p>

      <h2>Kontakt</h2>
      <p>
        E-Mail: <a href={`mailto:${email}`}>{email}</a>
      </p>

      <h2>Registereintrag</h2>
      <p>
        Handelsregister (Kamer van Koophandel): {kvk}
        <br />
        Umsatzsteuer-Identifikationsnummer (BTW): {vat}
      </p>

      <h2>Haftungs- und Urheberrechtshinweis</h2>
      <p>
        Inhalte und Werke auf dieser Plattform unterliegen dem Urheberrecht. Eine
        Vervielfaeltigung, Bearbeitung, Verbreitung oder jede Art der Verwertung
        ausserhalb der Grenzen des Urheberrechts beduerfen der schriftlichen
        Zustimmung des jeweiligen Rechteinhabers.
      </p>
      <p>
        Die Inhalte der Plattform werden mit groesster Sorgfalt erstellt. Fuer
        die Richtigkeit, Vollstaendigkeit und Aktualitaet der Inhalte wird jedoch
        keine Gewaehr uebernommen.
      </p>

      <h2>Datenschutz</h2>
      <p>
        Informationen zur Verarbeitung personenbezogener Daten finden Sie in der{" "}
        <a href="/datenschutz">Datenschutzerklaerung</a>.
      </p>

      <p>
        <em>
          Stand: 2026-05-15 (V6.2-Release, Anwalts-Review pending vor erstem
          echten Live-Partner).
        </em>
      </p>
    </main>
  );
}
