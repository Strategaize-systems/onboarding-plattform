# DSGVO-Compliance-Dokumentation

> **Erstellt:** 2026-05-15 (V6.2-Release-Stand, SLC-122)
> **System:** Strategaize Onboarding-Plattform
> **Delivery Mode:** Multi-Tenant SaaS
> **Domain:** `onboarding.strategaizetransition.com`
> **Verantwortlicher:** Strategaize Transition BV (NL-Operativ) — Stammdaten siehe `/impressum`
> **Status:** Beschreibender Stand nach Abschluss V6.2 (Compliance-Sprint)
>
> **Hinweis:** Diese Dokumentation ist eine pragmatische technische Standardvorlage und stellt **keine Rechtsberatung** dar. Sie beschreibt, wie das System personenbezogene Daten technisch verarbeitet. Vor produktivem Einsatz mit echten Partner-Kanzleien oder Mandanten ist eine **anwaltliche Pruefung** durch eine qualifizierte Datenschutzbeauftragte/einen qualifizierten Datenschutzbeauftragten erforderlich (BL-104, pending nach /deploy V6.2).

---

## Inhaltsverzeichnis

1. [Erhobene personenbezogene Daten](#1-erhobene-personenbezogene-daten)
2. [Datenfluesse pro Quelle](#2-datenfluesse-pro-quelle)
3. [Speicherorte und Regionen](#3-speicherorte-und-regionen)
4. [Retention-Policies](#4-retention-policies)
5. [Drittanbieter-Liste](#5-drittanbieter-liste)
6. [Auftragsverarbeitungsvertraege (DPA-Status)](#6-auftragsverarbeitungsvertraege-dpa-status)
7. [Loeschkonzept](#7-loeschkonzept)
8. [Datenschutzkonforme Defaults](#8-datenschutzkonforme-defaults)
9. [DPO-Bewertung (V6.2-spezifisch)](#9-dpo-bewertung-v62-spezifisch)

---

## Projektkontext

Die **Strategaize Onboarding-Plattform** ist eine Multi-Tenant-SaaS-Plattform fuer strukturierte Wissenserhebung und KI-gestuetzte Verdichtung. Sie wird in drei Tenant-Klassen genutzt:

- **`direct_client`** (V1-V4-Pfad): Endkunde arbeitet direkt mit der Plattform, ohne Multiplikator-Partner. Ein Geschaeftsfuehrer-Account (`tenant_admin`) plus optional Mitarbeiter-Accounts (`tenant_member`).
- **`partner_organization`** (V6+): Multiplikator-Kanzlei (Steuerberater, M&A-Berater) mit einem Partner-Admin-Account (`partner_admin`), der eigene Mandanten in die Plattform einladen kann.
- **`partner_client`** (V6+): Mandant einer Partner-Kanzlei — strukturell wie `direct_client`, aber mit `parent_partner_tenant_id`-Bezug zur Partner-Organisation und Partner-Branding.

**Verantwortlich** fuer die Datenverarbeitung ist **Strategaize Transition BV** (NL-Operativ, KvK-Nummer + Adresse + Vertretungsberechtigter siehe `/impressum`). Die Plattform laeuft auf **Hetzner Cloud Frankfurt** (Server `159.69.207.29`), verwaltet ueber Coolify, mit Standard-Stack Next.js 16 + selbst-gehostetes Supabase. Datenresidenz ist **strikt EU** per `data-residency.md`-Rule (Strategaize-Dev-System).

Die Plattform unterstuetzt mehrere Capture-Modi (Fragebogen, Walkthrough, Diagnose-Werkzeug) und mehrere Templates (Exit-Readiness, Diagnose-Funnel, weitere). KI-first-Grundprinzip (DEC-004): Mensch (Berater) wirkt nur im definierten Meeting-Review-Punkt, nie waehrend der Wissenserhebung.

---

## 1. Erhobene personenbezogene Daten

Das System verarbeitet personenbezogene Daten ausschliesslich zur Steuerung von Wissenserhebungs-, Onboarding- und Vermittlungs-Prozessen. Die folgenden Datenkategorien werden erhoben.

### 1.1 Auth-Stammdaten (alle Tenant-Klassen)
- E-Mail-Adresse (Pflicht, Login-Identifikator)
- Passwort (bcrypt-Hash via Supabase-Auth/GoTrue, nie im Klartext)
- Anzeigename (`profile.display_name`) — Vor- und Nachname
- Sprache (`profile.language`, DE/NL/EN — Default DE)
- Rolle (`strategaize_admin` / `partner_admin` / `tenant_admin` / `tenant_member`)
- Tenant-Bindung (`tenant_id`)
- Magic-Link-Token bei Invite-Flow (V4.2, V6 Mandanten-Einladung) — kurzlebig, nach Login verworfen
- Login-Audit-Felder (created_at, last_sign_in_at via Supabase-Auth)

### 1.2 Tenant-Stammdaten
- Tenant-Anzeigename (`tenants.display_name`) — Firmenname Mandant bzw. Partner-Kanzlei
- Tenant-Klasse (`tenants.tenant_kind`: `direct_client` / `partner_organization` / `partner_client`)
- Eltern-Partner-Bindung (`tenants.parent_partner_tenant_id` — nur fuer `partner_client`)
- Erstell-Datum, letzter-Aktiv-Stand

### 1.3 Partner-Organisations-Stammdaten (V6+, `partner_organization`)
- Partner-Branding-Konfiguration (`partner_branding_config`): Primaerfarbe, Logo-URL (Storage-Pfad im `partner-branding-assets`-Bucket), Anzeigename fuer Mandanten-Welcome-Block
- KvK-/Handelsregister-Daten (Standard-Vertragsdaten — derzeit nicht in DB, erst bei AVV-Versand via FEAT-049)

### 1.4 Capture-Daten (Wissens-Erhebung)
- Antworten auf Template-Fragen (`capture_session.answers` als JSONB)
- Block-Submit-Checkpoints (`block_checkpoint` mit Versionierung)
- Verdichtete Knowledge Units (`knowledge_unit` mit Quelle, Confidence-Level, Validation-Layer)
- Exception-Eingaben (Freitext-Beitraege parallel zum Questionnaire)
- KI-Chat-Verlauf waehrend der Questionnaire-Bearbeitung (Bedrock-Memory pro Session)

### 1.5 Walkthrough-Daten (V5, FEAT-031..032)
- Walkthrough-Aufzeichnungen (Screen + Mic, WebM/VP9+Opus, max. 30min Hard-Cap per DEC-076)
- Transkripte (Whisper-EU-Azure)
- Roh-Transkript und redigiertes Transkript (PII-Pattern-Library, DEC-082)
- Walkthrough-Review-Mappings (Mandant ordnet Snippets Subtopics zu)

### 1.6 Diagnose-Daten (V6, FEAT-045 — pending SLC-105)
- Diagnose-Antworten (`capture_session` mit `template.metadata.usage_kind = 'diagnostic'`)
- Deterministischer Score pro Frage (V6 DEC-100, Auto-Finalize DGN-A)
- KI-Kommentar zum Score (Bedrock Claude Sonnet)
- Auto-finalisierter Diagnose-Bericht (`block_checkpoint.checkpoint_type='auto_final'`)

### 1.7 Lead-Push-Daten (V6, FEAT-046)
- Lead-Push-Consent-Eintrag (`lead_push_consent`): Mandanten-User-ID, Consent-Text-Version, Consent-Datum, IP-Hash (SHA-256), User-Agent-Hash (SHA-256)
- Lead-Push-Audit-Trail (`lead_push_audit`): Versuche, Status (`pending`/`success`/`failed`), Attempt-Nummer, Business-System-Contact-ID, attempted_at-Zeitstempel
- UTM-Attribution-String `partner_<tenant_id>` als `utm_source` im Cross-System-Push

### 1.8 KI-Job-Audit
- `ai_jobs`-Tabelle: Job-Typ, Tenant-ID, Status, Input/Output-JSONB, Bedrock-Cost-Ledger (Token-Input/-Output, USD)
- Klassifikationen, Wiedervorlage-Vorschlaege, Signal-Extraktionen (interne KI-Output-Spuren)

### 1.9 Funktionale Cookies + Browser-State
- `sidebar:state` (functional, legitimate-interest gemaess DSGVO Art. 6(1)(f)) — speichert UI-Praeferenz (Sidebar ein-/ausgeklappt). Kein Tracking, kein Profiling, kein Drittanbieter.
- localStorage-Eintraege fuer Reader-Search-History (V4.3 DEC-063) — bleibt geraeteseitig, kein Server-Sync.

### 1.10 Was **nicht** erhoben wird
- Keine besonderen Kategorien personenbezogener Daten (Art. 9 DSGVO) — keine Gesundheits-, Religions-, politische Daten.
- Kein Tracking-Pixel, kein Web-Analytics, kein gtag/posthog/plausible/sentry. (Repo-grep zeigt: 0 Tracking-Bibliotheken aktiv.)
- Kein automatisiertes Profiling im Sinne automatisierter Einzelfallentscheidungen (Art. 22 DSGVO).
- Keine biometrischen Daten.
- Keine Standort-Daten (kein Geolocation-Feature).

---

## 2. Datenfluesse pro Quelle

Datenfluesse werden ueber **Adapter-Patterns** gekapselt (siehe `data-residency.md`). Jede externe Schnittstelle laeuft ueber einen typisierten Provider, der ueber ENV-Variablen umkonfiguriert werden kann — kein direktes SDK-Coupling in der Business-Logik.

### 2.1 Self-Signup / Direct-Client-Auth (V1-V4-Pfad)
```
Browser → /login (E-Mail + Passwort)
   → Server-Action mit Supabase-Auth (GoTrue, intra-Container)
   → Cookie-Session (httpOnly, secure, sameSite=lax)
   → /dashboard
```
- Rechtsgrundlage: Art. 6(1)(b) DSGVO (Vertrag — Plattform-Nutzung).

### 2.2 Magic-Link-Invite (V4.2 Mitarbeiter, V6 Mandanten-Einladung)
```
Strategaize-Admin / Partner-Admin → /admin/...-UI
   → Server-Action `invite*` (createUser via Supabase-Admin-API, identities-Eintrag, Magic-Link-Token erzeugen)
   → IONOS-SMTP via Supabase-Auth-SMTP (DEC-056)
   → User-E-Mail mit Magic-Link
   → Klick → /auth/callback?token=... → Session
   → /auth/set-password (Pflicht-Step bei Erst-Login)
```
- Rechtsgrundlage: Art. 6(1)(b) (Vertrag mit Partner-Kanzlei bzw. Mandant), Art. 6(1)(f) (Mitarbeiter-Onboarding).

### 2.3 Capture-Session-Submit (FEAT-003, FEAT-005)
```
Mandant /dashboard/capture/[sessionId] → Antworten eingeben (Autosave Debounce 500ms)
   → JSONB-Merge in capture_session.answers (DEC-013)
   → Block-Submit-Klick → block_checkpoint INSERT + ai_jobs Job 'knowledge_unit_condensation' enqueue
   → Worker-Container pollt ai_jobs (2000ms, DEC-007)
   → Bedrock Claude Sonnet eu-central-1 (Single-Pass bzw. V2-Loop DEC-014)
   → knowledge_unit INSERT via RPC rpc_bulk_import_knowledge_units
   → Cost-Logging in ai_cost_ledger
```
- Rechtsgrundlage: Art. 6(1)(b) (Vertrag — Wissens-Erhebung).

### 2.4 Walkthrough-Upload-Pipeline (V5, FEAT-031..032)
```
Mandant /dashboard/walkthrough/[sessionId] → Screen-Capture + Mic-Audio (Browser-WebRTC)
   → Pflicht-Privacy-Checkbox (DEC-091)
   → Direct-Upload via Supabase Signed URL (DEC-077)
   → walkthrough_session INSERT mit status='uploaded'
   → Background-Job: Azure Whisper EU Transkription
   → PII-Redaction (System-wide Pattern-Library, DEC-082)
   → Roh + Redacted Transkript als knowledge_unit-Eintraege (DEC-083)
   → Auto-Mapping zu Subtopics (Bedrock, Confidence-Schwelle 0.7, DEC-084)
   → Mandant Review-UI: Select-Move zwischen Subtopics (DEC-086)
```
- Rechtsgrundlage: Art. 6(1)(a) (explizite Einwilligung via Pflicht-Privacy-Checkbox).

### 2.5 Diagnose-Werkzeug (V6, FEAT-045 — pending SLC-105)
```
Mandant /dashboard/diagnose/start (auto-Welcome bei partner_client + diagnostic Template)
   → Antworten zu 15-25 strukturierten Fragen
   → Deterministischer Score-Compute aus template.diagnosis_schema (DEC-023, DEC-100)
   → Bedrock-Verdichtungs-Prompt fuer KI-Kommentar
   → Auto-Finalize (KU status='accepted' + validation_layer reviewer_role='system_auto' + block_checkpoint checkpoint_type='auto_final')
   → /dashboard/diagnose/bericht/[id] Renderer
```
- Rechtsgrundlage: Art. 6(1)(b) (Vertrag — Diagnose-Funnel-Leistung).

### 2.6 Lead-Push opt-in (V6, FEAT-046)
```
Mandant /dashboard → "Ich will mehr"-Button (nur nach finalized capture_session sichtbar)
   → Modal mit Pflicht-DSGVO-Checkbox (DEC-091, 3-fach gesichert: UI-Layer-Lock + Server-Action-Validation + DB-Constraint)
   → Server-Action requestLeadPush → lead_push_consent INSERT (mit ip_hash + user_agent_hash)
   → lead_push_audit attempt=1 → Adapter lead-intake.ts HTTP-Push an business.strategaizetransition.com/api/leads/intake (Bearer-Auth, UTM utm_source=partner_<tenant_id>, datensparsamer 2-Satz-Notes-Text)
   → bei Fail: ai_jobs job_type='lead_push_retry' (5min/30min Backoff, max 3 Versuche, DEC-112)
   → Mandant sieht Status-Card: "wird zugestellt" / "Gesendet am ..." / "Fehler — bitte spaeter erneut"
```
- Rechtsgrundlage: Art. 6(1)(a) (explizite Einwilligung via DSGVO-Checkbox).

### 2.7 Onboarding-Tenant-Reminder-Cron (V4.2, FEAT-031)
```
Coolify Scheduled Task im app-Container (DEC-059, kein pg_cron, kein eigener Cron-Container)
   → 2x taeglich SELECT auf nicht abgeschlossene Mitarbeiter-Invites
   → IONOS-SMTP-Versand (Supabase-Auth-SMTP, DEC-056) an Mitarbeiter (NICHT an tenant_admin, DEC-054)
   → 2-stufige Schedule: Stage 1 nach 3 Werktagen, Stage 2 nach 7 Werktagen (DEC-055)
   → Cross-Day-Idempotenz via Application-Level Guard `status='sent'` (DEC-094)
```
- Rechtsgrundlage: Art. 6(1)(f) (berechtigtes Interesse — Mitarbeiter-Onboarding-Fortschritt).

---

## 3. Speicherorte und Regionen

Alle Speicherorte liegen in der **EU** per `data-residency.md`-Rule. Keine Daten verlassen die EU-Region zu keinem Zeitpunkt.

| Komponente | Anbieter | Region | Zweck |
|---|---|---|---|
| Applikations-Hosting | Hetzner Cloud | Frankfurt (DE) | Next.js-App, Worker-Container, Coolify |
| Datenbank | Supabase Postgres (self-hosted in Coolify) | Hetzner Frankfurt (DE) | Alle relationalen Daten |
| Objekt-Storage | Supabase Storage (self-hosted) | Hetzner Frankfurt (DE) | Walkthrough-Aufzeichnungen, Partner-Branding-Assets |
| Auth | Supabase Auth / GoTrue (self-hosted) | Hetzner Frankfurt (DE) | Login, Session-Management, Magic-Link |
| LLM-Inferenz | AWS Bedrock | `eu-central-1` (Frankfurt) | Claude Sonnet fuer Verdichtung, Diagnose, Walkthrough-Mapping |
| Embeddings | AWS Bedrock | `eu-central-1` (Frankfurt) | Titan V2 fuer Wissens-Suche / RAG (vorbereitet, nicht aktiv produktiv in V6.2) |
| Speech-to-Text | Azure OpenAI Whisper | EU-Region (West Europe / Germany West Central) | Walkthrough-Transkription |
| SMTP-Versand | IONOS | Deutschland | Magic-Link, Reminder, Notification-Mails |

**Verboten und nicht im Einsatz:** OpenAI-API direkt (`api.openai.com`), Anthropic-API direkt (`api.anthropic.com`), US-Regionen bei AWS/Azure/GCP, Pinecone/Weaviate/Cohere-US.

**Audit-Trail:** Jeder externe LLM-/Speech-Call wird in `ai_jobs` bzw. `ai_cost_ledger` mit Anbieter, Region, Modell-ID, Zeitstempel und Request-ID geloggt.

---

## 4. Retention-Policies

### 4.1 Walkthrough-Aufzeichnungen
- **30 Tage** Hard-Cap via Cleanup-Cron (V5 DEC-093, Coolify Scheduled Task `walkthrough-cleanup`, 1h Stale-Threshold pro Stage).
- Roh-Video + Roh-Audio nach Ablauf geloescht.
- Transkripte (redigiert + ggf. Roh) bleiben als `knowledge_unit`-Eintraege bis zur Tenant-Loeschung erhalten.

### 4.2 Capture-Daten (Antworten, Knowledge Units, Checkpoints)
- Bleiben bis zur Tenant-Loeschung erhalten — Tenant-Lifecycle-gebunden.
- Knowledge Units sind versioniert (Block-Submit erzeugt Checkpoints); aeltere Checkpoints werden NICHT automatisch geloescht.

### 4.3 KI-Jobs und Cost-Ledger
- `ai_jobs` Standard-Retention 90 Tage (Cleanup-Cron, falls implementiert; aktuell nicht aktiv — V7+-Backlog).
- `ai_cost_ledger` unbegrenzt (Audit-Pflicht fuer Kostenrechnung).

### 4.4 Lead-Push-Audit-Trail (V6)
- `lead_push_consent` und `lead_push_audit` **unbegrenzt erhalten** als Nachweis der erteilten Einwilligung und der durchgefuehrten Verarbeitung (DSGVO-Rechenschaftspflicht Art. 5(2)).

### 4.5 Auth-Daten
- Aktive User-Accounts: Tenant-Lifecycle-gebunden.
- Magic-Link-Tokens: nach Verbrauch verworfen (Supabase-Default).
- Inaktive Tenant-Member nach Tenant-Loeschung CASCADE-geloescht.

### 4.6 Reminder-Cron-State (V4.2)
- `tenant_reminder_state`-Eintraege bleiben bis zur Tenant-Loeschung erhalten (Audit-Trail "wer wurde wann erinnert").

### 4.7 Error-Log
- `error_log`-Tabelle wird nicht automatisch bereinigt; manuelle Cleanup-Strategie pending V7+. Enthaelt keine PII (nur technische Fehler-Strings + Tenant-ID).

### 4.8 Was **nicht** retained wird
- Keine Sentry/Logs-Aggregation aktiv (kein externer Log-Sammler).
- Keine Web-Analytics-Daten (kein Tracking aktiv).
- Keine externe Cookies — `sidebar:state` ist functional ohne Server-Sync.

---

## 5. Drittanbieter-Liste

### 5.1 Aktive Drittanbieter (V6.2)

| Anbieter | Dienstleistung | Region | DPA-Status |
|---|---|---|---|
| Hetzner Online GmbH | Cloud-Hosting (Server + Storage) | Frankfurt (DE) | Standard-DPA Hetzner — `https://www.hetzner.com/de/rechtliches/auftragsverarbeitung` |
| Amazon Web Services (AWS) | Bedrock LLM (Claude Sonnet, Titan V2 Embeddings) | `eu-central-1` (Frankfurt) | Standard-AWS-DPA — `https://aws.amazon.com/compliance/gdpr-center/` |
| Microsoft Azure | Azure OpenAI (Whisper Speech-to-Text) | EU-Region (West Europe / Germany West Central) | Standard-Azure-DPA — Microsoft Online Services DPA |
| IONOS SE | SMTP-Versand (Magic-Link, Reminder) | Deutschland | Standard-IONOS-DPA |

### 5.2 Selbst betriebene Komponenten (kein Drittanbieter)

- **Supabase-Stack** (Postgres, Auth/GoTrue, Storage, Kong, Realtime, Studio) — self-hosted in Coolify auf Hetzner. Daten bleiben in der eigenen Infrastruktur.
- **Next.js-App + Worker-Container** — eigener Code in eigenem Coolify-Stack.
- **Cron-Jobs** — Coolify Scheduled Tasks im app-Container (DEC-059), kein externer Scheduler.

### 5.3 Vorbereitet, nicht aktiv (V6.2)

- **Cal.com** (Meeting-Buchungen) — als Cross-System-Integration mit Business-System geplant, aber in der Onboarding-Plattform V6.2 nicht aktiv.
- **Jitsi/Jibri** (Meeting-Aufzeichnungen) — V3-Vorbereitung, aktuell nicht im V6.2-Funktionsumfang.

---

## 6. Auftragsverarbeitungsvertraege (DPA-Status)

### 6.1 Strategaize ↔ Drittanbieter

Fuer jeden aktiven Drittanbieter besteht ein Auftragsverarbeitungsvertrag nach DSGVO Art. 28 ueber den Standard-DPA-Mechanismus des Anbieters (siehe Sektion 5.1). User-Pflicht: jaehrliche Pruefung, ob die Standard-DPAs weiterhin geltend sind.

### 6.2 Strategaize ↔ Partner-Kanzleien (V6+)

- **Standard-AVV-Template DE + NL** existiert als Markdown unter `docs/legal/AVV-DE.md` und `docs/legal/AVV-NL.md` (SLC-121, FEAT-049).
- Versand erfolgt **manuell** durch Strategaize-Inhaberin pro Partner-Onboarding (Mail/Cloud-Link, DEC-120). Kein Admin-UI in V6.2.
- Finale Rollen-Zuordnung (Strategaize-als-Verantwortlicher vs. Partner-Kanzlei-als-Verantwortlicher) wird durch Anwalts-Review (BL-104) gesetzt — V6.2-Vorlage enthaelt Platzhalter `[Verantwortlicher: ...]` + `[Auftragsverarbeiter: ...]`.

### 6.3 Strategaize ↔ Direct-Clients (V1-V4-Pfad)

- Rechtsgrundlage: Vertrag mit der Strategaize-Inhaberin (DSGVO Art. 6(1)(b)).
- Bei `direct_client` ist Strategaize Verantwortlicher gegenueber den Mandanten-Mitarbeitern (die ueber `tenant_admin` eingeladen werden) — nicht Auftragsverarbeiter.

### 6.4 Strategaize ↔ Mandanten von Partner-Kanzleien (V6+)

- Rollen-Zuordnung pending Anwalts-Review. Zwei Konstellationen moeglich:
  - **Variante A** (wahrscheinlich): Partner-Kanzlei ist Verantwortlicher gegenueber ihren Mandanten, Strategaize ist Auftragsverarbeiter — AVV (Variante 6.2) regelt das Verhaeltnis.
  - **Variante B**: Strategaize ist Verantwortlicher gegenueber Mandanten via Diagnose-Funnel-Direkt-Vertrag mit Mandant (Self-Signup-Path V7+), Partner-Kanzlei ist nur Vermittler. In V6 (Magic-Link-Invite-Path) ist Variante A wahrscheinlicher.

---

## 7. Loeschkonzept

### 7.1 Recht auf Loeschung (Art. 17 DSGVO)

#### Tenant-Loeschung (CASCADE-Kaskade)

Eine Tenant-Loeschung loescht **alle** zugehoerigen Daten in einer FK-CASCADE-Kette:

```
tenants
  → capture_session
      → block_checkpoint
      → knowledge_unit (Cascade via capture_session_id)
      → validation_layer
  → walkthrough_session (Cascade via capture_session_id oder tenant_id)
      → walkthrough_review_mapping
  → ai_jobs (Cascade via tenant_id)
  → ai_cost_ledger (Cascade via tenant_id)
  → lead_push_consent + lead_push_audit (Cascade via tenant_id, V6)
  → partner_branding_config (Cascade fuer partner_organization)
  → partner_client_mapping (Cascade fuer partner_organization)
  → tenant_reminder_state
  → profile (Cascade via tenant_id)
  → auth.users (eigener Loeschpfad ueber Supabase-Auth-Admin-API)
```

Loeschung erfolgt RLS-isoliert (kein Cross-Tenant-Leak). Storage-Cleanup (Walkthrough-Videos im `walkthrough-recordings`-Bucket, Partner-Logos im `partner-branding-assets`-Bucket) erfolgt **parallel** zur DB-Loeschung als separater Cleanup-Job — nicht automatisch via FK.

#### Einzelner User-Loeschung

- Mandanten-Mitarbeiter: `auth.users` DELETE via Supabase-Admin-API (`supabase.auth.admin.deleteUser`). Profil-Row in `profile`-Tabelle CASCADE-geloescht. Zugewiesene Knowledge Units bleiben Tenant-Eigentum (keine User-Bindung).
- Strategaize-Admin: nur durch Strategaize-Inhaberin manuell (administrative Operation).

### 7.2 V6-Voll-Restore-Limit (DEC-103)

V6 hat **keinen** selektiven Tenant-Restore-Pfad. Bei Mandanten-Datenverlust ist nur **globales Coolify-DB-Restore** moeglich. Selektiver Tenant-Restore ist V7+-Backlog-Item (`Tenant-Restore-Faehigkeit`). Vor Tenant-Loeschung deshalb: User-Pflicht-Backup falls Wiederherstellung gewuenscht.

### 7.3 Recht auf Auskunft (Art. 15 DSGVO)

User kann seine eigenen Daten ueber `/dashboard` einsehen. Auf formelle Anfrage an `[IMPRESSUM_EMAIL]` wird ein Daten-Export aus den relevanten Tabellen via Strategaize-Admin manuell erstellt (kein automatisierter Export-Endpoint in V6.2; V7+-Backlog).

### 7.4 Recht auf Berichtigung (Art. 16 DSGVO)

User kann seine eigenen Auth-Daten (Anzeigename, Sprache) im `/settings`-Bereich anpassen. Tenant-Anzeigename wird durch `tenant_admin` verwaltet. Strukturelle Korrekturen an Capture-Daten erfolgen auf Anfrage manuell.

### 7.5 Recht auf Datenuebertragbarkeit (Art. 20 DSGVO)

Auf Anfrage wird ein JSON-Export der Capture-Session erstellt (analog `GET /api/export/checkpoint/{id}` aus V1 DEC-009). Walkthrough-Videos werden als Direct-Download bereitgestellt.

### 7.6 Recht auf Widerruf der Einwilligung (Art. 7(3) DSGVO)

- **Walkthrough-Einwilligung** (Pflicht-Privacy-Checkbox DEC-091): Widerruf via Loeschung der Walkthrough-Aufzeichnung. Cleanup-Cron bereinigt nach Ablauf der 30-Tage-Retention.
- **Lead-Push-Einwilligung** (V6 DSGVO-Checkbox): Widerruf via Loeschung des `lead_push_consent`-Eintrags. Lead-Push wird nicht zurueckgenommen (Business-System-Contact bleibt), aber zukuenftige Pushes werden gesperrt.

### 7.7 Automatische Loeschung

- Walkthrough-Videos: 30 Tage (DEC-093, Cleanup-Cron).
- Magic-Link-Token: nach Verbrauch (Supabase-Default).
- KI-Job-Output: Standard-Retention 90 Tage (V7+ implementiert).

### 7.8 Loeschung von Drittanbieter-Daten

- Bedrock/Azure: keine persistente Speicherung der Inferenz-Inputs durch den Provider (DPA-konform, EU-Region).
- IONOS-SMTP: E-Mails werden nach Versand geloescht (kein Smarthost-Archiv).
- Hetzner: Backup-Strategie ueber Coolify-DB-Backups (User-Pflicht); selektiver Tenant-Restore V7+ (DEC-103).

---

## 8. Datenschutzkonforme Defaults

### 8.1 RLS by Default (Defense-in-Depth)

Jede Tabelle mit Tenant-Bindung hat **Row-Level Security** mit Default-DENY und expliziten Tenant-Scoped-Policies. Pen-Test-Suite mit 96 V6 + 94 Regression Faelle (DEC-110) verifiziert Cross-Tenant- und Cross-Partner-Isolation.

### 8.2 SECURITY DEFINER mit explicit search_path (IMP-507)

Alle SECURITY-DEFINER-RPCs setzen `SET search_path = public, pg_temp` explizit, um Schema-Hijacking-Risiko zu eliminieren. Smoke-Test als Pflicht-Post-Migration-Schritt (IMP-507).

### 8.3 Privacy-Pflicht-Checkbox (DEC-091)

Walkthrough-Submit und Lead-Push erfordern eine explizite Pflicht-Checkbox **dreifach gesichert**:
- UI-Layer-Lock (Submit-Button bleibt disabled bis Checkbox aktiv)
- Server-Action-Validation (Defense-in-Depth)
- Datenbank-Constraint (NOT NULL auf Consent-Spalte)

### 8.4 Pflicht-Footer "Powered by Strategaize" (DEC-108)

Hardcoded als Server-Component, NICHT ueber Branding-Config aenderbar. Niemand kann den Strategaize-Hinweis entfernen, auch nicht via DB-Manipulation. Whitelabel ausdruecklich niemals (MULTIPLIER_MODEL Achse 2 T5).

### 8.5 Footer-Erweiterung Datenschutz + Impressum (V6.2, DEC-118)

Footer enthaelt zusaetzlich Links zu `/datenschutz` und `/impressum` auf jeder Route (auth + non-auth). Layout: `[Datenschutz] · [Impressum] · [Powered by Strategaize ↗]`.

### 8.6 Impressum-Stammdaten ueber granulare ENV-Variablen (V6.2, DEC-116)

Strategaize Transition BV-Stammdaten (Firmenname, Anschrift, KvK-Nummer, USt-IdNr, Vertretungsberechtigter, Kontakt-E-Mail) werden ueber **9 separate ENV-Variablen** (`IMPRESSUM_COMPANY/STREET/ZIP/CITY/COUNTRY/KVK/VAT/DIRECTOR/EMAIL`) gesetzt. Kein PII im Code-Repo. Server-Component wirft Error bei fehlender Pflicht-ENV (kein silent default-Wert).

### 8.7 Markdown-basierte Compliance-Texte (V6.2, DEC-117)

`/datenschutz` rendert `src/content/legal/datenschutz.de.md` via `react-markdown` (Pattern-Reuse aus HandbookReader DEC-049). Anwalts-Aenderungen erfolgen direkt am Markdown-File ohne JSX-Touch.

### 8.8 Authentifizierung und Autorisierung

- E-Mail/Passwort via Supabase-Auth (bcrypt, GoTrue-managed).
- Magic-Link-Invite ueber Supabase-Auth-Admin-API.
- Rolle (`strategaize_admin` / `partner_admin` / `tenant_admin` / `tenant_member`) in `auth.users.raw_user_meta_data` + `auth.user_role()`-Helper.
- Set-Password-Pflicht-Step beim Erst-Login (FEAT-031).
- Server-Side-Auth bevorzugt (Server Actions + Cookie-Sessions), keine Browser-direkt-Supabase-Calls (memory feedback_no_browser_supabase).

### 8.9 KI on-click / Block-Submit-getriggert (memory feedback_bedrock_cost_control)

Keine Auto-Load-KI-Features. Bedrock-Calls erfolgen nur nach Mandanten-Aktion (Block-Submit, Walkthrough-Upload, Diagnose-Submit, Lead-Push). Kosten-Logging in `ai_cost_ledger` pro Call.

### 8.10 Kein Tracking, kein Cookie-Banner

- Repo-grep verifiziert: 0 Tracking-Bibliotheken (kein gtag, posthog, plausible, sentry-Browser-SDK).
- Einziger Cookie ist `sidebar:state` (functional, legitimate-interest gemaess Art. 6(1)(f)).
- Cookie-Banner waere DSGVO-Performativitaet ohne Substanz und wird in V6.2 bewusst nicht eingebaut (FEAT-048 Out-of-Scope).

### 8.11 Logging und Audit-Trail

- `error_log`-Tabelle: technische Fehler ohne PII (Tenant-ID + Fehler-String + Zeitstempel).
- `ai_jobs`: KI-Job-Lifecycle mit Input/Output-JSONB (kann PII enthalten — RLS-geschuetzt).
- `ai_cost_ledger`: Kosten-Audit pro Bedrock-Call.
- `lead_push_audit`: Lead-Push-Lifecycle (V6).
- `tenant_reminder_state`: Reminder-Audit (V4.2).
- Public-Consent-Events nutzen `ip_hash` + `user_agent_hash` (SHA-256), nicht Klartext.

### 8.12 Self-hosted Supabase Auto-Confirm bei Magic-Link-Invite

Supabase-Auth ist auf Self-hosted-Mode konfiguriert. Magic-Link-Invite via Admin-API setzt `email_confirm: true`, sodass Mandanten ohne separaten Confirm-Klick einsteigen koennen (Magic-Link selbst ist der Confirm). User-Pflicht: bei externem SMTP-Wechsel ENVs neu pruefen (`ENABLE_EMAIL_AUTOCONFIRM` vs. `GOTRUE_MAILER_AUTOCONFIRM` — Coolify-Wrapper-Mapping siehe Memory `reference_coolify_supabase_env_mapping`).

---

## 9. DPO-Bewertung (V6.2-spezifisch)

### 9.1 Rechtsgrundlage der Pruefung

DSGVO Art. 37(1) (DE) bzw. AVG Art. 37 (NL) verpflichten Verantwortliche zur Bestellung eines Datenschutzbeauftragten (DPO) wenn:

- **(a)** Kernaktivitaet ist umfangreiche regelmaessige systematische Beobachtung von Betroffenen.
- **(b)** Kernaktivitaet ist umfangreiche Verarbeitung besonderer Kategorien personenbezogener Daten (Art. 9 DSGVO).
- **(c)** DE-spezifisch (BDSG §38): ≥250 Mitarbeiter oder ≥20 mit automatischer Verarbeitung.

### 9.2 Strategaize-Transition-BV-Bewertung

Die Strategaize Transition BV bestellt **aktuell keinen DPO** (DEC-121). Begruendung:

1. **Keine umfangreiche Verarbeitung im Sinne von Art. 37(1)(b).** Erhobene Daten sind ausschliesslich Standard-Geschaeftsdaten (Auth-Stammdaten, Capture-Antworten, Walkthrough-Aufzeichnungen). Volumen niedrig (Solo-Founder-Org-Groesse, ≤10 Pilot-Partner geplant in den ersten 12 Monaten).
2. **Keine besonderen Kategorien personenbezogener Daten** nach Art. 9 (keine Gesundheits-, Religions-, politische, biometrische, Genetik-Daten).
3. **Keine systematische Verhaltensbeobachtung** im DSGVO-Sinn. Strukturierte Datenerhebung mit expliziter Mandanten-Einwilligung (DSGVO-Pflicht-Checkbox, DEC-091) ist nicht "Beobachtung".
4. **Kleine Org-Groesse** der Verantwortlichen Strategaize Transition BV — deutlich unter den DE-Schwellen aus §38 BDSG.

### 9.3 Anwalts-Review-Pflicht

Diese Einschaetzung wird durch **Anwalts-Review (BL-104)** geprueft. Falls Anwalt DPO-Pflicht feststellt:

- V6.2-Release-Marker bleibt auf "ready pending DPO-appointment".
- V6.3 oder V7 nimmt DPO-Bestellungs-Prozess auf (Suche externer DPO, Vertrag, Meldung an Aufsichtsbehoerde).
- Erster echter Live-Pilot-Partner blockiert auf DPO-Pass.

### 9.4 Dokumentations-Verpflichtung auch ohne DPO

Auch ohne DPO bleibt diese COMPLIANCE.md-Dokumentation die kanonische Quelle fuer Aufsichtsbehoerden-Anfragen. Strategaize-Inhaberin uebernimmt selbst die DSGVO-Verantwortlichen-Rolle und ist Ansprechpartnerin fuer:

- Auskunftsersuchen (Art. 15)
- Loeschungsersuchen (Art. 17)
- Beschwerden bei Aufsichtsbehoerde (NL: Autoriteit Persoonsgegevens, DE: Landesdatenschutzbehoerde des Mandanten-Wohnsitzes)
- Datenschutzpannen-Meldungen (Art. 33, 72h-Pflicht)

Kontakt: siehe `[IMPRESSUM_EMAIL]` (Strategaize-Inhaberin direkt).

---

## Cross-References

- [docs/DECISIONS.md](DECISIONS.md) — DEC-091 (Privacy-Pflicht-Checkbox), DEC-093 (Walkthrough-Cleanup), DEC-099 (RPC-SECURITY-DEFINER), DEC-100-113 (V6-Foundation), DEC-114-115 (V6.1), DEC-116-121 (V6.2)
- [docs/ARCHITECTURE.md](ARCHITECTURE.md) — V6-Section (Multiplikator-Foundation), V6.1-Section, V6.2-Section (Compliance-Sprint)
- [docs/legal/AVV-DE.md](legal/AVV-DE.md) — Standard-AVV-Template (SLC-121)
- [docs/legal/AVV-NL.md](legal/AVV-NL.md) — NL-AVV-Template (SLC-121)
- [Strategaize-Dev-System `data-residency.md`-Rule](../../strategaize-dev-system/.claude/rules/data-residency.md) — EU-Hosting-Pflicht
- [IMP-507](../docs/SKILL_IMPROVEMENTS.md) — SECURITY DEFINER + explicit search_path

---

## Disclaimer

Diese Dokumentation ist eine pragmatische technische Standardvorlage und stellt **keine Rechtsberatung** dar. Vor produktivem Einsatz mit echten Partner-Kanzleien oder Mandanten ist eine **anwaltliche Pruefung** durch eine qualifizierte Datenschutzbeauftragte/einen qualifizierten Datenschutzbeauftragten erforderlich. Die Pruefung ist als BL-104 (V6.2-Anwalts-Review) im Backlog gefuehrt und ist User-Pflicht nach /deploy V6.2.

**Stand:** 2026-05-15 (V6.2-Release, SLC-122).
