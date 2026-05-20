# FEAT-055 — Inline-Text-Override-Foundation

**Version:** V7.1
**Status:** planned
**Created:** 2026-05-20

## Zweck

Generische Tabelle + Resolver + RLS-Layer, mit dem alle User-sichtbaren Strings im Diagnose-Funnel (und potenziell daran haengender Pfade) editiert werden koennen — drei Override-Stufen `global` (Strategaize-Default), `template` (template-spezifisch), `partner` (Per-Partner-Anpassung). Foundation fuer FEAT-056 (EditableText-Komponente + Migration) und Pre-Condition fuer FEAT-057/059/060/061.

## Hintergrund

User-Direktive 2026-05-20 nach SLC-700-Live-Test: "Wir muessen Texte editierbar machen, ohne riesiges Template-System". Diese FEAT liefert das schlanke Schema-Fundament: eine Tabelle, ein Resolver, ein Audit-Log. Kein Page-Builder, keine 5 verschiedenen Edit-UIs, kein CMS-Workflow.

## In Scope

- **Migration `text_override`-Tabelle**:
  - Spalten: `id uuid PRIMARY KEY`, `scope text NOT NULL CHECK (scope IN ('global','template','partner'))`, `scope_id uuid NULL`, `text_key text NOT NULL`, `text_value text NOT NULL`, `locale text NOT NULL DEFAULT 'de'`, `updated_by uuid NOT NULL`, `updated_at timestamptz NOT NULL DEFAULT now()`.
  - Constraints: `UNIQUE(scope, scope_id, text_key, locale)` damit pro Scope nur ein aktueller Wert existiert. `scope_id` darf NULL sein nur fuer `scope='global'` (CHECK).
  - Indizes: `(text_key, locale)` fuer Resolver-Query, `(scope, scope_id)` fuer Partner-Lookup.
- **Migration `text_override_history`-Tabelle** (Audit):
  - Spalten: `id uuid PRIMARY KEY`, `text_override_id uuid NOT NULL`, `scope text NOT NULL`, `scope_id uuid NULL`, `text_key text NOT NULL`, `old_value text NULL`, `new_value text NOT NULL`, `locale text NOT NULL`, `editor_id uuid NOT NULL`, `editor_role text NOT NULL`, `action text NOT NULL CHECK (action IN ('create','update','delete'))`, `created_at timestamptz NOT NULL DEFAULT now()`.
  - History-Insert via DB-Trigger oder Server-Action (Entscheidung in /architecture).
- **RLS-Policies**:
  - `strategaize_admin` darf alle Scopes lesen + schreiben.
  - `partner_admin` darf `global` und `template` lesen, darf `partner` schreiben/lesen NUR fuer `scope_id = own_partner_organization_id`.
  - `partner_employee` + `tenant_admin` Lesen erlaubt, KEIN Schreiben (V7.1-Skope).
  - `tenant_member` (Mandant) Lesen erlaubt fuer eigenen Render-Pfad, KEIN Schreiben.
- **Resolver-Lib** `src/lib/text-override/resolver.ts`:
  - `loadOverrides(partnerOrgId, locale): Promise<Map<string, string>>` — Single-Query SELECT aller Overrides fuer `(global) + (template, templateIds) + (partner, partnerOrgId)`, gemerged in einer Map. Lookup-Reihenfolge: partner > template > global. Map-Cache pro Request-Context (React Server-Component-Tree).
  - `resolveText(map, key, defaultText): string` — Map-Lookup + Fallback auf defaultText (Hardcoded). O(1).
- **Server-Action `saveTextOverride(scope, scopeId, textKey, newValue, locale)`**:
  - RLS-Check, Role-Check.
  - UPSERT in `text_override` mit `ON CONFLICT(scope,scope_id,text_key,locale) DO UPDATE`.
  - History-Insert mit `action='create'` oder `action='update'` + `old_value` aus existierender Row.
  - Returns `{ ok: true, newValue }` oder `{ ok: false, error }`.
- **Server-Action `resetTextOverride(scope, scopeId, textKey, locale)`**:
  - DELETE Override-Row.
  - History-Insert mit `action='delete'`.
  - Effekt: naechster Render zeigt Default-Text.
- **Admin-Page `/admin/text-overrides`**:
  - Liste aller existierenden Overrides mit Filter (scope, partner, text_key-Praefix, locale).
  - Pro Override-Row: aktueller Wert, "Auf Standard zuruecksetzen"-Button, History-Link.
  - History-Sub-Page `/admin/text-overrides/[id]/history` zeigt Audit-Trail.
- **Vitest-Coverage**:
  - Resolver-Logik (partner > template > global > default).
  - Save-Action RLS (partner_admin darf NICHT andere partner_organization editieren).
  - History-Insert bei Create + Update + Delete.
  - Cache-Bust nach Save (naechster loadOverrides liefert neuen Wert).

## Out of Scope

- **EditableText-React-Komponente** + Text-Migration — separates FEAT-056.
- **Locale-UI ungleich `de`** — Schema unterstuetzt, UI exposed nur Deutsch.
- **Bulk-Edit**, Diff-View, Approval-Workflow — V8+.
- **Edit-Rate-Limit** — V7.1 vertraut auf RBAC. V8+ falls Abuse beobachtet.
- **Versioning fuer Rollback** ueber History hinaus (z.B. "Aktiviere Version vom 2026-04-15") — V8+.

## Akzeptanzkriterien

- AC-1: Migration `text_override` + `text_override_history` appliziert idempotent auf Coolify-DB.
- AC-2: RLS verbietet `partner_admin` von Partner A das INSERT/UPDATE einer Override-Row mit `scope='partner', scope_id=<Partner B>` (Pen-Test).
- AC-3: RLS verbietet `tenant_member` jeglichen Schreibzugriff.
- AC-4: `loadOverrides(partnerOrgId='X', locale='de')` liefert Map mit Reihenfolge partner > template > global gemerged. Test mit 3 Override-Rows fuer denselben Key in unterschiedlichen Scopes.
- AC-5: `resolveText(map, 'missing.key', 'default')` liefert `'default'`.
- AC-6: `saveTextOverride(scope='partner', scopeId='X', textKey='diagnose.bericht.cta.ich_will_mehr', newValue='Mehr erfahren', locale='de')` legt Row + History an.
- AC-7: Zweite `saveTextOverride` auf gleichem Key updated Row, History bekommt zweite Zeile mit `old_value`=erster Wert.
- AC-8: `resetTextOverride(scope='partner', scopeId='X', textKey='diagnose.bericht.cta.ich_will_mehr', locale='de')` loescht Row + History-Insert mit `action='delete'`.
- AC-9: `/admin/text-overrides` Page rendert als `strategaize_admin` alle Overrides, als `partner_admin` nur eigene + globale + template.
- AC-10: Vitest 100% Coverage auf Resolver + Save-Action + RLS-Cases.

## Abhaengigkeiten

- **Pattern-Reuse**: RLS-Pattern aus V6 Migration 090 (partner_organization-Hierarchie).
- **Pattern-Reuse**: Audit-Log-Pattern aus V6 `error_log`-Tabelle.
- **Pattern-Reuse**: Server-Action-Pattern aus V6.3 `src/app/dashboard/diagnose/actions.ts`.
- **Cross-Repo**: Helper-Texts JSONB-Schema-Sync mit IS V3 ist FEAT-057, NICHT FEAT-055-Concern.
- **Hard-Dep**: Keine. FEAT-055 ist self-contained Foundation.
- **Downstream-Dep**: FEAT-056..061 nutzen FEAT-055 fuer Text-Resolution.
