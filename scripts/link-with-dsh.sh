#!/usr/bin/env bash
# Link the companion mobile app into a DeepSeek Harness checkout so the app
# resolves the DSH client packages (workspace:*) at runtime.
#
# Usage: scripts/link-with-dsh.sh [path-to-deepseek-harness]
#
# The script:
#   1. clones deepseek-harness at the matching tag (or reuses your checkout)
#   2. syncs apps/companion-mobile into <clone>/apps/companion-mobile
#   3. injects the workspace dependencies the app needs
#   4. installs and builds the harness client libraries
#   5. prints how to start Expo from the linked folder
set -euo pipefail

DSH_TAG="v0.2.2-rc.1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/apps/companion-mobile"
CLONE="${1:-$ROOT/deepseek-harness}"

if [ ! -d "$CLONE/.git" ]; then
  echo "==> cloning deepseek-harness ($DSH_TAG) to $CLONE"
  git clone --depth 1 --branch "$DSH_TAG" https://github.com/deepseek-ai/deepseek-harness.git "$CLONE"
fi

echo "==> syncing app into $CLONE/apps/companion-mobile"
rm -rf "$CLONE/apps/companion-mobile"
mkdir -p "$CLONE/apps/companion-mobile"
rsync -a --exclude node_modules --exclude .expo "$APP/" "$CLONE/apps/companion-mobile/"

echo "==> injecting workspace dependencies"
node - "$CLONE/apps/companion-mobile/package.json" <<'EOF'
const fs = require('fs')
const file = process.argv[2]
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
pkg.dependencies = {
  ...(pkg.dependencies ?? {}),
  '@deepseek-ai/cordis': 'workspace:~',
  '@deepseek-ai/dsh-client-connection': 'workspace:*',
  '@deepseek-ai/dsh-api-gateway': 'workspace:*',
  '@deepseek-ai/dsh-api-session-controller': 'workspace:*',
  '@deepseek-ai/dsh-typert-registry': 'workspace:*',
  '@deepseek-ai/dsh-typert-protocol': 'workspace:*',
  '@deepseek-ai/dsh-client-file-upload': 'workspace:*',
  '@deepseek-ai/dsh-commands': 'workspace:*',
  '@deepseek-ai/dsh-subagent': 'workspace:*',
  zod: pkg.dependencies?.zod ?? '^4.4.3',
}
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
console.log('workspace deps injected')
EOF

echo "==> installing harness workspace (this takes a while)"
cd "$CLONE"
pnpm install

echo "==> building client libraries"
pnpm run build:lib || pnpm run build

cat <<'EOF'

==> done. start the app from the linked folder:

  cd <clone>/apps/companion-mobile
  npx expo start

the app now resolves the DSH client packages from the harness workspace.
EOF
