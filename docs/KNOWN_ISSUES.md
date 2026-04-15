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
- Impact: Static Type-Check fuer MT-4 Query-Layer in dieser Session nicht durchgefuehrt. Build-Verifikation erst moeglich nach `npm install`. Coolify-Build auf Hetzner lief durch (2026-04-15), Runtime-Verifikation via HTTP 200 auf /login also vorhanden.
- Workaround: Vor Deploy `npm install` ausfuehren (passiert ohnehin im Coolify-Build automatisch).
- Next Action: Einmalig `npm install` lokal ausfuehren, damit Type-Check + Lint in kommenden Slices verfuegbar sind.

### ISSUE-004 — SLC-001 MT-5 nicht durchgefuehrt (2-Tenant-RLS-Isolationstest)
- Status: open
- Severity: High
- Area: QA / RLS-Verifikation
- Summary: SLC-001 Acceptance Criterion 3 verlangt einen automatisierten Test, der prueft ob `tenant_admin` von Tenant A keine Rows von Tenant B sieht. Dieser Test ist nicht umgesetzt (keine Test-Dateien, keine Test-Infra).
- Impact: Das Kernprinzip der Multi-Tenancy ist nicht automatisiert abgesichert. Die RLS-Policies sind syntaktisch korrekt und folgen dem Blueprint-Muster, aber eine Kreuzpruefung mit echten JWT-Claims fehlt.
- Workaround: Manueller Smoke-Test via `SET LOCAL "request.jwt.claims" = '{...}'` auf der Hetzner-DB mit 2 seeded Tenants. Noch nicht durchgefuehrt.
- Next Action: Mit ISSUE-002 zusammen auf (a) Test-Infra-Setup (Vitest + Supabase-local) oder (b) psql-basierten Integrationstest. Ziel: Test in kommendem Slice SLC-002a "Test-Infrastruktur" umgesetzt.

### ISSUE-005 — App-Title "StrategAIze Kundenplattform" (Blueprint-Branding)
- Status: open
- Severity: Low
- Area: Frontend / Branding
- Summary: Die Login-Seite rendert mit `<title>StrategAIze Kundenplattform</title>`. Artefakt aus dem Blueprint-Fork.
- Impact: Rein kosmetisch. Onboarding-Plattform sollte eigene Branding haben.
- Next Action: In einem spaeteren UI-Slice korrigieren.

### ISSUE-006 — Legacy-Blueprint-Migrations im sql/migrations/ Ordner
- Status: open
- Severity: Low
- Area: Repo-Hygiene / Database
- Summary: Die 17 Blueprint-Migrations (003-020) sind noch im `sql/migrations/`-Ordner, werden aber nicht ausgefuehrt (Dockerfile.db referenziert sie nicht, Migrations-Layer laeuft manuell nur fuer 021-023).
- Impact: Keine funktionale Gefahr. Verwirrungspotenzial fuer Neu-Einsteiger.
- Next Action: In einem Maintenance-Slice entfernen, sobald sicher ist dass keine Referenz mehr existiert.
