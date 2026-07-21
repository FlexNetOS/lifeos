#!/bin/sh
# Resolve the platform package-config front door for Cargo build scripts.
#
# The active Yazelix/Nix profile owns Cargo and its tools, but its pkg-config
# wrapper deliberately has a Nix-only search path.  Tauri's Linux SDK is a
# platform-provided dependency, so use the platform resolver when one is
# available.  Cargo permits callers to override this bridge with PKG_CONFIG.
set -eu

for candidate in /usr/bin/pkg-config /opt/homebrew/bin/pkg-config /usr/local/bin/pkg-config; do
  if [ -x "$candidate" ]; then
    exec "$candidate" "$@"
  fi
done

printf '%s\n' 'LifeOS could not find a platform pkg-config executable. Install the platform Tauri SDK or set PKG_CONFIG to its resolver.' >&2
exit 127
