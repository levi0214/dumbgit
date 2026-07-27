#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: scripts/build-release.sh vMAJOR.MINOR.PATCH" >&2
  exit 2
fi

TAG=$1
if ! printf '%s\n' "$TAG" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$'; then
  echo "build-release: invalid release tag: $TAG" >&2
  exit 2
fi

VERSION=${TAG#v}
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUT=${DUMBGIT_RELEASE_DIR:-"$ROOT/dist/release"}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/dumbgit-release.XXXXXX")
trap 'rm -rf "$WORK"' EXIT HUP INT TERM

rm -rf "$OUT"
mkdir -p "$OUT"

for ARCH in arm64 x64; do
  STAGE="$WORK/dumbgit-darwin-$ARCH"
  mkdir -p "$STAGE/LICENSES"
  if [ "$ARCH" = x64 ]; then
    TARGET=bun-darwin-x64-baseline
  else
    TARGET=bun-darwin-arm64
  fi

  bun build \
    --compile \
    --minify \
    --no-compile-autoload-dotenv \
    --no-compile-autoload-bunfig \
    --target="$TARGET" \
    --define "DUMBGIT_BUILD_VERSION=\"$VERSION\"" \
    --outfile "$STAGE/dg" \
    "$ROOT/bin/dg.js"

  chmod 755 "$STAGE/dg"
  cp "$ROOT/LICENSE" "$STAGE/LICENSE"
  cp "$ROOT/licenses/BUN-LICENSE.md" "$STAGE/LICENSES/BUN-LICENSE.md"
  cp "$ROOT/licenses/HONO-LICENSE" "$STAGE/LICENSES/HONO-LICENSE"

  COPYFILE_DISABLE=1 tar -C "$STAGE" -czf \
    "$OUT/dumbgit-darwin-$ARCH.tar.gz" \
    dg LICENSE LICENSES

done

(
  cd "$OUT"
  shasum -a 256 dumbgit-darwin-*.tar.gz > checksums.txt
)

printf 'Release artifacts for dumbgit %s:\n' "$VERSION"
ls -lh "$OUT"
