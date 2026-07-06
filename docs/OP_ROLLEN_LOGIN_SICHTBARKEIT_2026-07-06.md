# Rollen, Logins & Sichtbarkeit — Status Quo → Soll

**Onboarding-Plattform · Stand 2026-07-06 (Code-Stand `main` @ cc9fd92, V10.2.1 live)**

Founder-Auftrag: "Welche Login-Tiefen gibt es? Welche Varianten? Wer bekommt was zu Gesicht, was ist Sinn und Zweck jedes Logins, was kann/soll er — und was nicht?" Erst Status Quo aus dem Code, dann Abgleich mit dem Geschäftsmodell. Basis: 5 parallele Code-Sweeps (Rollen-Modell, Routen-Gates, Login-Wege, RLS-Policies, API-Gates) über den kompletten OP-Code.

---

## 1. Das Wichtigste in 6 Sätzen

1. Es gibt **5 aktive Rollen** (`strategaize_admin`, `tenant_admin`, `tenant_member`, `employee`, `partner_admin`) und **einen einzigen Login** (`/login`, E-Mail + Passwort) — die "Login-Tiefe" entsteht NICHT durch verschiedene Logins, sondern durch die Rolle im Profil, die nach dem Login automatisch auf den richtigen Bereich weiterleitet.
2. Das Founder-Gefühl "falsch eingeloggt" hat eine konkrete Code-Ursache: Ein **GF-Login (tenant_admin) darf in den `/admin/*`-Bereich** und sieht dort eine abgespeckte Shell — dieselben URLs bedeuten je nach Rolle völlig verschiedene Dinge (Delta D1).
3. Der **StB hat heute nur EINEN Bereich** (partner_admin = Mandanten-Übersicht + Stammdaten/Branding). Das Founder-Modell verlangt ZWEI: eigener Kanzlei-Bereich (ausfüllen) + Berater-Workspace (Mandanten betreuen). Ein User kann aber nur EINE Rolle + EINEN Tenant haben → ein StB bräuchte heute **zwei getrennte Logins mit zwei E-Mail-Adressen** (Delta D2 — größtes strukturelles Delta).
4. Der **kostenlose Test** ist der Self-Signup-Weg (V7): Interessent trägt sich über die Intelligence-Plattform ein → wird automatisch **tenant_admin eines eigenen Mandanten-Tenants unter einem Partner** — er hängt also ausschließlich am StB-Strang, einen Test-Einstieg für den Direkt-Strang (Exit-Ready ohne StB) gibt es nicht (D9).
5. **"Mein Tag"** (V10.2) ist strikt strategaize_admin-only — für Produkt 2 (Berater-Workspace) braucht der StB später genau so eine Übersicht über SEINE Mandanten; die RLS-Grundlage dafür existiert bereits, die UI nicht (D3).
6. Die Absicherung selbst ist solide (3 Schichten: Middleware-Matrix → Layout-Gates → Seiten-Re-Gates; 52 Tabellen mit RLS; 37 API-Routen konsistent gegated) — das Problem ist nicht Sicherheit, sondern **Vermischung und fehlende Trennschärfe der Bereiche**.

---

## 2. Die 5 Rollen (Status Quo)

Definiert als CHECK-Constraint auf `profiles.role` (`sql/schema.sql:38`, erweitert durch Migration 065 + 090). Jeder User hat genau EINE Rolle und (außer strategaize_admin) genau EINEN Tenant.

| Rolle | Wer ist das (heute) | Tenant-Bindung | Landet nach Login auf | Zweck heute |
|---|---|---|---|---|
| `strategaize_admin` | Founder / Strategaize-Team | KEINE (tenant_id NULL, cross-tenant) | `/admin/tenants` | Betreibt die Plattform: alle Mandanten, Reviews, Debrief, Partner-Verwaltung, Mein Tag |
| `tenant_admin` | **GF / Inhaber eines Mandanten** (Direktkunde ODER Mandant unter StB ODER Test-Nutzer) | 1 Tenant | `/dashboard` | Füllt das eigene Unternehmen aus: Erhebungen starten, Mitarbeiter einladen, Handbuch, Diagnose, Bridge |
| `tenant_member` | Weiterer Nutzer im Mandanten-Unternehmen | 1 Tenant | `/dashboard` | Read-only-Mitblick ins Dashboard (kaum genutzt, Abgrenzung zu employee unscharf → D8) |
| `employee` | **Mitarbeiter des Mandanten** mit eigenen Erhebungs-Aufgaben | 1 Tenant | `/employee` | Beantwortet zugewiesene Capture-Sessions + Walkthroughs; sieht NUR eigene Aufgaben (`owner_user_id`) |
| `partner_admin` | **Steuerberater / Partner-Kanzlei** | 1 Partner-Tenant | `/partner/dashboard` | Verwaltet Kanzlei-Stammdaten/Branding, lädt Mandanten ein, sieht Mandanten-Daten read-only |

**Alt-Reste im Code (Aufräum-Kandidaten):**
- `tenant_owner` — Rolle wurde in Migration 026 abgeschafft, steht aber noch in RLS-Policies aus Migration 022/031/124 (`IN ('tenant_admin','tenant_owner',…)`) — funktional tot, aber verwirrend.
- `mirror_respondent` — Legacy-Rolle in `requireTenant()` (`src/lib/api-utils.ts`) und im Invite-API ("mirror"), existiert NICHT im CHECK-Constraint — toter Pfad.

**Tenant-Typen** (`tenants.tenant_kind`, Migration 090): `direct_client` (Direktkunde), `partner_organization` (StB-Kanzlei), `partner_client` (Mandant unter StB, mit `parent_partner_tenant_id`).

---

## 3. Alle Wege in die Plattform (Login-Varianten)

| # | Weg | Entry-Point | Wer nutzt ihn | Was entsteht | Rolle danach |
|---|---|---|---|---|---|
| 1 | **Passwort-Login** | `/login` | Alle Bestandsnutzer | Session; kein neuer User | bestehende |
| 2 | **Admin-/Team-Invite** | E-Mail-Link → `/accept-invitation/[token]` → Passwort setzen | strategaize_admin lädt beliebig ein; tenant_admin lädt Mitarbeiter ein; partner_admin lädt Mandanten-GF ein | User + Profil (Trigger `handle_new_user`), Rolle aus `role_hint` | `employee` (Default), `tenant_admin` oder `partner_admin` |
| 3 | **Self-Signup / kostenloser Test** (V7) | Intelligence-Plattform ruft serverseitig `POST /api/public/signup` (Service-Key) → Verify-Mail → `/auth/verify-signup` → Magic-Link → `/auth/set-password` | Interessent über Partner-Landingpage | Kompletter neuer Tenant (`partner_client` unter dem Partner) + User + `partner_client_mapping` | `tenant_admin` des neuen Tenants |
| 4 | **Partner-Gründung** | `/admin/partners/new` (Form) + anschließender partner_admin-Invite (Weg 2) | Nur strategaize_admin | Tenant (`partner_organization`) + `partner_organization`-Row; StB-Admin per Invite | `partner_admin` |
| 5 | **Auth-Callback** | `/auth/callback?token_hash=…&type=invite\|magiclink` | technische Achse aller Link-Klicks | Session-Cookie (verifyOtp) | — |

**Lücke:** Einen **Passwort-Vergessen-Weg gibt es nicht** — keine Reset-Seite, kein Reset-Flow im Code (D7). Vor jedem Testlauf mit externen StBs ein praktischer Blocker.

---

## 4. Schutz-Architektur (wie die Sichtbarkeit technisch erzwungen wird)

Drei Schichten übereinander, dahinter RLS auf der Datenbank:

1. **Middleware-Matrix** — `src/proxy.ts` (Next-16-Middleware) → `src/lib/supabase/middleware.ts` + `src/lib/auth/role-check.ts`. Pro Pfad-Klasse ist definiert, welche Rolle rein darf (durch `role-check.test.ts` als Test-Matrix abgesichert):
   - `/admin/*` → strategaize_admin **und tenant_admin**
   - `/partner/*` → partner_admin + strategaize_admin
   - `/dashboard/*` → tenant_admin, tenant_member, strategaize_admin
   - `/capture/*` → tenant_admin, tenant_member
   - `/employee/*` → NUR employee
2. **Layout-Gates** — `admin/layout.tsx:27` (strategaize_admin ODER tenant_admin; tenant_admin bekommt die reduzierte `TenantAdminShell`, strategaize_admin die volle `AdminSidebar`), `partner/layout.tsx:46` (nur partner_admin), `employee/layout.tsx:44` (nur employee), `dashboard/stb/layout.tsx:15` (Feature-Flag `NEXT_PUBLIC_ENABLE_STB_VERTIKALE`, aktuell OFF).
3. **Seiten-Re-Gates** — einzelne Admin-Seiten verschärfen auf strategaize_admin-only: `/admin/mein-tag`, `/admin/tenants`, `/admin/reviews`, `/admin/audit/bulk-email` (je `page.tsx`, Redirect `/dashboard`).

**Datenbank:** 52 Tabellen mit RLS; Muster überall gleich: `strategaize_admin` = full, Tenant-Rollen = nur eigener Tenant, `employee` = nur eigene Sessions (`owner_user_id`), `partner_admin` = read-only auf Mandanten-Daten via `partner_client_mapping` mit `invitation_status='accepted'` (Migration 090). Diagnose + SOP seit Migration 078 bewusst NUR tenant_admin (nicht member/employee). **API-Seite:** 37 Routen + ~25 Server-Actions konsistent gegated (requireAdmin / assertStrategaizeAdmin / Tenant-Match / Cron-Secret / Service-Key); keine ungeschützten Routen gefunden.

---

## 5. Die Matrix: Rolle × sieht × kann × kann nicht

### strategaize_admin (Founder / Strategaize-Team)
- **Login:** `/login` → `/admin/tenants`
- **Sieht (UI):** kompletten `/admin`-Bereich: Mein Tag, Tenants (+Reviews/Walkthroughs pro Tenant), Partner-Verwaltung, Reviews, Debrief, Funnel-Analytics, Text-Overrides, Helper-Texts, Handbuch, Audit Bulk-Email, Bridge, Dialogue/Meeting-Guide, Team. Kann zusätzlich in jedes `/dashboard` (Demo-Modus, wenn ihm ein tenant_id zugewiesen ist) und `/partner`-Pfade.
- **Sieht (Daten):** ALLES, cross-tenant (RLS `admin_full` auf jeder Tabelle; service-role-Aggregation nach Gate, z.B. Mein Tag).
- **Kann:** Mandanten + Partner anlegen/löschen, alle einladen, Reviews/Debrief freigeben, Tier setzen, RAG befragen (Mein Tag), alles auditieren.
- **Kann nicht / Lücke:** Es gibt keine zweite, schwächere Strategaize-Rolle — jeder Strategaize-Mitarbeiter mit Zugang wäre automatisch "Founder-Level" (→ D4).
- **Zweck:** Plattform-Betrieb + Beratungsarbeit AM Kunden (Produkt-1-Rückseite).

### tenant_admin (GF / Inhaber — Direktkunde, StB-Mandant oder Test-Nutzer)
- **Login:** `/login` → `/dashboard` (bzw. Invite/Self-Signup-Ersteinstieg)
- **Sieht (UI):** Dashboard-Cockpit (bei `partner_client` erst reduzierter Welcome-Block), Diagnose-Strecke, Handbuch, Reviews, Settings, Bulk-Email-Import, Erhebungen (`/capture/*`); dazu — **unter `/admin`-URLs!** — Team-Verwaltung (`/admin/team`), Bridge (`/admin/bridge`), Walkthrough-Übersicht, Handbuch-Trigger (`/admin/handbook`), gerendert in der `TenantAdminShell`. Bei Flag ON zusätzlich `/dashboard/stb/*` (StB-Fachmodule/Blueprint).
- **Sieht (Daten):** NUR eigenen Tenant (RLS überall `tenant_id = auth.user_tenant_id()`); als einzige Kunden-Rolle auch Diagnose-Berichte + SOPs (MIG-078).
- **Kann:** Erhebungen starten (`/capture/new` ist tenant_admin-only), Mitarbeiter einladen (employee-Invites), Handbuch-Snapshots triggern, Bridge ausführen, Diagnose anfordern, Reminder-Opt-out.
- **Kann nicht:** andere Tenants sehen, Partner-Funktionen, Mein Tag, Reviews freigeben (Strategaize-Hoheit).
- **Zweck:** das eigene Unternehmen erfassbar/exit-ready machen. **Dies wäre auch die Rolle, mit der ein StB seine EIGENE Kanzlei ausfüllt** (Strang a im Founder-Modell) — dafür bräuchte er aber einen eigenen Tenant + separaten Login (D2).

### tenant_member (weiterer Unternehmens-Nutzer)
- **Login:** `/login` → `/dashboard`
- **Sieht:** Dashboard + Capture read-only-artig (RLS: SELECT auf Sessions/Checkpoints/Knowledge des Tenants); KEINE Diagnose, KEINE SOPs (MIG-078), kein `/admin`, kein Team.
- **Kann:** mitlesen, an Erhebungen des Tenants mitwirken (kein Session-Start).
- **Zweck heute unscharf:** Der Invite-Weg vergibt die Rolle als Fallback ("zweiter User im Tenant"), aber das eigentliche Mitarbeiter-Konzept ist `employee`. → Entscheidung nötig (D8).

### employee (Mitarbeiter mit Erhebungs-Aufgaben)
- **Login:** `/login` (nach Invite durch tenant_admin) → `/employee`
- **Sieht:** NUR `/employee/*`: eigene zugewiesene Capture-Sessions + Walkthrough-Aufnahmen. Middleware blockiert aktiv `/dashboard`, `/admin`, `/capture`, `/partner`. Daten: nur Sessions mit `owner_user_id = auth.uid()` (MIG-075-Perimeter).
- **Kann:** zugewiesene Blöcke beantworten, Walkthroughs aufnehmen. Sonst nichts.
- **Zweck:** Wissens-Capture in der Breite der Belegschaft, ohne dem Mitarbeiter Firmen-Einblick zu geben. Sauberster Perimeter der Plattform.

### partner_admin (Steuerberater / Kanzlei)
- **Login:** `/login` (nach Invite durch Strategaize) → `/partner/dashboard`
- **Sieht (UI):** Partner-Dashboard, Mandanten-Liste (+ Mandant einladen), Stammdaten, Branding, Diagnose-Funnel-Analytics. Middleware blockiert `/admin`, `/dashboard`, `/capture`, `/employee`.
- **Sieht (Daten):** eigene Kanzlei-Org voll; von akzeptierten Mandanten read-only: capture_session, block_checkpoint, knowledge_unit, validation_layer (RLS via `partner_client_mapping`). **Aber:** für diese Daten-Sichtbarkeit gibt es kaum UI — keine Mandanten-Detail-/Drilldown-Seite ("wer hat was gemacht") (D5).
- **Kann:** Mandanten einladen/widerrufen (3-Phasen-Transaktion), Branding/Logo pflegen, Stammdaten ändern.
- **Kann nicht:** eigene Kanzlei als Unternehmen ausfüllen (kein Zugang zu `/dashboard` oder `/capture`!), keinen Berater-Workspace à la Mein Tag nutzen.
- **Zweck heute:** Vertriebs-/Verwaltungs-Hülle für den StB-Kanal. **Produkt 1 (read-only "wer hat was gemacht") ist datenbankseitig vorbereitet, aber UI-seitig nicht ausgebaut; Produkt 2 (Berater-Workspace) existiert nicht** (D3/D5).

---

## 6. Founder-Mental-Modell ↔ Code-Realität

| Founder-Modell | Code-Realität heute | Passt? |
|---|---|---|
| **Strategaize-Sicht:** sieht alles; aber nicht jeder Strategaize-Mitarbeiter alles (Founder ja) | Eine einzige Rolle `strategaize_admin` = immer alles. Keine Abstufung. | ⚠️ Teilweise — Abstufung fehlt (D4) |
| **StB Bereich (a): eigene Kanzlei ausfüllen**, mit Strategaize ausarbeiten; Produkt 1 = read-only-Einsicht wer was gemacht hat | Als partner_admin NICHT möglich (kein Dashboard-/Capture-Zugang). Möglich nur über einen ZWEITEN Login als tenant_admin eines eigenen Tenants. StB-Fachmodule (`/dashboard/stb/*`) sind gebaut, aber hinter Flag OFF. | ❌ Strukturelles Delta (D2, D10) |
| **StB Bereich (b): Berater-Workspace** — beraet SEINE Mandanten mit unserer Technologie, braucht Übersicht | Nur Mandanten-Liste + Analytics. Keine Workspace-Übersicht, kein Mandanten-Drilldown. RLS-Lesebasis existiert. | ❌ Nicht gebaut (D3, D5) |
| **GF-/Mandanten-Ebene für BEIDE Stränge** (Exit-Ready direkt + StB-Zusammenarbeit), kostenloser Test hängt da | tenant_admin deckt beide Stränge ab (`direct_client` vs `partner_client` — nur die Dashboard-Begrüßung unterscheidet sich). Kostenloser Test = Self-Signup, entsteht IMMER als partner_client → Direkt-Strang hat keinen Test-Einstieg. | ⚠️ Weitgehend, Test nur im StB-Strang (D9) |
| "Alles ein bisschen vermischt — sauber auseinanderziehen" | Kern-Vermischung: tenant_admin-Funktionen leben unter `/admin`-URLs (TenantAdminShell); tenant_member vs employee unscharf; Legacy-Rollen-Reste. | ✅ Befund bestätigt (D1, D6, D8) |
| Wer muss "Mein Tag" sehen? | Heute strikt strategaize_admin. Für Produkt 2 wäre eine partner-gescopte Variante (nur eigene Mandanten) die logische Ausbaustufe. | Entscheidung Founder (D3) |

---

## 7. Delta-Liste (Soll-Abweichungen, priorisiert)

| # | Delta | Schwere | Empfehlung |
|---|---|---|---|
| **D2** | StB kann nicht beides: eigene Kanzlei ausfüllen UND Mandanten betreuen — 1 User = 1 Rolle = 1 Tenant. Heute nur mit 2 Logins/2 E-Mail-Adressen machbar. | **Strukturell (Blocker für StB-Testlauf)** | Founder-Entscheidung: (Option A) bewusst 2 Logins dokumentieren als V1-Weg — sofort machbar, 0 Code; (Option B) Rollen-/Kontext-Switch bauen (User mit 2 Profilen o.ä.) — Architektur-Slice. Für den Founder-Selbst-Test reicht Option A. |
| **D1** | GF-Funktionen (Team, Bridge, Walkthroughs, Handbuch-Trigger) leben unter `/admin/*`-URLs in der TenantAdminShell — gleiche URLs, zwei Bedeutungen; Hauptquelle der "falsch eingeloggt"-Verwirrung. | Hoch (UX/Klarheit) | Mittelfristig: Routen unter `/dashboard/*` umziehen; kurzfristig: reicht Doku + klare Shell-Beschriftung. |
| **D7** | Kein Passwort-Vergessen-Flow. | Hoch (vor externem Testlauf) | Kleiner Slice; Pattern existiert im Strategaize-Fundus (supabase_password_reset). |
| **D3** | Kein Berater-Workspace für StB (Produkt 2); "Mein Tag" strategaize_admin-only. | Mittel (Produkt-Roadmap) | Später: "Mein Tag für Partner" partner-gescoped (RLS-Basis vorhanden); bewusst NACH Modul-Reife einplanen. |
| **D5** | Produkt 1 (read-only "wer hat was gemacht" für StB) hat RLS-Lesebasis, aber keine UI (kein Mandanten-Drilldown im Partner-Bereich). | Mittel | Eigener Slice: Mandanten-Detailseite unter `/partner/dashboard/mandanten/[id]`. |
| **D4** | Keine Strategaize-Mitarbeiter-Abstufung (nur die Allmacht-Rolle). | Mittel (erst bei Team-Wachstum) | Erst relevant, wenn zweiter Strategaize-Mitarbeiter Zugang braucht; dann `strategaize_member`-Rolle. |
| **D9** | Kostenloser Test nur als partner_client (Self-Signup braucht Partner-Slug); Direkt-Strang hat keinen Selbst-Einstieg. | Mittel (Geschäftsmodell) | Founder-Entscheidung: Ist der Test bewusst StB-gebunden? Wenn nein: Self-Signup ohne Partner (direct_client) als Folge-Slice. |
| **D8** | `tenant_member` vs `employee` unscharf; Invite-Fallback erzeugt tenant_member, das eigentliche Mitarbeiter-Modell ist employee. | Niedrig | Founder-Entscheidung: tenant_member deprecaten oder als "GF-Stellvertreter read-only" schärfen. |
| **D6** | Legacy-Reste: `tenant_owner` in RLS-Policies, `mirror_respondent` in `requireTenant()` + Mirror-Invite-Pfad. | Niedrig (Hygiene) | Aufräum-Slice bei nächster RLS-Migration mitnehmen; bis dahin: dokumentiert = entschärft. |
| **D10** | StB-Vertikale (`/dashboard/stb/*`) fertig gebaut, aber Flag OFF — der Inhalt von Strang (a) wartet auf Aktivierung. | Info | Flag-Enable ist bereits geplanter nächster Schritt nach dieser Doku (per Memory-Plan). |

---

## 8. Empfohlener Founder-Testplan (aus dem Status Quo abgeleitet)

1. **Selbst-Test Strang (a) "StB eigene Kanzlei":** eigenen Test-Tenant anlegen (als strategaize_admin unter `/admin/tenants`), sich selbst als tenant_admin mit zweiter E-Mail einladen, Flag `NEXT_PUBLIC_ENABLE_STB_VERTIKALE=true` setzen → als StB durch `/dashboard/stb/*` + Capture laufen. (= Option A aus D2, 0 Code nötig.)
2. **Selbst-Test Strang (b) "StB als Berater":** bestehenden Test-Partner nutzen bzw. unter `/admin/partners/new` anlegen, sich als partner_admin einladen (dritte E-Mail oder Test-Adresse), einen Test-Mandanten per Self-Signup-Strecke durchspielen → erleben, was der StB heute (nicht) sieht.
3. **Vor externem 2-3-StB-Testlauf:** D7 (Passwort-Reset) schließen, D1 mindestens per Anleitung entschärfen, D2-Entscheidung treffen.

---

*Quellen: 5 Explore-Sweeps über `src/app/**` (64 Pages, 37 API-Routen), `src/lib/auth/role-check.ts` + `src/lib/supabase/middleware.ts` (+ Test-Matrix `role-check.test.ts`), `sql/schema.sql` + `sql/rls.sql` + Migrationen 021–130, Login-/Invite-/Signup-Flows inkl. V7-Self-Signup. Einzelbelege (Datei:Zeile) im Sitzungsprotokoll.*
