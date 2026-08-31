#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "${TEST_DIR}"' EXIT

REMOTE_DIR="${TEST_DIR}/remote.git"
SEED_DIR="${TEST_DIR}/seed"
APP_DIR="${TEST_DIR}/games"
STATE_FILE="${TEST_DIR}/space-fighter.commit"
LOCK_FILE="${TEST_DIR}/space-fighter.lock"
DEPLOY_CALLS="${TEST_DIR}/deploy-calls.txt"

git init --bare --quiet "${REMOTE_DIR}"
git init --quiet --initial-branch=main "${SEED_DIR}"
git -C "${SEED_DIR}" config user.name "Space Fighter Test"
git -C "${SEED_DIR}" config user.email "space-fighter-test@example.com"
mkdir -p "${SEED_DIR}/space-fighter/scripts"
cat >"${SEED_DIR}/space-fighter/scripts/deploy.sh" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$(git rev-parse HEAD)" >>"${DEPLOY_CALLS}"
EOF
git -C "${SEED_DIR}" add .
git -C "${SEED_DIR}" commit --quiet -m "initial"
git -C "${SEED_DIR}" remote add origin "${REMOTE_DIR}"
git -C "${SEED_DIR}" push --quiet --set-upstream origin main
git --git-dir="${REMOTE_DIR}" symbolic-ref HEAD refs/heads/main
git clone --quiet "${REMOTE_DIR}" "${APP_DIR}"

run_auto_deploy() {
  DEPLOY_CALLS="${DEPLOY_CALLS}" \
    REPO_DIR="${APP_DIR}" \
    STATE_FILE="${STATE_FILE}" \
    LOCK_FILE="${LOCK_FILE}" \
    FLOCK_BIN=true \
    /usr/bin/bash "${ROOT_DIR}/space-fighter/scripts/auto_deploy.sh"
}

run_auto_deploy
[[ "$(wc -l <"${DEPLOY_CALLS}")" -eq 1 ]]
[[ "$(<"${STATE_FILE}")" == "$(git -C "${APP_DIR}" rev-parse HEAD)" ]]

run_auto_deploy
[[ "$(wc -l <"${DEPLOY_CALLS}")" -eq 1 ]]

printf '%s\n' "second" >"${SEED_DIR}/version.txt"
git -C "${SEED_DIR}" add version.txt
git -C "${SEED_DIR}" commit --quiet -m "second"
git -C "${SEED_DIR}" push --quiet
run_auto_deploy
[[ "$(wc -l <"${DEPLOY_CALLS}")" -eq 2 ]]
successful_commit="$(git -C "${APP_DIR}" rev-parse HEAD)"
[[ "$(<"${STATE_FILE}")" == "${successful_commit}" ]]

cat >"${SEED_DIR}/space-fighter/scripts/deploy.sh" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$(git rev-parse HEAD)" >>"${DEPLOY_CALLS}"
exit 1
EOF
git -C "${SEED_DIR}" add space-fighter/scripts/deploy.sh
git -C "${SEED_DIR}" commit --quiet -m "failing deploy"
git -C "${SEED_DIR}" push --quiet

if run_auto_deploy; then
  echo "auto deploy accepted a failed deployment" >&2
  exit 1
fi
[[ "$(wc -l <"${DEPLOY_CALLS}")" -eq 3 ]]
[[ "$(<"${STATE_FILE}")" == "${successful_commit}" ]]

echo "space-fighter auto deploy test ok"
