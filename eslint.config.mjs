// ESLint 9 flat-config (V4.3 BL-064, DEC-V4.3 / Q-V4.3-J).
// `eslint-config-next@^16` exportiert nativ ein flat-config-Array (siehe
// node_modules/eslint-config-next/dist/core-web-vitals.js endet mit
// `module.exports = config;` — das Array ist das flat-config-Schema).
// Daher kein `FlatCompat`-Adapter noetig (Q-V4.3-J nativ aufgeloest).
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextCoreWebVitals,
  {
    ignores: [
      ".next/**",
      "out/**",
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
];

export default config;
