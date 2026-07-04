# SLC-182 — Berater-Workspace-Shell + Gate + Nav

- Feature: FEAT-099 · Backlog: BL-525 · Version: V10.2
- Parallel-Group: 1 (muss zuerst — trägt SLC-183 + SLC-184) · MIG: keine · Repo: OP (Frontend)
- Status: planned · Dependency: keine
- Quelle: /architecture V10.2 DEC-257 (RPT-563)

## Ziel
Die **Hybrid-Workspace-Shell** unter `/admin/mein-tag` aufsetzen: strategaize_admin-gated Route + Layout (Berichts-Buttons oben · Frage-Box Text+Sprache mitte · Antwort-Fenster unten), zunächst als Gerüst mit Empty/Loading/Error-States, ohne Live-Daten. Keine Widget-Karten (KI-Workspace-Muster [[feedback_ki_workspace_pattern]]).

## Scope
- IN: neue Admin-Page (Gate-Reuse `admin/layout.tsx`), AdminSidebar-NAV_ITEM, Shell-Komponente + Scaffold-Komponenten (ReportButtons/QuestionBox/AnswerPanel) mit States. Mandanten-Selector-Slot (leer, befüllt in SLC-184).
- OUT: Live-Bericht-Daten (SLC-183), RAG/Whisper (SLC-184), KI-Kurzfazit (SLC-183).

## Abnahme (AC)
- AC-182-1: `/admin/mein-tag` rendert nur für `strategaize_admin`; `tenant_admin`/andere → redirect `/dashboard` (Gate-Reuse `src/app/admin/layout.tsx:27`, kein neuer Auth-Pfad).
- AC-182-2: Hybrid-Layout sichtbar: Berichts-Button-Reihe oben, Frage-Box mitte (Text-Input + Sprach-Button-Slot), Antwort-Fenster unten. Keine klassischen KPI-/Widget-Karten.
- AC-182-3: Empty/Loading/Error-States pro Zone vorhanden (statisch/stub).
- AC-182-4: NAV_ITEM `/admin/mein-tag` in AdminSidebar; `/admin/tenants` unverändert.
- AC-182-5: `tsc` 0, `eslint` 0, `next build` PASS; Browser-Smoke (Render + Gate-Redirect + 0 Console-Errors).

## Micro-Tasks

#### MT-1: AdminSidebar-NAV_ITEM
- Goal: `/admin/mein-tag` als ersten Nav-Eintrag ergänzen.
- Files: `src/components/admin-sidebar.tsx`
- Expected: neuer Link im NAV_ITEMS-Array; /admin/tenants bleibt.
- Verification: `next build` PASS; Link sichtbar in Admin-Sidebar.
- Dependencies: keine

#### MT-2: Workspace-Page (Gate) + Shell
- Goal: Server-Component-Page unter dem bestehenden Admin-Gate + Shell-Layout.
- Files: `src/app/admin/mein-tag/page.tsx`, `src/components/workspace/WorkspaceShell.tsx`
- Expected: Page unter `admin/layout.tsx`-Gate; WorkspaceShell rendert 3-Zonen-Hybrid-Layout.
- Verification: Browser-Smoke — als strategaize_admin sichtbar, als anderer Rolle Redirect /dashboard.
- Dependencies: keine

#### MT-3: Scaffold-Komponenten (States)
- Goal: ReportButtons + QuestionBox + AnswerPanel als Client-Komponenten mit Empty/Loading/Error-States (stub).
- Files: `src/components/workspace/ReportButtons.tsx`, `src/components/workspace/QuestionBox.tsx`, `src/components/workspace/AnswerPanel.tsx`
- Expected: Buttons-Reihe (Platzhalter für 5 Berichte), Text-Input + Sprach-Button-Slot, Antwort-Panel mit Empty/Loading/Error.
- Verification: Browser-Smoke — alle 3 Zonen rendern, States umschaltbar (stub).
- Dependencies: MT-2

## Risiken / Dependencies
- R-182-1: Cross-Tenant-Reads (SLC-183/184) brauchen `createAdminClient` nach Gate — hier nur Shell, kein service-role-Pfad. Kein BYPASSRLS in diesem Slice.
- Trägt SLC-183 + SLC-184 (deren Komponenten erweitern QuestionBox/AnswerPanel/ReportButtons).
