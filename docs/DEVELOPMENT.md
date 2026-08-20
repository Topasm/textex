# Development

## Setup

```bash
# Install/use the pinned Node.js version from .nvmrc (when using nvm)
nvm install
nvm use

# Install the exact dependency graph from package-lock.json
npm ci
```

Use `npm install` only when intentionally changing dependencies or the lockfile.

Tauri가 기본 desktop runtime이므로 `rust-toolchain.toml`에 고정된 Rust 1.97.1과
플랫폼별 Tauri build dependency가 필요하다. Debian/Ubuntu에서는 다음 패키지를 설치한다.

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Rust는 `rustup`이 repository의 pinned toolchain을 자동 선택한다. `rustup show`로
1.97.1, rustfmt와 clippy가 설치됐는지 확인한다. 다른 운영체제의 요구사항과 현재 이관
범위는 [TAURI_MIGRATION.md](TAURI_MIGRATION.md)를 참고한다.

Tectonic 0.17.0은 Tauri의 필수 sidecar다. `dev`와 `preview`는 현재 host/architecture의
공식 자산을 자동으로 준비한다. 처음부터 명시적으로 준비하려면 다음을 실행한다.

```bash
npm run setup:tauri
npm run check:tauri-sidecars
```

setup은 GitHub release API에 게시된 size와 SHA-256을 검증한 뒤
`src-tauri/binaries/`에 target-suffixed 실행 파일을 atomic install한다. 생성된 binary와
provenance는 Git에서 제외된다. 반면 `build`, `build:tauri`와 `package:*`는 release
재현성을 위해 다운로드하지 않고 기존 staging을 검사한 뒤, 없거나 검증되지 않았으면
실패한다.

Electron은 migration 기간의 legacy 호환 runtime이다. Electron main/preload나 native
module을 작업할 때만 `npm ci` 뒤에 다음 명령을 추가로 실행한다.

```bash
npm run postinstall:electron
```

## Running

```bash
# Start the default Tauri runtime with Vite HMR
npm run dev

# Equivalent explicit Tauri command
npm run dev:tauri

# Start the legacy Electron runtime
npm run dev:electron
```

`npm run dev:web`은 Tauri가 사용하는 Vite server만 실행한다. native runtime 없이
독립적으로 사용할 수 있는 web edition은 아니다.

## Building

```bash
# Build the Tauri executable without creating an installer
npm run build

# Build inside the supported Linux container when the host lacks WebKitGTK 4.1
npm run build:tauri:container

# Build only the shared renderer to out/tauri-renderer/
npm run build:web

# Build the legacy Electron main/preload/renderer
npm run build:electron

# Create Tauri packages for your platform
npm run package:linux
npm run package:linux:deb # DEB only; avoids the AppImage helper download
npm run package:linux:deb:container # Reproducible Rocky/Podman path
npm run package:mac        # Apple Silicon by default
npm run package:win

# Create the current public-release Electron package when validating legacy release CI
npm run package:electron:linux
npm run package:electron:mac:universal
npm run package:electron:win
```

All commands require Node.js 22.13+. `build:tauri:container` additionally requires Podman;
it installs the locked Node graph, stages the verified Linux Tectonic sidecar, and builds
inside `tools/tauri-linux.Containerfile`. Legacy Electron packaging additionally requires a
Tectonic binary in `resources/bin/{linux,mac,win}/`; macOS Apple Silicon binaries live in
`resources/bin/mac/arm64/`. See [PACKAGING.md](PACKAGING.md) for the legacy sidecar layout.

Bundled and generated open-source notice artifacts are kept in
`resources/licenses/` and are committed in the repository alongside the app.

Tectonic은 Tauri의 필수 `externalBin`으로 등록됐지만 TexLab과 나머지 desktop API는
아직 기능 동등성이 아니다. 따라서 기본 Tauri `build`나 `package:*` 성공은 전체
compile/PDF workflow 또는 public release 준비 완료를 의미하지 않는다. 기능 동등성이
확보될 때까지 GitHub public release workflow는 legacy Electron artifact를 계속 만든다.
별도 `Tauri Migration CI` workflow가 `tauri-migration` branch와 pull request에서
Linux, Windows, macOS universal Tauri package를 검증하되 Release는 만들지 않는다.

## All Commands

```bash
# Development
npm run dev              # Start the default Tauri runtime with Vite HMR
npm run dev:tauri        # Explicit Tauri development alias
npm run dev:electron     # Start the legacy Electron runtime
npm run dev:web          # Start the renderer Vite server used by Tauri
npm run build            # Build the Tauri executable without an installer
npm run build:tauri      # Explicit Tauri build alias
npm run build:tauri:container # Build Tauri in a Podman Linux toolchain container
npm run build:electron   # Build legacy Electron main/preload/renderer
npm run build:web        # Build the shared renderer to out/tauri-renderer/
npm run setup:tauri      # Download and verify the current-host Tectonic sidecar
npm run check:tauri-sidecars # Verify staged Tectonic without network access
npm run measure:renderer # Measure initial JS and total renderer build bytes
npm run measure:runtime  # Summarize one or more runtime performance JSON reports
npm run preview          # Run a release-mode Tauri preview without source watching
npm run preview:tauri    # Explicit Tauri preview alias
npm run preview:electron # Preview the legacy Electron production build
npm run preview:web      # Preview renderer assets; native APIs are unavailable
npm run postinstall:electron # Rebuild native modules for legacy Electron

# Type Checking
npm run typecheck        # Run the baseline tsc and Tauri adapter checks
npm run typecheck:tauri  # Check the Tauri renderer adapter explicitly

# Testing
npm run test             # Run the complete Vitest suite
npm run test:watch       # Run Vitest in watch mode

# Verification gates
npm run check            # Fast type/lint/format checks; skips tests
npm run pre-commit       # Full type/lint/format/test commit gate

# Linting & Formatting
npm run lint             # Run ESLint on src/
npm run lint:fix         # Auto-fix ESLint issues
npm run format           # Format with Prettier
npm run format:check     # Check formatting without modifying
npm run format:rust      # Format the Tauri Rust crate with rustfmt
npm run format:rust:check # Check Tauri Rust formatting without compiling
npm run licenses:generate # Regenerate bundled third-party notice files

# Packaging
npm run package          # Create every Tauri bundle supported by the current host
npm run package:linux    # Create Tauri AppImage + DEB
npm run package:linux:deb # Create only the Tauri DEB
npm run package:linux:deb:container # Clean-install and create the DEB in Podman
npm run package:mac      # Create Tauri Apple Silicon DMG
npm run package:mac:x64  # Create Tauri Intel DMG
npm run package:mac:universal # Create Tauri universal DMG
npm run package:win      # Create Tauri NSIS installer
npm run package:electron:linux # Create legacy Electron AppImage + DEB
npm run package:electron:mac # Create legacy Electron Apple Silicon DMG + ZIP
npm run package:electron:mac:x64 # Create legacy Electron Intel DMG + ZIP
npm run package:electron:mac:universal # Create legacy Electron universal DMG + ZIP
npm run package:electron:win # Create legacy Electron NSIS installer

# CLI & MCP
npm run build:cli        # Compile CLI to out/cli/
npm run build:mcp        # Compile MCP server to out/mcp/
npm run mcp              # Start the MCP server (stdio transport)
```

Rust 변경에는 npm gate와 별도로 다음 검증을 실행한다.

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Renderer size 변경은 production web build 뒤에 dependency-free baseline script로
확인한다. JSON artifact가 필요하면 `--silent`를 사용해 npm banner를 제외한다.

```bash
npm run build:web
npm run measure:renderer
npm run --silent measure:renderer -- --json > renderer-bundle.json
```

metric 정의와 editor performance scenario는
[EDITOR_ARCHITECTURE.md](EDITOR_ARCHITECTURE.md#performance-baseline)를 참고한다.
실행 중인 앱의 input/PDF/memory report 수집과 합산 절차도 같은 문서의
`Runtime measurement` 절에 기록되어 있다. Electron 전용 memory baseline은 legacy
`build:electron`과 `preview:electron`을 사용한다.

## License Notices

Run `npm run licenses:generate` after dependency or license changes, and before
packaging or release preparation if the bundled notice artifacts changed. This
refreshes `resources/licenses/THIRD-PARTY-NOTICES.txt`. The Electron/Chromium
notice remains required by legacy Electron packages during migration.

## Check Suite

Use the quick suite while iterating:

```bash
npm run check
```

Before every commit, run the full gate, which includes tests:

```bash
npm run pre-commit
```

`check`와 `pre-commit`은 Tauri adapter TypeScript 검사와 `cargo fmt --check`를
포함하지만 Cargo build/test는 실행하지 않는다. rustfmt는 Tauri를 compile/link하지
않으므로 WebKitGTK 4.1 개발 패키지가 없는 Rocky Linux host에서도 기본 gate를 실행할
수 있다. Rust 동작 변경은 WebKitGTK 4.1이 있는 host 또는
`npm run build:tauri:container`에서 위 Cargo build/test 검증도 추가로 통과해야 한다.

Changes to versions, dependencies, native modules, sidecars, packaging, updater
metadata, or GitHub Actions must also follow the blocking steps in
[RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). In particular, validate a release
commit on `main` across Linux, Windows, and macOS universal before creating its
version tag.

기본 개발·build·package 명령은 Tauri를 사용하지만, 현재 GitHub public release와 updater
workflow는 legacy Electron을 사용한다. 기능 동등성, sidecar, updater, signing과 세
플랫폼 Tauri packaging이 검증되기 전에는 Tauri artifact를 public release에 첨부하지
않는다. 두 runtime의 검증 명령과 artifact를 혼용하지 말고, publish 전에는 반드시
[RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)의 migration 구분을 확인한다.

## Maintainer Handoff

When another person will take over development or repository administration,
follow [HANDOFF.md](HANDOFF.md). It covers GitHub access, a clean local setup,
the first verification run, current release responsibilities, branch cleanup,
and safe removal of the previous maintainer's access.
