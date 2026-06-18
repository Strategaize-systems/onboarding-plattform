# FEAT-088 — Controlled Tenant-Tag-Vokabular (Prompt-gesteuert)

- Version: V9.8
- Backlog: BL-505
- Status: planned
- Created: 2026-06-18

## Was
Ein pro-Tenant wachsendes, kontrolliertes Tag-Vokabular, das das LLM bei der Theme-Vergabe aktiv steuert: bestehende Tenant-Tags werden in den Bulk-Import-Prompts injiziert mit der Regel „nutze einen passenden bestehenden Tag; entscheide nur ein neues Tag, wenn nichts passt".

## Warum
Heute generieren `email-pattern-prompt.ts` (Extraktion) und `email-synthesis-prompt.ts` (Synthese) `themes` pro Lauf frei (max 20), ohne Kenntnis bereits vergebener Tags. Synonym-Varianten (antwortzeit / reaktionszeit / antwort-geschwindigkeit) fragmentieren das Wissen → Handbuch-Suche verfehlt Treffer. Findbarkeit ist Produktkern.

## In Scope
- Vokabular-Quelle pro Tenant (Architektur-Fork Q-V9.8-B: on-the-fly aus bestehenden `themes`-Spalten vs. neue `tenant_tag`-Tabelle).
- Injektion des Vokabulars (+ kontrollierte Sections) in Extraktions- + Synthese-Prompt (Q-V9.8-D: beide).
- use-existing-where-fits / only-add-if-novel-Regel im Prompt.
- Obergrenze / Auswahlstrategie der injizierten Tags gegen Token-Budget (Q-V9.8-C).
- Tenant-Isolation (RLS), kein Cross-Tenant-Tag-Leak.

## Out of Scope
- Embedding-Normalisierung synonymer Themes (Titan/pgvector) — deferred (Founder: „nicht ueberdesignen").
- Manuelle Tag-Verwaltungs-UI (umbenennen/mergen/loeschen).
- Retroaktives Re-Tagging.

## Betroffene Bereiche (code-gegroundet)
- `src/lib/ai/bedrock-sonnet/email-pattern-prompt.ts`
- `src/lib/ai/bedrock-sonnet/email-synthesis-prompt.ts`
- evtl. neue `tenant_tag`-Vokabular-Tabelle (+ Migration, RLS) — Architektur entscheidet.

## Erfolg
- Lauf gegen Tenant mit Vokabular reproduziert passende Bestands-Tags statt Synonyme (SC-2).
- Neue Tags nur bei echt Neuem (SC-3).
- Tenant-Isolation verifiziert (SC-4).

## Offene Punkte
Q-V9.8-B/C/D/E (siehe PRD § V9.8 Open questions) → /architecture V9.8.
