#!/bin/bash
# StrategAIze Kundenplattform — Supabase System Roles
# Muss VOR schema.sql laufen (daher 00_)
# Erstellt alle Rollen und Schemas die Supabase-Services erwarten

set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL

  -- Basis-Rollen
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
      CREATE ROLE anon NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
      CREATE ROLE authenticated NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
      CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
      CREATE ROLE supabase_admin LOGIN CREATEROLE CREATEDB REPLICATION BYPASSRLS;
    END IF;
  END
  \$\$;

  -- Authenticator (PostgREST)
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
      CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD '${POSTGRES_PASSWORD}';
    END IF;
  END
  \$\$;
  ALTER ROLE authenticator WITH PASSWORD '${POSTGRES_PASSWORD}';
  GRANT anon TO authenticator;
  GRANT authenticated TO authenticator;
  GRANT service_role TO authenticator;

  -- Auth-Admin (GoTrue)
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
      CREATE ROLE supabase_auth_admin NOINHERIT CREATEROLE LOGIN PASSWORD '${POSTGRES_PASSWORD}';
    END IF;
  END
  \$\$;
  ALTER ROLE supabase_auth_admin WITH PASSWORD '${POSTGRES_PASSWORD}';

  -- Storage-Admin
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
      CREATE ROLE supabase_storage_admin NOINHERIT CREATEROLE LOGIN PASSWORD '${POSTGRES_PASSWORD}';
    END IF;
  END
  \$\$;
  ALTER ROLE supabase_storage_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
  -- Storage-Admin braucht Role-Membership um via set_config('role', ...) zu switchen
  GRANT anon TO supabase_storage_admin;
  GRANT authenticated TO supabase_storage_admin;
  GRANT service_role TO supabase_storage_admin;

  -- Supabase-Admin Passwort
  ALTER ROLE supabase_admin WITH PASSWORD '${POSTGRES_PASSWORD}';

  -- Grants
  GRANT ALL ON DATABASE postgres TO supabase_admin;
  GRANT ALL ON SCHEMA public TO supabase_admin;
  GRANT ALL ON SCHEMA public TO anon;
  GRANT ALL ON SCHEMA public TO authenticated;
  GRANT ALL ON SCHEMA public TO service_role;

  -- Service-Rollen brauchen CREATE ON DATABASE fuer CREATE SCHEMA IF NOT EXISTS
  GRANT CREATE ON DATABASE postgres TO supabase_auth_admin;
  GRANT CREATE ON DATABASE postgres TO supabase_storage_admin;

  -- Auth-Schema (GoTrue)
  CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
  GRANT ALL ON SCHEMA auth TO supabase_auth_admin;

  -- Storage-Schema
  CREATE SCHEMA IF NOT EXISTS storage AUTHORIZATION supabase_storage_admin;
  GRANT ALL ON SCHEMA storage TO supabase_storage_admin;

  -- Realtime-Schema (supabase_admin braucht ALL fuer Ecto-Migrations)
  CREATE SCHEMA IF NOT EXISTS _realtime AUTHORIZATION supabase_admin;
  GRANT ALL ON SCHEMA _realtime TO supabase_admin;

  -- Extensions
  CREATE SCHEMA IF NOT EXISTS extensions;
  GRANT USAGE ON SCHEMA extensions TO anon;
  GRANT USAGE ON SCHEMA extensions TO authenticated;
  GRANT USAGE ON SCHEMA extensions TO service_role;

EOSQL

echo "Supabase system roles created successfully."
