#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

for tool in node pnpm go; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "缺少 $tool，请先安装 Node.js 24+、pnpm 11 和 Go 1.26+。" >&2
    exit 1
  fi
done
node -e 'if (+process.versions.node.split(".")[0] < 24) { console.error("需要 Node.js 24 或更新版本。"); process.exit(1); }'
echo "正在准备 typoal 开发环境…"
pnpm install --frozen-lockfile
exec pnpm dev
