# SLC-137 — FEAT-056 EditableText-Komponente + Text-Migration A/D/E/F

**Feature:** FEAT-056
**Version:** V7.1
**Status:** planned
**Created:** 2026-05-20
**Estimated effort:** ~4-8h Code-Side
**Pre-Conditions:** SLC-136 done (text_override + Resolver + Save-Action verfuegbar)
**Worktree:** `slc-137-editabletext-component-migration` (Pflicht)

## Zweck

React-Komponente `<EditableText>` mit Pencil-Icon-Inline-Edit + Text-Migration von ~50-80 Hardcode-Strings im Diagnose-Funnel-Pfad auf EditableText-Aufrufe. Konsumiert SLC-136-Foundation.

## In Scope

Siehe FEAT-056 In-Scope. Konkret:
- EditableText-React-Komponente (Inline + Modal, Hybrid-Schwelle 80 chars per DEC-143)
- TextOverrideProvider Context (Server-Component Pre-Load via SLC-136 Resolver)
- Markdown-Subset-Rendering bei `markdown={true}` (remark@15+remark-html@16, DEC-144)
- Audit-Skript `scripts/audit-editable-text-coverage.mjs`
- Text-Migration aller Hardcodes in Diagnose-Funnel-Pfad (A+D+F)
- Email-Templates (E) via Server-Side `resolveText` (NICHT EditableText, da Server-Render)

## Out of Scope

- Helper-Texts Schema-Erweiterung (SLC-138)
- KI-System-Prompt-Edit (H, dauerhaft out-of-V7.1)
- i18n-Komplett-Migration ausserhalb Diagnose-Pfad (Sidebar/Admin-Pages bleiben i18n)

## Micro-Tasks

### MT-1: EditableText-Komponente (Inline + Modal Hybrid)
- Goal: Self-contained React-Komponente mit Pencil-Icon-Render bei Admin-Rollen, Hybrid-Editor-Schwelle 80 chars, Save via SLC-136-Action.
- Files: `src/components/text-override/EditableText.tsx`, `src/components/text-override/EditableText.module.css`, `src/components/text-override/__tests__/EditableText.test.tsx`.
- Expected behavior: Rendert `text` aus Context-Map oder defaultText. Bei strategaize_admin/partner_admin: Pencil-Icon opacity 0.4 hover 1.0. Klick: Inline-Editor wenn `defaultText.length <= 80 && !multiline`, Modal sonst. Save -> saveTextOverride-Action + revalidatePath + Re-Render. Cancel verwirft.
- Verification: Vitest mit 8+ Cases (rendert default, rendert override, Pencil-Icon-Visibility pro Rolle, Hybrid-Schwelle-Logik, Save schreibt + re-rendert, Cancel verwirft, Reset entfernt Override).
- Dependencies: SLC-136 MT-2 (Resolver), SLC-136 MT-3 (saveTextOverride-Action).

### MT-2: TextOverrideProvider Server-Component Context
- Goal: Wrappt Diagnose-Funnel-Sub-Layout, laedt einmalig Map via SLC-136 Resolver, stellt via React-Context bereit. Currentrole-Detection aus Server-Session.
- Files: `src/components/text-override/Provider.tsx` (Server-Component), `src/components/text-override/use-text-override.ts` (Client-Hook).
- Expected behavior: Provider preload't `loadOverrides(partnerOrgId, locale='de')`, current-User-Role aus supabase-server-client. Context: `{ map, role, partnerOrgId }`. Hook `useTextOverride()` greift drauf zu.
- Verification: Vitest auf Hook + Provider-Snapshot. Server-Render mit 50 EditableText-Aufrufen < 100ms (Performance-AC aus FEAT-056 AC-11).
- Dependencies: MT-1.

### MT-3: Audit-Skript audit-editable-text-coverage.mjs
- Goal: Node-Script grep't User-facing Strings im Diagnose-Funnel-Pfad, vergleicht mit EditableText-Usage, listet Coverage.
- Files: `scripts/audit-editable-text-coverage.mjs`.
- Expected behavior: Script durchlaeuft `src/app/dashboard/diagnose/**`, `src/lib/email/templates/**`. Findet Hardcode-Strings (Heuristik: JSX-Text ohne {var}, Email-Template-Subject/Body-Variables). Listet jeden String + Code-Pfad. Vergleicht mit `<EditableText`-Treffern. Output: Tabelle "migrated / not migrated / total".
- Verification: Pre-Migration-Run zeigt ~80 not-migrated Strings, Post-Migration zeigt 0 + Liste der migrierten Keys.
- Dependencies: Keine (kann parallel laufen).

### MT-4: Text-Migration A — Template-Frage-Texte + Block-Titel + Closing-Statement
- Goal: Render-Pfad in Diagnose-Run + Bericht-Pages laedt Template-Content via Resolver (mit Migration-Seed als Default).
- Files: `src/app/dashboard/diagnose/run/page.tsx` (Frage-Render), `src/app/dashboard/diagnose/run/components/QuestionCard.tsx`, `src/app/dashboard/diagnose/bericht/page.tsx` (Block-Titles + Closing).
- Expected behavior: Frage-Labels wie `<EditableText keyPath={\`template.partner_diagnostic.block.${block.key}.question.${q.key}.label\`} defaultText={q.label} multiline={true} markdown={false} />`. Block-Titel + Closing-Statement analog. Migration ~30 Keys.
- Verification: Visual-Check in Browser: alle Frage-Texte rendern wie zuvor (Defaults intakt). Edit via Pencil-Icon speichert + zeigt neuen Wert nach Reload.
- Dependencies: MT-1, MT-2.

### MT-5: Text-Migration D — Bericht-Page-Strings
- Goal: ~15-20 Hardcode-Strings im Bericht-Pfad auf EditableText.
- Files: `src/app/dashboard/diagnose/bericht/page.tsx` (Page-Title, Score-Labels), `src/app/dashboard/diagnose/bericht/components/ScoreVisual.tsx` (Score-Labels), `src/app/dashboard/diagnose/bericht/components/IchWillMehrCard.tsx` (CTA), `src/app/dashboard/diagnose/bericht/components/PrintButton.tsx` (Caption).
- Expected behavior: Page-Title "Deine Diagnose-Auswertung", Score-Labels "Reife-Stufe"/"Headroom", CTA "Ich will mehr", Print-Button-Caption, Datenschutz-Footer alle als EditableText. Key-Konvention `diagnose.bericht.*`.
- Verification: Audit-Skript meldet 0 Hardcode in Bericht-Pfad. Edit jedes Strings funktioniert.
- Dependencies: MT-1, MT-2.

### MT-6: Text-Migration E — Email-Templates Server-Side resolveText
- Goal: Email-Templates (Verify-Mail, Reminder-Mail, Invitation-Mail, Magic-Link-Mail) laden Subject + Body via `resolveText` server-side. Edit via Admin-Override-Page (FEAT-055 SLC-136 MT-4).
- Files: `src/lib/email/templates/signup-verify.ts`, `src/lib/email/templates/reminder.ts` (falls existent), `src/lib/email/templates/invitation.ts` (falls existent), `src/lib/email/templates/magic-link.ts` (falls existent).
- Expected behavior: Template-Builder ruft `resolveText(map, 'email.verify_signup.subject', defaultSubject)` etc. Statt EditableText-Wrapper, da Server-Render. Coverage ~12-16 Keys mit Konvention `email.<purpose>.<part>`.
- Verification: Email-Versand-Test (manuell, im Hetzner-Stack) zeigt Default-Text. Override via /admin/text-overrides + Re-Send zeigt neuen Subject/Body.
- Dependencies: MT-1, MT-2.

### MT-7: Text-Migration F — i18n-Strings im Diagnose-Pfad
- Goal: ~10-15 i18n-Keys aus `messages/de.json` die im Diagnose-Funnel-Pfad genutzt werden auf EditableText migrieren (Sidebar-Diagnose-Label, Empty-States, Error-Messages relevant fuer Diagnose-Flow).
- Files: `src/app/dashboard/diagnose/start/page.tsx`, `src/components/sidebar/DiagnoseLabel.tsx` (falls existent), evtl. Empty-State-Components.
- Expected behavior: Keine i18n-Drift in Sidebar/Auth/Admin-Pages (out-of-scope). Nur Strings die im Diagnose-Funnel-Pfad rendern. Konvention `diagnose.<area>.<element>`.
- Verification: Audit-Skript meldet 0 i18n-Keys im Diagnose-Pfad-Trefferraum, nur EditableText.
- Dependencies: MT-1, MT-2.

### MT-8: Records-Update + Audit-Skript-Endlauf
- Goal: Coverage-AC erfuellt (mindestens 50 EditableText-Aufrufe), Audit-Skript-Final-Output dokumentiert, Cockpit-Records aktualisiert.
- Files: `slices/INDEX.md`, `planning/backlog.json` (BL-119 -> done), `features/INDEX.md` (FEAT-056 -> done), `docs/STATE.md`, RPT-XXX.md mit Audit-Skript-Output.
- Expected behavior: Coverage-Tabelle in Report (X migrated / 0 not-migrated). Stub-Detection in QA findet 0 vergessene Hardcodes.
- Verification: Audit-Skript-Output >= 50 EditableText-Aufrufe + 0 Hardcodes in Diagnose-Funnel-Pfad.
- Dependencies: MT-3..7.

## Acceptance Criteria

Siehe FEAT-056 AC-1..11. Plus:
- AC-SLC-137-1: Audit-Skript meldet >= 50 EditableText-Aufrufe.
- AC-SLC-137-2: Audit-Skript meldet 0 Hardcode-Strings im Diagnose-Funnel-Pfad (mit dokumentierten Ausnahmen).
- AC-SLC-137-3: Performance-AC: Server-Render mit 50 EditableText < 100ms.

## Risiken

- Render-Performance bei vielen EditableText-Aufrufen + Inline-Editor-State -> React-Profiler-Run in QA.
- Email-Template-Server-Side resolveText kann bei async-Pfaden zu Race-Conditions kommen -> Pre-Load im Builder vor sendMail.
- i18n-Strings die in Sidebar UND Diagnose-Pfad genutzt werden -> Entscheidung pro String: Migration vs. Bleiben. Default: Bleiben in i18n.
