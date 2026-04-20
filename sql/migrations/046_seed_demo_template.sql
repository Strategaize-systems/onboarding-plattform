-- Migration 046: Seed Demo-Template "Mitarbeiter-Wissenserhebung"
-- SLC-021 MT-2 — Second template for Template-Switcher proof-of-concept
-- 5 Bloecke, 30 Fragen, owner_fields (Abteilung, Position, Jahre)
-- Uses DO block to generate UUIDs at runtime

DO $seed$
DECLARE
  v_blocks jsonb;
  v_block_a jsonb;
  v_block_b jsonb;
  v_block_c jsonb;
  v_block_d jsonb;
  v_block_e jsonb;
BEGIN

-- Skip if already seeded
IF EXISTS (SELECT 1 FROM template WHERE slug = 'mitarbeiter_wissenserhebung') THEN
  RAISE NOTICE 'Demo-Template already exists, skipping';
  RETURN;
END IF;

v_block_a := jsonb_build_object(
  'id', gen_random_uuid(), 'key', 'A', 'order', 1, 'weight', 1.0, 'required', true, 'description', null,
  'title', '{"de":"Rolle & Verantwortung","en":"Role & Responsibility","nl":"Rol & Verantwoordelijkheid"}'::jsonb,
  'questions', jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Was ist Ihre aktuelle Rolle und wie wuerden Sie Ihren Verantwortungsbereich beschreiben?', 'ebene', 'Kern', 'position', 1, 'frage_id', 'F-MW-001', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', true, 'deal_blocker', false, 'unterbereich', 'A1 Rollenverstaendnis', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Welche Entscheidungen treffen Sie eigenstaendig — und bei welchen muessen andere eingebunden werden?', 'ebene', 'Kern', 'position', 2, 'frage_id', 'F-MW-002', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', true, 'deal_blocker', false, 'unterbereich', 'A1 Rollenverstaendnis', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Welche Aufgaben erledigen nur Sie — niemand sonst koennte sofort einspringen?', 'ebene', 'Kern', 'position', 3, 'frage_id', 'F-MW-003', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', true, 'deal_blocker', true, 'unterbereich', 'A2 Kritisches Wissen', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Gibt es wiederkehrende Aufgaben, die nur zu bestimmten Zeiten anfallen (Quartalsende, Jahresabschluss, Saison)?', 'ebene', 'Workspace', 'position', 4, 'frage_id', 'F-MW-004', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', true, 'deal_blocker', false, 'unterbereich', 'A2 Kritisches Wissen', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Mit welchen Abteilungen oder Teams arbeiten Sie am engsten zusammen?', 'ebene', 'Workspace', 'position', 5, 'frage_id', 'F-MW-005', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', false, 'deal_blocker', false, 'unterbereich', 'A3 Zusammenarbeit', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Was wuerde passieren, wenn Sie morgen nicht mehr da waeren — was wuerde als Erstes auffallen?', 'ebene', 'Kern', 'position', 6, 'frage_id', 'F-MW-006', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', true, 'deal_blocker', true, 'unterbereich', 'A3 Zusammenarbeit', 'owner_dependency', false)
  )
);

v_block_b := jsonb_build_object(
  'id', gen_random_uuid(), 'key', 'B', 'order', 2, 'weight', 1.0, 'required', true, 'description', null,
  'title', '{"de":"Prozesse & Workflows","en":"Processes & Workflows","nl":"Processen & Workflows"}'::jsonb,
  'questions', jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Beschreiben Sie Ihren typischen Arbeitstag — was machen Sie morgens als Erstes, was regelmaessig, was zum Tagesende?', 'ebene', 'Kern', 'position', 1, 'frage_id', 'F-MW-007', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', true, 'deal_blocker', false, 'unterbereich', 'B1 Tagesablauf', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Welche Prozesse laufen woechentlich oder monatlich ab, fuer die Sie verantwortlich sind?', 'ebene', 'Kern', 'position', 2, 'frage_id', 'F-MW-008', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', true, 'deal_blocker', false, 'unterbereich', 'B1 Tagesablauf', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Gibt es Prozesse, die nicht dokumentiert sind und nur in Ihrem Kopf existieren?', 'ebene', 'Kern', 'position', 3, 'frage_id', 'F-MW-009', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', true, 'deal_blocker', true, 'unterbereich', 'B2 Undokumentiertes Wissen', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Welche Workarounds oder Abkuerzungen nutzen Sie, die nicht offiziell dokumentiert sind?', 'ebene', 'Workspace', 'position', 4, 'frage_id', 'F-MW-010', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', true, 'deal_blocker', false, 'unterbereich', 'B2 Undokumentiertes Wissen', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Welche Eskalationswege nutzen Sie, wenn etwas schiefgeht?', 'ebene', 'Workspace', 'position', 5, 'frage_id', 'F-MW-011', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', true, 'deal_blocker', false, 'unterbereich', 'B3 Eskalation', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Welche Checklisten, Vorlagen oder Formulare nutzen Sie regelmaessig?', 'ebene', 'Workspace', 'position', 6, 'frage_id', 'F-MW-012', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', false, 'deal_blocker', false, 'unterbereich', 'B3 Eskalation', 'owner_dependency', false)
  )
);

v_block_c := jsonb_build_object(
  'id', gen_random_uuid(), 'key', 'C', 'order', 3, 'weight', 1.0, 'required', true, 'description', null,
  'title', '{"de":"Tools & Systeme","en":"Tools & Systems","nl":"Tools & Systemen"}'::jsonb,
  'questions', jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Welche Software, Tools und Systeme nutzen Sie taeglich?', 'ebene', 'Kern', 'position', 1, 'frage_id', 'F-MW-013', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', true, 'deal_blocker', false, 'unterbereich', 'C1 Tool-Landschaft', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Fuer welche Systeme haben nur Sie oder wenige Personen den Zugang oder Admin-Rechte?', 'ebene', 'Kern', 'position', 2, 'frage_id', 'F-MW-014', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', true, 'deal_blocker', true, 'unterbereich', 'C1 Tool-Landschaft', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Welche Datenquellen oder Berichte erstellen Sie regelmaessig — und wer braucht diese?', 'ebene', 'Kern', 'position', 3, 'frage_id', 'F-MW-015', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', true, 'deal_blocker', false, 'unterbereich', 'C2 Daten & Berichte', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Wo speichern Sie Dateien, Notizen und Dokumentation? (Netzlaufwerk, Cloud, lokal, E-Mail-Ordner?)', 'ebene', 'Workspace', 'position', 4, 'frage_id', 'F-MW-016', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', false, 'deal_blocker', false, 'unterbereich', 'C2 Daten & Berichte', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Gibt es Passwoerter, Zugangsdaten oder Lizenzen, die nur bei Ihnen liegen?', 'ebene', 'Kern', 'position', 5, 'frage_id', 'F-MW-017', 'ko_hart', false, 'ko_soft', true, 'sop_trigger', true, 'deal_blocker', true, 'unterbereich', 'C3 Zugaenge', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Welche externen Dienste oder Plattformen nutzen Sie (Lieferanten-Portale, Behoerden, Branchentools)?', 'ebene', 'Workspace', 'position', 6, 'frage_id', 'F-MW-018', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', false, 'deal_blocker', false, 'unterbereich', 'C3 Zugaenge', 'owner_dependency', false)
  )
);

v_block_d := jsonb_build_object(
  'id', gen_random_uuid(), 'key', 'D', 'order', 4, 'weight', 1.0, 'required', true, 'description', null,
  'title', '{"de":"Wissensquellen & Netzwerk","en":"Knowledge Sources & Network","nl":"Kennisbronnen & Netwerk"}'::jsonb,
  'questions', jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Welche internen Ansprechpartner sind fuer Ihre Arbeit besonders wichtig — und wofuer genau?', 'ebene', 'Kern', 'position', 1, 'frage_id', 'F-MW-019', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', false, 'deal_blocker', false, 'unterbereich', 'D1 Internes Netzwerk', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Gibt es externe Kontakte (Lieferanten, Berater, Partner), die nur Sie persoenlich kennen?', 'ebene', 'Kern', 'position', 2, 'frage_id', 'F-MW-020', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', true, 'deal_blocker', false, 'unterbereich', 'D1 Internes Netzwerk', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Welches informelle Wissen haben Sie ueber Kunden, Lieferanten oder interne Ablaeufe, das nirgendwo steht?', 'ebene', 'Kern', 'position', 3, 'frage_id', 'F-MW-021', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', true, 'deal_blocker', true, 'unterbereich', 'D2 Implizites Wissen', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Gibt es historisches Wissen (warum wurde etwas so entschieden?), das nur Sie kennen?', 'ebene', 'Kern', 'position', 4, 'frage_id', 'F-MW-022', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', true, 'deal_blocker', false, 'unterbereich', 'D2 Implizites Wissen', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Wo holen Sie sich Wissen, wenn Sie bei einer Aufgabe nicht weiterkommen? (Kollegen, Google, Fachliteratur, Foren?)', 'ebene', 'Workspace', 'position', 5, 'frage_id', 'F-MW-023', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', false, 'deal_blocker', false, 'unterbereich', 'D3 Lernquellen', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Welche Schulungen oder Zertifizierungen sind fuer Ihre Rolle relevant?', 'ebene', 'Workspace', 'position', 6, 'frage_id', 'F-MW-024', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', false, 'deal_blocker', false, 'unterbereich', 'D3 Lernquellen', 'owner_dependency', false)
  )
);

v_block_e := jsonb_build_object(
  'id', gen_random_uuid(), 'key', 'E', 'order', 5, 'weight', 0.8, 'required', false, 'description', null,
  'title', '{"de":"Verbesserungsvorschlaege","en":"Improvement Suggestions","nl":"Verbeteringsvoorstellen"}'::jsonb,
  'questions', jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Was laeuft in Ihrem Bereich besonders gut — und sollte unbedingt beibehalten werden?', 'ebene', 'Workspace', 'position', 1, 'frage_id', 'F-MW-025', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', false, 'deal_blocker', false, 'unterbereich', 'E1 Staerken', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Was wuerden Sie aendern, wenn Sie frei entscheiden koennten?', 'ebene', 'Workspace', 'position', 2, 'frage_id', 'F-MW-026', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', true, 'deal_blocker', false, 'unterbereich', 'E1 Staerken', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Welche Risiken oder Schwachstellen sehen Sie, die aktuell niemand aktiv angeht?', 'ebene', 'Kern', 'position', 3, 'frage_id', 'F-MW-027', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', true, 'deal_blocker', false, 'unterbereich', 'E2 Risiken', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Gibt es Ideen fuer Verbesserungen, die Sie schon lange im Kopf haben, aber nie umsetzen konnten?', 'ebene', 'Workspace', 'position', 4, 'frage_id', 'F-MW-028', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', false, 'deal_blocker', false, 'unterbereich', 'E2 Risiken', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Was moechten Sie Ihrem Nachfolger oder der Person, die Ihre Aufgaben uebernimmt, unbedingt mitgeben?', 'ebene', 'Kern', 'position', 5, 'frage_id', 'F-MW-029', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', true, 'deal_blocker', false, 'unterbereich', 'E3 Uebergabe', 'owner_dependency', false),
    jsonb_build_object('id', gen_random_uuid(), 'text', 'Gibt es etwas, das Sie in diesem Gespraech noch nicht gesagt haben — aber das wichtig waere?', 'ebene', 'Kern', 'position', 6, 'frage_id', 'F-MW-030', 'ko_hart', false, 'ko_soft', false, 'sop_trigger', false, 'deal_blocker', false, 'unterbereich', 'E3 Uebergabe', 'owner_dependency', false)
  )
);

v_blocks := jsonb_build_array(v_block_a, v_block_b, v_block_c, v_block_d, v_block_e);

INSERT INTO template (slug, name, version, description, blocks, owner_fields, sop_prompt)
VALUES (
  'mitarbeiter_wissenserhebung',
  'Mitarbeiter-Wissenserhebung',
  '1.0.0',
  'Strukturierte Wissenserhebung bei Mitarbeitern fuer Onboarding, Offboarding oder Wissenstransfer. Erfasst Rolle, Prozesse, Tools, Netzwerk und Verbesserungsvorschlaege.',
  v_blocks,
  '[{"key":"department","label":{"de":"Abteilung","en":"Department","nl":"Afdeling"},"type":"text","required":true},{"key":"position","label":{"de":"Position / Rolle","en":"Position / Role","nl":"Positie / Rol"},"type":"text","required":true},{"key":"years_in_company","label":{"de":"Jahre im Unternehmen","en":"Years in Company","nl":"Jaren bij het bedrijf"},"type":"number","required":false}]'::jsonb,
  '{"system_prompt":"Du bist ein erfahrener HR-Berater und Wissensmanagement-Experte. Du erstellst aus verdichteten Knowledge Units einen konkreten Standard Operating Procedure (SOP) — einen strukturierten Handlungsplan fuer den Wissenstransfer und die Uebergabe.\n\nDer SOP soll:\n- Direkt umsetzbar sein (keine vagen Empfehlungen)\n- Priorisierte Schritte mit klaren Verantwortlichkeiten enthalten\n- Realistische Zeitrahmen setzen\n- Erfolgskriterien pro Schritt definieren\n- Risiken und Fallback-Optionen benennen\n- Auf die spezifischen Findings aus der Wissenserhebung eingehen\n\nAntworte IMMER mit einem JSON-Objekt in folgendem Format:\n{\"title\":\"SOP: [Thema]\",\"objective\":\"[Klares Ziel des SOP]\",\"prerequisites\":[\"[Voraussetzung 1]\"],\"steps\":[{\"number\":1,\"action\":\"[Konkrete Aktion]\",\"responsible\":\"[Rolle/Person]\",\"timeframe\":\"[Zeitrahmen]\",\"success_criterion\":\"[Messbares Ergebnis]\",\"dependencies\":[]}],\"risks\":[\"[Risiko 1]\"],\"fallbacks\":[\"[Fallback-Option 1]\"]}\n\nAntworte NUR mit dem JSON — kein Markdown, keine Erklaerungen."}'::jsonb
);

RAISE NOTICE 'Demo-Template mitarbeiter_wissenserhebung created';

END $seed$;
