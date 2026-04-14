-- StrategAIze Kundenplattform v1.0 — Schema
-- Append-only: question_events, evidence_items, evidence_links, run_submissions, admin_events
-- Source of Truth: question_events
-- runs.status: nur via SECURITY DEFINER Funktionen änderbar
-- Ausführung: einmalig beim DB-Start (docker-entrypoint-initdb.d)

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TENANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  language    text        NOT NULL DEFAULT 'de' CHECK (language IN ('de', 'en', 'nl')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES auth.users ON DELETE SET NULL
);

COMMENT ON TABLE tenants IS 'Repräsentiert ein Kundenunternehmen. Admin-verwaltet.';

-- ============================================================
-- PROFILES
-- One row per auth.users entry. Links user to tenant + role.
-- Created exclusively via handle_new_user() trigger.
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  tenant_id   uuid        REFERENCES tenants ON DELETE CASCADE, -- NULL für strategaize_admin
  email       text        NOT NULL,
  role        text        NOT NULL CHECK (role IN ('strategaize_admin', 'tenant_owner', 'tenant_member')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON profiles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role       ON profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_email      ON profiles (lower(email));

COMMENT ON TABLE profiles IS 'User-Profil, verknüpft mit auth.users. Erstellt via DB-Trigger bei Invite-Annahme.';
COMMENT ON COLUMN profiles.tenant_id IS 'NULL für strategaize_admin.';

-- ============================================================
-- QUESTION CATALOG SNAPSHOTS
-- ============================================================
CREATE TABLE IF NOT EXISTS question_catalog_snapshots (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  version           text        NOT NULL UNIQUE,         -- z.B. '1.0', '1.1'
  blueprint_version text        NOT NULL,                -- Version des Blueprint Master
  hash              text        NOT NULL,                -- SHA256 des gesamten Katalog-Inhalts
  question_count    integer     NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES auth.users ON DELETE SET NULL
);

COMMENT ON TABLE question_catalog_snapshots IS 'Versionierte Snapshots des Exit Ready Blueprint Fragenkatalogs.';

-- ============================================================
-- QUESTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS questions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_snapshot_id uuid        NOT NULL REFERENCES question_catalog_snapshots ON DELETE RESTRICT,
  frage_id            text        NOT NULL,  -- Stabile ID aus Blueprint Master: F-BP-001 bis F-BP-091
  block               text        NOT NULL CHECK (block IN ('A','B','C','D','E','F','G','H','I')),
  ebene               text        NOT NULL CHECK (ebene IN ('Kern','Workspace')),
  unterbereich        text        NOT NULL,
  fragetext           text        NOT NULL,
  owner_dependency    boolean     NOT NULL DEFAULT false,  -- OD-Flag
  deal_blocker        boolean     NOT NULL DEFAULT false,  -- DB-Flag
  sop_trigger         boolean     NOT NULL DEFAULT false,  -- SOP-Flag
  ko_hart             boolean     NOT NULL DEFAULT false,
  ko_soft             boolean     NOT NULL DEFAULT false,
  block_weight        numeric(3,1) NOT NULL,               -- A=1.2, B=1.5, C=1.5 etc.
  position            integer     NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog_snapshot_id, frage_id)
);

CREATE INDEX IF NOT EXISTS idx_questions_snapshot_position ON questions (catalog_snapshot_id, position);
CREATE INDEX IF NOT EXISTS idx_questions_block             ON questions (catalog_snapshot_id, block);

-- ============================================================
-- RUNS
-- status wird NUR via SECURITY DEFINER Funktionen geändert.
-- Tenant hat kein direktes UPDATE-Recht (via RLS gesichert).
-- ============================================================
CREATE TABLE IF NOT EXISTS runs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  catalog_snapshot_id uuid        NOT NULL REFERENCES question_catalog_snapshots,
  title               text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description         text,
  status              text        NOT NULL DEFAULT 'collecting'
                                  CHECK (status IN ('collecting','submitted','locked')),
  contract_version    text        NOT NULL DEFAULT 'v1.0',
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid        REFERENCES auth.users ON DELETE SET NULL,
  submitted_at        timestamptz                        -- Timestamp letzter Checkpoint
);

CREATE INDEX IF NOT EXISTS idx_runs_tenant_id ON runs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_runs_status    ON runs (status);

COMMENT ON TABLE runs IS 'Assessment-Zyklus. status nur via run_submit() und run_lock() änderbar.';

-- ============================================================
-- QUESTION EVENTS — SOURCE OF TRUTH (APPEND-ONLY)
-- Einzige Schreibquelle für Tenant-Antworten.
-- KEIN UPDATE, KEIN DELETE für Tenants (via RLS gesichert).
-- client_event_id: Idempotency Key vom Client (UUID).
-- ============================================================
CREATE TABLE IF NOT EXISTS question_events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_event_id  uuid        NOT NULL,              -- Client-generierter Idempotency Key
  question_id      uuid        NOT NULL REFERENCES questions ON DELETE RESTRICT,
  run_id           uuid        NOT NULL REFERENCES runs ON DELETE RESTRICT,
  tenant_id        uuid        NOT NULL REFERENCES tenants ON DELETE RESTRICT,
  event_type       text        NOT NULL CHECK (event_type IN (
                                 'answer_submitted',
                                 'note_added',
                                 'evidence_attached',
                                 'status_changed',
                                 'document_analysis'
                               )),
  payload          jsonb       NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid        NOT NULL REFERENCES auth.users ON DELETE RESTRICT,
  UNIQUE (run_id, client_event_id)                    -- Idempotency Constraint
);

CREATE INDEX IF NOT EXISTS idx_qevents_run_question ON question_events (run_id, question_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qevents_tenant        ON question_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_qevents_type          ON question_events (run_id, question_id, event_type);

COMMENT ON TABLE question_events IS 'SOURCE OF TRUTH. Append-only. Kein UPDATE/DELETE für Tenants.';
COMMENT ON COLUMN question_events.client_event_id IS 'UUID vom Client generiert. Idempotency: UNIQUE(run_id, client_event_id).';

-- ============================================================
-- EVIDENCE ITEMS (APPEND-ONLY)
-- ============================================================
CREATE TABLE IF NOT EXISTS evidence_items (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants ON DELETE RESTRICT,
  run_id          uuid        NOT NULL REFERENCES runs ON DELETE RESTRICT,
  item_type       text        NOT NULL CHECK (item_type IN ('file','note')),
  label           text        NOT NULL CHECK (label IN (
                                'policy','process','template','contract','financial',
                                'legal','system','org','kpi','other'
                              )),
  -- Datei-Felder (nullable, nur item_type = 'file')
  file_path       text,       -- Supabase Storage Pfad: evidence/{tenant_id}/{run_id}/{id}/{file_name}
  file_name       text,
  file_size_bytes bigint,
  file_mime_type  text,
  sha256          text,       -- SHA256 der Datei (empfohlen)
  -- Notiz-Feld (nullable, nur item_type = 'note')
  note_text       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid        NOT NULL REFERENCES auth.users ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_evidence_run    ON evidence_items (run_id);
CREATE INDEX IF NOT EXISTS idx_evidence_tenant ON evidence_items (tenant_id);

COMMENT ON TABLE evidence_items IS 'Append-only. Kein UPDATE/DELETE für Tenants. Storage-Pfad: evidence/{tenant_id}/{run_id}/{id}/{file_name}';

-- ============================================================
-- EVIDENCE LINKS (APPEND-ONLY)
-- ============================================================
CREATE TABLE IF NOT EXISTS evidence_links (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_item_id  uuid        NOT NULL REFERENCES evidence_items ON DELETE RESTRICT,
  tenant_id         uuid        NOT NULL REFERENCES tenants ON DELETE RESTRICT,
  link_type         text        NOT NULL CHECK (link_type IN ('question','run')),
  link_id           uuid        NOT NULL,  -- question_id oder run_id
  relation          text        NOT NULL CHECK (relation IN ('proof','supports','example','supersedes')),
  question_event_id uuid        REFERENCES question_events ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evidence_links_item ON evidence_links (evidence_item_id);
CREATE INDEX IF NOT EXISTS idx_evidence_links_link ON evidence_links (link_type, link_id);
CREATE INDEX IF NOT EXISTS idx_evidence_links_tenant ON evidence_links (tenant_id);

COMMENT ON TABLE evidence_links IS 'Append-only. Verknüpft evidence_items mit Fragen oder dem Run.';

-- ============================================================
-- RUN SUBMISSIONS (APPEND-ONLY)
-- Checkpoint-Events. Erstellt via SECURITY DEFINER run_submit().
-- ============================================================
CREATE TABLE IF NOT EXISTS run_submissions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           uuid        NOT NULL REFERENCES runs ON DELETE RESTRICT,
  tenant_id        uuid        NOT NULL REFERENCES tenants ON DELETE RESTRICT,
  submitted_by     uuid        NOT NULL REFERENCES auth.users ON DELETE RESTRICT,
  submitted_at     timestamptz NOT NULL DEFAULT now(),
  snapshot_version integer     NOT NULL,  -- Auto-Inkrement pro Run: 1, 2, 3...
  note             text,
  UNIQUE (run_id, snapshot_version)
);

CREATE INDEX IF NOT EXISTS idx_submissions_run ON run_submissions (run_id);

COMMENT ON TABLE run_submissions IS 'Append-only Checkpoint-Historie. Erstellt via run_submit() SECURITY DEFINER.';

-- ============================================================
-- ADMIN EVENTS (APPEND-ONLY Audit Log)
-- Protokolliert alle Admin-Aktionen.
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  text        NOT NULL CHECK (event_type IN (
                            'tenant_created','run_created','run_locked',
                            'catalog_imported','export_generated',
                            'invite_sent','reinvite_sent'
                          )),
  actor_id    uuid        NOT NULL REFERENCES auth.users ON DELETE RESTRICT,
  tenant_id   uuid        REFERENCES tenants ON DELETE SET NULL,
  run_id      uuid        REFERENCES runs ON DELETE SET NULL,
  payload     jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_events_actor  ON admin_events (actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_events_tenant ON admin_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_admin_events_run    ON admin_events (run_id);

COMMENT ON TABLE admin_events IS 'Append-only Admin Audit Log. Kein Zugriff für Tenants.';

-- ============================================================
-- VIEW: v_current_answers — DERIVED (nicht MATERIALIZED)
-- Berechnet immer aus question_events.
-- Wird NIEMALS direkt beschrieben.
-- event_id wird mitgegeben für derived_from_event_id im Export.
-- ============================================================
CREATE OR REPLACE VIEW v_current_answers AS
SELECT DISTINCT ON (run_id, question_id)
  id            AS event_id,
  run_id,
  question_id,
  tenant_id,
  payload->>'text' AS answer_text,
  created_at    AS answered_at,
  created_by
FROM question_events
WHERE event_type = 'answer_submitted'
ORDER BY run_id, question_id, created_at DESC;

COMMENT ON VIEW v_current_answers IS
  'Derived convenience view. NICHT MATERIALIZED. Berechnet die neueste Antwort pro (run_id, question_id) aus question_events. Niemals direkt beschreiben.';
