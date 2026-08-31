#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "${TEST_DIR}"' EXIT
CRONTAB_STATE="${TEST_DIR}/crontab.txt"

cat >"${TEST_DIR}/crontab" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${1:-}" == "-l" ]]; then
  cat "${FAKE_CRONTAB_STATE}"
else
  cat >"${FAKE_CRONTAB_STATE}"
fi
EOF
chmod 755 "${TEST_DIR}/crontab"

cat >"${CRONTAB_STATE}" <<EOF
15 2 * * * /usr/local/bin/unrelated-job
# BEGIN SPACE FIGHTER AUTO DEPLOY CRON
* * * * * /usr/bin/bash ${ROOT_DIR}/space-fighter/scripts/auto_deploy.sh
# END SPACE FIGHTER AUTO DEPLOY CRON
*/5 * * * * /usr/bin/bash /var/www/message/scripts/auto_deploy.sh
EOF

run_installer() {
  PATH="${TEST_DIR}:${PATH}" \
    FAKE_CRONTAB_STATE="${CRONTAB_STATE}" \
    REPO_DIR="${ROOT_DIR}" \
    /usr/bin/bash "${ROOT_DIR}/space-fighter/scripts/install_cron.sh" >/dev/null
}

run_installer
run_installer

[[ "$(grep -c '^# BEGIN SPACE FIGHTER AUTO DEPLOY CRON$' "${CRONTAB_STATE}")" -eq 1 ]]
[[ "$(grep -c '^# END SPACE FIGHTER AUTO DEPLOY CRON$' "${CRONTAB_STATE}")" -eq 1 ]]
grep -qF "*/5 * * * * /usr/bin/bash ${ROOT_DIR}/space-fighter/scripts/auto_deploy.sh" "${CRONTAB_STATE}"
grep -qF "/var/www/message/scripts/auto_deploy.sh" "${CRONTAB_STATE}"
grep -qF "/usr/local/bin/unrelated-job" "${CRONTAB_STATE}"

printf '%s\n' '# END SPACE FIGHTER AUTO DEPLOY CRON' >"${CRONTAB_STATE}"
cp "${CRONTAB_STATE}" "${CRONTAB_STATE}.before"
if run_installer 2>/dev/null; then
  echo "installer accepted an incomplete marker block" >&2
  exit 1
fi
cmp -s "${CRONTAB_STATE}" "${CRONTAB_STATE}.before"

echo "space-fighter cron installer test ok"
