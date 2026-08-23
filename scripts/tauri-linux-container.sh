#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
image_name="localhost/textex-tauri-linux:rust-1.97.1"
containerfile="$repo_root/tools/tauri-linux.Containerfile"
containerfile_sha=$(sha256sum "$containerfile" | awk '{print $1}')

if ! command -v podman >/dev/null 2>&1; then
  echo "podman is required for the containerized Tauri Linux build" >&2
  exit 1
fi

image_containerfile_sha=""
if podman image exists "$image_name"; then
  image_containerfile_sha=$(
    podman image inspect "$image_name" \
      --format '{{ index .Labels "com.textex.containerfile-sha256" }}' 2>/dev/null || true
  )
fi

if [[ "$image_containerfile_sha" != "$containerfile_sha" ]]; then
  podman build \
    --file "$containerfile" \
    --label "com.textex.containerfile-sha256=$containerfile_sha" \
    --tag "$image_name" \
    "$repo_root"
fi

if [[ $# -eq 0 ]]; then
  # Keep the container build reproducible and avoid running unrelated package
  # lifecycle scripts as root inside the build image.
  set -- bash -lc 'npm ci --ignore-scripts --include=optional && npm run setup:tauri && npm run build:tauri'
fi

exec podman run --rm \
  --security-opt label=disable \
  --volume "$repo_root:/workspace" \
  --volume textex-node-modules:/workspace/node_modules \
  --volume textex-cargo-registry:/opt/cargo/registry \
  --volume textex-cargo-git:/opt/cargo/git \
  --volume textex-tauri-cache:/root/.cache/tauri \
  --workdir /workspace \
  "$image_name" \
  "$@"
