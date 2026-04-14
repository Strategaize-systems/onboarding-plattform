#!/usr/bin/env bash
set -euo pipefail

# ══════════════════════════════════════════════════════════════════════
# Strategaize Blueprint Plattform — Customer Provisioning Script
#
# Setzt einen neuen Hetzner-Server komplett auf:
# Docker, Repo, Secrets, Supabase-Stack, App, SSL.
#
# Usage:
#   ./scripts/provision-customer.sh \
#     --ip 159.69.207.29 \
#     --domain blueprint.strategaizetransition.com \
#     --ssh-user root \
#     --smtp-host smtp.example.com \
#     --smtp-port 587 \
#     --smtp-user user@example.com \
#     --smtp-pass "password" \
#     --smtp-from noreply@strategaizetransition.com
#
# Without SMTP (deploy without email functionality):
#   ./scripts/provision-customer.sh \
#     --ip 159.69.207.29 \
#     --domain blueprint.strategaizetransition.com
# ══════════════════════════════════════════════════════════════════════

# ── Defaults ─────────────────────────────────────────────────────────
SSH_USER="root"
SSH_KEY=""
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""
REPO_URL="https://github.com/Strategaize-systems/strategaize-blueprint-plattform.git"
INSTALL_DIR="/opt/strategaize-blueprint"
BRANCH="main"

# ── Parse Arguments ──────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --ip)         SERVER_IP="$2";    shift 2 ;;
    --domain)     DOMAIN="$2";       shift 2 ;;
    --ssh-user)   SSH_USER="$2";     shift 2 ;;
    --ssh-key)    SSH_KEY="$2";      shift 2 ;;
    --smtp-host)  SMTP_HOST="$2";    shift 2 ;;
    --smtp-port)  SMTP_PORT="$2";    shift 2 ;;
    --smtp-user)  SMTP_USER="$2";    shift 2 ;;
    --smtp-pass)  SMTP_PASS="$2";    shift 2 ;;
    --smtp-from)  SMTP_FROM="$2";    shift 2 ;;
    --repo)       REPO_URL="$2";     shift 2 ;;
    --branch)     BRANCH="$2";       shift 2 ;;
    --dir)        INSTALL_DIR="$2";  shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Validate Required Args ───────────────────────────────────────────
if [[ -z "${SERVER_IP:-}" || -z "${DOMAIN:-}" ]]; then
  echo "ERROR: --ip and --domain are required."
  echo ""
  echo "Usage:"
  echo "  ./scripts/provision-customer.sh --ip 1.2.3.4 --domain blueprint.example.com"
  exit 1
fi

# ── SSH Command Helper ───────────────────────────────────────────────
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"
if [[ -n "$SSH_KEY" ]]; then
  SSH_OPTS="$SSH_OPTS -i $SSH_KEY"
fi

ssh_run() {
  ssh $SSH_OPTS "${SSH_USER}@${SERVER_IP}" "$@"
}

scp_to() {
  scp $SSH_OPTS "$1" "${SSH_USER}@${SERVER_IP}:$2"
}

# ── Banner ───────────────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Strategaize Blueprint Plattform — Customer Provisioning    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Server:  ${SSH_USER}@${SERVER_IP}"
echo "  Domain:  ${DOMAIN}"
echo "  Repo:    ${REPO_URL} (${BRANCH})"
echo "  Install: ${INSTALL_DIR}"
echo "  SMTP:    ${SMTP_HOST:-nicht konfiguriert}"
echo ""

# ── Step 1: Test SSH Connection ──────────────────────────────────────
echo "── Step 1/7: SSH-Verbindung testen..."
if ! ssh_run "echo 'SSH OK'" 2>/dev/null; then
  echo "ERROR: SSH-Verbindung zu ${SERVER_IP} fehlgeschlagen."
  echo "Pruefe: SSH-Key, Firewall, Server-Status."
  exit 1
fi
echo "   OK"

# ── Step 2: Install Docker (if needed) ──────────────────────────────
echo "── Step 2/7: Docker pruefen/installieren..."
ssh_run 'bash -s' << 'DOCKER_INSTALL'
if command -v docker &>/dev/null && command -v docker compose &>/dev/null; then
  echo "   Docker bereits installiert: $(docker --version)"
else
  echo "   Docker wird installiert..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  echo "   Docker installiert: $(docker --version)"
fi
DOCKER_INSTALL

# ── Step 3: Clone/Update Repository ─────────────────────────────────
echo "── Step 3/7: Repository klonen..."
ssh_run "bash -s" << REPO_SETUP
if [[ -d "${INSTALL_DIR}/.git" ]]; then
  echo "   Repo existiert, Update..."
  cd "${INSTALL_DIR}"
  git fetch origin
  git reset --hard origin/${BRANCH}
else
  echo "   Klone ${REPO_URL}..."
  mkdir -p "$(dirname ${INSTALL_DIR})"
  git clone --branch ${BRANCH} --single-branch "${REPO_URL}" "${INSTALL_DIR}"
fi
echo "   OK: $(cd ${INSTALL_DIR} && git log --oneline -1)"
REPO_SETUP

# ── Step 4: Generate Secrets ─────────────────────────────────────────
echo "── Step 4/7: Secrets generieren..."
ssh_run "bash -s" << SECRETS
cd "${INSTALL_DIR}"

# Nur generieren wenn noch keine .env existiert
if [[ -f .env ]]; then
  echo "   .env existiert bereits, ueberspringe Generierung."
  echo "   (Zum Neugenerieren: .env auf dem Server loeschen und Skript neu starten)"
else
  # Secrets generieren
  JWT_SECRET=\$(openssl rand -hex 32)
  REALTIME_SECRET=\$(openssl rand -hex 64)
  POSTGRES_PASSWORD=\$(openssl rand -hex 24)

  # JWT-Tokens generieren (Anon + Service Role)
  # Header: {"alg":"HS256","typ":"JWT"} = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
  HEADER="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
  IAT=\$(date +%s)
  EXP=\$(( IAT + 315360000 ))  # 10 Jahre

  # Base64URL-encode Payload
  ANON_PAYLOAD=\$(echo -n "{\"role\":\"anon\",\"iat\":\${IAT},\"exp\":\${EXP}}" | openssl base64 -A | tr '+/' '-_' | tr -d '=')
  SERVICE_PAYLOAD=\$(echo -n "{\"role\":\"service_role\",\"iat\":\${IAT},\"exp\":\${EXP}}" | openssl base64 -A | tr '+/' '-_' | tr -d '=')

  # HMAC-SHA256 Signature
  ANON_SIG=\$(echo -n "\${HEADER}.\${ANON_PAYLOAD}" | openssl dgst -sha256 -hmac "\${JWT_SECRET}" -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')
  SERVICE_SIG=\$(echo -n "\${HEADER}.\${SERVICE_PAYLOAD}" | openssl dgst -sha256 -hmac "\${JWT_SECRET}" -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')

  ANON_KEY="\${HEADER}.\${ANON_PAYLOAD}.\${ANON_SIG}"
  SERVICE_ROLE_KEY="\${HEADER}.\${SERVICE_PAYLOAD}.\${SERVICE_SIG}"

  cat > .env << ENVFILE
# Strategaize Blueprint Plattform — Production Environment
# Generiert am: \$(date -Iseconds)
# Server: ${SERVER_IP}
# Domain: ${DOMAIN}

# === App ===
NEXT_PUBLIC_APP_URL=https://${DOMAIN}

# === Supabase ===
NEXT_PUBLIC_SUPABASE_URL=http://supabase-kong:8000
JWT_SECRET=\${JWT_SECRET}
NEXT_PUBLIC_SUPABASE_ANON_KEY=\${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=\${SERVICE_ROLE_KEY}

# === Database ===
POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}

# === Realtime ===
REALTIME_SECRET=\${REALTIME_SECRET}

# === SMTP ===
SMTP_HOST=${SMTP_HOST:-smtp.example.com}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_USER=${SMTP_USER:-change_me}
SMTP_PASS=${SMTP_PASS:-change_me}
SMTP_FROM=${SMTP_FROM:-noreply@strategaizetransition.com}

# === Storage ===
STORAGE_FILE_SIZE_LIMIT=209715200
ENVFILE

  echo "   Secrets generiert und in .env gespeichert."
fi
SECRETS

# ── Step 5: Build & Start Stack ──────────────────────────────────────
echo "── Step 5/7: Docker-Stack bauen und starten..."
ssh_run "bash -s" << BUILD
cd "${INSTALL_DIR}"
echo "   Docker Compose build..."
docker compose build --no-cache app 2>&1 | tail -3
echo "   Docker Compose up..."
docker compose up -d 2>&1 | tail -5
echo "   Warte 30 Sekunden auf Service-Start..."
sleep 30
BUILD

# ── Step 6: Health Check ─────────────────────────────────────────────
echo "── Step 6/7: Health-Check..."
ssh_run "bash -s" << HEALTH
cd "${INSTALL_DIR}"

echo "   Checking services..."
SERVICES=("supabase-db" "supabase-auth" "supabase-kong" "supabase-rest" "supabase-storage" "app")
ALL_OK=true

for SVC in "\${SERVICES[@]}"; do
  STATUS=\$(docker compose ps --format '{{.State}}' \$SVC 2>/dev/null || echo "missing")
  if [[ "\$STATUS" == "running" ]]; then
    echo "   ✓ \$SVC: running"
  else
    echo "   ✗ \$SVC: \$STATUS"
    ALL_OK=false
  fi
done

# App health endpoint
if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
  echo "   ✓ App health endpoint: OK"
else
  echo "   ✗ App health endpoint: nicht erreichbar"
  ALL_OK=false
fi

if [[ "\$ALL_OK" == "true" ]]; then
  echo ""
  echo "   Alle Services laufen!"
else
  echo ""
  echo "   WARNUNG: Nicht alle Services laufen."
  echo "   Logs pruefen: docker compose logs -f"
fi
HEALTH

# ── Step 7: Summary ──────────────────────────────────────────────────
echo ""
echo "── Step 7/7: Zusammenfassung"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Provisioning abgeschlossen!                                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  App URL:      https://${DOMAIN}"
echo "  Server:       ${SERVER_IP}"
echo "  Install-Dir:  ${INSTALL_DIR}"
echo ""
echo "  Naechste Schritte:"
echo "  1. SSL/Domain: In Coolify oder Caddy konfigurieren"
echo "     (falls nicht automatisch via Coolify)"
echo "  2. SMTP pruefen: Einladungs-Emails testen"
echo "  3. Admin-User: Ersten Admin in Supabase anlegen"
echo "  4. Fragenkatalog: JSON-Import ueber Admin-API"
echo ""
echo "  Nuetzliche Befehle (auf dem Server):"
echo "  cd ${INSTALL_DIR}"
echo "  docker compose logs -f          # Alle Logs"
echo "  docker compose logs -f app      # Nur App-Logs"
echo "  docker compose ps               # Service-Status"
echo "  docker compose restart app      # App neustarten"
echo ""
