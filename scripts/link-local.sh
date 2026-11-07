#!/bin/sh
# Link this checkout's built CLI into a local bin directory.
# Override BMAD_BOARD_INSTALL_DIR to use a different directory.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) echo "bmad-board: no local build for $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) arch=arm64 ;;
  x86_64|amd64) arch=x64 ;;
  *) echo "bmad-board: no local build for $(uname -m)" >&2; exit 1 ;;
esac
if [ "$os" = darwin ] && [ "$arch" = x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = 1 ]; then arch=arm64; fi

binary="$here/release/bmad-board-$os-$arch"
if [ ! -x "$binary" ]; then
  echo "bmad-board: $binary is missing; run 'bun run build:cli' first" >&2
  exit 1
fi

dir=${BMAD_BOARD_INSTALL_DIR:-"$HOME/.local/bin"}
mkdir -p "$dir"
ln -sfn "$binary" "$dir/bmad-board"
echo "Linked $dir/bmad-board -> $binary"
case ":$PATH:" in
  *":$dir:"*) ;;
  *) echo "Add $dir to your PATH, for example: echo 'export PATH=\"$dir:\$PATH\"' >> ~/.zshrc" ;;
esac
