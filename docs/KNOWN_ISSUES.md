# Known Issues

### ISSUE-001 — secrets-onboarding.txt liegt untracked im Repo-Root
- Status: resolved
- Resolution Date: 2026-04-14
- Severity: Medium
- Area: Security / Repo-Hygiene
- Summary: Die Datei /secrets-onboarding.txt liegt untracked im Repo-Root. Sie ist NICHT in .gitignore aufgefuehrt. Bei versehentlichem `git add .` wuerde sie committed werden.
- Impact: Risiko, dass Secrets (JWT, DB-Password, SMTP, Bedrock-Keys) in oeffentliches GitHub-Repo gelangen.
- Workaround: Nie `git add .` verwenden, nur gezieltes Staging.
- Resolution: .gitignore um `secrets-*.txt`, `*.secrets`, `secrets/` erweitert. secrets-onboarding.txt wird jetzt garantiert ignoriert, auch bei versehentlichem `git add .`.

### ISSUE-002 — Test-Infrastruktur fehlt im Repo
- Status: open
- Severity: High
- Area: QA / Build-Toolchain
- Summary: `package.json` hat kein `test`-Script und keine Test-Framework-Abhaengigkeit (kein Vitest, kein Jest, kein Playwright). SaaS-Delivery-Mode verlangt laut `.claude/rules/tdd.md` mandatorisches TDD pro Slice.
- Impact: SLC-001 MT-4 Query-Layer ist OHNE Unit-Tests committet. SLC-001 MT-5 (2-Tenant-RLS-Integrationstest) kann nicht ausgefuehrt werden, bis ein Test-Framework gewaehlt und eingerichtet ist. Gilt analog fuer alle folgenden Slices.
- Workaround: Query-Layer manuell auf der Hetzner-DB verifizieren (nach Deploy); RLS-Isolation per psql-Script pruefen.
- Next Action: Rule-4-Entscheidung durch User: Vitest (empfohlen — de-facto Standard fuer Next.js 16 + TypeScript + Zod) oder Alternative. Nach Entscheidung: separater Setup-Slice oder In-Place-Aufnahme in SLC-002.

### ISSUE-003 — node_modules nicht installiert
- Status: open
- Severity: Medium
- Area: Build-Toolchain
- Summary: Im Onboarding-Repo wurde nach dem Blueprint-Fork noch kein `npm install` ausgefuehrt. Ohne `node_modules` koennen `next build`, `tsc --noEmit` und ein spaeter eingerichtetes Test-Framework nicht lokal validiert werden.
- Impact: Static Type-Check fuer MT-4 Query-Layer in dieser Session nicht durchgefuehrt. Build-Verifikation erst moeglich nach `npm install`.
- Workaround: Vor Deploy `npm install` ausfuehren (passiert ohnehin im Coolify-Build automatisch).
- Next Action: Einmalig `npm install` lokal ausfuehren, damit Type-Check + Lint in kommenden Slices verfuegbar sind.
