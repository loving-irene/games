#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="${REPO_DIR:-/var/www/games}"
SCHEDULE="${SCHEDULE:-*/5 * * * *}"
AUTO_DEPLOY_SCRIPT="${REPO_DIR}/space-fighter/scripts/auto_deploy.sh"
CRON_LINE="${SCHEDULE} /usr/bin/bash ${AUTO_DEPLOY_SCRIPT}"
BEGIN_MARKER="# BEGIN SPACE FIGHTER AUTO DEPLOY CRON"
END_MARKER="# END SPACE FIGHTER AUTO DEPLOY CRON"

[[ -f "${AUTO_DEPLOY_SCRIPT}" ]] || { echo "missing auto_deploy.sh: ${AUTO_DEPLOY_SCRIPT}" >&2; exit 1; }

current_crontab="$(crontab -l 2>/dev/null || true)"
if ! cleaned_crontab="$(printf '%s\n' "${current_crontab}" | awk \
  -v begin="${BEGIN_MARKER}" \
  -v end="${END_MARKER}" \
  -v auto_deploy_script="${AUTO_DEPLOY_SCRIPT}" '
  $0 == begin {
    if (inside || seen_begin) exit 2
    inside = 1
    seen_begin = 1
    next
  }
  $0 == end {
    if (!inside || seen_end) exit 2
    inside = 0
    seen_end = 1
    next
  }
  !inside && index($0, auto_deploy_script) { next }
  !inside { print }
  END {
    if (inside || seen_begin != seen_end) exit 2
  }
')"; then
  echo "invalid space-fighter cron marker block; crontab was not changed" >&2
  exit 1
fi

{
  if [[ -n "${cleaned_crontab}" ]]; then
    printf '%s\n' "${cleaned_crontab}"
  fi
  printf '%s\n' "${BEGIN_MARKER}" "${CRON_LINE}" "${END_MARKER}"
} | crontab -

echo "installed: ${CRON_LINE}"
