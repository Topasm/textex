# Tectonic offline seed staging

This directory is a deterministic staging area, not a manually maintained
cache dump.

- `manifest.json` identifies the seed, required Tectonic version, total size,
  and SHA-256/size metadata for every bundled file.
- `files/` contains only paths listed by the manifest. It is intentionally
  absent while TextEx ships without a curated support-file seed.

Generate a seed from a reviewed cache fixture with:

```sh
node scripts/prepare-tectonic-cache-seed.js \
  --source /absolute/path/to/reviewed-cache \
  --seed-version tectonic-0.17-common-v1
```

Verify the tracked staging area without network access with:

```sh
npm run check:tectonic-cache-seed
```

The checked-in manifest is currently empty. Settings reports that fact rather
than claiming full offline readiness, and first compile may download required
support files into the user's writable cache.

Do not copy a developer's full cache into this directory. Review the generated
manifest, package-size change, file licenses, and first-compile fixtures before
committing an actual seed.
