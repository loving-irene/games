#!/usr/bin/env bash
set -Eeuo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

REPO_DIR="${REPO_DIR:-/var/www/games}"
BRANCH="${BRANCH:-main}"
GAME_DIR="${REPO_DIR}/space-fighter"
LOCK_FILE="${LOCK_FILE:-/tmp/games-space-fighter-auto-deploy.lock}"
STATE_FILE="${STATE_FILE:-${REPO_DIR}/.deploy/space-fighter.commit}"
LOG_DIR="${LOG_DIR:-${REPO_DIR}/.deploy/logs}"
FLOCK_BIN="${FLOCK_BIN:-flock}"
DEPLOY_SCRIPT="${GAME_DIR}/scripts/deploy.sh"
DEPLOY_LOG="${LOG_DIR}/space-fighter-auto-deploy-$(TZ=Asia/Shanghai date +%Y%m%d).log"

log() {
  printf '[%s] %s\n' "$(TZ=Asia/Shanghai date '+%Y-%m-%d %H:%M:%S %Z')" "$*"
}

mkdir -p "$(dirname "${LOCK_FILE}")"
mkdir -p "${LOG_DIR}"
touch "${DEPLOY_LOG}"
exec >>"${DEPLOY_LOG}" 2>&1
find "${LOG_DIR}" -maxdepth 1 -type f -name 'space-fighter-auto-deploy-*.log' -mtime +3 -delete 2>/dev/null || true

exec 9>"${LOCK_FILE}"
if ! "${FLOCK_BIN}" -n 9; then
  log "another deployment is running; skip"
  exit 0
fi

[[ -d "${REPO_DIR}/.git" ]] || { log "missing Git repository: ${REPO_DIR}"; exit 1; }
[[ -f "${DEPLOY_SCRIPT}" ]] || { log "missing deploy script: ${DEPLOY_SCRIPT}"; exit 1; }
cd "${REPO_DIR}"

if ! git diff --quiet || ! git diff --cached --quiet; then
  log "tracked files contain local changes; abort"
  exit 1
fi

current_branch="$(git branch --show-current)"
if [[ "${current_branch}" != "${BRANCH}" ]]; then
  log "current branch is ${current_branch:-detached}, expected ${BRANCH}; abort"
  exit 1
fi

git fetch origin "${BRANCH}"
local_commit="$(git rev-parse HEAD)"
remote_commit="$(git rev-parse "origin/${BRANCH}")"

if [[ "${local_commit}" != "${remote_commit}" ]]; then
  if ! git merge-base --is-ancestor "${local_commit}" "${remote_commit}"; then
    log "local ${BRANCH} cannot fast-forward to origin/${BRANCH}; abort"
    exit 1
  fi
  git pull --ff-only origin "${BRANCH}"
fi

target_commit="$(git rev-parse HEAD)"
if [[ "${target_commit}" != "$(git rev-parse "origin/${BRANCH}")" ]]; then
  log "local HEAD does not match origin/${BRANCH} after pull; abort"
  exit 1
fi

deployed_commit=""
if [[ -f "${STATE_FILE}" ]]; then
  deployed_commit="$(<"${STATE_FILE}")"
fi
if [[ "${deployed_commit}" == "${target_commit}" ]]; then
  log "no deployment needed: commit=${target_commit}"
  exit 0
fi

log "deploying commit=${target_commit}"
if ! /usr/bin/bash "${DEPLOY_SCRIPT}"; then
  log "deployment failed; state remains at ${deployed_commit:-none} and the next run will retry"
  exit 1
fi

mkdir -p "$(dirname "${STATE_FILE}")"
printf '%s\n' "${target_commit}" >"${STATE_FILE}.tmp"
mv -f "${STATE_FILE}.tmp" "${STATE_FILE}"
log "auto deploy complete: commit=${target_commit}"
