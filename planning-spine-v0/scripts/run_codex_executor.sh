#!/usr/bin/env bash
set -euo pipefail

RUNNER_RUNTIME_DIR="/run/user/1001/yazelix/profile-runtime/codex"

if [ -d "${RUNNER_RUNTIME_DIR}" ]; then
  rm -f \
    "${RUNNER_RUNTIME_DIR}/.config.toml.yazelix-stage-"* \
    "${RUNNER_RUNTIME_DIR}/.transaction-journal-"* \
    "${RUNNER_RUNTIME_DIR}/transaction-journal"* \
    2>/dev/null || true
fi

export LD_LIBRARY_PATH="/usr/lib/x86_64-linux-gnu:/usr/lib:${LD_LIBRARY_PATH:-}"
export LIBCLANG_PATH="/usr/lib/llvm-21/lib"
export LLVM_CONFIG_PATH="/usr/lib/llvm-21/bin/llvm-config"
export PGRX_HOME="${PGRX_HOME:-/home/flexnetos/meta/var/lib/pgrx}"
mkdir -p "${PGRX_HOME}"

if [ "$#" -eq 0 ]; then
  exec /home/flexnetos/.nix-profile/bin/codex exec -
fi

if [ "${1:-}" != "exec" ]; then
  exec /home/flexnetos/.nix-profile/bin/codex exec "$@"
else
  exec /home/flexnetos/.nix-profile/bin/codex "$@"
fi
