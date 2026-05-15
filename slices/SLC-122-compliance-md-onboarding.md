# SLC-122 — docs/COMPLIANCE.md Onboarding-Plattform (FEAT-050)

## Goal

**Compliance-Foundation-Doku** als erster V6.2-Slice. Erzeugt `docs/COMPLIANCE.md` als strukturierte technische DSGVO-Compliance-Dokumentation der Onboarding-Plattform mit 8 Standardsektionen analog Business-System V5.2 + 1 V6.2-spezifische DPO-Bewertungs-Sektion (DEC-121).

Dieser Slice liefert die **kanonische Quelle fuer TOMs und Subunternehmer**, auf die SLC-121 (AVV-Templates) und V6.3+ verweisen. Reine Doku-Aenderung, kein Code, keine DB-Migration.

## Feature

FEAT-050 (docs/COMPLIANCE.md Onboarding-Plattform).

**Pattern-Reuse:**
- `c:/strategaize/strategaize-business-system/docs/COMPLIANCE.md` (V5.2-Stand) als Struktur-Vorbild — 8 Standardsektionen 1:1 portieren, Inhalt komplett neu auf Multi-Tenant-SaaS-Reality der Onboarding-Plattform.
- `data-residency.md`-Rule als Anker fuer Speicherort- und Anbieter-Liste.
- DEC-091 (Privacy-Pflicht-Checkbox), DEC-099 (RPC-SECURITY-DEFINER-Pattern), DEC-108 (Pflicht-Footer hardcoded) als referenzierte Defaults.

## In Scope

### Sektion-Struktur (8+1 Sektionen)

`docs/COMPLIANCE.md` enthaelt:

1. **Erhobene personenbezogene Daten** — pro Tenant-Klasse:
   - `direct_client` (V1-V4-Pfad): GF, Mitarbeiter-Profile, Capture-Daten, Mirror-Profile, Block-Sessions
   - `partner_organization` (V6): Partner-Admin-User, Partner-Branding-Config-Stammdaten
   - `partner_client` (V6): Mandanten-tenant_admin, Mandanten-Mitarbeiter, Capture-Daten via Partner-Funnel
   - Cross-Cutting: Auth-User (email, profile.display_name, sidebar:state-Cookie), Walkthrough-Aufzeichnungen, AI-Job-Audit, Lead-Push-Consent + Audit-Trail
2. **Datenfluesse pro Quelle** — Self-Signup (V7+ pending), Magic-Link-Invite (V4.2), Capture-Session-Submit, Walkthrough-Upload-Pipeline (V5), Lead-Push opt-in (V6 FEAT-046), Onboarding-Tenant-Reminder-Cron (V4.2). Pro Quelle: Erhebungsweg, Rechtsgrundlage (DSGVO Art. 6), Speicherort.
3. **Speicherorte + Regionen** — alles EU per `data-residency.md`:
   - Hetzner Cloud Frankfurt (Onboarding-Server `159.69.207.29`)
   - AWS Bedrock `eu-central-1` (LLM-Calls fuer Verdichtung, Diagnose, Walkthrough-Pipeline)
   - Azure Whisper EU (Walkthrough-Transkription)
   - IONOS SMTP DE (Reminder + Magic-Link-Versand via Supabase-Auth-SMTP, DEC-056)
4. **Retention-Policies** — Walkthrough 30-Tage-Cleanup-Cron (V5 DEC-093), capture_session tenant-lifecycle, ai_jobs Standard-Retention, lead_push_audit-Trail unbegrenzt (Audit-Pflicht), Sentry/Logs N/A (keine Tracking-Pipeline aktiv).
5. **Drittanbieter-Liste mit DPA-Status** — AWS, Azure, IONOS, Hetzner, ggf. Cal.com (V4.1, falls aktiv). Pro Anbieter: Dienstleistung, Region, Standard-DPA-Link, Aktualitaets-Datum.
6. **Auftragsverarbeitungsvertraege (DPA-Status)** — Strategaize↔Drittanbieter (Standard-DPAs der Cloud-Provider) + Strategaize↔Partner-Kanzleien (FEAT-049 als Standard-Template) + Strategaize↔Direct-Clients (V1-V4-Pfad: Rechtsgrundlage Vertrag).
7. **Loeschkonzept** — Tenant-Delete-Kaskade via FK-CASCADE (`tenants` → `capture_session` → `block_session` → `knowledge_unit` etc.), RLS-isoliert, Walkthrough-Storage-Cleanup parallel. Hinweis auf V6 Voll-Restore-Limit (DEC-103) und V7+-Backlog fuer selektiven Tenant-Restore.
8. **Datenschutzkonforme Defaults** — RLS by Default (Defense-in-Depth), keine PII in Logs, SECURITY DEFINER mit explicit search_path (IMP-507), Privacy-Pflicht-Checkbox (DEC-091), Pflicht-Footer hardcoded (DEC-108), keine non-essentielle Cookies aktiv (gegrept: nur `sidebar:state` functional).
9. **DPO-Bewertung (V6.2-spezifisch, DEC-121)** — explizite Klausel: Strategaize Transition BV bestellt aktuell keinen DPO. Begruendung: keine umfangreiche Verarbeitung i.S.v. Art. 37(1)(b), keine besonderen Kategorien Art. 9, keine systematische Verhaltensbeobachtung, kleine Org-Groesse. Anwalts-Review (BL-104) klaert finale Einschaetzung.

### Disclaimer + Cross-Links

- Prominenter Disclaimer ganz oben: "keine Rechtsberatung — pragmatische technische Standardvorlage, Anwalts-Pruefung erforderlich vor erstem echten Live-Partner".
- Verantwortlicher: **Strategaize Transition BV** (NL-Operativ, Domain-Inhaber `onboarding.strategaizetransition.com`).
- Cross-Links: zu `docs/DECISIONS.md` (relevante DECs DEC-091, DEC-100..113, DEC-114, DEC-115, DEC-116..121), zu `docs/ARCHITECTURE.md` (V6, V6.1, V6.2-Sections), zu `data-residency.md`-Rule.
- Versionierung im Header: "Stand: 2026-05-15 (V6.2-Release)".

## Out of Scope

- **Englische Variante** der COMPLIANCE.md — Anwalts-pruefende Stelle bekommt DE-Original.
- **Detail-DPO-Bestellung-Prozess** — DEC-121 deklariert nur die Klausel. Falls Anwalt DPO-Pflicht bestaetigt: V6.3 oder V7 nimmt Bestellungs-Prozess auf.
- **Pro-Partner-konfigurierbare Compliance-Variationen** — V7+.
- **Anwalts-Review-Ausfuehrung** — User-Pflicht (BL-104), nicht Teil des Slices.
- **PDF-Konvertierung** — Markdown bleibt das Quellformat.

## Acceptance Criteria

| AC | Beschreibung |
|---|---|
| AC-1 | `docs/COMPLIANCE.md` existiert mit Header (Verantwortlicher, Stand, Disclaimer, Inhaltsverzeichnis). |
| AC-2 | Alle 8 Standardsektionen analog Business-System V5.2 vorhanden und mit Onboarding-Plattform-spezifischem Inhalt befuellt (NICHT copy/paste Business-System-Internal-Tool-Beschreibung). |
| AC-3 | Sektion 9 "DPO-Bewertung (V6.2)" enthaelt DEC-121-Klausel mit allen 4 Begruendungs-Punkten (keine umfangreiche Verarbeitung, keine besonderen Kategorien, keine systematische Beobachtung, kleine Org-Groesse). |
| AC-4 | Sektion 3 "Speicherorte" listet alle 4 Provider mit Region (Hetzner Frankfurt, AWS Bedrock eu-central-1, Azure Whisper EU, IONOS SMTP DE) konsistent zu `data-residency.md`. |
| AC-5 | Sektion 1 "Erhobene Daten" unterscheidet `direct_client`, `partner_organization`, `partner_client` als drei Tenant-Klassen (Multi-Tenant-SaaS-spezifisch, nicht Internal-Tool-Beschreibung). |
| AC-6 | Cross-Links zu DECISIONS.md (mind. DEC-091, DEC-099, DEC-108, DEC-121) + ARCHITECTURE.md + `data-residency.md`-Rule technisch korrekt (relative Pfade funktionieren). |
| AC-7 | Disclaimer "keine Rechtsberatung — Anwalts-Pruefung erforderlich" prominent in Header. |
| AC-8 | Datei ist Markdown-valide (kein gebrochener Renderer-State; pruefbar via VS Code Markdown-Preview). |
| AC-9 | Sektion 6 "DPA-Status" listet sowohl Drittanbieter-DPAs als auch Strategaize↔Partner-Kanzleien-Template-Referenz (Cross-Link auf FEAT-049 / SLC-121). |
| AC-10 | TOMs-Beschreibung in Sektion 8 ist so strukturiert, dass SLC-121 AVV-Vorlagen darauf cross-linken koennen (statt eigene TOMs-Liste in AVV zu duplizieren). |

## Micro-Tasks

### MT-1: COMPLIANCE.md Skelett + Header + Sektionen 1-4

- Goal: Datei anlegen, Header (Disclaimer, Verantwortlicher, Stand, Inhaltsverzeichnis), Projektkontext-Abschnitt, Sektionen 1-4 (Erhobene Daten, Datenfluesse, Speicherorte, Retention) befuellen.
- Files: `docs/COMPLIANCE.md` (NEU).
- Expected behavior: Strukturierte Markdown-Datei mit Sektionen 1-4 vollstaendig. Tenant-Klassen `direct_client` / `partner_organization` / `partner_client` als Unter-Abschnitte in Sektion 1. Datenfluesse aus realer Architektur (Magic-Link-Invite V4.2, Capture-Submit, Walkthrough-Pipeline V5, Lead-Push V6). Speicherorte aus `data-residency.md` zitiert. Retention-Policies aus DEC-093 (Walkthrough), DEC-091 (Privacy-Default) etc.
- Verification: Markdown-Preview rendert sauber, alle 4 Sektionen vorhanden, kein Platzhalter-Text uebrig.
- Dependencies: keine.

### MT-2: COMPLIANCE.md Sektionen 5-9 + Cross-Links + Outline-Check

- Goal: Sektionen 5 (Drittanbieter-Liste mit DPA-Status), 6 (Auftragsverarbeitungsvertraege), 7 (Loeschkonzept), 8 (Datenschutzkonforme Defaults), 9 (DPO-Bewertung V6.2-spezifisch DEC-121) ergaenzen. Cross-Links zu DECISIONS.md, ARCHITECTURE.md, `data-residency.md`-Rule einbauen und durchklicken.
- Files: `docs/COMPLIANCE.md` (Erweiterung der MT-1-Datei).
- Expected behavior: Vollstaendige 9-Sektionen-Datei. Loeschkonzept dokumentiert FK-CASCADE-Kaskade konkret (`tenants` → `capture_session` → ...). Sektion 8 referenziert DEC-091/099/108 + IMP-507. Sektion 9 enthaelt DEC-121-Klausel mit 4 Begruendungs-Punkten. TOMs-Beschreibung in Sektion 8 als Cross-Ref-Quelle fuer SLC-121 AVV strukturiert. Alle internen Links funktionieren (relative Pfade `../docs/...`, `../.claude/rules/...`).
- Verification: VS Code Markdown-Preview komplett, alle Cross-Links anklickbar, kein toter Anker. Eine Lese-Iteration durch die Datei mit Aufmerksamkeit auf "ist das Anwalts-Review-bereit" (gut strukturiert, vollstaendig, klar).
- Dependencies: MT-1.

## Rollback-Pfad

- Reine Doku-Aenderung. Revert via `git revert <commit>` falls Inhalt grob falsch ist. Kein DB-Effect, kein UI-Effect.

## DEC-Cross-References

- **DEC-121** — Keine DPO-Bestellung, Klausel in Sektion 9 deklariert.
- **DEC-091** — Privacy-Pflicht-Checkbox als Datenschutzkonformer Default in Sektion 8.
- **DEC-099** — RPC-SECURITY-DEFINER-Pattern (Walkthrough-Storage-Proxy) in Sektion 8.
- **DEC-108** — Pflicht-Footer hardcoded in Sektion 8.
- **DEC-093** — Walkthrough 30-Tage-Cleanup-Cron in Sektion 4.
- **DEC-103** — V6 Voll-Restore-Limit in Sektion 7 (Hinweis auf V7+-Backlog).
- **IMP-507** — SECURITY DEFINER mit explicit search_path in Sektion 8.

## Pattern-Reuse-Quellen

- `c:/strategaize/strategaize-business-system/docs/COMPLIANCE.md` — Struktur-Vorbild, Inhalt KOMPLETT neu.
- `c:/strategaize/strategaize-dev-system/.claude/rules/data-residency.md` — Anbieter+Region-Liste.
- `c:/strategaize/strategaize-onboarding-plattform/docs/DECISIONS.md` — DEC-091..121.
- `c:/strategaize/strategaize-onboarding-plattform/docs/ARCHITECTURE.md` — V6, V6.1, V6.2-Sections.

## Estimated Effort

~30-45 Min reines Schreiben (zwei Micro-Tasks, MT-1 ~20min Skelett+1-4, MT-2 ~15min 5-9 + Cross-Links). Anwalts-Lese-Review nicht enthalten (User-Pflicht BL-104).
