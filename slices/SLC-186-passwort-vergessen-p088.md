# SLC-186 — Passwort-Vergessen-Flow + P-088-Policy-Port (FEAT-103)

- Status: planned
- Feature: FEAT-103 (PRD §V10.3) · DEC-265 (GoTrue-Bausteine) · DEC-266 (P-088)
- Branch: `v10-3-rollenmodell-p1` (Worktree unter `c:/strategaize/strategaize-onboarding-plattform.worktrees/v10-3`, SaaS-Pflicht)
- Migration: KEINE (0 Migration per Addendum U.3)
- Created: 2026-07-06

## Ziel

Nutzer können ein vergessenes Passwort selbst zurücksetzen (Login-Link → E-Mail → recovery-Link → Set-Password), enumeration-sicher und doppelt rate-limited. Gleichzeitig wird die Passwort-Policy P-088 (12+ / zxcvbn-Score ≥3) als 1:1-Port aus BS auf alle Neu-Passwort-Stellen gezogen.

## Verified-Against-Code-Reality (2026-07-06)

- NEW-Pfade existieren NICHT (per ls verifiziert): `src/app/auth/passwort-vergessen/` (page.tsx, actions.ts), `src/lib/auth/password-policy.ts`, `src/lib/auth/__tests__/password-policy.test.ts`.
- MODIFY-Pfade existieren (per ls verifiziert): `src/lib/rate-limit.ts`, `src/app/auth/callback/route.ts`, `src/app/auth/set-password/actions.ts`, `src/app/accept-invitation/[token]/actions.ts`, `src/app/accept-invitation/[token]/AcceptInvitationForm.tsx`, `src/app/login/login-form.tsx`, `src/lib/email.ts`.
- Reuse-Contract verifiziert (Read): BS `cockpit/src/lib/auth/password-policy.ts` exportiert `PASSWORD_MIN_LENGTH=12`, `PASSWORD_MIN_SCORE=3`, `validatePasswordStrength(password): Promise<PasswordStrengthResult>` (async, zxcvbn via dynamic import). zxcvbn ^4.4.2 + @types/zxcvbn NICHT in OP package.json (neue Deps, DEC-266).
- Test-Infra: vitest `environment: "node"` — alle Tests Pure-Mock/Pure-Function; KEINE Component-Render-Tests. UI-Verifikation = next build + Live-Smoke.
- Callback special-cased heute nur `type === "invite"` (route.ts:17-19) — recovery-Erweiterung ist MODIFY dort.

## Micro-Tasks

#### MT-1: GoTrue-recovery-Spike (R-ARCH-2) [backend, read-only gegen Live]
- Goal: Verifizieren, dass `admin.generateLink({type:'recovery'})` + `verifyOtp({token_hash, type:'recovery'})` gegen self-hosted GoTrue funktioniert, BEVOR UI gebaut wird.
- Files: keine Repo-Files (Scratch-Script); Ergebnis-Notiz in dieser Spec (Abschnitt "MT-1-Verdict") + ggf. Korrektur der MT-3/4-Annahmen.
- Vorgehen: Wegwerf-Test-User via Admin-API anlegen (NIE Bestands-User anfassen — Memory-Regel), recovery-Link generieren, verifyOtp-Kette prüfen, GOTRUE_MAILER_OTP_EXP aus Live-ENV notieren, Test-User löschen.
- Verification: dokumentiertes PASS/FAIL-Verdict + TTL-Wert; bei FAIL: Architektur-Rückschleife (Deviation Rule 4) statt Weiterbau.
- Dependencies: keine.

#### MT-2: P-088-Port + Anwendung an Bestands-Stellen [shared, TDD]
- Goal: Zentrale Passwort-Policy, drei divergierende min-8-Checks ersetzt.
- Files: NEW `src/lib/auth/password-policy.ts` (1:1 BS-Port, Quell-Pfad-Header Pflicht) + NEW `src/lib/auth/__tests__/password-policy.test.ts`; MODIFY `src/app/auth/set-password/actions.ts`, `src/app/accept-invitation/[token]/actions.ts`, `src/app/accept-invitation/[token]/AcceptInvitationForm.tsx` (Client-Hint 12+); package.json (+zxcvbn, +@types/zxcvbn dev).
- Expected behavior: Neu-Passwörter <12 Zeichen oder Score <3 werden mit maschinenlesbaren reasons abgelehnt; Fehlertexte deutsch.
- Verification: TDD (RED→GREEN) ~5 Cases (min_length, weak, ok, Score-Grenze, reasons-Shape); tsc 0 / eslint 0 / targeted vitest.
- Dependencies: keine (parallel zu MT-1 möglich).

#### MT-3: Reset-Anforderung — Limiter + Action + Mail [backend, TDD]
- Goal: Enumeration-sichere Reset-Anforderung mit Doppel-Rate-Limit und Mail-Versand.
- Files: MODIFY `src/lib/rate-limit.ts` (+`passwordResetLimiter` IP + account-scoped Bucket, P-081-Muster) + bestehende `src/lib/__tests__/rate-limit.test.ts` erweitern; NEW `src/app/auth/passwort-vergessen/actions.ts` (`requestPasswordReset`; createAdminClient + generateLink recovery; user-not-found geschluckt via captureInfo; Link über `NEXT_PUBLIC_APP_URL`, P-040) + NEW `src/app/auth/passwort-vergessen/__tests__/actions.test.ts` (hermetisch, DI-Mocks per OP-Konvention); MODIFY `src/lib/email.ts` (+`sendPasswordResetEmail`, Stil renderSignupVerifyTemplate).
- Expected behavior: Identische Erfolgsantwort für existierende UND nicht existierende E-Mail; Limit-Fälle liefern generische Fehlermeldung; Token wird nie geloggt.
- Verification: TDD ~6 Cases (identische Antwort beide Zweige, IP-Limit, Account-Limit, sendMail-Aufruf-Shape, Link-Konstruktion, Fehler-Schlucken); tsc/eslint/vitest.
- Dependencies: MT-1 (PASS-Verdict), MT-2 (Policy existiert — kein harter Code-Link, aber Review-Kohärenz).

#### MT-4: UI + Callback-Erweiterung [frontend]
- Goal: Sichtbarer Einstieg + korrektes Routing des recovery-Links.
- Files: NEW `src/app/auth/passwort-vergessen/page.tsx` (kleines Formular, Success-State identisch unabhängig vom Konto); MODIFY `src/app/login/login-form.tsx` (Link "Passwort vergessen?"); MODIFY `src/app/auth/callback/route.ts` (`needsPassword = type invite ODER recovery` → `/auth/set-password`).
- Expected behavior: Kompletter Flow klickbar; recovery landet auf Set-Password (nicht /dashboard).
- Verification: tsc/eslint; `next build` PASS via Dummy-.env.local (Playbook worktree-setup P3); beide Routen im Build-Manifest. Browser-E2E = /deploy-Live-Smoke (AC-186-6).
- Dependencies: MT-3.

## Acceptance Criteria

- AC-186-1 [MT-3, Pure-Mock]: Antwort auf Reset-Anforderung ist byte-identisch für existierende/nicht existierende Konten.
- AC-186-2 [MT-3, Pure-Mock]: IP-Limit UND Account-Limit greifen unabhängig (peek-before-send).
- AC-186-3 [MT-2, Pure-Mock]: P-088 an set-password + accept-invitation wirksam (12+/Score≥3), alte min-8-Pfade entfernt.
- AC-186-4 [MT-4, Code-verify]: Callback routet type=recovery auf /auth/set-password.
- AC-186-5 [MT-4, Build]: next build EXIT 0, neue Route im Manifest.
- AC-186-6 [/deploy, Live-Smoke]: E2E-Reset mit Test-Account live PASS; GOTRUE_MAILER_OTP_EXP-Wert dokumentiert (DEC-265 UNVERIFIED-Auflösung); Founder-Smoke.

## Cross-Slice-Dependencies

- Blockiert: SLC-187 startet erst nach Slice-/qa-PASS von SLC-186 (kumulativer Branch, Reihenfolge-Rationale Addendum U.7: Cleanup zuletzt).
- Geteilte Files mit SLC-187: `src/app/accept-invitation/[token]/actions.ts` (MT-2 ändert Policy-Check; SLC-187-Audit prüft dieselbe Datei auf tenant_member-Reste) — sequenziell unkritisch.
- Produced für später: `src/lib/auth/password-policy.ts` wird kanonische OP-Policy (P2-P4 nutzen sie für alle Invite-Flows).
