-- Migration 099a: V7.1 SLC-138 partner_diagnostic Helper-Texts Initial-Content
-- SLC-138 MT-3 (FEAT-057, MIG-045) — DEC-073, DEC-142
--
-- ZIEL
-- ====
-- Seeded helper_text + examples_md fuer alle 24 Fragen des partner_diagnostic v1
-- Templates. Jeder Eintrag <= 300 / 800 chars (DEC-073) — Validation-Function
-- aus Migration 099 garantiert das via Trigger.
--
-- Inhaltsquelle: LLM-Draft 2026-05-21, Founder-Review-pending via EditableText
-- (SLC-137 Foundation). Texte sind Branchen-neutral fuer Steuerberater-Mandanten:
-- Mittelstand, KMU, Beratung, Handwerk, Handel.
--
-- IDEMPOTENZ
-- ==========
-- - Helper-Function `_mig099a_set_question_helper` ist CREATE OR REPLACE
-- - UPDATEs sind idempotent via jsonb_set
-- - Cleanup am Ende (DROP FUNCTION)
-- - Zweiter Apply ueberschreibt mit denselben Texten, kein Drift
--
-- APPLY-PATTERN (sql-migration-hetzner.md)
-- ========================================
--   base64 -w 0 sql/migrations/099a_v71_partner_diagnostic_helper_initial_content.sql
--   echo '<BASE64>' | base64 -d > /tmp/099a_v71.sql
--   docker exec -i <db-container> psql -U postgres -d postgres < /tmp/099a_v71.sql
--   docker exec -i <db-container> psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema'"
--
-- VERIFIKATION (nach Apply)
-- =========================
--   SELECT q->>'key' AS qkey,
--          char_length(q->>'helper_text') AS h_len,
--          char_length(q->>'examples_md') AS e_len
--     FROM public.template,
--          jsonb_array_elements(blocks) block,
--          jsonb_array_elements(block->'questions') q
--    WHERE slug='partner_diagnostic'
--    ORDER BY qkey;
--   -- erwartet: 24 Rows, h_len <= 300, e_len <= 800

-- ============================================================
-- 1. Helper-Function: setze helper_text + examples_md by question_key
-- ============================================================
-- Iteriert blocks[].questions[], findet Frage by key, merged Felder.
-- Verlaesst Frage-Reihenfolge + andere Felder unangetastet.

CREATE OR REPLACE FUNCTION public._mig099a_set_question_helper(
  p_slug text,
  p_question_key text,
  p_helper_text text,
  p_examples_md text
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  template_rec record;
  new_blocks jsonb := '[]'::jsonb;
  block jsonb;
  new_block jsonb;
  q jsonb;
  new_questions jsonb;
  new_q jsonb;
  found_question boolean := false;
  -- NB: Do NOT name a local variable `found` — PL/pgSQL has a built-in FOUND
  -- variable that gets shadowed and `IF NOT FOUND` would reference the local
  -- one instead of the SELECT INTO result.
BEGIN
  SELECT id, blocks INTO template_rec
    FROM public.template
   WHERE slug = p_slug
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template % not found', p_slug;
  END IF;

  FOR block IN SELECT * FROM jsonb_array_elements(template_rec.blocks)
  LOOP
    new_questions := '[]'::jsonb;
    FOR q IN SELECT * FROM jsonb_array_elements(block->'questions')
    LOOP
      IF q->>'key' = p_question_key THEN
        new_q := q || jsonb_build_object(
          'helper_text', p_helper_text,
          'examples_md', p_examples_md
        );
        found_question := true;
      ELSE
        new_q := q;
      END IF;
      new_questions := new_questions || jsonb_build_array(new_q);
    END LOOP;
    new_block := jsonb_set(block, '{questions}', new_questions);
    new_blocks := new_blocks || jsonb_build_array(new_block);
  END LOOP;

  IF NOT found_question THEN
    RAISE EXCEPTION 'Question key % not found in template %', p_question_key, p_slug;
  END IF;

  UPDATE public.template
     SET blocks = new_blocks
   WHERE slug = p_slug;
END;
$$;

-- ============================================================
-- 2. Seed 24 Fragen
-- ============================================================
-- BLOCK 1: Strukturelle KI-Reife (ki_reife)

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'ki_reife.q1',
  'Zentrale Systeme sind Software-Anwendungen, in denen Geschaeftsdaten gepflegt werden — z.B. ERP, CRM, Rechnungstool, Projektsoftware. Je mehr Systeme parallel laufen, desto schwerer wird ein einheitlicher Ueberblick und desto haeufiger muessen Daten manuell uebertragen werden.',
  E'- **Steuerberatung**: DATEV + Tax-Software + Outlook + Excel-Mandantenliste = 4 Systeme\n- **Handwerk**: Auftrags-Software + Buchhaltung + Excel-Materialplanung + WhatsApp-Gruppe = 4 Systeme\n- **Beratung**: HubSpot CRM + Notion + Toggl + Stripe + DropBox = 5 Systeme'
);

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'ki_reife.q2',
  'Stammdaten sind die Grunddaten Ihrer Firma — Kunde, Ansprechpartner, Preisliste, Produktkatalog. Verlaesslich heisst: aktuell, vollstaendig, eindeutig und in einem System. Unsaubere Stammdaten fuehren zu Doppelarbeit, falschen Rechnungen und unklaren Auswertungen.',
  E'- **Unklare Stammdaten**: Kunde steht in 3 Systemen mit unterschiedlicher Adresse; niemand weiss welche stimmt\n- **Saubere Stammdaten**: Kunde wird einmal im CRM angelegt, ERP zieht Adresse automatisch\n- **Pflege-Luecke**: Preisliste aus 2024 steht noch im System, Vertrieb nutzt Excel mit aktuellen Preisen'
);

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'ki_reife.q3',
  'Datenverantwortung bedeutet: eine bestimmte Person ist namentlich zustaendig fuer Pflege, Korrektheit und Weiterentwicklung eines Systems oder Datenbereichs. Ohne klare Zustaendigkeit verwahrlost Datenqualitaet schleichend, niemand fuehlt sich verantwortlich.',
  E'- **Klar geregelt**: Frau Schmidt ist Datenverantwortliche fuer das CRM, kuemmert sich um Stammdaten-Pflege\n- **Niemand zustaendig**: CRM gehoert dem Vertrieb gefuehlt, aber pflegen tut keiner aktiv\n- **Geteilte Verantwortung**: IT, Vertrieb und Buchhaltung machen jeweils ein bisschen, niemand hat den Gesamtueberblick'
);

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'ki_reife.q4',
  'Strukturierte Prozesse laufen in Software mit Status, Verantwortlichen, Zeitstempeln. Unstrukturierte Prozesse laufen ueber E-Mail-Threads, muendliche Absprachen oder einzelne Excel-Dateien — schwer reproduzierbar, schlecht messbar, anfaellig bei Ausfall.',
  E'- **Strukturiert**: Angebote werden im CRM erstellt, mit Status (offen/gewonnen/verloren) und Verantwortlichem\n- **E-Mail-Chaos**: Reklamationen werden per Mail an Sammeladresse gemeldet, jeder antwortet zufaellig\n- **Excel-Insel**: Materialplanung laeuft ueber eine zentrale Datei, die nur eine Person sauber pflegt'
);

-- BLOCK 2: Entscheidungs-Qualitaet

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'entscheidungs_qualitaet.q1',
  'Festhalten von Entscheidungen heisst: Was wurde entschieden, von wem, mit welcher Begruendung und mit welchen Konsequenzen — dokumentiert an einer auffindbaren Stelle. Muendlich getroffene Entscheidungen ohne Notiz verlieren ihren Kontext und werden spaeter hinterfragt.',
  E'- **Muendlich**: Geschaeftsfuehrung entscheidet im Bueroflur, alle Beteiligten merken sich nur Teile\n- **Protokoll**: Entscheidungs-Beschluss steht im Meeting-Protokoll mit Datum und Beteiligten\n- **Strukturiert**: Eigenes Entscheidungslog in Notion/Confluence mit Begruendung und betroffenen Bereichen'
);

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'entscheidungs_qualitaet.q2',
  'Ausfallsicherheit heisst: Operative und kleinere strategische Entscheidungen koennen ohne den Inhaber/Geschaeftsfuehrer getroffen werden, weil Regeln, Befugnisse und Hintergruende schriftlich vorliegen. Haengt alles am Chef, ist die Firma erpressbar von seinem Kalender.',
  E'- **Voll abhaengig**: Bei Urlaub des GF werden alle Entscheidungen aufgeschoben, Mandanten warten\n- **Teilweise vertretbar**: Operatives laeuft weiter, aber Sonderfaelle wie Preise/Rabatte stocken\n- **Voll vertretbar**: Stellvertreter haben Regelwerk + Befugnisse, GF nur bei strategischen Fragen noetig'
);

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'entscheidungs_qualitaet.q3',
  'Entscheidungs-Review bedeutet: Nach 3-12 Monaten wird geprueft, ob eine groessere Entscheidung (Investition, Personalwechsel, neue Software, Preisanpassung) das erhoffte Ergebnis gebracht hat. Ohne Review lernt die Firma nicht aus ihren eigenen Entscheidungen.',
  E'- **Nie**: Entscheidungen werden getroffen, Ergebnis wird nicht systematisch geprueft\n- **Adhoc**: Bei sichtbaren Problemen wird hinterfragt, sonst nicht\n- **Strukturiert**: Investitionen bekommen 6-Monats-Review im Quartals-Meeting mit klarem Erfolgskriterium'
);

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'entscheidungs_qualitaet.q4',
  'Datenbasierte Entscheidungen stuetzen sich auf Zahlen, Auswertungen und nachvollziehbare Fakten. Bauchentscheidungen basieren auf Erfahrung und Intuition. Problematisch wird es, wenn keine Daten verfuegbar sind, obwohl sie eigentlich vorhanden waeren.',
  E'- **Bauch**: Preise werden nach Gefuehl angepasst, ohne Margenrechnung\n- **Gemischt**: Groessere Entscheidungen mit Excel-Auswertung, operatives nach Erfahrung\n- **Datenbasiert**: KPI-Dashboard pro Bereich, monatliche Review-Meetings mit klaren Kennzahlen'
);

-- BLOCK 3: Schriftlich festgehaltene Entscheidungen

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'schriftliche_entscheidungen.q1',
  'Schriftliche Entscheidungsgrundlagen sind Regeln, Befugnisse und Eskalations-Pfade in dokumentierter Form. Sie ermoeglichen Stellvertretern, eigenstaendig zu entscheiden, ohne den GF anrufen zu muessen. Der Anteil zeigt, wie betriebsblind die Firma ohne den GF waere.',
  E'- **Unter 30%**: Stellvertreter darf kleine operative Themen entscheiden, bei allem darueber wartet er\n- **50-70%**: Standard-Prozesse laufen, Sonderfaelle (Rabatte, Personal, IT-Kaeufe) blockieren\n- **Ueber 80%**: Klare Regeln + Eskalations-Matrix, GF wird nur bei wirklich strategischen Themen gebraucht'
);

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'schriftliche_entscheidungen.q2',
  'Sonderregeln entstehen ueber Jahre — Rabatt fuer Kunde X, Sonderkondition fuer Lieferant Y, abweichende Zahlungsziele bei Grossprojekten. Sind diese nur in den Koepfen einzelner Mitarbeiter, gehen sie bei Personalwechsel verloren oder werden inkonsistent angewendet.',
  E'- **Koepfe**: GF und Vertriebsleiter wissen die Sonderregeln auswendig, neue Mitarbeiter raetseln\n- **Verstreut**: Teil im CRM-Notizfeld, Teil in alten E-Mails, Teil in Excel\n- **Zentral**: Eigene Sonderkonditions-Liste pro Kunde mit Gueltigkeit, Quelle und Verantwortlichem'
);

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'schriftliche_entscheidungen.q3',
  'Entscheidungs-Kontext bedeutet: zu jeder wichtigen Regel ist dokumentiert, warum sie eingefuehrt wurde, welches Problem sie loest und wann sie ueberdacht werden sollte. Ohne Kontext wirken Regeln willkuerlich und werden umgangen oder vorschnell geaendert.',
  E'- **Ohne Kontext**: "Bei Auftrag ueber 50T€ braucht es GF-Freigabe" — niemand weiss, warum\n- **Mit Kontext**: Gleiche Regel + Notiz "eingefuehrt 2023 nach Verlustprojekt XY zur Marge-Sicherung"\n- **Mit Review**: Zusaetzlich "2027 pruefen, ob Schwelle anzupassen"'
);

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'schriftliche_entscheidungen.q4',
  'Ein kritischer Wissensbereich ist ein Themengebiet, ohne das ein Kernprozess der Firma nicht funktioniert — z.B. Stammkunden-Historie, Lieferanten-Sonderkonditionen, IT-Konfiguration, Vertrags-Klauseln. Wenn dieses Wissen nur in einem Kopf liegt, ist die Firma erpressbar.',
  E'- **Beispiele**: Stammkunden-Historie, IT-Setup, Vertrags-Sonderklauseln, Buchhaltungs-Eigenheiten\n- **Niedrig (0-2)**: Wissen ist verteilt, Stellvertretung jederzeit moeglich\n- **Mittel (3-5)**: Einzelne Bereiche haengen an Personen, bei Ausfall entstehen Engpaesse\n- **Hoch (6+)**: Mehrere Bereiche personalisiert, jede Kuendigung erschuettert den Betrieb'
);

-- BLOCK 4: SOPs

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'sops.q1',
  'SOP (Standard Operating Procedure) ist eine schriftliche Schritt-fuer-Schritt-Anleitung fuer wiederkehrende Aufgaben mit Ausloeser, Ablauf, Verantwortlichen und Tools. Sie macht Prozesse reproduzierbar, pruefbar und uebertragbar an neue Mitarbeiter.',
  E'- **Angebot**: Anfrage pruefen → Daten ins CRM → Kalkulation → Angebot generieren → Versand → Wiedervorlage\n- **Reklamation**: Eingang erfassen → 24h-Eingangsbestaetigung → Ursache pruefen → Loesung anbieten → Doku ins CRM\n- **Einarbeitung**: Tag-1-Checkliste, Wochenziele, Mentor, Review-Termine'
);

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'sops.q2',
  'Einarbeitungs-Material zeigt, wie verdichtet das Firmenwissen ist. Eine Aufgabe gut uebergeben heisst: schriftliche Anleitung + Uebungen + Ansprechpartner + Review-Termine. Ohne Material ist die Einarbeitung anstrengend, fehleranfaellig und stark vom Uebergebenden abhaengig.',
  E'- **Nichts**: Neuer Mitarbeiter lernt durch Beobachten und Fragen, dauert Wochen\n- **Muendlich**: Uebergeber zeigt, neuer macht nach, beide hoffen es klappt\n- **SOP + Begleitung**: Schriftliche Anleitung, Mentor fuer 2 Wochen, klare Review-Punkte\n- **Komplett**: SOP + Video-Walkthrough + Uebungs-Dataset + Fragenkatalog'
);

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'sops.q3',
  'SOPs veralten, wenn Tools, Personen oder Anforderungen sich aendern. Ohne regelmaessige Updates klafft die Schere zwischen dokumentierter Theorie und gelebter Praxis — bis das Dokument unbrauchbar ist. Pflege-Rhythmus + Verantwortlicher pro SOP sind Pflicht.',
  E'- **Nie**: SOP wurde 2019 erstellt und nie ueberarbeitet, niemand nutzt sie noch\n- **Bei Bedarf**: Wenn etwas schiefgeht, wird die SOP angefasst\n- **Strukturiert**: Jede SOP hat Verantwortlichen + jaehrlichen Review-Termin\n- **Live**: Kontinuierliches Feedback aus Praxis fliesst direkt in die SOP zurueck'
);

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'sops.q4',
  'Prozess-Konsistenz heisst: dieselbe Aufgabe wird unabhaengig vom Bearbeiter im gleichen Schritt-Schema erledigt, mit dem gleichen Output-Format. Hohe Varianz fuehrt zu inkonsistenter Kundenerfahrung, schlechter Vergleichbarkeit und Personenabhaengigkeit.',
  E'- **Hohe Varianz**: Jeder Vertriebler bietet anders an, jeder Buchhalter dokumentiert anders\n- **Mittlere Varianz**: Grobformat gleich, Details unterschiedlich\n- **Niedrige Varianz**: Standard-Templates, klare Felder, einheitlicher Output\n- **Voll konsistent**: Tooling erzwingt Format, Abweichungen sind sichtbar und werden geprueft'
);

-- BLOCK 5: Unternehmerhandbuch

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'unternehmerhandbuch.q1',
  'Ein Unternehmerhandbuch ist die schriftliche Beschreibung der Firma: Geschaeftsmodell, Strategie, Organisation, Prozesse, Regeln, Werte. Es ist die Antwort auf "Wie funktioniert diese Firma?" und ermoeglicht systematische Einarbeitung, Nachfolge und Verkauf.',
  E'- **Nicht vorhanden**: Wissen verteilt auf Kopf + Excel + verstreute Dokumente\n- **Teilweise**: Einzelne Bereiche dokumentiert (HR-Handbuch, Vertriebs-Playbook), aber kein Gesamtbild\n- **Vorhanden**: Strukturiertes Handbuch in Notion/Confluence/Sharepoint mit Geschaeftsmodell, Organisation, Prozessen'
);

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'unternehmerhandbuch.q2',
  'Onboarding-Reife der Geschaeftsleitung zeigt, wie verkaufsfaehig die Firma ist. Wenn ein neuer Geschaeftsfuehrer 4 Wochen braucht statt 4 Monate, ist das Wissen verdichtet und transferierbar. Gleicher Test wie bei einem Unternehmensverkauf: kann der Kaeufer uebernehmen?',
  E'- **Mehr als 6 Monate**: Nur durch jahrelange Beobachtung lernbar, der bisherige GF muss mit\n- **3-6 Monate**: Standard-Einarbeitung mit Uebergabe-Termin, viele Detailfragen\n- **4-12 Wochen**: Handbuch + Mentor + strukturierte Uebergabe — verkaufsfaehige Firma'
);

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'unternehmerhandbuch.q3',
  'Strategische Klarheit bedeutet: Zielkunden, Leistungsversprechen, Wettbewerbsposition und Prioritaeten sind dokumentiert und allen Fuehrungskraeften bekannt. Ohne schriftliche Strategie laufen Vertrieb, Marketing und Produktentwicklung in unterschiedliche Richtungen.',
  E'- **Im Kopf**: GF kennt die Strategie, Mitarbeiter erraten Prioritaeten\n- **Powerpoint im Schrank**: Strategie-Folien existieren von 2022, niemand schaut rein\n- **Lebendig**: Strategie-Onepager im Handbuch, jaehrlich ueberprueft, im Onboarding besprochen'
);

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'unternehmerhandbuch.q4',
  'Eine Dokumentation, die nicht genutzt wird, ist Friedhof. Wichtig ist nicht Vollstaendigkeit, sondern Auffindbarkeit, Aktualitaet und Verankerung in Alltagsroutinen — z.B. im Onboarding, bei Reviews, bei Entscheidungen, als Lookup-Referenz.',
  E'- **Friedhof**: Doku existiert, niemand schaut rein\n- **Onboarding-only**: Neuer Mitarbeiter blaettert einmal durch, danach vergessen\n- **Punktuell**: Bei konkreten Fragen wird nachgeschlagen\n- **Verankert**: Doku ist Quelle fuer Entscheidungen, Reviews und Prozess-Updates; aktive Pflege im Alltag'
);

-- BLOCK 6: Workaround-Dunkelziffer

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'workaround_dunkelziffer.q1',
  'Schatten-Listen sind Excel- oder Notion-Dateien, die Mitarbeiter parallel zu den offiziellen Systemen fuehren, weil diese ihre Beduerfnisse nicht abdecken. Sie sind ein Hinweis auf Luecken in den Hauptsystemen und auf Datenrisiken bei Ausfall der Schatten-Person.',
  E'- **Typische Beispiele**: Vertriebspipeline-Excel parallel zum CRM, Material-Bestellliste parallel zum ERP\n- **Niedrig (0-2)**: Hauptsysteme decken den Alltag ab, kaum Workarounds\n- **Mittel (3-5)**: Einzelne Bereiche behelfen sich, aber System-Luecken werden gemanagt\n- **Hoch (6+)**: Schatten-Tools sind Realitaet, offizielle Systeme nur halb genutzt'
);

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'workaround_dunkelziffer.q2',
  'Export-Bearbeiten-Weiterverwenden ist ein Anti-Pattern: Daten verlassen das System, werden manuell veraendert und tauchen dann in Reports oder anderen Tools auf. Jeder Schritt bricht den Audit-Trail, erhoeht Fehlerquote und macht Auswertungen schwer reproduzierbar.',
  E'- **Selten**: Systeme integrieren sich, Daten fliessen automatisch\n- **Regelmaessig**: Monatlicher Excel-Export aus ERP fuer Monatsabschluss, manuelle Korrekturen\n- **Taeglich**: Mehrere Mitarbeiter exportieren, bearbeiten und arbeiten in Excel weiter\n- **Standard**: Auswertungen entstehen prinzipiell in Excel, Systeme sind reine Datenablage'
);

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'workaround_dunkelziffer.q3',
  'Inoffizielle Tools sind privat installierte Apps oder Cloud-Dienste, die Mitarbeiter fuer Firmenarbeit nutzen — z.B. WhatsApp-Gruppen, private Google-Sheets, Notion-Accounts. Sie umgehen IT-Governance, schaffen DSGVO-Risiken und fuehren zu Datenfragmentierung.',
  E'- **Keine**: Klare IT-Liste, alle nutzen freigegebene Tools\n- **Geduldet**: WhatsApp-Gruppen fuer Schichtplanung, nicht offiziell aber bekannt\n- **Verbreitet**: Private Google-Sheets, private Notion-Accounts, private DropBox-Ordner\n- **Risiko**: DSGVO-Bruch (Kundendaten in WhatsApp), kein Zugriff bei Mitarbeiter-Austritt'
);

SELECT public._mig099a_set_question_helper(
  'partner_diagnostic',
  'workaround_dunkelziffer.q4',
  'Workaround-Transparenz bedeutet: jemand weiss, welche Schatten-Listen, inoffiziellen Tools und Excel-Workarounds existieren. Ohne diesen Ueberblick lebt die Firma mit blinden Flecken — bei Personalwechsel verschwinden Listen, niemand merkt es bis zum Schaden.',
  E'- **Niemand**: Workarounds sind ueber Mitarbeiter verteilt, niemand kennt das Gesamtbild\n- **GF teilweise**: Geschaeftsfuehrung kennt die groessten Schatten-Listen, nicht alle Details\n- **IT/Datenverantwortlicher**: Hat aktive Inventur und prueft regelmaessig\n- **Strukturiert**: Workaround-Register als Teil des Risk-Managements'
);

-- ============================================================
-- 3. Cleanup Helper-Function
-- ============================================================
-- Function war one-shot Tool fuer diese Migration. Nicht im Production-Surface.

DROP FUNCTION IF EXISTS public._mig099a_set_question_helper(text, text, text, text);

-- ============================================================
-- 4. Post-Apply Validation
-- ============================================================
-- Alle 24 Fragen muessen jetzt helper_text + examples_md haben,
-- und validate_helper_text_schema muss NULL liefern.

DO $$
DECLARE
  rec record;
  expected_count int := 24;
  actual_count int;
BEGIN
  SELECT count(*)
    INTO actual_count
    FROM public.template,
         jsonb_array_elements(blocks) block,
         jsonb_array_elements(block->'questions') q
   WHERE slug='partner_diagnostic'
     AND q->>'helper_text' IS NOT NULL
     AND q->>'examples_md' IS NOT NULL;

  IF actual_count != expected_count THEN
    RAISE EXCEPTION 'MIG-045/099a Post-Apply: erwartet % Fragen mit Helper-Texts, gefunden %',
      expected_count, actual_count;
  END IF;

  RAISE NOTICE 'MIG-045/099a: % Fragen mit Helper-Texts seeded', actual_count;

  -- Schema-Validation
  SELECT slug, public.validate_helper_text_schema(blocks) AS violation
    INTO rec
    FROM public.template
   WHERE slug='partner_diagnostic';

  IF rec.violation IS NOT NULL THEN
    RAISE EXCEPTION 'MIG-045/099a Post-Apply Schema-Violation: %', rec.violation::text;
  END IF;

  RAISE NOTICE 'MIG-045/099a: schema validation PASSED for partner_diagnostic';
END;
$$;
