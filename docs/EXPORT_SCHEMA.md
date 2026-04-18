# Export Schema

## Purpose

Dieses Dokument definiert das JSON-Schema fuer den Checkpoint-Export der Onboarding-Plattform.

## API Endpoint

```
GET /api/export/checkpoint/{checkpointId}
```

### Auth
Cookie-basiert (Supabase Auth Session). Zugriff fuer `strategaize_admin` (alle Tenants) und `tenant_admin` (nur eigener Tenant via RLS).

### Response — 200 OK

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "session_id": "uuid",
  "block_key": "string (z.B. 'A', 'B', 'C')",
  "checkpoint_type": "questionnaire_submit | meeting_final",
  "content": {
    "kus": [
      {
        "id": "uuid",
        "unit_type": "finding | risk | action | observation | ai_draft",
        "source": "questionnaire | ai_draft | manual | exception | meeting_final",
        "title": "string",
        "body": "string",
        "confidence": "low | medium | high",
        "evidence_refs": [],
        "status": "proposed | accepted | edited | rejected",
        "created_at": "ISO 8601 timestamp",
        "updated_at": "ISO 8601 timestamp"
      }
    ],
    "finalized_by": "uuid (user_id des strategaize_admin)",
    "finalized_at": "ISO 8601 timestamp",
    "version": "1.0"
  },
  "content_hash": "SHA-256 hex string",
  "created_at": "ISO 8601 timestamp"
}
```

### Fehler-Responses

| Status | Body | Bedeutung |
|---|---|---|
| 401 | `{"error": "Nicht authentifiziert"}` | Kein Auth-Cookie / Session abgelaufen |
| 404 | `{"error": "Checkpoint nicht gefunden"}` | Checkpoint existiert nicht oder gehoert zu anderem Tenant (RLS) |

## Schema-Stabilitaet

Dieses Schema ist **V1 stable**. Breaking Changes nur mit Major-Version der Plattform (V2+). Additive Felder (neue optionale Properties in `content`) sind jederzeit moeglich und gelten nicht als Breaking Change.

## Beispiel-Payload

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "tenant_id": "00000000-0000-0000-0000-0000000000de",
  "session_id": "11111111-2222-3333-4444-555555555555",
  "block_key": "A",
  "checkpoint_type": "meeting_final",
  "content": {
    "kus": [
      {
        "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "unit_type": "finding",
        "source": "ai_draft",
        "title": "Nachfolgeregelung nicht formalisiert",
        "body": "Der Inhaber hat keine schriftliche Nachfolgeregelung. Muendliche Absprachen mit Familienmitgliedern existieren, sind aber nicht rechtlich bindend.",
        "confidence": "high",
        "evidence_refs": [],
        "status": "accepted",
        "created_at": "2026-04-18T10:30:00.000Z",
        "updated_at": "2026-04-18T14:22:00.000Z"
      }
    ],
    "finalized_by": "99999999-8888-7777-6666-555555555555",
    "finalized_at": "2026-04-18T15:00:00.000Z",
    "version": "1.0"
  },
  "content_hash": "a3f2b8c1d4e5f6789012345678901234567890abcdef1234567890abcdef1234",
  "created_at": "2026-04-18T15:00:01.000Z"
}
```
