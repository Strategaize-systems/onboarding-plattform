-- V4.3 Bundle-Smoke-Test-Fixture: Strategaize Business-Case GF-Blueprint
--
-- Idempotent: kann jederzeit re-applied werden, fuegt sich selbst zurueck und neu ein.
-- Wirkung: 1 capture_session + 9 block_checkpoints (A-I) + 9 block_diagnoses + 27 knowledge_units
-- auf Demo-Tenant (00000000-0000-0000-0000-0000000000de), owner = demo-admin@strategaizetransition.com.
--
-- Voraussetzung: Template "exit_readiness" 1.0.0 + demo-admin User existiert.
-- Wiederverwendbar fuer Reader-Smoke + Worker-Output-Tests.
--
-- ID-Konvention (hex-only, sonst UUID-INVALID):
--   capture_session : c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a
--   block_checkpoint: cb000001..cb000009 (Block A-I = Position 1-9)
--   block_diagnosis : bd000001..bd000009
--   knowledge_unit  : cd00X0YZ wo X=Block-Position(1-9), YZ=KU-Index(01-03)
--
-- Workflow zum Anwenden:
--   ssh root@159.69.207.29
--   docker exec -i supabase-db-... psql -U postgres -d postgres < seed-strategaize-business-case.sql
--
-- Workflow zum Cleanup:
--   docker exec -i supabase-db-... psql -U postgres -d postgres -c \
--     "DELETE FROM capture_session WHERE id='c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a';"

BEGIN;

-- 1. Cleanup vorheriger Fixture-Run (idempotent)
DELETE FROM capture_session WHERE id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a';

-- 2. capture_session: GF-Blueprint Strategaize Q1/2026
INSERT INTO capture_session (
  id, tenant_id, template_id, template_version, owner_user_id,
  status, capture_mode, answers, started_at, updated_at
) VALUES (
  'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a',
  '00000000-0000-0000-0000-0000000000de',
  '374f572d-9b2b-4e55-af44-fb0a646f1736',
  '1.0.0',
  'a317e861-60fc-493c-bbab-9c90d6a5cca9',
  'submitted',
  'questionnaire',
  '{"_fixture": "v43-bundle-smoke", "_business_case": "strategaize"}'::jsonb,
  now(), now()
);

-- 3. block_checkpoints (9 Bloecke A-I, alle questionnaire_submit)
INSERT INTO block_checkpoint (
  id, tenant_id, capture_session_id, block_key, checkpoint_type,
  content, content_hash, created_by, created_at
) VALUES
  ('cb000001-cb00-cb00-cb00-cbcbcbcb043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'A', 'questionnaire_submit',
   '{"summary": "B2B-SaaS fuer KMU 50-500 MA mit GF-Transition / Skalierungs-Themen. Drei Plattformen: Onboarding (Wissens-Erhebung), Business System (CRM+Workflow), Blueprint (Strategie). AI-first via Bedrock+Whisper EU, DSGVO-fokussiert."}'::jsonb,
   'sha-A-fixture-043a', 'a317e861-60fc-493c-bbab-9c90d6a5cca9', now()),
  ('cb000002-cb00-cb00-cb00-cbcbcbcb043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'B', 'questionnaire_submit',
   '{"summary": "Solo-Founder (Immo Bellaerts), Sitz NL Limburg. B.V. in Gruendung. Beraternetzwerk fuer Domain-Expertise. Plan: CTO+Sales-Lead in 6-12 Monaten."}'::jsonb,
   'sha-B-fixture-043a', 'a317e861-60fc-493c-bbab-9c90d6a5cca9', now()),
  ('cb000003-cb00-cb00-cb00-cbcbcbcb043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'C', 'questionnaire_submit',
   '{"summary": "Sales→Onboarding→Capture→Bridge→Handbuch in ~4-8 Wochen. Leadgen via LinkedIn + Empfehlung, Sales-Cycle 30-60 Tage. Ad-hoc-Support per Email/Discord."}'::jsonb,
   'sha-C-fixture-043a', 'a317e861-60fc-493c-bbab-9c90d6a5cca9', now()),
  ('cb000004-cb00-cb00-cb00-cbcbcbcb043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'D', 'questionnaire_submit',
   '{"summary": "MRR + Aktive Tenants + Cost-per-Job-Ratio als Kern-KPIs. Bedrock-Cost-Ziel <5% MRR pro Tenant. Founder-Selbstfinanziert mit 18-24 Monate Runway."}'::jsonb,
   'sha-D-fixture-043a', 'a317e861-60fc-493c-bbab-9c90d6a5cca9', now()),
  ('cb000005-cb00-cb00-cb00-cbcbcbcb043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'E', 'questionnaire_submit',
   '{"summary": "Hetzner Cloud Frankfurt+Helsinki, Coolify-managed. AWS Bedrock eu-central-1, Azure Whisper EU, Self-hosted Supabase + pgvector. JWT+RLS-Auth, EU-only-Endpoints."}'::jsonb,
   'sha-E-fixture-043a', 'a317e861-60fc-493c-bbab-9c90d6a5cca9', now()),
  ('cb000006-cb00-cb00-cb00-cbcbcbcb043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'F', 'questionnaire_submit',
   '{"summary": "Founder-Skills: KI-Engineering, SaaS-Architektur, B2B-Sales-Erfahrung. Externe Advisors fuer Sales-Coaching + Domain-Expertise. Notion+GitHub als Wissens-Speicher."}'::jsonb,
   'sha-F-fixture-043a', 'a317e861-60fc-493c-bbab-9c90d6a5cca9', now()),
  ('cb000007-cb00-cb00-cb00-cbcbcbcb043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'G', 'questionnaire_submit',
   '{"summary": "Email + Discord intern, Notion fuer Dokumentation. Externe Kommunikation per Email + LinkedIn. Kein CRM extern bisher (Plan: Strategaize Business System eigen-dogfooden)."}'::jsonb,
   'sha-G-fixture-043a', 'a317e861-60fc-493c-bbab-9c90d6a5cca9', now()),
  ('cb000008-cb00-cb00-cb00-cbcbcbcb043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'H', 'questionnaire_submit',
   '{"summary": "Hiring: CTO+Sales-Lead in 6-12 Monaten, dann Skalierung 3-5 FTE. Outsourcing: Sales-Coaching + Buchhaltung. Skalierungs-Lever: Tenant-Onboarding-Automatisierung."}'::jsonb,
   'sha-H-fixture-043a', 'a317e861-60fc-493c-bbab-9c90d6a5cca9', now()),
  ('cb000009-cb00-cb00-cb00-cbcbcbcb043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'I', 'questionnaire_submit',
   '{"summary": "B.V. NL in Gruendung (Limburg). DSGVO/AVG-Compliance via DPA mit AWS+Azure. Tenant-Vertraege als SaaS-Standard, Compliance-Sprint vor Production-Ready geplant."}'::jsonb,
   'sha-I-fixture-043a', 'a317e861-60fc-493c-bbab-9c90d6a5cca9', now());

-- 4. block_diagnoses (9 Bloecke A-I, alle confirmed, 3 Subtopics pro Block)
INSERT INTO block_diagnosis (
  id, tenant_id, capture_session_id, block_key, block_checkpoint_id,
  content, status, generated_by_model, created_by, created_at
) VALUES
  ('bd000001-bd00-bd00-bd00-bdbdbdbd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'A', 'cb000001-cb00-cb00-cb00-cbcbcbcb043a',
   '{"block_key": "A", "subtopics": [
      {"key": "a1_zielgruppe", "name": "Zielgruppe & Markt", "fields": {"Zielgruppe": "KMU 50-500 MA mit Eigentuemer/GF im Transitions-Modus", "Marktgroesse_DACH_EU": "ca. 100k Unternehmen", "Wettbewerb": "Klassische Beratungsformate, keine direkten KI-SaaS-Wettbewerber"}},
      {"key": "a2_value_proposition", "name": "Value Proposition", "fields": {"Kern": "Strukturierte Wissens-Erhebung mit KI-gestuetzter Verdichtung in Wochen statt Monate", "Differenzierung": "AI-first + DSGVO-konform (EU-Hosting)", "Belegt_durch": "Erste Pilot-Tenants planen go-live Q3/2026"}},
      {"key": "a3_pricing", "name": "Pricing-Modell", "fields": {"Modell": "SaaS-MRR pro Tenant + Implementierungs-Pauschale", "Preisspanne": "EUR 500-2000/Tenant/Monat", "Vertragslaufzeit": "Min. 12 Monate"}}
   ]}'::jsonb,
   'confirmed', 'fixture-v43-bundle-smoke', 'a317e861-60fc-493c-bbab-9c90d6a5cca9', now()),
  ('bd000002-bd00-bd00-bd00-bdbdbdbd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'B', 'cb000002-cb00-cb00-cb00-cbcbcbcb043a',
   '{"block_key": "B", "subtopics": [
      {"key": "b1_eigentuemer", "name": "Eigentuemer-Struktur", "fields": {"Founder": "Immo Bellaerts (100%)", "Rechtsform": "B.V. NL in Gruendung", "Sitz": "Limburg, Niederlande"}},
      {"key": "b2_organisation", "name": "Organisations-Aufbau", "fields": {"Aktuell": "Solo-Founder + Berater-Netzwerk", "Struktur": "Flat, kein Mid-Management", "Berater": "Domain-Expertise + Sales-Coaching extern"}},
      {"key": "b3_stellvertretung", "name": "Stellvertretung & Continuity", "fields": {"Aktuell": "Keine formelle Stellvertretung", "Risiko": "Bus-Faktor 1", "Plan_2026": "CTO + Sales-Lead in Q3/2026"}}
   ]}'::jsonb,
   'confirmed', 'fixture-v43-bundle-smoke', 'a317e861-60fc-493c-bbab-9c90d6a5cca9', now()),
  ('bd000003-bd00-bd00-bd00-bdbdbdbd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'C', 'cb000003-cb00-cb00-cb00-cbcbcbcb043a',
   '{"block_key": "C", "subtopics": [
      {"key": "c1_sales_funnel", "name": "Sales-Funnel", "fields": {"Leadgen": "LinkedIn + Empfehlungen", "Sales_Cycle": "30-60 Tage", "Conversion_Annahme": "ca. 10% Lead→Tenant"}},
      {"key": "c2_delivery", "name": "Delivery-Pipeline", "fields": {"Stages": "Sales → Onboarding → Capture → Bridge → Handbuch", "Dauer_pro_Tenant": "4-8 Wochen", "Automatisierungs_Grad": "70-80%"}},
      {"key": "c3_support", "name": "Support-Modell", "fields": {"Aktuell": "Ad-hoc per Email + Discord", "Skaliert_bis": "Max 10 aktive Tenants", "Plan": "Dediziertes Ticketing + CSM ab 15 Tenants"}}
   ]}'::jsonb,
   'confirmed', 'fixture-v43-bundle-smoke', 'a317e861-60fc-493c-bbab-9c90d6a5cca9', now()),
  ('bd000004-bd00-bd00-bd00-bdbdbdbd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'D', 'cb000004-cb00-cb00-cb00-cbcbcbcb043a',
   '{"block_key": "D", "subtopics": [
      {"key": "d1_kpi_modell", "name": "KPI-Modell", "fields": {"Kern_KPIs": "MRR, Aktive Tenants, Cost-per-Job-Ratio", "Reporting": "Monthly Stand-Alone, kein Dashboard bisher", "Naechster_Schritt": "Strategaize Business System dogfoodden"}},
      {"key": "d2_unit_economics", "name": "Unit-Economics", "fields": {"Bedrock_Cost_Target": "<5% MRR pro Tenant", "Hosting_Cost_pro_Tenant": "ca. EUR 30-50/Monat", "Marge_Brutto_Ziel": ">70%"}},
      {"key": "d3_runway", "name": "Runway & Finanzierung", "fields": {"Modell": "Founder-Selbstfinanziert", "Runway_Monate": "18-24", "External_Funding_Plan": "Bei Product-Market-Fit (>10 Paid-Tenants)"}}
   ]}'::jsonb,
   'confirmed', 'fixture-v43-bundle-smoke', 'a317e861-60fc-493c-bbab-9c90d6a5cca9', now()),
  ('bd000005-bd00-bd00-bd00-bdbdbdbd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'E', 'cb000005-cb00-cb00-cb00-cbcbcbcb043a',
   '{"block_key": "E", "subtopics": [
      {"key": "e1_hosting", "name": "Hosting-Stack", "fields": {"Provider": "Hetzner Cloud", "Regionen": "Frankfurt + Helsinki", "Orchestrator": "Coolify-managed Docker"}},
      {"key": "e2_ai_stack", "name": "AI-Stack", "fields": {"LLM": "AWS Bedrock Claude Sonnet eu-central-1", "Speech_to_Text": "Azure Whisper EU", "Vector_Store": "Self-hosted Supabase + pgvector"}},
      {"key": "e3_security", "name": "Security & Compliance", "fields": {"Auth": "JWT + Row-Level-Security", "Endpoints": "EU-only (DSGVO-DPA mit AWS + Azure)", "Sensitivity": "Audit-Trail pro AI-Call"}}
   ]}'::jsonb,
   'confirmed', 'fixture-v43-bundle-smoke', 'a317e861-60fc-493c-bbab-9c90d6a5cca9', now()),
  ('bd000006-bd00-bd00-bd00-bdbdbdbd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'F', 'cb000006-cb00-cb00-cb00-cbcbcbcb043a',
   '{"block_key": "F", "subtopics": [
      {"key": "f1_founder_skills", "name": "Founder-Skills", "fields": {"Stark": "KI-Engineering, SaaS-Architektur, Produkt-Vision", "Mittel": "B2B-Sales (frueh), DevOps", "Schwach": "Marketing-Skalierung, Finance/Controlling-Tiefe"}},
      {"key": "f2_external_advisors", "name": "Externe Advisors", "fields": {"Domain_Berater": "Beirat fuer KMU-Strategie + Exit-Readiness", "Sales_Coaching": "Externer B2B-Sales-Coach", "Finance": "Buchhaltung extern"}},
      {"key": "f3_knowledge_transfer", "name": "Wissens-Transfer & Doku", "fields": {"Tools": "Notion (Doku) + GitHub (Code)", "Format": "Architektur-Records, Sliced Slices, Onboarding-Skills", "Reuse": "Strategaize Dev-System als Cross-Project-Standard"}}
   ]}'::jsonb,
   'confirmed', 'fixture-v43-bundle-smoke', 'a317e861-60fc-493c-bbab-9c90d6a5cca9', now()),
  ('bd000007-bd00-bd00-bd00-bdbdbdbd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'G', 'cb000007-cb00-cb00-cb00-cbcbcbcb043a',
   '{"block_key": "G", "subtopics": [
      {"key": "g1_internal_tools", "name": "Interne Tools", "fields": {"Email": "IONOS-Hosting (DKIM-konform)", "Chat": "Discord (Solo-Founder + Berater)", "Doku": "Notion"}},
      {"key": "g2_external_comm", "name": "Externe Kommunikation", "fields": {"Primary": "Email + LinkedIn", "Newsletter": "Nicht aktiv", "Owned_Media": "Geplant: Strategaize-Blog ab Q3/2026"}},
      {"key": "g3_documentation", "name": "Dokumentation", "fields": {"Internal": "Notion + GitHub Markdown", "User_Facing": "BL-067-konformes In-App-Help-Center", "Public": "README + onboarding.strategaizetransition.com"}}
   ]}'::jsonb,
   'confirmed', 'fixture-v43-bundle-smoke', 'a317e861-60fc-493c-bbab-9c90d6a5cca9', now()),
  ('bd000008-bd00-bd00-bd00-bdbdbdbd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'H', 'cb000008-cb00-cb00-cb00-cbcbcbcb043a',
   '{"block_key": "H", "subtopics": [
      {"key": "h1_hiring_plan", "name": "Hiring-Plan", "fields": {"Q3_2026": "CTO + Sales-Lead", "Q4_2026": "1-2 Software-Engineers", "Q2_2027": "CSM-Lead bei >15 Tenants"}},
      {"key": "h2_outsourcing", "name": "Outsourcing", "fields": {"Sales_Coaching": "Berater on-demand", "Buchhaltung_NL": "Externes Buero", "Design_Marketing": "Freelancer pro Sprint"}},
      {"key": "h3_scaling_model", "name": "Skalierungs-Modell", "fields": {"Lever": "Tenant-Onboarding-Automatisierung", "Limit": "Bedrock-Throughput + DSGVO-Audit-Aufwand", "Plan": "Self-Service-Onboarding ab V4.2 (released)"}}
   ]}'::jsonb,
   'confirmed', 'fixture-v43-bundle-smoke', 'a317e861-60fc-493c-bbab-9c90d6a5cca9', now()),
  ('bd000009-bd00-bd00-bd00-bdbdbdbd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'I', 'cb000009-cb00-cb00-cb00-cbcbcbcb043a',
   '{"block_key": "I", "subtopics": [
      {"key": "i1_rechtsform", "name": "Rechtsform", "fields": {"Gesellschaft": "B.V. NL in Gruendung", "Sitz": "Limburg", "Geschaeftsjahr": "Kalender"}},
      {"key": "i2_compliance", "name": "Compliance", "fields": {"Datenschutz": "DSGVO + AVG (NL-aequivalent)", "DPA_extern": "AWS Bedrock + Azure Speech (EU-DPA-konform)", "Naechster_Schritt": "Compliance-Sprint vor Pre-Production-Release"}},
      {"key": "i3_vertraege", "name": "Vertragsstruktur", "fields": {"Tenant_Vertrag": "SaaS-Standard, Vertragslaufzeit min. 12 Monate", "DPA_Customer": "Aktuell Standard, Custom-DPA-Template in Vorbereitung", "AGB": "Standard-SaaS-AGB"}}
   ]}'::jsonb,
   'confirmed', 'fixture-v43-bundle-smoke', 'a317e861-60fc-493c-bbab-9c90d6a5cca9', now());

-- 5. knowledge_units (27 KUs, 3 pro Block: 1 finding, 1 observation/risk, 1 risk/action)
-- ID-Pattern: cd00X0YZ wo X=Block-Position(1-9), YZ=KU-Index(01-03)
INSERT INTO knowledge_unit (
  id, tenant_id, capture_session_id, block_checkpoint_id, block_key,
  unit_type, source, title, body, confidence, status, evidence_refs, created_at, updated_at
) VALUES
  -- Block A (Position 1)
  ('cd001001-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000001-cb00-cb00-cb00-cbcbcbcb043a', 'A',
   'finding', 'questionnaire', 'Klare Zielgruppen-Schaerfung',
   'KMU 50-500 Mitarbeiter mit Eigentuemer/GF im Transitions-Modus (Wechsel, Verkauf, Skalierung) sind klar definiert. Marktgroesse DACH+EU ca. 100k Unternehmen.',
   'high', 'accepted', '[]'::jsonb, now(), now()),
  ('cd001002-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000001-cb00-cb00-cb00-cbcbcbcb043a', 'A',
   'observation', 'questionnaire', 'AI-first als Differenzierung',
   'Klassische Beratungsformate sind manuell + langsam. AI-gestuetzte Wissens-Verdichtung in DSGVO-konformer Form ist im Wettbewerb selten.',
   'high', 'accepted', '[]'::jsonb, now(), now()),
  ('cd001003-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000001-cb00-cb00-cb00-cbcbcbcb043a', 'A',
   'risk', 'questionnaire', 'Mittelstand traditionell langsam in SaaS-Adoption',
   'Trotz klarem Pain-Point ist die Mittelstand-Buying-Cycle-Geschwindigkeit ein Risiko. Mitigation: Pilot-Tenants ueber Berater-Empfehlung gewinnen.',
   'medium', 'accepted', '[]'::jsonb, now(), now()),

  -- Block B (Position 2)
  ('cd002001-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000002-cb00-cb00-cb00-cbcbcbcb043a', 'B',
   'finding', 'questionnaire', 'Founder-Fokus auf Produkt + Sales',
   'Solo-Founder konzentriert sich auf Produkt-Architektur + erste Sales-Cycles. Operative Themen (Buchhaltung, Marketing) sind extern vergeben.',
   'high', 'accepted', '[]'::jsonb, now(), now()),
  ('cd002002-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000002-cb00-cb00-cb00-cbcbcbcb043a', 'B',
   'risk', 'questionnaire', 'Bus-Faktor 1 — Single-Point-Dependency',
   'Aktuell keine formelle Stellvertretung. Wenn Founder ausfaellt, gibt es keinen Continuity-Plan. Hoechstes operatives Risiko bis 2026 Q3.',
   'high', 'accepted', '[]'::jsonb, now(), now()),
  ('cd002003-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000002-cb00-cb00-cb00-cbcbcbcb043a', 'B',
   'action', 'questionnaire', 'Stellvertreter-Hire bis Q3/2026',
   'CTO oder Sales-Lead als ersten Hire einplanen. Beide haben Founder-Continuity-Funktion in unterschiedlichen Bereichen.',
   'medium', 'accepted', '[]'::jsonb, now(), now()),

  -- Block C (Position 3)
  ('cd003001-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000003-cb00-cb00-cb00-cbcbcbcb043a', 'C',
   'finding', 'questionnaire', 'Delivery-Prozess strukturiert',
   '5-Stage-Pipeline (Sales → Onboarding → Capture → Bridge → Handbuch) in 4-8 Wochen pro Tenant. 70-80% Automatisierungs-Grad bereits in V4.2.',
   'high', 'accepted', '[]'::jsonb, now(), now()),
  ('cd003002-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000003-cb00-cb00-cb00-cbcbcbcb043a', 'C',
   'observation', 'questionnaire', 'Support skaliert nicht ueber 10 Tenants',
   'Ad-hoc-Support per Email + Discord ist OK fuer Pilot-Phase, aber Engpass-Risiko bei mehr als 10 aktiven Tenants.',
   'medium', 'accepted', '[]'::jsonb, now(), now()),
  ('cd003003-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000003-cb00-cb00-cb00-cbcbcbcb043a', 'C',
   'risk', 'questionnaire', 'Support-Kapazitaet wird Engpass nach Scale',
   'Support-Modell muss vor 10-Tenant-Schwelle umgestellt werden (Ticketing + CSM-Lead). Kritisch fuer Tenant-Retention.',
   'medium', 'accepted', '[]'::jsonb, now(), now()),

  -- Block D (Position 4)
  ('cd004001-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000004-cb00-cb00-cb00-cbcbcbcb043a', 'D',
   'finding', 'questionnaire', 'Unit-Economics gesund',
   'Brutto-Marge-Ziel >70% mit Bedrock-Cost-per-Tenant <5% MRR. Hosting-Cost ca. EUR 30-50 pro Tenant pro Monat — passt zu MRR-Modell EUR 500-2000.',
   'high', 'accepted', '[]'::jsonb, now(), now()),
  ('cd004002-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000004-cb00-cb00-cb00-cbcbcbcb043a', 'D',
   'observation', 'questionnaire', 'Bedrock-on-click-Trigger spart Token-Kosten',
   'KI-Features sind on-demand, nicht auto-load. Spart erheblich Bedrock-Token (BL-396-Pattern). Cost-per-Tenant bleibt unter Plan.',
   'high', 'accepted', '[]'::jsonb, now(), now()),
  ('cd004003-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000004-cb00-cb00-cb00-cbcbcbcb043a', 'D',
   'risk', 'questionnaire', 'Einkommens-Flaute bis erste Cohort live',
   'Founder-Selbstfinanzierung mit 18-24 Monate Runway haengt davon ab dass erste Paid-Tenants in Q3-Q4/2026 liefern. Buffer ist eng.',
   'medium', 'accepted', '[]'::jsonb, now(), now()),

  -- Block E (Position 5)
  ('cd005001-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000005-cb00-cb00-cb00-cbcbcbcb043a', 'E',
   'finding', 'questionnaire', 'EU-Hosting-Stack DSGVO-konform',
   'Hetzner + AWS Bedrock eu-central-1 + Azure Whisper EU + Self-hosted Supabase: alle Endpoints in der EU, alle DPAs vorhanden.',
   'high', 'accepted', '[]'::jsonb, now(), now()),
  ('cd005002-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000005-cb00-cb00-cb00-cbcbcbcb043a', 'E',
   'observation', 'questionnaire', 'Self-hosted Supabase reduziert Vendor-Lock',
   'Pgvector + Postgres + Storage selbst orchestriert via Coolify. Kein Vendor-Lock auf Supabase-Cloud. Migrations-Pfad zu Pure-Postgres jederzeit moeglich.',
   'medium', 'accepted', '[]'::jsonb, now(), now()),
  ('cd005003-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000005-cb00-cb00-cb00-cbcbcbcb043a', 'E',
   'action', 'questionnaire', 'Compliance-Sprint vor Production-Ready',
   'Aktuell Internal-Test-Mode. Pre-Production benoetigt Compliance-Sprint mit DPA-Template, Anwaltspruefung, Audit-Trail-Vervollstaendigung.',
   'high', 'accepted', '[]'::jsonb, now(), now()),

  -- Block F (Position 6)
  ('cd006001-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000006-cb00-cb00-cb00-cbcbcbcb043a', 'F',
   'finding', 'questionnaire', 'Founder-Skills decken 80% V1 ab',
   'KI-Engineering, SaaS-Architektur, B2B-Sales-Erfahrung sind im Founder bereits vorhanden. Reicht fuer V1-Auslieferung.',
   'high', 'accepted', '[]'::jsonb, now(), now()),
  ('cd006002-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000006-cb00-cb00-cb00-cbcbcbcb043a', 'F',
   'risk', 'questionnaire', 'Tiefere Sales-Domain-Expertise fehlt',
   'Cold-Outbound-B2B-Sales und Enterprise-Sales-Cycle (>5k MRR) sind fuer Founder Neuland. Externer Sales-Coach gleicht das teilweise aus.',
   'medium', 'accepted', '[]'::jsonb, now(), now()),
  ('cd006003-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000006-cb00-cb00-cb00-cbcbcbcb043a', 'F',
   'action', 'questionnaire', 'Beirats-Aufbau bis Q4/2026',
   'Beirat aus 3-4 Domain-Experten (Mittelstand-Strategie, Exit-Readiness, B2B-SaaS-Skalierung) als externer Wissens-Multiplier.',
   'medium', 'accepted', '[]'::jsonb, now(), now()),

  -- Block G (Position 7)
  ('cd007001-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000007-cb00-cb00-cb00-cbcbcbcb043a', 'G',
   'finding', 'questionnaire', 'Kommunikations-Tools etabliert',
   'IONOS-Email (DKIM), Discord intern, Notion fuer Doku, GitHub fuer Code. Alle Tools laufen stabil und sind DSGVO-konform.',
   'high', 'accepted', '[]'::jsonb, now(), now()),
  ('cd007002-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000007-cb00-cb00-cb00-cbcbcbcb043a', 'G',
   'observation', 'questionnaire', 'Kein CRM extern bisher',
   'Sales-Pipeline aktuell in Notion + Spreadsheet. Plan: Strategaize Business System (V5+ released) eigen-dogfooden.',
   'medium', 'accepted', '[]'::jsonb, now(), now()),
  ('cd007003-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000007-cb00-cb00-cb00-cbcbcbcb043a', 'G',
   'action', 'questionnaire', 'Strategaize Business System eigen-dogfooden',
   'Erste echte Tenant-Anbindung an internes Business System ab Q3/2026. Eigenes Tool als groesster Glaubwuerdigkeits-Beweis.',
   'high', 'accepted', '[]'::jsonb, now(), now()),

  -- Block H (Position 8)
  ('cd008001-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000008-cb00-cb00-cb00-cbcbcbcb043a', 'H',
   'finding', 'questionnaire', 'Hiring-Plan klar, Timing flexibel',
   'CTO + Sales-Lead in 6-12 Monaten, dann 1-2 Engineers in Q4/2026, CSM-Lead bei >15 Tenants. Plan ist staged und cost-conscious.',
   'medium', 'accepted', '[]'::jsonb, now(), now()),
  ('cd008002-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000008-cb00-cb00-cb00-cbcbcbcb043a', 'H',
   'risk', 'questionnaire', 'Hiring-Markt fuer KI-Engineers angespannt',
   'Senior-KI-Engineers im DACH-Raum schwer zu finden, Loehne hoch. Mitigation: Open-Source-Beitraege als Talent-Pipeline + Remote-EU-Hiring.',
   'medium', 'accepted', '[]'::jsonb, now(), now()),
  ('cd008003-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000008-cb00-cb00-cb00-cbcbcbcb043a', 'H',
   'action', 'questionnaire', 'Talent-Pipeline ueber Open-Source-Beitraege',
   'Strategaize Dev-System Open-Source-isieren als Talent-Magnet. Parallel: technische Blogs ueber AI-Engineering.',
   'low', 'accepted', '[]'::jsonb, now(), now()),

  -- Block I (Position 9)
  ('cd009001-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000009-cb00-cb00-cb00-cbcbcbcb043a', 'I',
   'finding', 'questionnaire', 'Rechtsstruktur passt zu V1-Zielmarkt',
   'B.V. NL Limburg ermoeglicht EU-Wide-Vertrieb mit DSGVO/AVG-Compliance ohne zusaetzliche EU-Verlagerungs-Hueren.',
   'high', 'accepted', '[]'::jsonb, now(), now()),
  ('cd009002-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000009-cb00-cb00-cb00-cbcbcbcb043a', 'I',
   'observation', 'questionnaire', 'B.V.-Gruendung in Endphase',
   'Gruendungsprozess B.V. NL laeuft seit 2026-Q2, Abschluss erwartet Q3/2026. Bis dahin Sole-Trader-Setup.',
   'medium', 'accepted', '[]'::jsonb, now(), now()),
  ('cd009003-cdcd-cdcd-cdcd-cdcdcdcd043a', '00000000-0000-0000-0000-0000000000de', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a', 'cb000009-cb00-cb00-cb00-cbcbcbcb043a', 'I',
   'action', 'questionnaire', 'DPA-Template bis Pre-Production-Sprint',
   'Custom-DPA-Template (Tenant-Vertrag-Anhang) muss vor erstem Paid-Tenant fertig sein. Anwaltspruefung im Compliance-Sprint geplant.',
   'high', 'accepted', '[]'::jsonb, now(), now());

COMMIT;

-- Verifikation
SELECT 'capture_session' AS what, count(*) FROM capture_session WHERE id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a'
UNION ALL SELECT 'block_checkpoints', count(*) FROM block_checkpoint WHERE capture_session_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a'
UNION ALL SELECT 'block_diagnoses', count(*) FROM block_diagnosis WHERE capture_session_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a'
UNION ALL SELECT 'knowledge_units', count(*) FROM knowledge_unit WHERE capture_session_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1043a';
