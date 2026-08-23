# Tauri Migration

TextEx의 기본 local development, build, preview와 package 명령은 Tauri 2 runtime을
사용한다. Electron main/preload와 `electron-builder`는 migration 기간의 legacy 호환
경로로 유지한다. 현재 GitHub public release와 updater workflow는 기능 동등성과
플랫폼별 Tauri packaging 검증이 끝날 때까지 legacy Electron artifact를 계속 배포한다.

이 기본값 전환은 Tauri가 이미 모든 TextEx 기능을 지원한다는 뜻이 아니다. 아래의
미지원 기능은 명시적으로 실패하며, 전체 workflow가 필요한 개발자는 대응되는
`:electron` 명령을 사용해야 한다.

## Current Status

현재 구현 범위는 renderer 부팅 기반, 프로젝트 파일시스템과 native 설정/세션 복원,
revision-aware Tectonic compile, system Git vertical slice다. 새 기능은 Tauri/Rust 경로에만
추가하며 Electron은 기능 동등성을 확인하기 위한 임시 fallback으로만 유지한다.

| 영역 | 상태 | 비고 |
| --- | --- | --- |
| React/Vite renderer | 지원 | Electron과 같은 `src/renderer/`를 사용한다. |
| Runtime adapter | 지원 | Electron preload 또는 Tauri adapter가 같은 `DesktopApi`를 구현한다. |
| 폴더 선택 | 지원 | Rust dialog에서 선택한 폴더를 현재 project root로 등록한다. |
| 디렉터리 읽기 | 지원 | project root 내부만 허용하며 숨김 항목은 제외한다. |
| 파일 읽기 | 지원 | UTF-8/BOM, UTF-16 LE BOM, legacy byte fallback을 처리한다. |
| 파일 저장 | 지원 | 기존 파일과, 존재하는 project 폴더 안의 새 경로에 저장한다. |
| Save As/파일·폴더 생성/복사/이름 변경/삭제 | 지원 | Rust command가 project root와 symlink 경계를 검증하며 root 삭제와 기존 대상 덮어쓰기를 거부한다. |
| 열린 파일 일괄 저장 | 지원 | 하나의 `save_file_batch` command가 검증 후 atomic replacement를 수행한다. |
| binary/base64 읽기 | 지원 | project root 내부 파일만 허용한다. base64는 10 MiB, raw IPC response는 256 MiB safety cap을 적용한다. |
| directory watcher | 지원 | Rust가 100ms batch/dedupe 후 Channel로 전달하고 renderer ProjectIndex가 구조 변경을 부모 디렉터리 단위로 병합해 lazy tree만 갱신한다. |
| project metadata index | 지원 | `get_project_index` 최초 호출 시 hidden/noisy/symlink tree를 제외한 flat path metadata를 lazy build하고, 활성 index는 generation-aware watcher delta로 갱신한다. OmniSearch의 `/f`가 파일 내용을 materialize하지 않고 이 index를 검색하며 FileTree는 expanded flat row 중 viewport+overscan만 DOM에 둔다. |
| 설정/최근 프로젝트 | 지원 | app config의 typed JSON을 Rust가 원자 저장하며 최근 프로젝트 목록을 경로 권한으로도 사용한다. |
| 세션 프로젝트 복원 | 지원 | renderer 저장 경로를 직접 신뢰하지 않고 Rust에 저장된 최근 프로젝트만 재활성화한다. |
| Tectonic compile | 지원 | bundled 0.17 sidecar, magic root, timeout, cancel과 log Channel을 지원한다. |
| compile scheduling | 지원 | priority queue, revision identity, latest-wins coalescing과 preemption을 적용한다. |
| compile diagnostics | 지원 | Rust가 Tectonic log를 구조화하고 revision-tagged Channel event로 전달해 stale marker 게시를 차단한다. |
| Git | 지원 | project root로 제한된 system Git service가 init/status/stage/unstage/commit/diff/log/file log를 제공한다. |
| LaTeX package metadata | 지원 | bundled JSON resource를 Rust가 검증·cache하고 transitive dependency까지 반환한다. |
| fallback document outline | 지원 | filesystem 접근 없는 shared parser를 Tauri renderer에서 직접 실행한다. |
| updater | 지원 | Rust가 GitHub `latest.json`을 확인하고 signed artifact를 Channel progress와 함께 설치한다. Tauri config의 빈 `pubkey` placeholder는 plugin 역직렬화를 통과시키고 release build의 `TEXTEX_UPDATER_PUBLIC_KEY`가 builder에서 이를 덮어쓴다. |
| PDF preview | 지원 | Rust raw IPC body를 `Uint8Array`로 연결하고 visible+overscan만 DOM에 둔다. 새 generation은 숨겨진 현재 page가 렌더된 뒤 기존 keyed layer와 atomic swap한다. |
| SyncTeX | 지원 | Rust가 plain/gzip SyncTeX를 parse·mtime cache하고 magic root 및 project boundary를 유지하며 forward/inverse/line-map command를 제공한다. |
| BibTeX/label index | 지원 | ProjectIndex generation별로 `.bib`/`.tex`를 한 번만 scan·cache하며 단일 BibTeX 파일 parse도 project boundary와 10 MiB 제한을 적용한다. |
| Zotero/Better BibTeX | 지원 | loopback 전용 Rust HTTP client가 probe, search, CAYW, 선택 citekey export와 collection→project `.bib` atomic sync를 제공하며 redirect, 크기와 timeout을 제한한다. |
| local history | 지원 | Rust가 project-scoped gzip snapshot을 원자 저장하고 50개로 prune하며 snapshot 경로와 50 MiB decompression limit을 검증한다. |
| 나머지 desktop API | 미지원 | 호출 시 `has not been migrated` 오류를 반환한다. |

파일 읽기는 5 MiB를 넘으면 renderer에 경고 정보를 전달하고, editor 정지를 막기
위해 50 MiB를 넘는 파일은 거부한다. 이 제한은 PDF 전달 방식과는 별개이며 추후
실사용 측정에 따라 조정한다.

## Coexistence Architecture

```text
React renderer
      |
      | window.api: DesktopApi
      v
+----------------------+----------------------+
| Electron runtime     | Tauri runtime        |
| preload contextBridge| renderer adapter     |
|          |           |          | invoke    |
|          v           |          v           |
| Node/Electron main   | Rust commands/services |
+----------------------+----------------------+
```

`src/renderer/platform/desktopApi.ts`가 React mount 전에 runtime을 선택한다. Electron의
preload가 이미 `window.api`를 제공하면 이를 그대로 사용한다. 그렇지 않으면 실제
Tauri runtime인지 확인한 뒤 `src/renderer/platform/tauriApi.ts`를 동적으로 불러온다.
따라서 Tauri 관련 JavaScript는 Electron renderer의 초기 chunk에 포함되지 않는다.

Tauri adapter는 아직 이관하지 않은 command를 조용히 성공시켜서는 안 된다. 일반
method는 명시적인 rejected promise를 반환한다. 앱 부팅에 필요한 일부 listener 등록은
현재 임시 no-op이다. updater는 Rust command와 Channel을 기존 `DesktopApi` notification
contract에 연결하며 renderer에 updater plugin 권한을 직접 노출하지 않는다.

M0에서는 닫기/최소화/최대화 control을 잃지 않도록 Tauri native window frame을
유지한다. runtime 표식으로 Electron 전용 toolbar drag 영역과 window-control 여백은
Tauri에서 비활성화한다. Electron과 같은 custom title bar는 정확한 window permission과
control을 함께 구현하는 단계에서 전환한다.

## Security Boundary

renderer는 Electron/Tauri 여부와 관계없이 Node.js, Electron, Rust API를 직접
사용하지 않고 typed `window.api`만 사용한다. `DesktopApi` contract를 변경할 때는
Electron preload, Tauri adapter, 공유 타입과 테스트를 함께 갱신한다.

현재 Rust backend는 다음 command만 등록한다.

- `open_file`
- `open_directory`
- `read_directory`
- `read_file`
- `save_file`
- `save_file_as`
- `save_file_batch`
- `create_file`
- `create_directory`
- `copy_file`
- `rename_path`
- `delete_path`
- `read_file_base64`
- `read_file_binary`
- `git_is_repo`
- `git_init`
- `git_status`
- `git_stage`
- `git_unstage`
- `git_commit`
- `git_diff`
- `git_log`
- `git_file_log`
- `load_package_data`
- `watch_directory`
- `unwatch_directory`
- `get_project_index`
- `load_settings`
- `save_settings`
- `activate_project`
- `add_recent_project`
- `remove_recent_project`
- `update_recent_project`
- `compile_latex`
- `cancel_compile`
- `check_app_update`
- `download_and_install_update`
- `restart_app`

`src-tauri/build.rs`의 app manifest와
`src-tauri/capabilities/main-window.json`에서 동일한 allow-list를 유지한다.
`withGlobalTauri`는 `false`이고 renderer에 shell 또는 filesystem plugin 권한을 직접
노출하지 않는다. native folder dialog도 Rust command 안에서 호출한다.

선택한 폴더는 canonical project root로 저장한다. 이후 경로는 다음 검사를 거친다.

- 절대경로만 허용한다.
- 기존 파일과 폴더는 canonicalize한 후 project root 내부인지 확인한다.
- 새 파일은 canonical parent가 project root 내부이고 실제 폴더인지 확인한다.
- symlink를 이용한 project root 탈출을 거부한다.
- Windows에서는 경로 component를 대소문자 구분 없이 비교한다.
- Rust에서 손실 없이 JavaScript 문자열로 전달할 수 없는 경로는 거부하거나 목록에서
  제외한다.

새 command를 추가할 때 renderer에서 `@tauri-apps/plugin-shell` 같은 범용 native
API를 직접 열기보다 좁은 입력 타입과 검증을 가진 Rust command를 우선한다.

## Prerequisites

공통 Node.js 요구사항은 Node.js 22.13 이상과 `npm ci`다. 이 repository의 재현 가능한
개발 기준은 `.nvmrc`의 Node.js 22.23.2와 `rust-toolchain.toml`의 Rust 1.97.1이다.
Tauri command를 실행하려면 이 Rust toolchain과 플랫폼 build dependency가 필요하다.

```bash
nvm install
nvm use
rustup show
rustup component add clippy rustfmt
node --version
rustc --version
cargo --version
```

Debian/Ubuntu 계열 Linux에서는 Tauri 공식 prerequisite를 설치한다.

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

다른 배포판, macOS, Windows 요구사항은
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)를 따른다. Windows는
MSVC C++ build tools와 WebView2가 필요하며, macOS desktop build는 Xcode Command
Line Tools가 필요하다.

Rocky Linux처럼 host에 WebKitGTK 4.1 개발 패키지를 설치하기 어려운 환경에서는 Podman
기반 build container를 사용한다. 이 명령은 container 안에서
`npm ci --ignore-scripts --include=optional`, 검증된 Linux Tectonic setup과 Tauri
build를 순서대로 수행한다. Electron 전용 `node-pty` native lifecycle은 이 Tauri
build에 필요하지 않지만 플랫폼별 Tauri CLI binding은 포함해야 한다.

```bash
npm run build:tauri:container
```

container 정의는 `tools/tauri-linux.Containerfile`, 실행 wrapper는
`scripts/tauri-linux-container.sh`다. host repository를 mount하므로 생성된 renderer와
Rust build output은 기존 workspace에 남는다. image도 Node.js 22.23.2와 Rust 1.97.1을
고정하며, container definition이 바뀌면 wrapper가 SHA label을 비교해 다시 빌드한다.

## Mandatory Tectonic Sidecar

Tectonic 0.17.0은 선택 기능이 아니라 기본 Tauri runtime에 항상 포함되는 sidecar다.
`src-tauri/tauri.conf.json`의 `bundle.externalBin`은 `binaries/tectonic`을 등록하며,
Tauri CLI가 build target에 맞는 다음 파일을 찾는다.

```text
src-tauri/binaries/tectonic-$TARGET_TRIPLE[.exe]
```

현재 host용 자산을 내려받고 검증하려면 다음 명령을 사용한다.

```bash
npm run setup:tauri
npm run check:tauri-sidecars
```

다른 target을 준비하거나 release preflight를 직접 실행할 수도 있다.

```bash
npm run setup:tauri -- --target x86_64-pc-windows-msvc
npm run setup:tauri -- --target x86_64-pc-windows-msvc --check
npm run setup:tauri -- --target aarch64-apple-darwin
npm run setup:tauri -- --target aarch64-apple-darwin --check
```

setup script는 npm package를 사용하지 않는다. GitHub Tectonic 0.17.0 release의 고정 URL,
asset size와 SHA-256을 검증하고, 임시 위치에서 tar.gz 또는 ZIP을 해제한 뒤 binary format과
native `tectonic --version`을 검사한다. 성공한 파일만 target-suffixed 경로로 atomic
install한다. 생성된 payload/provenance는 gitignored이며 검토된
`src-tauri/binaries/manifest.json`만 source control에 둔다.

Tauri bundle은 sidecar와 함께 `resources/data/packages/**`를 `data/packages/`에,
`resources/licenses/**`를 `licenses/`에, `resources/tectonic-cache/**`를
`tectonic-cache/`에 포함한다. 따라서 dependency 또는
Tectonic 고지가 바뀌면 `npm run licenses:generate` 결과도 package 전에 검토한다. 이
명령은 npm 고지와 함께 locked Cargo runtime/build dependency 그래프를
`RUST-THIRD-PARTY-NOTICES.txt`로 생성한다. 플랫폼 crate까지 내려받는 Cargo cache는
Podman build volume에 격리하기 위해 container 안에서 실행할 수 있다.

Tauri macOS release target은 Apple Silicon `aarch64-apple-darwin`만 지원한다. Intel과
universal package는 migration release matrix에서 제외하며, 현재 public Electron release가
universal artifact를 유지하는 동안에만 legacy 경로에서 별도로 검증한다.
개발용 `dev`/`preview`는 setup을 자동 실행하지만, release 성격의 `build`와 `package:*`는
네트워크 다운로드 없이 `--check`만 실행한다. CI는 setup과 check를 별도 단계로 남겨
다운로드 provenance와 packaging 실패를 구분해야 한다.

## Development Commands

| Command | 용도 |
| --- | --- |
| `npm run dev` | 기본 Tauri 개발 모드다. Vite renderer와 Rust backend를 함께 실행한다. |
| `npm run dev:tauri` | 기본 Tauri 개발 모드의 명시적 alias다. |
| `npm run dev:electron` | 전체 legacy 기능을 확인하는 Electron 개발 모드다. |
| `npm run dev:web` | Tauri가 사용할 Vite dev server만 실행한다. 단독 web app은 아니다. |
| `npm run build` | installer 없이 기본 Tauri release executable을 빌드한다. |
| `npm run build:tauri` | `npm run build`의 명시적 alias다. |
| `npm run build:tauri:container` | WebKitGTK 4.1을 포함한 Podman Linux image에서 빌드한다. |
| `npm run build:electron` | legacy Electron main/preload/renderer를 빌드한다. |
| `npm run build:web` | 공유 renderer를 `out/tauri-renderer/`에 빌드한다. |
| `npm run setup:tauri` | current-host Tectonic을 download, 검증, staging한다. |
| `npm run check:tauri-sidecars` | network 없이 current-host staging을 검증한다. |
| `npm run preview` | source watcher 없이 release-mode Tauri preview를 실행한다. |
| `npm run preview:electron` | legacy Electron production build를 preview한다. |
| `npm run package:*` | 현재 host/target의 Tauri installer를 만든다. public release용은 아직 아니다. |
| `npm run package:linux:deb` | Linux DEB만 만들며 AppImage tool download가 필요 없다. |
| `npm run package:linux:deb:container` | 고정된 Podman 환경에서 clean install 후 Linux DEB를 만든다. |
| `npm run package:updater:*` | 별도 config를 병합해 signed updater artifact를 만든다. signing 환경변수가 반드시 필요하다. |
| `npm run package:electron:*` | 현재 public release 형식의 legacy Electron installer를 만든다. |

`dev`/`dev:tauri`와 `build`/`build:tauri`는 각각 `tauri.conf.json`의 `beforeDevCommand`와
`beforeBuildCommand`를 통해 web command를 자동 실행한다. `dev:web` 또는
`preview:web`만 브라우저에서 열면 Electron preload와 Tauri runtime이 모두 없으므로
`DesktopApi`를 설치할 수 없다.

`package`는 `tauri.conf.json`에서 현재 host가 지원하는 기본 bundle target을 모두
만든다. 재현 가능한 artifact 검증에는 `package:linux`, Apple Silicon 전용
`package:mac`, `package:win`처럼 target을 좁힌 명령을 사용한다. Tauri가 기능 동등성을
확보하기 전까지 이 artifact와 Electron updater artifact를 같은 release에 섞지 않는다.

별도 `.github/workflows/tauri-migration.yml`은 `tauri-migration`/`main` push, `main` 대상
pull request와 manual dispatch에서 Tauri만 검증한다. Node/Rust/npm audit, Rust 테스트,
세 플랫폼 sidecar와 package, package 내부 Tectonic, artifact hash/size를 로그로 남기고
14일 동안 migration artifact를 보관한다. 이 workflow에는 tag 또는 release job이 없다.

## Updater and Signing

Tauri updater는 renderer plugin API를 열지 않고 다음 narrow command만 사용한다.

```text
check_app_update
download_and_install_update + Channel<started|progress|finished>
restart_app
```

endpoint는 `https://github.com/Topasm/textex/releases/latest/download/latest.json`이다.
`src-tauri/tauri.conf.json`은 `plugins.updater`를 빈 object라도 항상 유지해야 한다.
plugin이 등록된 상태에서 이 항목이 없으면 Tauri가 `null`을 updater configuration으로
역직렬화하지 못해 window 생성 전에 application startup이 중단된다.
일반 개발 build는 signing key 없이 compile할 수 있지만 updater check는 명시적인
configuration error를 반환한다. signed release build에는 다음 환경변수가 필요하다.

```text
TEXTEX_UPDATER_PUBLIC_KEY
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

public key는 release build에 embed되며 공유할 수 있다. private key와 password는 repository,
config file, chat history에 넣지 않고 CI secret 또는 maintainer의 secure storage에만 둔다.
`package:updater:linux`, `package:updater:win`, `package:updater:mac`은
`src-tauri/tauri.updater.conf.json`의 `createUpdaterArtifacts: true`를 적용한다. 기존
`package:*`와 migration CI는 key가 준비되기 전에도 unsigned validation package를 계속
만들 수 있다.

Linux updater artifact는 DEB가 아니라 AppImage와 `.sig`다. Tauri public release 전환
gate에는 AppImage 생성, signature 검증, 이전 설치본에서의 update installation test와
`latest.json` platform map 검증이 모두 포함돼야 한다.

### Verified Linux artifact

2026-08-20에 Rocky Linux host에서 고정된 Podman image로 release build와 DEB packaging을
검증했다.

```text
artifact: src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/deb/TextEx_1.0.8_amd64.deb
package size: 15,917,542 bytes
installed size metadata: 53,994 KiB
app binary: 9,333,896 bytes
bundled Tectonic 0.17.0: 26,401,904 bytes
```

DEB에는 Tectonic 실행 파일, Tectonic 고지와 Rust/npm third-party notices가 포함된다.
AppImage는 첫 packaging 때 Tauri의 `AppRun-x86_64` tool을 GitHub에서 내려받아야 한다.
현재 검증 host에서는 그 외부 다운로드가 global timeout으로 실패했으므로 DEB 성공과
AppImage 배포 준비를 구분한다.

## Verification

JavaScript adapter와 renderer build는 다음 순서로 확인한다.

```bash
npm run typecheck:tauri
npm run test -- src/__tests__/renderer/tauriApi.test.ts
npm run build:web
```

Rust toolchain이 있는 환경에서는 다음 검증도 실행한다.

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

마지막으로 `npm run dev`에서 폴더 선택, 중첩 폴더 탐색, `.tex` 파일 열기와
저장, 선택 취소, project 밖 경로와 symlink 탈출 거부를 수동 확인한다. Windows의
대소문자 경로와 Linux/macOS의 symlink 동작은 각 플랫폼에서 따로 검증한다.

`npm run check`와 `npm run pre-commit`은 Tauri adapter용 TypeScript 검사와
`cargo fmt --check`를 실행하지만 Cargo build/test는 실행하지 않는다. rustfmt는
Tauri를 compile/link하지 않으므로 WebKitGTK 4.1 개발 패키지가 없는 Rocky Linux
host에서도 기본 gate를 실행할 수 있다. Rust 동작 변경에는 위 Cargo 검증 또는
`npm run build:tauri:container`를 별도로 추가한다.

## Not Yet Supported

현재 기본 Tauri runtime은 전체 TextEx workflow를 지원하지 않는다. 다음 기능은 legacy
Electron에서만 동작한다.

- project-scoped custom protocol과 PDFium A/B
- TexLab lifecycle와 LSP JSON-RPC
- project metadata
- spellcheck, templates와 Pandoc export
- AI provider와 Claude/Codex CLI integration
- PTY terminal
- menu/window integration, 세 플랫폼 signed release CI와 notarization

Tectonic은 필수 sidecar로 등록되어 package 전 검증되지만 TexLab은 아직 등록되어 있지
않다. 기본 `build`와 `package:*`가 성공하더라도 큰 PDF의 scroll latency와
나머지 LaTeX workflow의 기능 동등성 또는 public release 준비를 의미하지 않는다.

현재 bundled cache directory에는 안내 파일만 있고 curated support-file seed는 없다.
따라서 Tectonic 자체는 installer에 포함되지만 새 환경의 첫 compile은 support files를
받기 위한 network가 필요할 수 있다. warm cache compile과 완전한 offline first compile은
서로 다른 검증 항목이다.

## Next Steps

다음 순서로 작은 vertical slice를 추가한다.

1. raw IPC보다 큰 PDF에는 project-scoped custom protocol을 A/B 측정하고 PDF.js 대비
   PDFium의 latency/memory/package-size tradeoff를 기록한다.
2. Pandoc, bibliography, history, AI/Zotero 등 나머지 service를 이관한다.
3. TexLab은 project-wide definition/rename/semantic diagnostics의 실사용 필요성을 측정할
   때까지 HOLD한다.
4. PTY는 마지막에 cross-platform 구현과 Windows console QA를 함께 진행한다.
5. menu와 release signing을 완료하고 세 플랫폼 updater package를 다시 검증한 뒤 임시 Electron 경로를
   제거한다.

sidecar 파일은 `-$TARGET_TRIPLE` 이름을 사용하며 Windows는 triple 뒤에 `.exe`를
붙인다. macOS Tectonic은 Apple Silicon용 arm64 payload만 release 대상으로 검증한다.
TexLab을 다시 추가할 때도 arm64만 bundle한다. renderer에서 sidecar spawn 권한이나
`args: true`를 열지 말고 Rust manager가 child process와 cancel handle을 소유해야 한다.

## Size and Performance

현재 Tauri renderer는 별도 Vite build, vendor chunk 분리, production source map 제거를
사용한다. Monaco editor, PDF preview, terminal, MathLive와 AI/template UI는 실제 사용
시점까지 lazy-load한다. Monaco는 전체 package entry 대신 editor API와 editor feature만
포함하고, TextEx가 사용하지 않는 TypeScript/JSON/CSS/HTML 언어 service와 worker는
번들하지 않는다. local worker는 CSP의 좁은 `worker-src 'self' blob:` 범위에서 별도
파일로 캐시된다.

같은 Vite production build를 변경 전후로 비교한 현재 기준값은 다음과 같다. 이 값은
native shell이나 sidecar를 포함하지 않은 renderer 파일 합계이며 플랫폼별 최종
installer 크기는 아니다.

| 지표 | 변경 전 | 변경 후 | 변화 |
| --- | ---: | ---: | ---: |
| 초기 preload 대상 JavaScript (raw) | 약 5.47 MB | 약 0.87 MB | 약 84% 감소 |
| 초기 preload 대상 JavaScript (gzip) | 약 1.47 MB | 약 0.26 MB | 약 83% 감소 |
| 전체 renderer 파일 | 13.95 MB | 9.12 MB | 약 35% 감소 |

현재 값은 `npm run build:web && npm run measure:renderer`로 재측정한다. metric의 정확한
정의, byte 기준값과 향후 Monaco/CodeMirror A/B protocol은
[EDITOR_ARCHITECTURE.md](EDITOR_ARCHITECTURE.md#performance-baseline)에 기록한다.

Rust release profile은 LTO, single codegen unit, `opt-level = "s"`, abort-on-panic과 symbol
stripping을 사용한다. `removeUnusedCommands`도 capability allow-list를 기준으로
활성화돼 있다.

이 설정은 출발점일 뿐이다. Monaco, PDF.js와 이후 포함될 Tectonic/TexLab sidecar가
배포 크기와 시작 시간에 미치는 영향을 Linux/Windows/macOS artifact별로 측정한다.
manual chunk 분리는 실제 lazy import와 함께 사용할 때만 초기 실행 비용을 줄인다.

## Release Guardrail

- 기본 local 명령(`dev`, `build`, `preview`, `package:*`)은 Tauri다.
- 현재 public release와 updater 기준은 legacy Electron이며, local 검증에는
  `build:electron`, `preview:electron`, `package:electron:*`를 사용한다.
- Tauri artifact 검증을 위해 `v*` tag를 만들거나 publishing이 활성화된 workflow를
  실행하지 않는다.
- 기본 Tauri `build`/`package:*` 결과물을 GitHub Release에 첨부하거나 legacy Electron
  installer와 updater metadata를 대체하지 않는다.
- Tauri build/package 전에 target별 `setup-tauri-sidecars.js --check`를 통과시키고,
  setup download와 release preflight를 같은 암묵적 단계로 합치지 않는다.
- 재현 가능한 Rust dependency graph를 위해 `src-tauri/Cargo.lock`을 포함하고 dependency
  변경 때마다 diff를 검토한다.
- release 전환은 Linux, Windows, macOS Apple Silicon에서 Tectonic, updater,
  signing/notarization과 설치/업그레이드까지 검증한 별도 변경으로 진행한다.
- 전환 release도 [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)의 version 동기화,
  `main` workflow 선검증, tag 불변성과 artifact 검증 규칙을 따른다.

공식 Tauri 참고 문서는 [Vite integration](https://v2.tauri.app/start/frontend/vite/),
[commands and channels](https://v2.tauri.app/develop/calling-rust/),
[capabilities](https://v2.tauri.app/security/capabilities/),
[sidecars](https://v2.tauri.app/develop/sidecar/)와
[application size](https://v2.tauri.app/concept/size/)다.
