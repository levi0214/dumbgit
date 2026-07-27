#!/bin/sh
set -eu

REPOSITORY=${DUMBGIT_REPOSITORY:-levi0214/dumbgit}
REQUESTED_VERSION=${DUMBGIT_VERSION:-latest}
INSTALL_DIR=${DUMBGIT_INSTALL_DIR:-"$HOME/.local/bin"}

if [ "$(uname -s)" != Darwin ]; then
  echo "dumbgit: only macOS is supported" >&2
  exit 1
fi

case "$(uname -m)" in
  arm64) ARCH=arm64 ;;
  x86_64) ARCH=x64 ;;
  *)
    echo "dumbgit: unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

if [ "$REQUESTED_VERSION" = latest ]; then
  RELEASE_URL="https://github.com/$REPOSITORY/releases/latest/download"
  VERSION_LABEL=latest
else
  case "$REQUESTED_VERSION" in
    v*) TAG=$REQUESTED_VERSION ;;
    *) TAG="v$REQUESTED_VERSION" ;;
  esac
  if ! printf '%s\n' "$TAG" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z][0-9A-Za-z.-]*)?$'; then
    echo "dumbgit: invalid version: $REQUESTED_VERSION" >&2
    exit 1
  fi
  RELEASE_URL="https://github.com/$REPOSITORY/releases/download/$TAG"
  VERSION_LABEL=$TAG
fi

ASSET="dumbgit-darwin-$ARCH.tar.gz"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/dumbgit-install.XXXXXX")
CANDIDATE=
cleanup() {
  rm -rf "$TMP"
  if [ -n "$CANDIDATE" ]; then rm -f "$CANDIDATE"; fi
}
trap cleanup EXIT HUP INT TERM

download() {
  URL=$1
  DESTINATION=$2
  if [ "${3:-}" = progress ]; then
    curl --proto '=https' --tlsv1.2 -fL --retry 3 --progress-bar \
      -o "$DESTINATION" "$URL"
  else
    curl --proto '=https' --tlsv1.2 -fsSL --retry 3 \
      -o "$DESTINATION" "$URL"
  fi || {
    echo "dumbgit: could not download $URL" >&2
    exit 1
  }
}

echo "Downloading dumbgit $VERSION_LABEL for macOS $ARCH..."
download "$RELEASE_URL/checksums.txt" "$TMP/checksums.txt"
download "$RELEASE_URL/$ASSET" "$TMP/$ASSET" progress

EXPECTED=$(awk -v asset="$ASSET" '$2 == asset { print $1; exit }' "$TMP/checksums.txt")
if [ -z "$EXPECTED" ]; then
  echo "dumbgit: $ASSET is missing from checksums.txt" >&2
  exit 1
fi
ACTUAL=$(shasum -a 256 "$TMP/$ASSET" | awk '{ print $1 }')
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "dumbgit: checksum verification failed for $ASSET" >&2
  exit 1
fi

mkdir -p "$TMP/unpack"
tar -xzf "$TMP/$ASSET" -C "$TMP/unpack"
if [ ! -f "$TMP/unpack/dg" ]; then
  echo "dumbgit: release archive does not contain dg" >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
CANDIDATE="$INSTALL_DIR/.dg.$$"
install -m 755 "$TMP/unpack/dg" "$CANDIDATE"
mv -f "$CANDIDATE" "$INSTALL_DIR/dg"
CANDIDATE=

INSTALLED_VERSION=$("$INSTALL_DIR/dg" --version)
printf '\n✓ dumbgit %s is ready\n' "${INSTALLED_VERSION#dg }"
case ":$PATH:" in
  *:"$INSTALL_DIR":*) ;;
  *)
    printf '\n  First add it to your PATH:\n'
    if [ "$INSTALL_DIR" = "$HOME/.local/bin" ]; then
      printf '    export PATH="$HOME/.local/bin:$PATH"\n'
    else
      printf '    export PATH="%s:$PATH"\n' "$INSTALL_DIR"
    fi
    ;;
esac
printf '\n  Run it in any Git repo:\n    dg\n'
