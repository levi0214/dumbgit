#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: scripts/build-npm-package.sh vMAJOR.MINOR.PATCH" >&2
  exit 2
fi

TAG=$1
if ! printf '%s\n' "$TAG" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z][0-9A-Za-z.-]*)?$'; then
  echo "build-npm-package: invalid release tag: $TAG" >&2
  exit 2
fi

VERSION=${TAG#v}
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUT=${DUMBGIT_NPM_DIR:-"$ROOT/dist/npm"}
PACKAGE="$OUT/package"

rm -rf "$OUT"
mkdir -p "$PACKAGE"

bun build \
  --target=bun \
  --minify \
  --define "DUMBGIT_BUILD_VERSION=\"$VERSION\"" \
  --outfile "$PACKAGE/dg.js" \
  "$ROOT/bin/dg.js"
chmod 755 "$PACKAGE/dg.js"

cat > "$PACKAGE/package.json" <<EOF
{
  "name": "dumbgit",
  "version": "$VERSION",
  "description": "A tiny local Git GUI for macOS.",
  "license": "MIT",
  "author": "Luyao",
  "type": "module",
  "bin": {
    "dg": "./dg.js"
  },
  "os": ["darwin"],
  "engines": {
    "bun": ">=1.3.0"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/levi0214/dumbgit.git"
  },
  "homepage": "https://github.com/levi0214/dumbgit",
  "bugs": {
    "url": "https://github.com/levi0214/dumbgit/issues"
  }
}
EOF

cp "$ROOT/LICENSE" "$PACKAGE/LICENSE"
cp "$ROOT/README.md" "$PACKAGE/README.md"
mkdir -p "$PACKAGE/LICENSES"
cp "$ROOT/licenses/HONO-LICENSE" "$PACKAGE/LICENSES/HONO-LICENSE"
cp "$ROOT/licenses/HTMX-LICENSE" "$PACKAGE/LICENSES/HTMX-LICENSE"

npm pack "$PACKAGE" --pack-destination "$OUT"
