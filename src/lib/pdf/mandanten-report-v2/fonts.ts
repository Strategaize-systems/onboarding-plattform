// V8 SLC-150 MT-3 — Custom-Font-Registrierung fuer Mandanten-Report V2.
//
// @react-pdf v4 Font.register() Side-Effect-Modul. Wird in renderer.tsx
// als `import './fonts'` importiert und registriert Fraunces (Regular +
// Bold) + JetBrains Mono Regular fuer Server-Side-Render.
//
// Quelle: Google Fonts gstatic CDN, Latin-Subset (DE-Umlaute included).
// TTFs liegen in `public/fonts/` (siehe SLC-150 MT-3 Pre-Step):
// - Fraunces-Regular.ttf (~70 KB, weight 400)
// - Fraunces-Bold.ttf (~70 KB, weight 700)
// - JetBrainsMono-Regular.ttf (~110 KB, weight 400)
//
// Path-Resolution per `process.cwd()` damit Server-Side-Render in Coolify-
// Container den korrekten Workdir-Pfad sieht.
//
// Warum nicht @fontsource: liefert nur WOFF/WOFF2, @react-pdf v4 supportet
// WOFF nicht zuverlaessig (SLC-150 MT-3 Befund 2026-05-29).

import { Font } from "@react-pdf/renderer";
import path from "node:path";

const FONTS_DIR = path.join(process.cwd(), "public", "fonts");

Font.register({
  family: "Fraunces",
  fonts: [
    { src: path.join(FONTS_DIR, "Fraunces-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONTS_DIR, "Fraunces-Bold.ttf"), fontWeight: 700 },
  ],
});

Font.register({
  family: "JetBrains Mono",
  fonts: [
    { src: path.join(FONTS_DIR, "JetBrainsMono-Regular.ttf"), fontWeight: 400 },
  ],
});

// Disable hyphenation globally fuer alle Custom-Fonts (deutsche Texte
// sehen mit aggressiver @react-pdf-Hyphenation visuell unsauber aus).
Font.registerHyphenationCallback((word) => [word]);
