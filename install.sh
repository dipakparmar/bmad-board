#!/bin/sh
# Installs the bmad-board executable from the latest GitHub release.
#
#   curl -fsSL https://raw.githubusercontent.com/dipakparmar/bmad-board/main/install.sh | sh
#   gh api repos/dipakparmar/bmad-board/contents/install.sh -H 'Accept: application/vnd.github.raw' | sh
#
# While the repo is private, the second form works: it and the download below use your `gh` login.
#
# BMAD_BOARD_VERSION=v1.0.0 picks a release; BMAD_BOARD_INSTALL_DIR picks the folder
# (default /usr/local/bin when writable, else ~/.local/bin).
set -eu

repo="dipakparmar/bmad-board"
case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) echo "bmad-board: no build for $(uname -s); build from source with bun scripts/build-cli.ts" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) arch=arm64 ;;
  x86_64|amd64) arch=x64 ;;
  *) echo "bmad-board: no build for $(uname -m)" >&2; exit 1 ;;
esac
# Rosetta reports x86_64 on Apple silicon; prefer the native build.
if [ "$os" = darwin ] && [ "$arch" = x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = 1 ]; then arch=arm64; fi

asset="bmad-board-$os-$arch.tar.gz"
if [ -n "${BMAD_BOARD_VERSION:-}" ]; then
  base="https://github.com/$repo/releases/download/$BMAD_BOARD_VERSION"
else
  base="https://github.com/$repo/releases/latest/download"
fi

dir="${BMAD_BOARD_INSTALL_DIR:-}"
if [ -z "$dir" ]; then
  if [ -w /usr/local/bin ]; then dir=/usr/local/bin; else dir="$HOME/.local/bin"; fi
fi
mkdir -p "$dir"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
echo "Downloading ${asset}…"
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  # gh reaches private repos too.
  gh release download ${BMAD_BOARD_VERSION:-} -R "$repo" -p "$asset" -p checksums.txt -D "$tmp"
else
  curl -fsSL "$base/$asset" -o "$tmp/$asset"
  curl -fsSL "$base/checksums.txt" -o "$tmp/checksums.txt" 2>/dev/null || true
fi
if [ -s "$tmp/checksums.txt" ]; then
  want="$(grep " $asset\$" "$tmp/checksums.txt" | cut -d' ' -f1)"
  got="$( (sha256sum "$tmp/$asset" 2>/dev/null || shasum -a 256 "$tmp/$asset") | cut -d' ' -f1)"
  if [ -n "$want" ] && [ "$want" != "$got" ]; then echo "bmad-board: checksum mismatch for $asset" >&2; exit 1; fi
fi
tar -xzf "$tmp/$asset" -C "$tmp"
install -m 755 "$tmp/bmad-board" "$dir/bmad-board"
echo "Installed $("$dir/bmad-board" --version 2>/dev/null || echo bmad-board) to $dir/bmad-board"
case ":$PATH:" in
  *":$dir:"*) ;;
  *) echo "Add $dir to your PATH, for example: echo 'export PATH=\"$dir:\$PATH\"' >> ~/.zshrc" ;;
esac
echo "Run it inside a BMAD project: cd ~/code/my-project && bmad-board"
