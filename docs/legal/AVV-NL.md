# Verwerkersovereenkomst volgens AVG Art. 28

> **Datum:** 2026-05-15 (V6.2-Release, SLC-121)
> **Systeem:** Strategaize Onboarding-Platform
> **Domein:** `onboarding.strategaizetransition.com`
> **Status:** Standaard sjabloon, juridische toetsing vereist voor verzending naar een werkelijke partner.
>
> **Let op:** Dit sjabloon is een pragmatisch technisch standaard sjabloon en vormt **geen juridisch advies**. Het beschrijft het gangbare raamwerk van een verwerkersovereenkomst volgens AVG Art. 28 voor de samenwerking tussen Strategaize Transition BV en een partner-kantoor (of een directe klant). Voordat het sjabloon productief naar een werkelijke contractpartij wordt verzonden, is een **juridische toetsing** door een gekwalificeerde Functionaris voor Gegevensbescherming (FG) vereist (BL-104, V6.2 juridische review).

---

## Preambule

Deze verwerkersovereenkomst (hierna: **Overeenkomst**) regelt de verplichtingen van partijen op het gebied van gegevensbescherming in verband met het gebruik van het Strategaize Onboarding-Platform door de Verwerkingsverantwoordelijke.

**Partijen:**

- **Verwerkingsverantwoordelijke:** `[Verwerkingsverantwoordelijke: bedrijfsnaam, adres, vertegenwoordigingsbevoegde, KvK-/handelsregisternummer]`
- **Verwerker:** `[Verwerker: bedrijfsnaam, adres, vertegenwoordigingsbevoegde, KvK-/handelsregisternummer]`

**Opmerking over de rolverdeling:** De definitieve toewijzing van de rollen "Verwerkingsverantwoordelijke" en "Verwerker" wordt vastgesteld via juridische toetsing (BL-104). Twee constellaties zijn mogelijk:

- **Variant A** (waarschijnlijk): Het partner-kantoor is Verwerkingsverantwoordelijke ten opzichte van zijn klanten, Strategaize Transition BV is Verwerker.
- **Variant B**: Strategaize Transition BV is Verwerkingsverantwoordelijke ten opzichte van de eindklant via directe overeenkomst (Self-Signup-pad V7+), het partner-kantoor is bemiddelaar zonder verwerkersrol.

Deze Overeenkomst gaat uit van **Variant A**. Bij Variant B is deze Overeenkomst niet van toepassing.

**Contractuele basis:** Hoofdovereenkomst/serviceovereenkomst tussen partijen over het gebruik van het Strategaize Onboarding-Platform.

---

## 1. Onderwerp van de verwerking

De Verwerker verwerkt persoonsgegevens uitsluitend in opdracht van de Verwerkingsverantwoordelijke conform AVG Art. 28. Onderwerp is het leveren van het Strategaize Onboarding-Platform voor gestructureerde kennisverzameling, AI-ondersteunde verdichting en diagnose-funnel-diensten.

Verwerking voor eigen doeleinden van de Verwerker vindt niet plaats; uitgezonderd zijn verwerkingen ten behoeve van facturatie, audit en beveiliging in het kader van de AVG-verantwoordingsplicht (Art. 5(2)).

---

## 2. Aard en doel van de verwerking

De verwerking vindt plaats ten behoeve van:

- Gestructureerde kennisverzameling via capture-modi (vragenlijst, walkthrough, diagnose-instrument)
- AI-ondersteunde verdichting van antwoorden tot Knowledge Units (Bedrock Claude Sonnet, eu-central-1)
- Levering van diagnose-rapporten aan klanten
- Optionele lead-push naar het Strategaize Business System na expliciete klant-toestemming (V6 FEAT-046)
- Verzending van magic-link-uitnodigingen aan klanten en medewerkers
- Verzending van reminders bij onvolledige medewerker-onboardings (V4.2)

Het platform is AI-first ontworpen: Bedrock-aanroepen vinden uitsluitend plaats na een klant-actie (block-submit, walkthrough-upload, diagnose-submit), nooit automatisch op de achtergrond.

---

## 3. Aard van de persoonsgegevens en categorieen betrokkenen

De gegevenscategorieen en betrokkenenkringen die in het kader van deze Overeenkomst worden verwerkt, zijn volledig beschreven in [`../COMPLIANCE.md` Sektion 1](../COMPLIANCE.md#1-erhobene-personenbezogene-daten) (Duitstalig — bindende referentiebron).

**Korte versie:**

- **Gegevenscategorieen:** Auth-stamgegevens, tenant-stamgegevens, partner-branding-stamgegevens, capture-antwoorden, walkthrough-opnames, diagnose-gegevens, lead-push-consent + audit-trail, AI-job-audit, functionele cookies.
- **Betrokkenenkringen:** Directeuren van klantorganisaties, medewerkers van klantorganisaties, partner-admin-gebruikers, Strategaize-admin-gebruikers.
- **Geen bijzondere categorieen** volgens AVG Art. 9 (zie `../COMPLIANCE.md` Sektion 1.10).

---

## 4. Instructierecht van de Verwerkingsverantwoordelijke

De Verwerker verwerkt persoonsgegevens uitsluitend op basis van gedocumenteerde instructies van de Verwerkingsverantwoordelijke. De eerste instructie volgt uit deze Overeenkomst en de onderliggende hoofdovereenkomst.

Wijzigingen, aanvullingen of vervangingen van instructies vinden plaats in tekstvorm (e-mail volstaat) door de Verwerkingsverantwoordelijke aan het in de hoofdovereenkomst aangewezen contactpunt van de Verwerker.

Indien de Verwerker van mening is dat een instructie van de Verwerkingsverantwoordelijke in strijd is met geldend gegevensbeschermingsrecht, stelt hij de Verwerkingsverantwoordelijke daarvan onverwijld in kennis. Tot aan opheldering kan de Verwerker de uitvoering van de betreffende instructie opschorten.

---

## 5. Vertrouwelijkheid

De Verwerker verplicht alle personen die betrokken zijn bij de verwerking van persoonsgegevens schriftelijk tot vertrouwelijkheid (AVG Art. 28(3)(b), Art. 29, Art. 32(4)). Deze verplichting blijft ook na beeindiging van het dienstverband bestaan.

---

## 6. Technische en organisatorische maatregelen (TOMs)

De door de Verwerker getroffen technische en organisatorische maatregelen conform AVG Art. 32 zijn volledig beschreven in [`../COMPLIANCE.md` Sektion 8 "Datenschutzkonforme Defaults"](../COMPLIANCE.md#8-datenschutzkonforme-defaults) (Duitstalig — bindende referentiebron).

**Zwaartepunten:**

- **Row-Level Security (RLS) by Default** met standaard-DENY-policies en expliciete tenant-scoped-policies (Defense-in-Depth). Pen-test-suite met 96 V6 + 94 regressie-cases verifieert cross-tenant- en cross-partner-isolatie.
- **SECURITY DEFINER met expliciete search_path** (`SET search_path = public, pg_temp`) bij alle bevoorrechte database-functies (schema-hijacking-bescherming).
- **Privacy-verplichte checkbox** drievoudig gewaarborgd (UI-layer-lock + server-action-validation + database-constraint) bij walkthrough-upload en lead-push.
- **Verplichte footer "Powered by Strategaize"** hard-coded als server-component, niet via configuratie verwijderbaar.
- **Self-hosted Supabase-stack** op Hetzner Cloud Frankfurt, volledige gegevensresidentie binnen de EU.
- **Authenticatie** via Supabase-Auth/GoTrue (bcrypt-hash, cookie-sessies httpOnly + secure + sameSite=lax).
- **Logging zonder PII** in `error_log` (tenant-ID + technische foutmelding-strings, geen klartext-gegevens).
- **Audit-trail** voor alle externe LLM-/spraak-aanroepen in `ai_jobs` en `ai_cost_ledger` met aanbieder, regio, model-ID, request-ID, tijdstempel.
- **Geen tracking** — repo-grep verifieert: 0 tracking-bibliotheken (geen gtag, posthog, plausible, sentry-browser-SDK). De enige cookie is `sidebar:state` (functioneel, gerechtvaardigd belang Art. 6(1)(f)).

---

## 7. Sub-verwerkers

De Verwerkingsverantwoordelijke verleent bij het sluiten van deze Overeenkomst een **algemene schriftelijke goedkeuring** voor het inschakelen van onderstaande sub-verwerkers conform AVG Art. 28(2). Elke sub-verwerker is EU-gehost, beschikt over een standaard-DPA en is onderworpen aan de `data-residency.md`-regel.

| Sub-verwerker | Dienst | Regio | DPA |
|---|---|---|---|
| **Hetzner Online GmbH** | Cloud-hosting (server + opslag) | Frankfurt (DE) | Standaard-DPA Hetzner — `https://www.hetzner.com/de/rechtliches/auftragsverarbeitung` |
| **Amazon Web Services EMEA SARL** | Bedrock LLM (Claude Sonnet, Titan V2 Embeddings) | `eu-central-1` (Frankfurt) | Standaard-AWS-DPA — `https://aws.amazon.com/compliance/gdpr-center/` |
| **Microsoft Ireland Operations Ltd.** | Azure OpenAI (Whisper Speech-to-Text) | EU-regio (West Europe / Germany West Central) | Microsoft Online Services DPA |
| **IONOS SE** | SMTP-verzending (magic-link, reminder) | Duitsland | Standaard-IONOS-DPA |

Wijzigingen of aanvullingen op de sub-verwerkerslijst worden door de Verwerker minstens **30 kalenderdagen voor inwerkingtreding** in tekstvorm aan de Verwerkingsverantwoordelijke gemeld. De Verwerkingsverantwoordelijke kan binnen 15 kalenderdagen om gegronde redenen bezwaar maken tegen de wijziging. Zonder bezwaar wordt de wijziging als goedgekeurd beschouwd.

Volledige beschrijving zie [`../COMPLIANCE.md` Sektion 5 "Drittanbieter-Liste"](../COMPLIANCE.md#5-drittanbieter-liste).

---

## 8. Ondersteuningsverplichtingen en rechten van betrokkenen

De Verwerker ondersteunt de Verwerkingsverantwoordelijke bij het uitoefenen van de rechten van betrokkenen volgens AVG Hoofdstuk III. In detail:

- **Recht op inzage** (Art. 15) — op verzoek van de Verwerkingsverantwoordelijke levert de Verwerker binnen 14 kalenderdagen een gegevensexport van de relevante tabellen.
- **Recht op rectificatie** (Art. 16) — de Verwerker past gegevens in het platform aan op gedocumenteerde instructie of stelt de Verwerkingsverantwoordelijke in staat zelf wijzigingen door te voeren via `/settings` en `/dashboard`.
- **Recht op gegevenswissing** (Art. 17) — zie clausule 11 en [`../COMPLIANCE.md` Sektion 7](../COMPLIANCE.md#7-loeschkonzept).
- **Recht op beperking van de verwerking** (Art. 18) — op instructie markeert de Verwerker betreffende records als geblokkeerd; een aparte technische blokkeer-markering is in V6.2 nog niet beschikbaar, uitvoering vindt operationeel plaats.
- **Recht op gegevensoverdraagbaarheid** (Art. 20) — de Verwerker levert een JSON-export van de capture-sessie en direct-download van de walkthrough-video's.
- **Recht op bezwaar** (Art. 21) — op instructie stopt de Verwerker de bijbehorende verwerking.
- **Intrekken van toestemming** (Art. 7(3)) — de Verwerker voert intrekkingen binnen 14 kalenderdagen door (in het bijzonder walkthrough-toestemming en lead-push-toestemming).

---

## 9. Meldplicht en datalekken

De Verwerker stelt de Verwerkingsverantwoordelijke onverwijld in kennis van datalekken in de zin van AVG Art. 33(2), **uiterlijk binnen 24 uur** na bekendwording, zodat de Verwerkingsverantwoordelijke zijn eigen 72-uurs meldplicht volgens Art. 33(1) aan de toezichthoudende autoriteit kan nakomen.

De melding bevat ten minste:

- Beschrijving van de aard van de inbreuk (gegevenscategorieen, aantal betrokkenen, aantal records)
- Waarschijnlijke gevolgen van de inbreuk
- Reeds genomen of voorgestelde maatregelen ter beheersing en schadebeperking
- Naam en contactgegevens van de contactpersoon aan de zijde van de Verwerker

De Verwerker documenteert alle datalekken intern (Art. 33(5)).

---

## 10. Auditrechten

De Verwerkingsverantwoordelijke heeft het recht om de naleving van de TOMs door de Verwerker te controleren. De controle vindt plaats:

- Met een aankondigingstermijn van minimaal **20 kalenderdagen**
- Maximaal **eenmaal per kalenderjaar**, behalve bij concrete aanleiding (bijv. na een gemeld datalek)
- Naar keuze door de Verwerkingsverantwoordelijke zelf of door een door hem aangewezen onafhankelijke auditor die tot geheimhouding is verplicht
- Op eigen kosten van de Verwerkingsverantwoordelijke, behalve bij aangetoonde inbreuken van de Verwerker

In plaats van een ter-plaatse-controle kan de Verwerker actuele audit-rapporten, certificeringen of audit-documentatie overleggen, mits deze het controle-doel dienen.

---

## 11. Teruggave en wissing na beeindiging van de overeenkomst

Na beeindiging van de verwerkingsactiviteiten wist de Verwerker alle persoonsgegevens van de Verwerkingsverantwoordelijke, tenzij een bewaarplicht volgens Unierecht of het recht van de lidstaten van toepassing is.

De wissing vindt plaats via het gedocumenteerde tenant-delete-pad (FK-CASCADE-cascade) zoals beschreven in [`../COMPLIANCE.md` Sektion 7 "Loeschkonzept"](../COMPLIANCE.md#7-loeschkonzept). De FK-CASCADE-keten omvat:

- `tenants` → `capture_session` → `block_checkpoint` + `knowledge_unit` + `validation_layer`
- `walkthrough_session` → `walkthrough_review_mapping`
- `ai_jobs`, `ai_cost_ledger`, `lead_push_consent`, `lead_push_audit`
- `partner_branding_config`, `partner_client_mapping`, `tenant_reminder_state`, `profile`
- `auth.users` via Supabase-Auth-Admin-API

Opslag-inhoud (walkthrough-opnames, partner-branding-assets) wordt parallel via storage-cleanup-jobs gewist.

Als alternatief voor wissing kan de Verwerkingsverantwoordelijke na beeindiging een gegevensexport eisen (zie clausule 8). Op verzoek bevestigt de Verwerker schriftelijk de volledige wissing.

**Belangrijke beperking:** In V6.2 bestaat geen selectief tenant-restore-pad. Bij gegevensverlies is alleen globale Coolify-DB-restore mogelijk (zie `../COMPLIANCE.md` Sektion 7.2 en DEC-103). Voorafgaand aan een tenant-wissing adviseert de Verwerker de Verwerkingsverantwoordelijke om zelf een gegevensback-up te maken.

**Behoud van audit-trail:** `lead_push_consent` en `lead_push_audit` blijven onbegrensd bewaard als bewijs van verleende toestemming en uitgevoerde verwerking (AVG-verantwoordingsplicht Art. 5(2)), ook na tenant-wissing in gepseudonimiseerde vorm (tenant-ID-koppeling verwijderd, IP-hash + user-agent-hash blijven).

---

## 12. Aansprakelijkheid, looptijd en opzegging

**Aansprakelijkheid:** De aansprakelijkheid van partijen wordt geregeld door AVG Art. 82 en de bepalingen van de onderliggende hoofdovereenkomst. Aanvullende aansprakelijkheidsclausules worden in de hoofdovereenkomst of via aparte overeenkomst geregeld.

**Looptijd:** Deze Overeenkomst geldt voor de duur van de hoofdovereenkomst. Bij beeindiging van de hoofdovereenkomst eindigt automatisch ook deze Overeenkomst.

**Opzegging:** Een gewone opzegging van deze Overeenkomst is uitsluitend mogelijk samen met de opzegging van de hoofdovereenkomst. Het recht tot buitengewone opzegging om gegronde redenen (bijv. herhaalde ernstige inbreuken op AVG-verplichtingen) blijft onverlet.

**Schriftelijke vorm:** Wijzigingen en aanvullingen op deze Overeenkomst dienen in tekstvorm te geschieden (e-mail volstaat). Mondelinge nevenafspraken zijn niet geldig.

**Salvatoire clausule:** Indien afzonderlijke bepalingen van deze Overeenkomst ongeldig zijn of worden, raakt dit de geldigheid van de overige bepalingen niet. In plaats van de ongeldige bepaling treedt een geldige regeling die het economische doel van de ongeldige bepaling het meest nabij komt.

**Bevoegde rechter en toepasselijk recht:** Het Nederlands recht is van toepassing (vestigingsplaats van de Verwerker Strategaize Transition BV). Bevoegde rechter is de rechtbank in de vestigingsplaats van de Verwerker, tenzij dwingende consumentenbeschermingsvoorschriften een andere bevoegde rechter voorschrijven.

---

## 13. Handtekeningen

**Voor de Verwerkingsverantwoordelijke:**

```
Plaats, Datum: ___________________________

Naam:          ___________________________

Functie:       ___________________________

Handtekening:  ___________________________
```

**Voor de Verwerker:**

```
Plaats, Datum: ___________________________

Naam:          ___________________________

Functie:       ___________________________

Handtekening:  ___________________________
```

---

## Cross-References

- [../COMPLIANCE.md Sektion 1](../COMPLIANCE.md#1-erhobene-personenbezogene-daten) — Gegevenscategorieen en betrokkenenkringen
- [../COMPLIANCE.md Sektion 5](../COMPLIANCE.md#5-drittanbieter-liste) — Volledige sub-verwerkerslijst
- [../COMPLIANCE.md Sektion 7](../COMPLIANCE.md#7-loeschkonzept) — Wissingsconcept en FK-CASCADE-keten
- [../COMPLIANCE.md Sektion 8](../COMPLIANCE.md#8-datenschutzkonforme-defaults) — TOMs volgens AVG Art. 32
- [../COMPLIANCE.md Sektion 9](../COMPLIANCE.md#9-dpo-bewertung-v62-spezifisch) — FG-beoordeling Strategaize Transition BV
- [../../strategaize-dev-system/.claude/rules/data-residency.md](../../../strategaize-dev-system/.claude/rules/data-residency.md) — EU-hosting-plicht

---

## Disclaimer

Dit sjabloon is een pragmatisch technisch standaard sjabloon en vormt **geen juridisch advies**. Voordat het sjabloon productief naar werkelijke partners of contractpartijen wordt verzonden, is een **juridische toetsing** door een gekwalificeerde Functionaris voor Gegevensbescherming (FG) vereist. De toetsing is als BL-104 (V6.2 juridische review) in de backlog opgenomen en is een user-verplichting na /deploy V6.2.

**Datum:** 2026-05-15 (V6.2-Release, SLC-121).
