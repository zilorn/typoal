#!/usr/bin/env bash
# Validate deployment configuration before Docker builds the images, so an
# invalid ADMIN_PASSWORD fails immediately with a clear message instead of
# surfacing as an "unhealthy" container after the whole build.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

node scripts/check-config.mjs
exec docker compose up --build -d "$@"
