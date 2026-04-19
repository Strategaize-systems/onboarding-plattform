# SLC-022 — Whisper-Adapter + Voice-Input

## Zuordnung
- Feature: FEAT-015 (Voice Input)
- Version: V2
- Priority: Medium
- Depends on: V1.1 stable (keine Feature-Abhaengigkeit)
- Loest: ISSUE-014

## Ziel
Whisper-Adapter-Pattern (DEC-018) implementieren. Transkriptions-Endpoint fuer Capture-Sessions. Mic-Button im Questionnaire reaktivieren. Self-hosted Whisper-Container nutzen (bereits in Docker-Compose vorhanden).

## Scope
- Whisper-Adapter-Pattern: provider.ts, local.ts, azure.ts (Stub), factory.ts
- API-Route: POST /api/capture/[sessionId]/transcribe
- questionnaire-form.tsx: Mic-Button reaktivieren (whisperEnabled = true)
- Docker-Compose: Whisper-Container ASR_MODEL auf 'medium' setzen
- ENV-Update: WHISPER_PROVIDER, WHISPER_URL, WHISPER_MODEL
- Coolify ENV-Konfiguration dokumentieren

## Nicht in Scope
- Persistentes Audio-Speichern (V3, Dialogue-Mode)
- Voice-Navigation (V3+)
- Echtzeit-Transkription (V3+)
- Azure-Provider-Implementierung (Stub reicht fuer V2, ausbaubar)

## Acceptance Criteria
1. Whisper-Adapter-Pattern unter /src/lib/ai/whisper/ implementiert
2. Local-Provider sendet Audio an http://whisper:9000 und liefert Transkript
3. API-Route POST /api/capture/[sessionId]/transcribe funktioniert
4. Mic-Button im Questionnaire ist aktiv und nimmt Audio auf
5. Sprache wird transkribiert und als Antwort-Text eingefuegt
6. Audio wird nach Transkription NICHT persistiert
7. Whisper-Container laeuft mit 'medium' Modell
8. npm run build + npm run test erfolgreich
9. ISSUE-014 resolved

### Micro-Tasks

#### MT-1: Whisper-Adapter-Pattern
- Goal: Provider-Interface + Local-Implementation + Factory
- Files: `src/lib/ai/whisper/provider.ts`, `src/lib/ai/whisper/local.ts`, `src/lib/ai/whisper/azure.ts`, `src/lib/ai/whisper/factory.ts`, `src/lib/ai/whisper/index.ts`
- Expected behavior: WhisperProvider Interface (transcribe(buffer, options) → {text, duration_ms}). LocalWhisperProvider: POST to WHISPER_URL mit audio/wav. AzureWhisperProvider: Stub (throws 'Azure Whisper not configured'). Factory: liest WHISPER_PROVIDER ENV, default='local'.
- Verification: npm run build
- Dependencies: none

#### MT-2: Transkriptions-API-Route
- Goal: Endpoint fuer Audio-Upload + Transkription
- Files: `src/app/api/capture/[sessionId]/transcribe/route.ts`
- Expected behavior: (1) Auth-Check: Session-Owner. (2) multipart/form-data parsen. (3) whisperFactory.create().transcribe(audioBuffer). (4) Response: {text, duration_ms}. (5) Audio-Buffer wird NICHT gespeichert. (6) Kosten-Log in ai_cost_ledger (feature='voice', minimal — self-hosted hat keine Kosten, aber Duration tracken).
- Verification: npm run build
- Dependencies: MT-1

#### MT-3: Docker-Compose Whisper-Config anpassen
- Goal: Whisper-Container auf 'medium' Modell setzen
- Files: `docker-compose.yml`
- Expected behavior: whisper.environment.ASR_MODEL: ${WHISPER_MODEL:-medium} (ENV-konfigurierbar, Default medium). Sicherstellen dass Whisper im strategaize-net erreichbar ist.
- Verification: docker-compose config zeigt korrektes Modell
- Dependencies: none

#### MT-4: ENV-Dokumentation
- Goal: Neue ENV-Variablen dokumentieren
- Files: `.env.deploy.example`, `.env.local.example`
- Expected behavior: WHISPER_PROVIDER=local, WHISPER_URL=http://whisper:9000, WHISPER_MODEL=medium. Kommentar: "Adapter-Pattern DEC-018. Optionen: local (self-hosted), azure (Azure Speech EU)."
- Verification: Dateien aktualisiert
- Dependencies: none

#### MT-5: Mic-Button reaktivieren
- Goal: whisperEnabled = true im Questionnaire + Integration mit neuer API
- Files: `src/app/capture/[sessionId]/block/[blockKey]/questionnaire-form.tsx`
- Expected behavior: (1) whisperEnabled von false auf true (oder conditional: NEXT_PUBLIC_WHISPER_ENABLED). (2) transcribeRecording() ruft POST /api/capture/[sessionId]/transcribe auf statt altem Blueprint-Endpoint. (3) Transkript wird als Antwort-Text eingefuegt (append oder replace, je nach bestehendem Text). (4) Loading-State waehrend Transkription.
- Verification: npm run build
- Dependencies: MT-2

#### MT-6: ISSUE-014 schliessen
- Goal: KNOWN_ISSUES.md aktualisieren
- Files: `docs/KNOWN_ISSUES.md`
- Expected behavior: ISSUE-014 Status: resolved, Resolution Date: 2026-04-XX, Resolution: SLC-022 Whisper-Adapter + Transcribe-Endpoint + Mic-Button aktiviert.
- Verification: Datei aktualisiert
- Dependencies: MT-5

#### MT-7: Test — Whisper-Adapter
- Goal: Unit-Test fuer Adapter-Factory + Local-Provider
- Files: `src/lib/ai/whisper/__tests__/factory.test.ts`
- Expected behavior: Testet: Factory liefert LocalWhisperProvider bei WHISPER_PROVIDER=local. Factory liefert AzureWhisperProvider (Stub) bei azure. Default ist local.
- Verification: npm run test -- factory
- Dependencies: MT-1
