#!/bin/sh
set -e

# Substitute environment variables in kong.yml template using sed
# Write to /tmp/ because /var/lib/kong/ is not writable by kong user
sed \
  -e "s|\${NEXT_PUBLIC_SUPABASE_ANON_KEY}|${NEXT_PUBLIC_SUPABASE_ANON_KEY}|g" \
  -e "s|\${SUPABASE_SERVICE_ROLE_KEY}|${SUPABASE_SERVICE_ROLE_KEY}|g" \
  /var/lib/kong/kong.yml.template > /tmp/kong.yml

export KONG_DECLARATIVE_CONFIG=/tmp/kong.yml

exec /docker-entrypoint.sh kong docker-start
