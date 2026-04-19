# SLC-020 — Evidence-UI

## Zuordnung
- Feature: FEAT-013 (Evidence-Mode Frontend)
- Version: V2
- Priority: High
- Depends on: SLC-018, SLC-019

## Ziel
Kunden koennen Dokumente pro Block hochladen. KI-Mapping-Vorschlaege werden reviewt (bestaetigen/ablehnen). Bestaetigte Mappings fliessen als zusaetzliche Antwortdaten in den Block-Submit.

## Scope
- Upload-UI im Questionnaire (Drag-and-Drop + Datei-Auswahl)
- Extraction-Status-Anzeige (pending/extracting/extracted/failed)
- Mapping-Review-UI (Vorschlaege bestaetigen/ablehnen pro Chunk)
- Integration: bestaetigte Mappings in Block-Submit (evidence-Prefix in answers)
- i18n (de/en/nl)

## Nicht in Scope
- Bulk-Upload-UI fuer ganze Archive (V2 nur Multi-File-Select, kein spezielles Archiv-UI)
- Evidence-Anzeige im Debrief (V2.1)

## Acceptance Criteria
1. Upload-Bereich im Questionnaire (Drag-and-Drop oder Button)
2. Datei-Liste mit Status-Anzeige (Spinner, Checkmark, Error)
3. Nach Extraktion: Mapping-Vorschlaege pro Frage sichtbar
4. Kunde kann Mappings bestaetigen oder ablehnen
5. Bestaetigte Mappings erscheinen als Evidence-Text bei der Frage
6. Block-Submit inkludiert Evidence-Antworten (evidence.{blockKey}.{questionId})
7. i18n komplett

### Micro-Tasks

#### MT-1: FileUploadZone-Komponente
- Goal: Drag-and-Drop + Button fuer Datei-Upload
- Files: `src/app/capture/[sessionId]/block/[blockKey]/evidence/FileUploadZone.tsx`
- Expected behavior: Akzeptiert PDF, DOCX, TXT, CSV, ZIP. Multi-File-Select. Zeigt Dateinamen + Groesse. Upload-Button triggert POST /api/capture/[sessionId]/evidence/upload. Progress-Bar pro Datei.
- Verification: npm run build
- Dependencies: SLC-018 MT-4

#### MT-2: EvidenceFileList-Komponente
- Goal: Liste hochgeladener Dateien mit Status
- Files: `src/app/capture/[sessionId]/block/[blockKey]/evidence/EvidenceFileList.tsx`
- Expected behavior: Query: evidence_file WHERE capture_session_id + block_key. Zeigt pro Datei: Filename, Size, Status-Icon (Spinner=pending/extracting, Check=extracted, X=failed). Auto-Refresh per Supabase Realtime oder Polling (5s).
- Verification: npm run build
- Dependencies: none

#### MT-3: MappingReview-Komponente
- Goal: Mapping-Vorschlaege pro Frage reviewen
- Files: `src/app/capture/[sessionId]/block/[blockKey]/evidence/MappingReview.tsx`
- Expected behavior: Query: evidence_chunk WHERE evidence_file_id IN (dateien des blocks) AND mapping_status='suggested'. Pro Mapping: Frage-Text, relevant_excerpt, Confidence-Badge, Confirm/Reject Buttons. Confirm → rpc_confirm_evidence_mapping. Reject → rpc_reject_evidence_mapping.
- Verification: npm run build
- Dependencies: SLC-019 MT-5

#### MT-4: Integration in Questionnaire-Page
- Goal: Evidence-Bereich in die Questionnaire-Block-Seite einbinden
- Files: `src/app/capture/[sessionId]/block/[blockKey]/page.tsx`
- Expected behavior: Neue Sektion "Dokumente & Evidenz" oberhalb oder neben den Fragen. Zeigt FileUploadZone + EvidenceFileList + MappingReview. Nur sichtbar wenn Evidence-Mode fuer diesen Block relevant (immer in V2, spaeter template-konfigurierbar).
- Verification: npm run build
- Dependencies: MT-1, MT-2, MT-3

#### MT-5: Block-Submit Evidence-Integration
- Goal: Bestaetigte Mappings fliessen in die Verdichtung
- Files: `src/app/capture/[sessionId]/block/[blockKey]/submit-action.ts`
- Expected behavior: Bei Block-Submit: Lade confirmed evidence_chunks fuer diesen Block. Merge in checkpoint.content mit Key-Pattern `evidence.{blockKey}.{questionId}`. Bestehende Antworten bleiben unveraendert — Evidence ist additiv.
- Verification: npm run build
- Dependencies: MT-3

#### MT-6: i18n Keys
- Goal: Evidence-spezifische Texte in de/en/nl
- Files: `src/messages/de.json`, `src/messages/en.json`, `src/messages/nl.json`
- Expected behavior: Keys fuer: evidence.upload, evidence.drag_drop, evidence.processing, evidence.extracted, evidence.failed, evidence.mapping.confirm, evidence.mapping.reject, evidence.mapping.confidence
- Verification: npm run build
- Dependencies: MT-4
