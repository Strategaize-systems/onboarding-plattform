# FEAT-056 — EditableText-Komponente + Text-Migration

**Version:** V7.1
**Status:** planned
**Created:** 2026-05-20

## Zweck

React-Komponente `<EditableText>` als universeller Wrapper fuer alle User-sichtbaren Strings im Diagnose-Funnel. Rendert Default-Text + (bei berechtigter Rolle) ein kleines Pencil-Icon, das Inline-Edit oeffnet. Migration ~50-80 Hardcode-Strings auf EditableText-Aufrufe. Foundation-Konsum fuer FEAT-055 (Override-Layer).

## Hintergrund

User-Direktive: "Editierbar mit so einem kleinen Icon, muessen wir sie wohl ueberall machen". Diese FEAT macht den Edit-Layer im Render-Tree sichtbar + benutzbar.

## In Scope

- **`<EditableText>` React-Komponente** in `src/components/text-override/EditableText.tsx`:
  - Props: `keyPath: string` (Pflicht), `defaultText: string` (Pflicht), `scope?: 'global' | 'template' | 'partner'` (Default `'global'`), `scopeId?: string`, `multiline?: boolean` (Default false), `markdown?: boolean` (Default false), `as?: keyof JSX.IntrinsicElements` (Default `'span'`).
  - Rendert resolvierten Text aus React-Context (TextOverrideProvider — siehe unten).
  - Bei Rolle `strategaize_admin` oder `partner_admin`: Pencil-Icon (lucide-react `Pencil` 12px) rechts neben dem Text, opacity 0.4, hover 1.0.
  - Klick auf Icon: Inline-Edit-Mode. Bei `multiline=false`: Inline-Textarea (Auto-Resize, max 80 chars Width sichtbar). Bei `multiline=true`: Modal mit grosser Textarea + Save/Cancel.
  - Save: ruft `saveTextOverride`-Server-Action (FEAT-055). Loading-Spinner waehrend Save. Bei Erfolg: Re-Render mit neuem Wert. Bei Fehler: Toast-Error.
  - Reset-Button "Auf Standard zuruecksetzen" sichtbar wenn Override-Row existiert (visueller Indikator: dezenter "Override"-Badge).
- **`<TextOverrideProvider>` React-Context** in `src/components/text-override/Provider.tsx`:
  - Wrappt Root-Layout oder Diagnose-Funnel-Sub-Layout.
  - Laedt einmalig per Server-Component `loadOverrides(partnerOrgId, locale)` (FEAT-055 Resolver).
  - Stellt Map + currentRole + currentPartnerOrgId via Context bereit.
  - Cache-Bust nach Save via React-Server-Action-Revalidation oder `router.refresh()`.
- **Text-Migration auf EditableText** (Coverage ~50-80 Keys):
  - **A — Template-Frage-Texte + Block-Titel**: Bleiben in Migration als Default, EditableText laedt sie ueber `defaultText={block.title}` + `keyPath={`template.partner_diagnostic.block.${block.key}.title`}`. Analog fuer 24 Frage-Labels und Pflicht-Output-Aussage.
  - **D — Bericht-Page-Strings** (`src/app/dashboard/diagnose/bericht/page.tsx`): Page-Title, Score-Labels ("Reife-Stufe", "Headroom"), CTA "Ich will mehr", Print-Button-Caption, Datenschutz-Footer, KI-Verdichtungs-Block-Header. ~15-20 Keys.
  - **E — Email-Templates** (`src/lib/email/templates/*.ts`): Verify-Mail Subject + Body, Reminder-Mail Subject + Body, Invitation-Mail Subject + Body, Magic-Link-Mail Subject + Body. EditableText kann hier NICHT direkt (Server-Side Template-Engine), stattdessen `resolveText` direkt im Template-Builder + Admin-Edit ueber `/admin/text-overrides`-Page. ~12-16 Keys.
  - **F — i18n-Strings im Diagnose-Funnel-Pfad** (`messages/de.json`): Sidebar-Diagnose-Label, Diagnose-Start-Welcome, Empty-States, Error-Messages relevant fuer Diagnose-Flow. ~10-15 Keys.
- **Text-Key-Naming-Konvention** (dokumentiert in `docs/ARCHITECTURE.md` V7.1-Section):
  - Hierarchisch punkt-separiert: `<root>.<subarea>.<element>` (z.B. `diagnose.bericht.cta.ich_will_mehr`).
  - Erlaubte Zeichen: `[a-z0-9._]`, keine Sonderzeichen.
  - Template-spezifisch: `template.<slug>.<element>` (z.B. `template.partner_diagnostic.block.q1.label`).
  - Email-spezifisch: `email.<purpose>.<part>` (z.B. `email.verify_signup.subject`, `email.verify_signup.body_md`).
- **Grep-Audit-Skript** `scripts/audit-editable-text-coverage.mjs`:
  - Sucht alle Hardcode-Strings im Diagnose-Pfad (`src/app/dashboard/diagnose/**`, `src/lib/email/templates/**`).
  - Vergleicht mit `<EditableText>`-Usage.
  - Listet noch-nicht-migrierte Strings als TODO.
- **Vitest-Coverage**:
  - EditableText rendert defaultText ohne Override-Row.
  - EditableText rendert Override-Wert wenn vorhanden.
  - Pencil-Icon sichtbar fuer strategaize_admin, partner_admin; NICHT sichtbar fuer tenant_admin, tenant_member.
  - Klick auf Pencil-Icon oeffnet Editor.
  - Save schreibt Override + Re-Render mit neuem Text.
  - Reset entfernt Override + Re-Render mit defaultText.

## Out of Scope

- **Rich-Text-Editor** (bold, italic, links) — V7.1 nur Plain-Text + limitierte Markdown (entschieden in /architecture Q-V7.1-B).
- **Drag-and-Drop von Text-Bloecken** — V8+.
- **Versions-Diff-View** "altes vs. neues Override" — V7.2+.
- **Edit-of-KI-System-Prompt** (H) — bleibt Code, NICHT migriert.
- **Migration von Auth-Pages, Sidebar, Admin-Pages-Strings** — Diese sind NICHT im Diagnose-Funnel-Scope, bleiben i18n-File.

## Akzeptanzkriterien

- AC-1: `<EditableText keyPath="diagnose.bericht.cta.ich_will_mehr" defaultText="Ich will mehr" />` rendert "Ich will mehr" ohne Override-Row.
- AC-2: Override-Row schreiben + Re-Render zeigt neuen Wert.
- AC-3: Pencil-Icon visible nur fuer Rollen `strategaize_admin` + `partner_admin`. Test fuer 4 Rollen (strategaize_admin / partner_admin / tenant_admin / tenant_member).
- AC-4: Klick auf Pencil-Icon oeffnet Inline-Textarea fuer `multiline=false`, Modal fuer `multiline=true`.
- AC-5: Save ruft `saveTextOverride`-Server-Action (FEAT-055), Re-Render zeigt neuen Wert.
- AC-6: Cancel verwirft Aenderungen, Editor schliesst.
- AC-7: Reset-Button entfernt Override-Row, Re-Render zeigt defaultText.
- AC-8: Grep-Audit-Skript meldet 0 Hardcode-Strings im Diagnose-Pfad (mit dokumentierten Ausnahmen).
- AC-9: Mindestens 50 EditableText-Aufrufe im Diagnose-Funnel-Pfad. Coverage A+D+F migriert.
- AC-10: Email-Templates (E) nutzen `resolveText`-Server-Side. Admin-Edit ueber `/admin/text-overrides` aenderbar.
- AC-11: TextOverrideProvider-Performance: Server-Render mit 50 EditableText-Aufrufen unter 100ms (Single-Query-Load + Map-Cache).

## Abhaengigkeiten

- **Hard-Dep**: FEAT-055 (text_override-Tabelle + Resolver + saveTextOverride-Server-Action).
- **Pattern-Reuse**: React-Server-Component-Pattern aus V6 Diagnose-Werkzeug.
- **Pattern-Reuse**: lucide-react Icons (bereits in Repo).
- **Pattern-Reuse**: Tailwind-Modal-Pattern aus existierenden Dialog-Komponenten.
- **Downstream-Dep**: FEAT-057, FEAT-059, FEAT-060 nutzen EditableText fuer Helper-Texts + Polish + Email-Bodies.
