#!/usr/bin/env bash
set -Eeuo pipefail

# 太空战机（space-fighter）部署脚本
# 用法：将本仓库同步到服务器后，在服务器上执行 bash scripts/deploy.sh
# 前提：域名 zj.games.jcc666.top 已解析到本服务器，且 80/443 端口开放

DOMAIN="${DOMAIN:-zj.games.jcc666.top}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-admin@jcc666.top}"
WEB_DIR="${WEB_DIR:-/var/www/games/space-fighter}"
CERTBOT_WAIT_SECONDS="${CERTBOT_WAIT_SECONDS:-180}"
CERTBOT_RETRY_INTERVAL="${CERTBOT_RETRY_INTERVAL:-5}"
NGINX_AVAIL="/etc/nginx/sites-available/${DOMAIN}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"
DEFAULT_NGINX="/etc/nginx/sites-enabled/default"
CERT_FULLCHAIN="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
CERT_PRIVKEY="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

SUDO=""
if [[ "${EUID}" -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo "[ERROR] root or sudo is required to run deploy.sh"
    exit 1
  fi
fi

run() {
  if [[ -n "${SUDO}" ]]; then
    "${SUDO}" "$@"
  else
    "$@"
  fi
}

log() {
  echo "[INFO] $*"
}

warn() {
  echo "[WARN] $*"
}

fail() {
  echo "[ERROR] $*"
  exit 1
}

validate_certbot_wait_config() {
  [[ "${CERTBOT_WAIT_SECONDS}" =~ ^(0|[1-9][0-9]*)$ ]] || fail "CERTBOT_WAIT_SECONDS must be a non-negative integer."
  [[ "${CERTBOT_RETRY_INTERVAL}" =~ ^[1-9][0-9]*$ ]] || fail "CERTBOT_RETRY_INTERVAL must be a positive integer."
}

detect_package_manager() {
  if command -v apt-get >/dev/null 2>&1; then
    echo "apt"
    return
  fi
  if command -v dnf >/dev/null 2>&1; then
    echo "dnf"
    return
  fi
  if command -v yum >/dev/null 2>&1; then
    echo "yum"
    return
  fi
  fail "No supported package manager found (apt/dnf/yum)."
}

install_dependencies() {
  local pm
  pm="$(detect_package_manager)"

  log "Checking dependencies: nginx certbot rsync"
  case "${pm}" in
    apt)
      run apt-get update
      run apt-get install -y nginx certbot rsync
      ;;
    dnf)
      run dnf install -y nginx certbot rsync
      ;;
    yum)
      run yum install -y nginx certbot rsync
      ;;
  esac
}

ensure_service() {
  local service="$1"
  run systemctl enable --now "${service}" >/dev/null 2>&1 || warn "Service ${service} failed to start; check manually."
}

write_http_config() {
  log "Writing HTTP nginx config for ACME challenge"
  run mkdir -p "$(dirname "${NGINX_AVAIL}")"
  run mkdir -p "${WEB_DIR}"
  cat <<EOF | run tee "${NGINX_AVAIL}" >/dev/null
server {
    listen 80;
    server_name ${DOMAIN};
    root ${WEB_DIR};

    location /.well-known/acme-challenge/ {
        allow all;
    }

    location / {
        try_files \$uri /index.html;
    }
}
EOF

  run ln -sfn "${NGINX_AVAIL}" "${NGINX_ENABLED}"
  if [[ -f "${DEFAULT_NGINX}" ]]; then
    run rm -f "${DEFAULT_NGINX}"
  fi

  run nginx -t
  run systemctl reload nginx
}

issue_certificate_if_needed() {
  local certbot_output
  local certbot_status
  local deadline
  local remaining_wait
  local retry_delay

  if [[ -f "${CERT_FULLCHAIN}" && -f "${CERT_PRIVKEY}" ]]; then
    log "SSL certificate already exists; skipping request"
    return
  fi

  deadline=$((SECONDS + CERTBOT_WAIT_SECONDS))
  while true; do
    if [[ -f "${CERT_FULLCHAIN}" && -f "${CERT_PRIVKEY}" ]]; then
      log "SSL certificate became available while waiting; skipping request"
      return
    fi

    log "Requesting Let's Encrypt certificate for ${DOMAIN}"
    certbot_status=0
    certbot_output="$(run certbot certonly \
      --webroot \
      -w "${WEB_DIR}" \
      -d "${DOMAIN}" \
      --non-interactive \
      --agree-tos \
      --email "${LETSENCRYPT_EMAIL}" \
      --keep-until-expiring 2>&1)" || certbot_status=$?
    printf '%s\n' "${certbot_output}"

    if ((certbot_status == 0)); then
      break
    fi

    if [[ "${certbot_output}" != *"Another instance of Certbot"* ]]; then
      fail "Certificate request failed. Check the Certbot output above."
    fi

    remaining_wait=$((deadline - SECONDS))
    if ((remaining_wait <= 0)); then
      fail "Another Certbot instance is still running after ${CERTBOT_WAIT_SECONDS}s. Check: systemctl status certbot.service"
    fi

    retry_delay="${CERTBOT_RETRY_INTERVAL}"
    if ((retry_delay > remaining_wait)); then
      retry_delay="${remaining_wait}"
    fi
    warn "Another Certbot instance is running; retrying in ${retry_delay}s"
    sleep "${retry_delay}"
  done

  [[ -f "${CERT_FULLCHAIN}" && -f "${CERT_PRIVKEY}" ]] || fail "Certificate request failed. Check DNS and port 80."
}

write_https_config() {
  log "Writing HTTPS nginx config"
  cat <<EOF | run tee "${NGINX_AVAIL}" >/dev/null
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root ${WEB_DIR};
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate ${CERT_FULLCHAIN};
    ssl_certificate_key ${CERT_PRIVKEY};
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    root ${WEB_DIR};
    index index.html;

    # 游戏静态资源：开启 gzip，JS 是大头
    gzip on;
    gzip_types application/javascript text/css application/json image/svg+xml;
    gzip_min_length 1024;

    # 纯静态、无后端：允许跨域资源共享无需，缓存带版本策略
    location ~* \.(js|css|png|jpg|svg|ico|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public";
    }

    location / {
        try_files \$uri /index.html;
    }
}
EOF

  run nginx -t
  run systemctl reload nginx
}

sync_site_files() {
  log "Syncing static files to ${WEB_DIR}"
  run mkdir -p "${WEB_DIR}"
  run rsync -a --delete \
    --exclude ".git" \
    --exclude ".gitignore" \
    --exclude "scripts" \
    "${SOURCE_DIR}/" "${WEB_DIR}/"
}

enable_certbot_renew() {
  if systemctl list-unit-files | grep -q "^certbot\.timer"; then
    ensure_service "certbot.timer"
  fi
}

log "===== [0/4] Environment check ====="
validate_certbot_wait_config
install_dependencies
ensure_service "nginx"

log "===== [1/4] Sync static files ====="
sync_site_files

log "===== [2/4] HTTP config and certificate ====="
write_http_config
issue_certificate_if_needed

log "===== [3/4] Enable HTTPS ====="
write_https_config
enable_certbot_renew

log "===== [4/4] Done ====="
log "Open: https://${DOMAIN}"
