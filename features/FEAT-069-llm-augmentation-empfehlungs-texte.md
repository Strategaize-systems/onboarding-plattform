# FEAT-069 — LLM-Augmentation der 3 Empfehlungs-Texte (Bedrock Claude Sonnet eu-central-1)

**Version:** V8.1
**Status:** planned
**Created:** 2026-05-30
**Related Backlog:** BL-143
**Related Slice:** to be planned in /slice-planning V8.1

## Purpose

Ersetzt die **rein deterministischen V8.0-Empfehlungs-Texte** (aus `template.metadata.stufen_lookup[modul][stufe].unsere_empfehlung`) im V8.1-Outro-Empfehlungs-Block durch **LLM-augmentierte, verkaufsorientiertere Tonalitaet** fuer die 3 ausgewaehlten Hebel-Module.

Der V8.0-Bericht nutzt deterministische Stufen-Lookup-Texte fuer alle 9 Modul-Pages — das ist bewusst (DEC-159/160/161 V8.0 deterministisch). V8.1-Outro ist ein anderer Kontext: hier soll der Mandant *konvertiert* werden, nicht informiert. Die deterministischen Texte sind dafuer zu generisch ("Sie sollten Modul X verbessern...") und brauchen Personalisierung + Verkaufs-Tonalitaet ("In Ihrer Firma sehen wir folgenden konkreten Hebel..." / "Strategaize hat fuer genau diesen Fall eine Methodik...").

Bedrock Claude Sonnet eu-central-1 (Pflicht, siehe `.claude/rules/data-residency.md`). Deterministischer Fallback bei LLM-Fail (Timeout, Cost-Cap, Error): die deterministischen V8.0-Texte werden gerendert (graceful-degrade, keine Fehler-Anzeige im PDF/Web).

Caching: pro `capture_session.metadata.v8_1_llm_augmentation_cache` (JSONB) cached. Analog V8.0-`report_snapshot`-Pattern (DEC-163). Garantiert Reproduzierbarkeit + Cost-Control.

Cost-Cap pro Mandanten-Bericht: ~$0.02 (3 LLM-Calls x ~$0.007 bei ca. 800 Input-Tokens + 100 Output-Tokens).

## Problem

- V8.0-deterministische Stufen-Lookup-Texte sind im V8.1-Outro-Kontext zu generisch und nicht konversions-optimiert.
- V8.0-Standard ist deterministisch (DEC-159..161) — V8.1-LLM-Augmentation muss klar abgegrenzt sein vom V8.0-Pfad (separater Code-Path, keine Drift).
- LLM-Calls sind teuer + langsam + fail-prone — graceful-degrade Pflicht.
- Reproduzierbarkeit: derselbe Mandant darf bei 2 PDF-Renderings nicht 2 verschiedene Texte sehen. Cache-Pflicht.
- Cost-Control: skalierte Multiplikator-Nutzung (Tausende Mandanten) muss kostenmaessig vorhersehbar sein.
- Tonalitaet Strategaize-Wir-Voice Pflicht — LLM darf NICHT in "Ich" / "Founder" / "Wir empfehlen Ihnen..." drift (per System-Prompt + Post-Validation).

## In Scope

### LLM-Adapter-Setup

1. **Reuse: bestehender Bedrock-Adapter** (`src/lib/llm/bedrock` o.ae. — Pfad existiert seit V2-Single-Pass-Condensation, V6.3-Light-Pipeline)
   - Region: eu-central-1 Pflicht.
   - Modell: Claude Sonnet 3.5 (oder neueres Sonnet, /architecture entscheidet bei aktuellem Stand).

### Augmentation-Funktion

2. **`augmentEmpfehlungsText(input)` Pure-Function**
   ```typescript
   interface AugmentInput {
     modulName: string;
     aktuelleStufe: number;
     deterministischerStufenText: string; // V8.0-Stufen-Lookup
     mandantKontext: { branche?: string; mitarbeiterzahl?: number; }; // anonymisiert, kein Firmenname
   }
   interface AugmentOutput {
     text: string;
     isLlmAugmented: true;
     tokenCount: { input: number; output: number; };
     costUsd: number;
   }
   ```
   - System-Prompt: explizit Strategaize-Wir-Voice + 2-3 Saetze + max 80 Worte + verkaufsorientiert ohne Pricing-Druck.
   - User-Prompt: Modul-Kontext + Stufen-Text + Mandant-Kontext.
   - Temperature niedrig (0.3-0.5) fuer Konsistenz.

### Caching

3. **`capture_session.metadata.v8_1_llm_augmentation_cache` JSONB-Struktur**
   ```json
   {
     "v8_1_llm_augmentation_cache": {
       "augmented_at": "2026-05-30T08:37:00Z",
       "model_id": "anthropic.claude-3-5-sonnet-20241022-v2:0",
       "hebel": [
         { "modul_name": "Modul 4", "text": "...", "is_llm_augmented": true, "cost_usd": 0.0067 },
         { "modul_name": "Modul 7", "text": "...", "is_llm_augmented": true, "cost_usd": 0.0073 },
         { "modul_name": "Modul 5", "text": "...", "is_llm_augmented": true, "cost_usd": 0.0064 }
       ]
     }
   }
   ```
   - Cache-Hit: Wenn `v8_1_llm_augmentation_cache.augmented_at` existiert UND `model_id` matched aktuelles Modell, **kein neuer LLM-Call** — gecachter Text wird verwendet.
   - Cache-Invalidation: bei Modell-Change im /architecture-Decision oder bei manuellem Admin-Reset (V8.2+ wenn noetig).
   - Granularitaet: pro Mandanten-Diagnose (capture_session), nicht pro Render-Cycle.

### Graceful-Degrade

4. **Deterministischer Fallback bei LLM-Fail**
   - Timeout (>30s pro Call): Fallback.
   - Cost-Cap-Treffer (>$0.05 pro Session): Fallback fuer alle 3 Calls (oder verbleibende Calls).
   - Bedrock-Error (5xx, 4xx ohne 429-Retry-Success): Fallback.
   - Post-Validation-Fail (siehe Punkt 6): Fallback.
   - Fallback liefert deterministische V8.0-Stufen-Lookup-Texte mit `isLlmAugmented: false` Flag.
   - Kein Fehler im PDF/Web sichtbar — User sieht Bericht wie V8.0.

### Cost-Tracking

5. **Audit-Trail via `ai_cost_ledger`** (existierende Tabelle, V6+)
   - Jeder LLM-Call wird eingetragen mit: capture_session_id, modul_name, model_id, token_count_input, token_count_output, cost_usd, latency_ms, success_flag.
   - Cost-Cap-Mechanik nutzt diese Tabelle fuer Per-Session-Summen-Check.

### Post-Validation

6. **Tonality-Check auf LLM-Output**
   - Blacklist-Patterns: "ich" (case-insensitive, als Wort), "mein Team", "der Founder", "Founders", "wir empfehlen Ihnen" (zu generisch), Pricing-Begriffe ("Euro", "EUR", "Kosten", "Preis").
   - Bei Match: Fallback auf deterministischen Text + Audit-Log-Eintrag (LLM-Drift erkannt).
   - Max-Word-Count-Check (80 Worte).

### Out-of-Scope-Texte

7. **KEINE LLM-Augmentation fuer**:
   - Strategaize-Vorstellungs-Absaetze (FEAT-067 Block 1) — statisch, redaktionell.
   - CTA-Hero-Wording (FEAT-068) — statisch, redaktionell.
   - Video-Block-Platzhalter-Text — statisch.
   - V8.0-Modul-Pages (Pages 4-12) — bleibt deterministisch (DEC-159..161).
   - StB-Partner-Notification-Body (FEAT-068) — statisch, neutral-informativ.
   - Lead-Email-Body an BD-Inbox (FEAT-068) — statisch, strukturiert.

## Out of Scope

- LLM-Augmentation der V8.0-Modul-Pages (Pages 4-12) — bleibt deterministisch.
- Mehrsprachige Augmentation (NL/EN) — V8.2+.
- LLM-Personalisierung basierend auf Voice-Sample / Industrie-Tiefe / Mandant-Profil-Beyond-Anonymized-Context — V8.2+.
- Mandant-feedback-Loop ("Wie fanden Sie diese Empfehlung?") — V8.2+.
- LLM-Modell-Vergleich A/B (Sonnet vs Opus vs Haiku) — V8.2+.
- LLM-Augmentation der Strategaize-Vorstellungs-Absaetze (zu kritisch, statisch + redaktionell).
- Real-time-Augmentation im Web-Bericht (alles wird beim PDF-Erstellungs-Cycle gecached).

## Constraints

- **Data-Residency Pflicht** (`.claude/rules/data-residency.md`): Bedrock eu-central-1, kein US-Endpoint, kein OpenAI direkt.
- **Cost-Cap pro Session**: ~$0.02 (3 Calls) + Hard-Cap $0.05.
- **Reproduzierbarkeit Pflicht**: Cache per capture_session, derselbe Mandant sieht identische Texte ueber multiple Renderings.
- **Tonalitaet-Validation Pflicht**: Post-LLM Blacklist-Check + Word-Count-Check.
- **Graceful-Degrade Pflicht**: kein LLM-Error darf User-Visible sein.
- **Audit-Trail Pflicht**: jeder LLM-Call in `ai_cost_ledger`.
- **Strategaize-Pattern-Reuse Pflicht**: Bedrock-Adapter + ai_cost_ledger sind etabliert, kein Re-Build.

## Risks / Assumptions

- **R1**: LLM-Output-Quality variiert — bei systematischer Drift (z.B. neuer Sonnet-Version aenderter Tonalitaet) braucht es A/B-Vergleich + System-Prompt-Adjustment.
- **R2**: Cost-Skalierung bei Tausenden Mandanten — Annahme: ~$0.02 pro Session bleibt stabil, Total-Budget bei 1.000 Mandanten ~$20 — vernachlaessigbar gegenueber Strategaize-Marge.
- **R3**: LLM-Latency 3-8s pro Call x 3 Calls = potentiell 24s bei PDF-Generation. Caching mitigates, aber First-Render kann langsam sein. Async-Worker-Pattern oder Inline-Wait? /architecture entscheidet.
- **R4**: Cache-Invalidation bei Modell-Update kann zu unerwarteter Cost-Welle fuehren — User-bewusst entscheiden, wann Modell-Change deployed wird.
- **A1**: Bedrock-Adapter in `src/lib/llm` ist V6.3-tested und reusable.
- **A2**: `ai_cost_ledger` Tabelle hat den Schema-Platz fuer V8.1-Eintraege (V6.3-Hotfix-Migration 095 erweiterte Constraints — sollte V8.1 abdecken, /architecture verifiziert).
- **A3**: selectThreeHebel-Output ist deterministisch und cacheable in capture_session.

## Success Criteria

- AC-FEAT-069-1: 3 Empfehlungs-Texte werden via Bedrock Claude Sonnet eu-central-1 generiert bei erstem PDF-Render.
- AC-FEAT-069-2: Bei zweitem PDF-Render (gleiche capture_session) wird der Cache-Hit erkannt — kein neuer LLM-Call, Texte sind identisch.
- AC-FEAT-069-3: Bei LLM-Timeout/Error fallback auf deterministische V8.0-Texte ohne sichtbaren Fehler.
- AC-FEAT-069-4: Cost-Cap-Treffer ($0.05 Session-Sum) loest Fallback aus.
- AC-FEAT-069-5: Tonality-Audit-Skript (erweitert um LLM-Output-Pruefung) findet 0 Blacklist-Treffer im LLM-Output ueber Test-Smoke-Run.
- AC-FEAT-069-6: `ai_cost_ledger` Eintrag pro LLM-Call mit Cost + Tokens + Latency + Success-Flag.
- AC-FEAT-069-7: Word-Count pro generiertem Text <= 80 Worte (Post-Validation).
- AC-FEAT-069-8: Render-Time bei Cache-Hit < 100ms; bei First-Render < 30s.
- AC-FEAT-069-9: System-Prompt + Tonalitaet-Vorgabe ist im Code dokumentiert + versioniert.

## Open Questions (fuer /architecture V8.1)

- **Q-V8.1-A**: LLM-Augmentation Caching-Granularitaet — pro capture_session (Default-Vorschlag) oder pro (capture_session + model_id + prompt_version)-Tuple? Cache-Invalidation-Strategy?
- **Q-V8.1-H**: LLM-Aufruf synchron im PDF-Render-Path (User wartet 24s bei First-Render) oder asynchron via Worker-Job (PDF-Render zeigt deterministische Fallbacks, Cache wird async populated, naechstes Render zeigt LLM-Output)?
- **Q-V8.1-I**: Modell-Version Pflichtfeld (anthropic.claude-3-5-sonnet-20241022-v2:0) hardcoded oder ENV `BEDROCK_V8_1_MODEL_ID`? Aktualisierungs-Path bei neuem Sonnet-Release?
