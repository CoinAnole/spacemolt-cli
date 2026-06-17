#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
BUN_BIN="${BUN:-bun}"
INSTALL_DIR="${INSTALL_DIR:-"$HOME/.local/bin"}"
TARGET_NAME="${TARGET_NAME:-spacemolt}"

if ! command -v "$BUN_BIN" >/dev/null 2>&1; then
  if [ -x "$HOME/.bun/bin/bun" ]; then
    BUN_BIN="$HOME/.bun/bin/bun"
  else
    echo "error: bun not found. Install Bun or set BUN=/path/to/bun." >&2
    exit 127
  fi
fi

mkdir -p "$INSTALL_DIR"
INSTALL_DIR="$(cd "$INSTALL_DIR" && pwd -P)"
TARGET="$INSTALL_DIR/$TARGET_NAME"
TMP="$(mktemp "$INSTALL_DIR/.${TARGET_NAME}.tmp.XXXXXX")"

cleanup() {
  rm -f "$TMP"
}
trap cleanup EXIT

cd "$ROOT_DIR"
"$BUN_BIN" scripts/build.ts

if [ ! -f "$ROOT_DIR/spacemolt" ]; then
  echo "error: build did not create $ROOT_DIR/spacemolt" >&2
  exit 1
fi

cp "$ROOT_DIR/spacemolt" "$TMP"
chmod 755 "$TMP"
mv -f "$TMP" "$TARGET"
trap - EXIT

echo "Installed $TARGET"

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo "warning: $INSTALL_DIR is not on PATH."
    echo "Add it to your shell profile to run spacemolt from anywhere."
    ;;
esac
