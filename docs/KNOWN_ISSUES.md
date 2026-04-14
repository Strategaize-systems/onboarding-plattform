# Known Issues

### ISSUE-001 — secrets-onboarding.txt liegt untracked im Repo-Root
- Status: open
- Severity: Medium
- Area: Security / Repo-Hygiene
- Summary: Die Datei /secrets-onboarding.txt liegt untracked im Repo-Root. Sie ist NICHT in .gitignore aufgefuehrt. Bei versehentlichem `git add .` wuerde sie committed werden.
- Impact: Risiko, dass Secrets (JWT, DB-Password, SMTP, Bedrock-Keys) in oeffentliches GitHub-Repo gelangen.
- Workaround: Nie `git add .` verwenden, nur gezieltes Staging.
- Next Action: .gitignore-Eintrag hinzufuegen oder Datei aus Repo-Root wegbewegen (z.B. nach ~/.strategaize/secrets/).
