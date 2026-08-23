#!/usr/bin/env bash
set -euo pipefail

readonly MINISIGN_VERSION=0.12
readonly MINISIGN_SHA256=9a599b48ba6eb7b1e80f12f36b94ceca7c00b7a5173c95c3efc88d9822957e73
readonly ARCHIVE_URL="https://github.com/jedisct1/minisign/releases/download/${MINISIGN_VERSION}/minisign-${MINISIGN_VERSION}-linux.tar.gz"

tool_root="${RUNNER_TEMP:?RUNNER_TEMP is required}/textex-minisign"
archive="$tool_root/minisign.tar.gz"
extract_dir="$tool_root/extract"
bin_dir="$tool_root/bin"

mkdir -p "$extract_dir" "$bin_dir"
curl --fail --location --silent --show-error "$ARCHIVE_URL" --output "$archive"
printf '%s  %s\n' "$MINISIGN_SHA256" "$archive" | sha256sum --check --strict
tar --extract --gzip --file "$archive" --directory "$extract_dir"
install -m 0755 "$extract_dir/minisign-linux/x86_64/minisign" "$bin_dir/minisign"
"$bin_dir/minisign" -v

if [[ -n "${GITHUB_PATH:-}" ]]; then
  printf '%s\n' "$bin_dir" >> "$GITHUB_PATH"
fi
