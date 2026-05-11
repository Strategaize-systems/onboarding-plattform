# SLC-104 — Partner-Branding + CSS-Custom-Properties Setup + RPC (FEAT-044, Migration 091)

## Goal

Erste Einfuehrung von **CSS-Custom-Properties in der Plattform**. Legt `partner_branding_config`-Tabelle + Storage-Bucket `partner-branding-assets` + RPC `rpc_get_branding_for_tenant` (SECURITY DEFINER, DEC-099-Pattern) + Branding-Resolver Server-Side an. Mandanten-Login resolved Partner-Branding ueber `parent_partner_tenant_id`; Root-Layout emittiert `<style>:root{--brand-primary:...;--brand-logo-url:url(...);}</style>` Server-Side im `<head>` (DEC-106, **kein Client-FOUC**). Pflicht-Footer "Powered by Strategaize" als hardcoded Server-Component mit i18n-Lookup (DEC-108). Branding-UI im Partner-Dashboard mit Live-Preview-Frame. **Migration 091 wird in MT-N live appliziert.**

## Feature

FEAT-044 (Partner-Branding minimal + CSS-Custom-Properties Setup). Pattern-Reuse: Walkthrough-Storage-Pattern (FEAT-034) fuer signed-URL-Proxy auf Logo-Bucket; DEC-099 RPC SECURITY DEFINER (analog `rpc_get_walkthrough_video_path` aus V5.1); Tailwind-Config-Erweiterung erstmals.

## In Scope

### A — Migration 091 SQL-File anlegen

Pfad: `sql/migrations/091_v6_partner_branding_and_template_metadata.sql` (NEU).

Inhalt (vollstaendig, idempotent, ON_ERROR_STOP-faehig):

1. **`partner_branding_config` Tabelle + RLS** (vollstaendig wie in MIG-034 SQL-Skizze):
   - UUID PK + `partner_tenant_id` UNIQUE FK ON DELETE CASCADE
   - `logo_url text NULL`
   - `primary_color text NOT NULL DEFAULT '#2563eb'` mit CHECK `~ '^#[0-9a-fA-F]{6}$'`
   - `secondary_color text NULL` mit CHECK (NULL ODER Hex-Format)
   - `display_name text NULL` (alternativ zu `partner_organization.display_name`)
   - `created_at`, `updated_at`
   - `ENABLE ROW LEVEL SECURITY`
   - 4 Policies: `pbc_select_own_partner_admin` (partner_admin liest eigene via `partner_tenant_id = auth.user_tenant_id()`), `pbc_select_strategaize_admin`, `pbc_update_own_partner_admin` (partner_admin updated eigene), `pbc_insert_strategaize_admin` (nur strategaize_admin INSERT bei Partner-Anlage; partner_admin INSERT geht ueber Server-Action mit `service_role` — alternativ INSERT-Policy fuer eigene Row erlauben mit Auth-Check).
   - INDEX auf `partner_tenant_id` (UNIQUE-Constraint impliziert das).

2. **RPC `rpc_get_branding_for_tenant`** (SECURITY DEFINER, vollstaendig wie in MIG-034 SQL-Skizze + ARCHITECTURE.md V6 Data Flow C):
   - Input: `p_tenant_id uuid`.
   - Logik: (a) Lookup `tenants.tenant_kind` + `tenants.parent_partner_tenant_id`. (b) IF `tenant_kind='partner_client'` AND parent existiert: SELECT `partner_branding_config WHERE partner_tenant_id=parent`. (c) IF `tenant_kind='partner_organization'`: SELECT eigene `partner_branding_config`. (d) ELSE oder nicht gefunden: RETURN Strategaize-Default-JSON.
   - **`SET search_path = public, auth`** im Function-Body (R-091-4-Pattern aus SLC-091, Search-Path-Attack-Mitigation).
   - GRANT EXECUTE TO authenticated, anon (anon damit Login-Page brandable ist, DEC-109-Tradeoff).
   - Audit-Tradeoff (DEC-109): RPC prueft NICHT, ob aufrufender User Zugriff auf `p_tenant_id` hat — Branding ist absichtlich "best-effort lesbar". UUID-v4 mitigiert Enumeration-Risiko.

3. **CHECK-Constraint-Erweiterungen** auf bestehenden Tabellen:
   - `validation_layer.reviewer_role` DROP + RECREATE CHECK: bestehende Werte (`strategaize_admin, tenant_admin, tenant_member, employee, partner_admin`) + neu `'system_auto'`.
   - `block_checkpoint.checkpoint_type` DROP + RECREATE CHECK: bestehende Werte + neu `'auto_final'`.
   - Idempotent: `DROP CONSTRAINT IF EXISTS ...`.

4. **Storage-Bucket `partner-branding-assets`**:
   - `INSERT INTO storage.buckets (id, name, public) VALUES ('partner-branding-assets', 'partner-branding-assets', false) ON CONFLICT (id) DO NOTHING`.
   - Storage-RLS-Policies analog walkthroughs-Bucket (Pattern-Reuse aus V5):
     - SELECT allowed via Server-Proxy `/api/partner-branding/[partner_tenant_id]/logo` mit RPC-Auth-Check (DEC-099-analog).
     - INSERT/DELETE: nur `partner_admin` darf in eigenen `partner_tenant_id`-Folder schreiben.

5. **Backfill bestehender Partner-Tenants** (idempotent):
   - Fuer jeden `tenants` Row mit `tenant_kind='partner_organization'`: INSERT `partner_branding_config` mit Defaults wenn noch nicht vorhanden (`ON CONFLICT (partner_tenant_id) DO NOTHING`).
   - Loest R-102-4 (Stub-Logik aus SLC-102 wird durch Backfill abgedeckt).

### B — Branding-Resolver

Pfade: `src/lib/branding/resolve.ts` (NEU) + `src/lib/branding/types.ts` (NEU).

**Interface:**

```typescript
export interface BrandingConfig {
  logoUrl: string | null;        // signed URL via Proxy
  primaryColor: string;           // hex
  primaryColorRgb: string;        // "37 99 235" (fuer Tailwind alpha)
  secondaryColor: string | null;
  displayName: string | null;
}

export async function resolveBrandingForTenant(tenantId: string | null): Promise<BrandingConfig>;
```

**Logik:**

1. Wenn `tenantId === null` → return Strategaize-Default.
2. SELECT `rpc_get_branding_for_tenant(p_tenant_id)` via supabase-client (admin oder authenticated — DEC-109 erlaubt beides).
3. Map response: hex → rgb-Triplet fuer Tailwind, logoUrl → Server-Proxy-URL `/api/partner-branding/[partner_tenant_id]/logo` (Logo-URL aus DB ist Storage-Path, wird via Proxy signed serviert).
4. Cache: ggf. Request-scoped Cache via React `cache()` (Next.js Server-Component-Pattern) — kein cross-Request-Cache (Branding kann sich aendern).

**Strategaize-Default:**

```typescript
{
  logoUrl: null,
  primaryColor: '#2563eb',
  primaryColorRgb: '37 99 235',
  secondaryColor: null,
  displayName: 'Strategaize',
}
```

### C — Root-Layout Server-Side Inline-Style

Pfad: `src/app/layout.tsx` (modifiziert).

```typescript
import { resolveBrandingForCurrentRequest } from "@/lib/branding/resolve";
import StrategaizePoweredFooter from "@/components/branding/StrategaizePoweredFooter";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const branding = await resolveBrandingForCurrentRequest();
  return (
    <html lang="de">
      <head>
        <style dangerouslySetInnerHTML={{
          __html: `:root {
            --brand-primary: ${branding.primaryColor};
            --brand-primary-rgb: ${branding.primaryColorRgb};
            ${branding.secondaryColor ? `--brand-secondary: ${branding.secondaryColor};` : ''}
            ${branding.logoUrl ? `--brand-logo-url: url('${branding.logoUrl}');` : ''}
          }`,
        }} />
      </head>
      <body>
        {children}
        <StrategaizePoweredFooter />
      </body>
    </html>
  );
}
```

**`resolveBrandingForCurrentRequest()`** liest die Server-Auth-Session, ermittelt `auth.user_tenant_id()`, ruft `resolveBrandingForTenant(tenantId)` auf.

**Wichtig:** kein FOUC, weil Server-Component das `<style>` direkt im `<head>` emittiert, bevor erster Pixel gerendert wird (DEC-106).

### D — Tailwind-Config-Erweiterung

Pfad: `tailwind.config.ts` (modifiziert).

```typescript
theme: {
  extend: {
    colors: {
      brand: {
        primary: 'rgb(var(--brand-primary-rgb) / <alpha-value>)',
        // secondary kommt V6.1 falls Pilot-Feedback Bedarf zeigt
      },
    },
    backgroundImage: {
      'brand-logo': 'var(--brand-logo-url)',
    },
  },
},
```

Komponenten, die ueber Tailwind-Klassen `bg-brand-primary`, `text-brand-primary`, `border-brand-primary` Branding nutzen: Top-Bar-Background, Primary-Button-Color, Sidebar-Akzent, Link-Color (in einzelnen Komponenten in SLC-104 anpassen — V6 Scope: nur die augenfaelligsten ~4-6 Komponenten).

### E — Pflicht-Footer Server-Component

Pfade: `src/components/branding/StrategaizePoweredFooter.tsx` (NEU) + `src/messages/de.json` (Erweiterung mit `branding.poweredByStrategaize` Key).

```typescript
// Server Component
import { getTranslations } from "next-intl/server";

export default async function StrategaizePoweredFooter() {
  const t = await getTranslations("branding");
  const url = process.env.STRATEGAIZE_FOOTER_URL ?? "https://strategaize.com";
  return (
    <footer className="py-4 text-center text-sm text-gray-500 border-t">
      <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
        {t("poweredByStrategaize")}
      </a>
    </footer>
  );
}
```

i18n-Texte:
- DE: "Aufgesetzt mit Strategaize" oder "Bereitgestellt von Strategaize" (final-Wording siehe Inhalts-Review).
- EN: "Powered by Strategaize" (V6 nicht aktiv, fuer Vollstaendigkeit).
- NL: "Aangedreven door Strategaize" (V6.1).

**Pflicht**: Component liest **weder** `partner_branding_config` **noch** ENV ausser fuer URL — Text und Logo (falls Logo dazu) sind statisch im Component-Code. Bei DB-Manipulation bleibt Footer unbeeinflusst (DEC-108).

### F — Storage-Proxy-Endpoint fuer Logo

Pfad: `src/app/api/partner-branding/[partner_tenant_id]/logo/route.ts` (NEU).

Pattern-Reuse von SLC-091 Walkthrough-Storage-Proxy (mit Range-Support koennte hier weggelassen werden — Logos sind klein, kein Range noetig).

```typescript
export async function GET(req, { params }) {
  const { partner_tenant_id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Auth ist optional: Logo wird auch fuer anonyme Login-Page geladen (Branding bevor Login)
  // RPC checks: ist partner_tenant_id wirklich ein partner_organization? Branding existiert?
  const { data: branding } = await supabase.rpc('rpc_get_branding_for_tenant', { p_tenant_id: partner_tenant_id });
  if (!branding || !branding.logo_url) return 404;
  const adminClient = createAdminClient();
  const { data: blob } = await adminClient.storage.from('partner-branding-assets').download(branding.logo_url);
  if (!blob) return 500;
  const arrayBuffer = await blob.arrayBuffer();
  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'image/png', // ggf. dynamisch aus filename extension
      'Cache-Control': 'public, max-age=3600', // Logo kann gecached werden — Branding-Aenderungen sind selten
    },
  });
}
```

### G — Branding-UI im Partner-Dashboard

Pfade: `src/app/partner/dashboard/branding/page.tsx` (NEU) + `src/app/partner/dashboard/branding/actions.ts` (NEU) + `src/components/partner/BrandingPreview.tsx` (NEU).

**`/partner/dashboard/branding`** (Form):
- Auth-Gate: `partner_admin`.
- Sektion "Logo": Upload-Form (Native HTML, type=file, accept=".png,.svg,.jpg"). Validation: max. 500KB. Vorschau nach Upload (clientseitig).
- Sektion "Primary-Color": HTML5 `<input type="color">` + Hex-Input-Field. Default: `#2563eb`.
- Sektion "Vorschau-Frame": iframe oder eingebettete Component, die das Mandanten-Dashboard-Layout mit den aktuellen Branding-Werten rendert (Live-Preview).
- "Speichern"-Button → Server Action `updateBranding`.

**`uploadLogo(formData)`** (Rolle `partner_admin`):

1. Auth-Check: aufrufender User muss `partner_admin` sein.
2. File-Validation: max 500KB, mime in (image/png, image/svg+xml, image/jpeg).
3. Upload an Storage-Bucket `partner-branding-assets/{partner_tenant_id}/logo.{ext}` (Overwrite OK).
4. UPDATE `partner_branding_config` SET `logo_url=<storage_path>`, `updated_at=now()`.
5. INSERT `error_log` mit `category='partner_branding_logo_updated'`.
6. Return `{ ok: true, logo_url }`.

**`updateBranding({ primary_color, secondary_color?, display_name? })`** (Rolle `partner_admin`):

1. Auth-Check.
2. Hex-Format-Validation (`/^#[0-9a-fA-F]{6}$/`).
3. UPDATE `partner_branding_config` SET ...
4. INSERT `error_log` mit `category='partner_branding_updated'`.
5. Return `{ ok: true }`.

**Color-Contrast-Check** (clientseitig): bei zu hellen/dunklen Farben Warning-Banner "Diese Farbe ist schwer lesbar auf weissem Hintergrund". Heuristik: WCAG AA Contrast-Ratio > 4.5:1 gegen weiss/schwarz.

### H — Welcome-Block-Update in `/dashboard`

Pfad: `src/app/dashboard/page.tsx` + `src/components/dashboard/PartnerClientWelcomeBlock.tsx` (aus SLC-103 erweitert).

- Welcome-Block bekommt jetzt den Partner-Display-Name ueber Branding-Resolver (`branding.displayName` oder Fallback zu `partner_organization.display_name`).
- Logo-Anzeige im Header der Branding (Server-Component liest `branding.logoUrl`).

### I — TypeScript-Types + Vitest

- `BrandingConfig` Interface in `src/lib/branding/types.ts`.
- Vitest fuer:
  - `resolveBrandingForTenant` mit Mock-RPC: 4 Faelle (partner_client mit parent / partner_organization / direct_client / non-existent).
  - `uploadLogo` Happy + Validation-Reject (Size, Mime).
  - `updateBranding` Happy + Hex-Validation-Reject + Auth-Reject.
  - Storage-Proxy `/api/partner-branding/[id]/logo`: 4 Faelle (Happy / Not-Found-Branding / Not-Found-Logo / RPC-Fehler).
  - RPC `rpc_get_branding_for_tenant` gegen Coolify-DB im node:20-Container: 16 Faelle (4 Tenant-Kinds × 4 Auth-Konstellationen) — wird Teil der `v6-partner-rls.test.ts` aus SLC-101 (placeholder aus SLC-101 jetzt aktivieren) + neue Datei `rpc-branding.test.ts`.
- Mindestens 20 neue Vitest.

## Acceptance Criteria

1. Migration 091 idempotent appliziert: zweiter Apply produziert keinen DML-Drift.
2. RPC `rpc_get_branding_for_tenant` returns Strategaize-Default fuer Direct-Client, eigenes Branding fuer Partner-Organization, parent-Branding fuer Partner-Client.
3. Mandanten-Login: Root-Layout emittiert `<style>:root{--brand-primary: <partner-farbe>;}` Server-Side. Browser zeigt **kein** FOUC (Partner-Branding ab erstem Pixel sichtbar).
4. Direkt-Kunden (`tenant_kind='direct_client'`) sehen weiter Strategaize-Default-Branding (`#2563eb`, kein Logo).
5. Partner-Admin kann Logo hochladen (PNG/SVG/JPG max 500KB) und Primary-Color setzen via `/partner/dashboard/branding`.
6. Branding-Aenderung wird sofort wirksam: nach Save + Page-Reload sieht Partner sein eigenes Branding; Mandanten unter diesem Partner sehen es bei naechstem Page-Load.
7. Pflicht-Footer "Powered by Strategaize" ist auf jeder Partner-UI- und Mandanten-UI-Seite sichtbar (SC-V6-9).
8. Pflicht-Footer ist via DB-Manipulation der Branding-Config NICHT entfernbar (manueller Test: SQL UPDATE auf `partner_branding_config` SET display_name='Test' → Footer bleibt unveraendert).
9. Storage-Upload nur fuer `partner_admin`-Rolle (RLS-Test gegen Storage-Bucket).
10. Logo wird ueber Server-Proxy `/api/partner-branding/[id]/logo` mit Auth-Check ausgeliefert (kein direkter Bucket-Zugriff — Browser laedt das Logo, RPC checks Tenant-Existence).
11. Color-Picker validiert Hex-Format serverseitig (Zod) + clientseitig (HTML5 pattern); ungueltiger Hex liefert klare Fehler-UI.
12. TypeScript-Types `BrandingConfig` exportiert. `npm run build` PASS.
13. Pen-Test-Suite SLC-101 weiter gruen + 16 neue Faelle fuer `partner_branding_config` + RPC aktiviert.
14. ESLint 0/0. `npm audit --omit=dev` keine neuen Vulns (SLC-104 fuegt keine npm-Deps hinzu — Tailwind-Config-Erweiterung ist konfigurativ).

## Micro-Tasks

| # | Task | Files | Verify |
|---|------|-------|--------|
| MT-1 | Migration 091 SQL-File anlegen (Tabelle + RLS + RPC + CHECK-Erweiterungen + Storage-Bucket + Backfill) | `sql/migrations/091_v6_partner_branding_and_template_metadata.sql` (NEU) | `psql --syntax-check` lokal, SQL-Skizze aus MIG-034 konsistent |
| MT-2 | Migration 091 Live-Apply auf Hetzner | Coolify-Container | Pre-Apply-Backup `/opt/onboarding-plattform-backups/pre-mig-034-091_<timestamp>.sql`; Apply via base64 + psql; `\dt partner_branding_config`, `\df rpc_get_branding_for_tenant` zeigt Function SECURITY DEFINER, Backfill: SELECT COUNT(*) FROM partner_branding_config = SELECT COUNT(*) FROM tenants WHERE tenant_kind='partner_organization' |
| MT-3 | Branding-Resolver `resolveBrandingForTenant` + Types + Vitest | `src/lib/branding/resolve.ts` + `types.ts` (NEU) + `__tests__/` | 4 Vitest gruen, Mock-RPC + hex-zu-rgb-Conversion verifiziert |
| MT-4 | Pflicht-Footer Server-Component + i18n-Key | `src/components/branding/StrategaizePoweredFooter.tsx` (NEU) + `src/messages/de.json` (modifiziert) | Build PASS, i18n-Lookup PASS, Component rendert link mit korrekter URL |
| MT-5 | Root-Layout Server-Side Inline-Style + Footer-Einbau | `src/app/layout.tsx` (modifiziert) | Build PASS, Server-Render-Snapshot zeigt `<style>:root{...}</style>` im Head |
| MT-6 | Tailwind-Config-Erweiterung + 4-6 Komponenten umstellen auf `bg-brand-primary` etc. | `tailwind.config.ts` + ausgewaehlte Komponenten (Top-Bar, Primary-Button, Sidebar-Akzent, Link) | Build PASS, Visual-Diff auf Demo-Tenant (default = Strategaize-Blau, kein Visual-Regression) |
| MT-7 | Storage-Proxy `/api/partner-branding/[id]/logo` + Vitest | `src/app/api/partner-branding/[partner_tenant_id]/logo/route.ts` (NEU) + Test | 4 Vitest Happy/Not-Found-Branding/Not-Found-Logo/RPC-Error |
| MT-8 | Branding-UI `/partner/dashboard/branding` + `uploadLogo` + `updateBranding` Server Actions + Vitest | `src/app/partner/dashboard/branding/page.tsx` + `actions.ts` + `BrandingPreview.tsx` (alle NEU) | 5 Vitest Happy/Size-Reject/Mime-Reject/Hex-Reject/Auth-Reject |
| MT-9 | Welcome-Block-Update mit Partner-Display-Name + Logo | `src/app/dashboard/page.tsx` + `PartnerClientWelcomeBlock.tsx` (modifiziert) | Mandanten-Dashboard zeigt Partner-Logo + Partner-Display-Name |
| MT-10 | RPC `rpc_get_branding_for_tenant` Vitest gegen Coolify-DB | `src/lib/db/__tests__/rpc-branding.test.ts` (NEU) | 16 Faelle PASS gegen Live-DB, SAVEPOINT-Pattern |
| MT-11 | Pen-Test-Faelle fuer `partner_branding_config` aktivieren (placeholder aus SLC-101 → `it()`) | `src/lib/db/__tests__/v6-partner-rls.test.ts` (modifiziert) | 16+ neue PASS-Faelle |
| MT-12 | Quality-Gates: Lint + Build + Test + Audit + Visual-Regression-Smoke | (gesamt) | 0/0 Lint, Build PASS, alle Vitest gruen, kein Visual-Regression auf Demo-Tenant |
| MT-13 | User-Pflicht-Browser-Smoke nach Coolify-Deploy | Live-URL | partner_admin laed Logo hoch + setzt Primary-Color; eingeladener Mandant sieht Partner-Branding (Logo + Akzentfarbe) sofort im Mandanten-Dashboard, Pflicht-Footer sichtbar; Hard-Reload zeigt kein FOUC (Server-Side-Inline-Style funktioniert) |

## Out of Scope (deferred)

- Sekundaerfarbe Vollintegration (V6 optional, V6.1 falls Pilot-Feedback)
- Mehrere Theme-Varianten (Light/Dark pro Partner) → V6.1+
- Email-Template-Branding (Partner-Logo in Magic-Link-Mail) → V7+
- Domain-Mapping (steuerberater-x.partner.strategaize.de) → V7+
- Custom Schriftart pro Partner → niemals (Lesbarkeits-Risk, FEAT-044 Out-of-Scope)
- Footer-Anpassung durch Partner → V7+
- Logo-Bibliothek mit vorgefertigten Logos → niemals
- A/B-Test verschiedener Branding-Varianten → V7+
- Live-Branding-Switch im Browser ohne Page-Reload → V6-Scope nicht noetig (DEC-106-Tradeoff akzeptiert)
- White-Label-Variante (Strategaize-Hinweis weg) → **niemals** (DEC-108)

## Tests / Verifikation

- **Vitest-Mindestumfang**: 20+ neue Tests (Resolver 4 + Storage-Proxy 4 + uploadLogo 3 + updateBranding 3 + RPC 16 gegen Live-DB).
- **Live-Migration-Apply**: MT-2 via sql-migration-hetzner.md Pattern + `\d` Schema-Verify + RPC-Smoke.
- **Build**: `npm run build` PASS mit Tailwind-Config-Erweiterung.
- **Visual-Smoke** (MT-12 + MT-13): manuelle Verifikation dass Demo-Tenant (direct_client) weiter Strategaize-Default zeigt + Partner-Tenant zeigt Partner-Branding + kein FOUC.

## Risks

- **R-104-1** CSS-Custom-Properties Server-Side-Render-Bug: wenn `resolveBrandingForCurrentRequest()` async fehlschlaegt, koennte Root-Layout brechen. **Mitigation**: Resolver hat Try/Catch + Fallback auf Strategaize-Default. Vitest fuer 4 Faelle (Happy/RPC-Error/User-Logged-Out/Tenant-Not-Found).
- **R-104-2** Tailwind-Config-Erweiterung um `brand`-Klassen koennte bestehende Komponenten brechen (z.B. `bg-blue-600`-Klassen-Drift). **Mitigation**: in MT-6 nur 4-6 Komponenten explizit umstellen + Visual-Diff auf Demo-Tenant. Komponenten die `bg-blue-600` direkt nutzen bleiben unveraendert (kein Auto-Migration).
- **R-104-3** Logo-Upload mit `service_role` (RLS-Bypass im Server-Action) — Risiko: partner_admin koennte ueber direkte API-Calls in fremde Folders schreiben. **Mitigation**: Server Action prueft strikt `partner_tenant_id = auth.user_tenant_id()` vor Upload; Storage-RLS prueft das zusaetzlich (Defense-in-Depth).
- **R-104-4** RPC SECURITY DEFINER ohne Auth-Check (DEC-109-Tradeoff): UUID-Enumeration koennte Tenant-IDs entdecken. **Mitigation**: UUID-v4 ist nicht enumerierbar; Audit-Log fuer ungewoehnliche Lookup-Patterns ist V7+. Akzeptables Restrisiko in Pilot-Phase.
- **R-104-5** Color-Picker Hex-Validierung clientseitig vs serverseitig — Drift-Risiko. **Mitigation**: serverseitige Zod-Validation ist authoritative, clientseitig nur UX-Hilfe.
- **R-104-6** Backfill Bestand-Partner-Tenants koennte fehlschlagen wenn Trigger `check_partner_client_mapping_tenant_kinds` aus SLC-101 unerwartete Side-Effects hat. **Mitigation**: Backfill betrifft nur `partner_branding_config`, nicht `partner_client_mapping` — Trigger nicht relevant.

## Cross-Refs

- DEC-106 (CSS-Custom-Properties via Server-Side Inline-Style)
- DEC-108 (Pflicht-Footer hardcoded)
- DEC-109 (RPC SECURITY DEFINER best-effort lesbar)
- MIG-034 / Migration 091
- FEAT-044 (Spec)
- ARCHITECTURE.md V6-Sektion (Data Flow C — Branding-Resolution)
- V5.1 SLC-091 (Storage-Proxy-Pattern, RPC-Pattern)
- V5.1 DEC-099 (RPC-basierter RLS-Check Pattern)
- feedback_no_browser_supabase (alle DB-Calls ueber Server)

## Dependencies

- **Pre-Conditions**: SLC-101 done + Migration 090 LIVE (Schema + Rolle + `partner_organization` Tabelle, weil partner_branding_config 1:1 FK darauf hat).
- **Soft-Pre-Condition**: SLC-102 done (Partner-Dashboard existiert als Einsprungspunkt fuer Branding-UI). Branding-UI kann theoretisch auch ohne SLC-102 laufen, aber ohne Partner-Dashboard kein Zugang.
- **Soft-Pre-Condition**: SLC-103 done (Mandanten-Dashboard existiert als Verifikations-Punkt fuer Branding-Sichtbarkeit). Branding-Resolver funktioniert auch ohne, aber Live-Smoke braucht einen Mandanten.
- **Blockt**: SLC-105 (Diagnose-Bericht-Renderer respektiert Branding — soft, koennte auch ohne).
- **Wird nicht blockiert von**: SLC-106 Lead-Push (unabhaengig).
