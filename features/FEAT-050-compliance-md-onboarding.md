# FEAT-050 — docs/COMPLIANCE.md Onboarding-Plattform

**Version:** V6.2 Compliance-Sprint
**Status:** planned
**Created:** 2026-05-15
**Backlog-Item:** BL-103

## Purpose

Strukturierte DSGVO-Compliance-Dokumentation der Onboarding-Plattform als technische Standardvorlage. Beschreibt **wie** das System personenbezogene Daten verarbeitet. Vorlage fuer Anwalts-Review + Referenz im AVV (FEAT-049). Pattern-Reuse aus Business-System V5.2 `docs/COMPLIANCE.md`.

## In Scope (8 Sektionen analog BS V5.2)

1. **Erhobene personenbezogene Daten** — pro Tenant-Klasse:
   - `direct_client` (V1-V4-Pfad): GF, Mitarbeiter-Profile, Capture-Daten
   - `partner_organization` (V6): Partner-Admin, Partner-Branding-Config
   - `partner_client` (V6): Mandanten-tenant_admin, Mandanten-Mitarbeiter, Capture-Daten via Partner-Funnel
   - Cross-Cutting: Auth-User (email, profile.display_name, sidebar-Cookie), Walkthrough-Aufzeichnungen, AI-Job-Audit
2. **Datenfluesse pro Quelle** — Self-Signup (V7-zukuenftig), Magic-Link-Invite (V4.2), Capture-Session-Submit, Walkthrough-Upload-Pipeline (V5), Lead-Push opt-in (V6 FEAT-046), Onboarding-Tenant-Reminder-Cron (V4.2)
3. **Speicherorte + Regionen** — alles EU per `data-residency.md`:
   - Hetzner Cloud Frankfurt (Onboarding-Server 159.69.207.29)
   - AWS Bedrock eu-central-1 (LLM-Calls fuer Verdichtung, Diagnose, Walkthrough-Pipeline)
   - Azure Whisper EU (Walkthrough-Transkription)
   - IONOS SMTP (Reminder + Magic-Link)
4. **Retention-Policies** — Walkthrough 30-Tage-Cleanup-Cron (V5), capture_session tenant-lifecycle, ai_jobs Standard-Retention, lead_push_audit-Trail unbegrenzt (Audit-Pflicht), Sentry/Logs N/A (keine Tracking-Pipeline)
5. **Drittanbieter-Liste mit DPA-Status** — AWS, Azure, IONOS, Hetzner, ggf. Cal.com bei V4.1-Integration
6. **Auftragsverarbeitungsvertraege (DPA-Status)** — Strategaize↔Drittanbieter (Standard-DPAs der Cloud-Provider), Strategaize↔Partner-Kanzleien (FEAT-049 als Standard-Template)
7. **Loeschkonzept** — Tenant-Delete-Kaskade via FK-CASCADE (`tenants` -> `capture_session` -> `block_session` etc.), RLS-isoliert, Walkthrough-Storage-Cleanup parallel
8. **Datenschutzkonforme Defaults** — RLS by Default (Defense-in-Depth), keine PII in Logs, SECURITY DEFINER mit explicit search_path (IMP-507), Privacy-Pflicht-Checkbox (DEC-091)

## Out of Scope V6.2

- Englische Variante (Anwalt-pruefende Stelle bekommt DE).
- Detail-DPO-Bestellung-Pruefung (Sektion deklariert: keine DPO-Pflicht bei aktueller Org-Groesse, falls falsch → Anwalts-Review klaert).
- Pro-Partner-konfigurierbare Compliance-Variationen.

## Constraints

- Pattern-Reuse aus `c:/strategaize/strategaize-business-system/docs/COMPLIANCE.md` (V5.2-Stand) — Struktur direkt portieren, Inhalt komplett neu.
- Disclaimer "keine Rechtsberatung — Anwalts-Pruefung erforderlich" prominent.
- Konsistent zu `docs/DECISIONS.md` (V6-DECs 100-113 + V6.1-DECs 114+115 referenzieren wo relevant).
- Konsistent zu `data-residency.md`-Rule.

## Architecture Decisions (entschieden in /architecture V6.2, RPT-266)

- **DEC-121** — Keine DPO-Bestellung fuer Strategaize Transition BV in V6.2. Begruendung explizit in `docs/COMPLIANCE.md` Sektion 9 deklarieren: keine umfangreiche Verarbeitung Art. 37(1)(b), keine besonderen Kategorien Art. 9, keine systematische Verhaltensbeobachtung, kleine Org-Groesse. Anwalts-Review (BL-104) prueft Einschaetzung final.
- **Sektion-Struktur**: 8 Standardsektionen analog Business-System V5.2-Pattern + 1 V6.2-spezifische DPO-Bewertungs-Sektion (Sektion 9, neu vs. BS V5.2).
- **Cross-Links zu DECISIONS.md**: COMPLIANCE.md verweist auf konkrete V6-DECs (DEC-100..113), V6.1-DECs (DEC-114, DEC-115), V6.2-DECs (DEC-116..121), wo relevant. Konsistent zu `data-residency.md`-Rule.
- **TOMs-Sektion** dient als kanonische Quelle fuer die TOMs-Referenz in den AVV-Vorlagen (FEAT-049) — keine Doppelung der Subunternehmer-Liste in AVV-Files.

## Success Criteria

- `docs/COMPLIANCE.md` deckt alle 8 Standardsektionen analog BS V5.2 ab
- Inhalt ist Multi-Tenant-SaaS-spezifisch (nicht copy/paste-Internal-Tool)
- Disclaimer "keine Rechtsberatung" prominent
- Cross-Links zu `docs/DECISIONS.md` + `data-residency.md` korrekt
- Anwalts-Review-bereit (gut strukturiert, vollstaendig, klar)
