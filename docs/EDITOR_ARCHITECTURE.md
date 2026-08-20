# TextEx 2.0 Editor Architecture

이 문서는 TextEx 2.0 Phase 1의 editor 경계를 정의한다. Tauri command와 packaging은
[TAURI_MIGRATION.md](TAURI_MIGRATION.md), 현재 Electron process model은
[ARCHITECTURE.md](ARCHITECTURE.md)를 따른다. Phase 1에서는 editor engine을 교체하거나
새 native capability를 추가하지 않는다.

## Decision

Phase 1은 Monaco를 유지하면서 `EditorAdapter`와 `DocumentModel`을 도입한다. Zed에서
참고하는 것은 buffer/snapshot/revision과 edit-aware anchor라는 구현 원칙뿐이다. GPUI나
Zed source code를 가져오지 않는다.

CodeMirror 6는 즉시 도입할 dependency가 아니라 Phase 8의 측정 대상이다. Tauri 이관과
editor engine 교체를 같은 단계에서 진행하지 않는다. 이 원칙으로 회귀가 발생했을 때
desktop runtime과 editor 중 어느 경계가 원인인지 분리할 수 있다.

## Current Problem

현재 `useEditorStore`는 활성 문서의 전체 문자열을 `content`에 보관하고 같은 문자열을
`openFiles`에도 복제한다. Monaco model, React state와 비동기 분석 작업이 이 값을 함께
관찰하므로 다음 문제가 생길 수 있다.

- 입력마다 큰 문자열과 `openFiles` 객체가 Zustand를 통과한다.
- 저장이나 분석을 요청한 시점과 결과가 도착한 시점의 문서를 구분할 revision이 없다.
- renderer feature가 Monaco instance와 Monaco range type에 직접 결합된다.
- line/column만 장기 보관한 위치는 앞부분 edit 뒤에 원래 대상을 추적하지 못한다.

Phase 1의 목표는 기능을 줄이는 것이 아니라 이 소유권을 명시하는 것이다.

## Ownership

```text
React / Zustand
  activeDocumentId, open document ids, dirty, revision, cursor/UI metadata
                         |
                         v
                  DocumentModel
            identity/revision/save state
                         |
                         v
                   EditorAdapter
                         |
                         v
             Monaco model and editor view

DocumentModel.snapshot(revision N)
       +-- spell/outline/package analysis
       +-- TexLab synchronization
       +-- save/compile request
```

편집 가능한 text의 canonical owner는 editor model이다. Zustand에는 전체 문서 문자열이나
Monaco instance를 장기 상태로 저장하지 않는다. UI가 text를 필요로 하거나 backend 작업을
시작할 때는 `DocumentModel`에서 명시적으로 snapshot을 얻는다.

Phase 1의 snapshot은 JavaScript immutable string이어도 된다. 첫 단계의 목적은 rope를
새로 구현하는 것이 아니라 **어느 revision의 text인지 안정적으로 식별**하는 것이다.
대형 문서 측정에서 snapshot 복사가 병목으로 확인된 뒤에만 representation 변경을 검토한다.

## Runtime-neutral Contracts

아래 contract는 Phase 1이 끝났을 때의 목표 surface다. 현재 첫 vertical slice는 하나의
mounted active document를 감싸며 text/edit/selection/diagnostic/decoration/scroll과
adapter-local change snapshot을 제공한다. 다중 문서 `open/activate/close`, tracked range와
canonical revision 연결은 registry 단계에서 추가한다.

실제 contract에는 Monaco type을 노출하지 않는다. 최소 surface는 다음 책임을 포함한다.

```ts
interface EditorAdapter {
  openDocument(document: DocumentDescriptor): void
  closeDocument(documentId: string): void
  activateDocument(documentId: string): void

  getText(documentId: string): string
  applyEdits(documentId: string, edits: readonly TextEdit[]): void
  getSelection(): EditorSelection | null
  revealPosition(position: EditorPosition): void

  setDiagnostics(documentId: string, diagnostics: readonly EditorDiagnostic[]): void
  setDecorations(documentId: string, decorations: readonly EditorDecoration[]): void
  trackRange(documentId: string, range: EditorRange): TrackedRange
  onDidChange(listener: (change: DocumentChange) => void): Disposable
}
```

`MonacoEditorAdapter`가 Monaco model, decoration, tracked range와 disposable을 이
contract로 변환한다. React hook과 feature는 가능한 한 adapter contract에 의존한다.
CodeMirror를 실험할 때는 `CodeMirrorEditorAdapter`만 같은 conformance test를 통과하게
만든다.

`DocumentModel`은 적어도 다음 값을 소유한다.

```ts
interface DocumentSnapshot {
  documentId: string
  revision: number
  text: string
}

interface DocumentMetadata {
  documentId: string
  filePath: string
  revision: number
  savedRevision: number
}
```

`documentId`는 한 session에서 안정적이어야 하며 display label과 구분한다. 경로 casing과
separator가 다른 같은 Windows 파일을 중복 문서로 만들지 않도록 기존 path normalization
규칙을 재사용한다.

## Revision and Snapshot Rules

1. 문서를 연 뒤 각 content change는 monotonic revision을 정확히 한 번 증가시킨다.
2. snapshot은 `{ documentId, revision, text }`를 함께 고정한다.
3. 비동기 결과는 요청 revision을 포함한다. 현재 revision과 다르면 상태를 덮어쓰지 않고
   폐기하거나 해당 feature의 명시적인 stale policy를 따른다.
4. save는 요청한 snapshot revision만 `savedRevision`으로 표시한다. 저장 도중 새 edit가
   생겼으면 완료 후에도 `revision !== savedRevision`이므로 dirty 상태를 유지한다.
5. compile/PDF 결과도 document revision 또는 generation을 포함한다. 최신 요청만 publish하는
   queue는 Tauri CompileManager 단계에서 구현한다.
6. citation, diagnostic, SyncTeX highlight처럼 edit 뒤에도 의미가 유지돼야 하는 위치는
   adapter의 tracked range를 사용한다. 장기 기능 상태에 raw line number만 저장하지 않는다.

## Phase 1 Migration Gate

Phase 1은 다음 순서의 작은 변경으로 진행한다.

1. **완료:** runtime-neutral editor type과 adapter conformance test를 추가한다.
2. **완료:** 기존 Monaco model/view를 감싸는 active-document `MonacoEditorAdapter`를
   추가하고 pending action, diagnostic, drop, table edit 경로를 연결한다.
3. **진행 중:** revision/snapshot/save-state `DocumentModel` 코어는 추가됐다. 다음 변경에서
   문서별 registry와 adapter change 연결을 추가한다.
4. tab open/activate/close, edit, selection, diagnostics와 decoration을 adapter를 통해 연결한다.
5. spell, outline, package detection, TexLab didChange와 save/compile 입력을 revision snapshot으로
   전환한다.
6. `useEditorStore`에서 full `content`, `openFiles[*].content`와 raw Monaco editor instance를
   제거하고 UI metadata에 fine-grained selector를 사용한다.

완료 조건은 기존 Monaco 기능과 keyboard/IME/undo behavior가 유지되고, async stale-result와
save-race test가 통과하며, 지속 입력 시 React/Zustand에 전체 문서 문자열을 publish하지 않는
것이다. CodeMirror package 추가는 이 gate에 포함하지 않는다.

## Performance Baseline

renderer build 크기는 Node.js 내장 모듈만 사용하는 다음 command로 반복 측정한다.

```bash
npm run build:web
npm run measure:renderer
```

기계가 읽을 결과가 필요하면 다음과 같이 실행한다.

```bash
npm run --silent measure:renderer -- --json > renderer-bundle.json
```

`Initial HTML JavaScript`는 생성된 `index.html`의 module entry와 `modulepreload` 대상만
합산한다. gzip 값은 각 HTTP asset을 level 9로 개별 압축한 크기의 합이다. `All renderer
files`는 native shell, source tree와 sidecar를 제외한 `out/tauri-renderer/` 전체다. 따라서
installer 크기와 비교하면 안 된다.

2026-08-20, Node.js 22.22.0의 clean `npm run build:web` 결과는 다음과 같다. hash가 붙은
파일명 대신 byte 지표를 비교한다.

| 지표 | 기준값 |
| --- | ---: |
| Initial HTML JavaScript raw | 869,067 bytes |
| Initial HTML JavaScript gzip | 256,168 bytes |
| All JavaScript raw | 8,715,401 bytes |
| All renderer files raw | 9,128,111 bytes |

### Runtime measurement

Runtime 계측은 개발 build에서 자동 활성화되고 production build에서는
`TEXTEX_PERFORMANCE=1`일 때만 활성화된다. 활성화되면 renderer가 다음 값을 최대 2,000개
sample의 bounded buffer에 기록한다.

| Metric | 시작/종료 지점 |
| --- | --- |
| `startup.shellInteractive` | navigation 시작 → 첫 React shell commit |
| `startup.editorInteractive` | navigation 시작 → 최초 Monaco mount |
| `editor.inputToFrame` | editor `beforeinput` → content change 뒤 첫 animation frame |
| `pipeline.editToPdfPage` | 마지막 document change → 새 PDF의 첫 page render |
| `pdf.scrollFrame` | PDF scroll 중 연속 animation frame 간격 |
| `renderer.longTask` | Chromium Long Tasks API가 보고한 renderer task |

Electron에서는 `performance:memory` typed IPC가 `app.getAppMetrics()`를 직렬화하여 전체
working set/private memory와 process별 값을 제공한다. renderer JS heap과 application
memory는 시작 시점, 30초 간격, report 생성 직전에 수집한다. Tauri가 동일한 process
memory contract를 구현하기 전까지 Tauri report에는 application memory가 비어 있을 수 있다.

Production 조건을 측정할 때는 다음처럼 build를 실행한다.

```bash
npm run build:electron
TEXTEX_PERFORMANCE=1 npm run preview:electron
```

측정할 project를 열고 고정 fixture에서 입력, compile/PDF render와 scroll scenario를 수행한
후 DevTools console에서 report를 내려받는다.

```js
await window.textexPerformance.download()
```

한 조건마다 새 process에서 5회 cold run을 수행한다. 생성된 JSON report는 다음 command로
합산한다. 여러 report의 raw sample을 합쳐 p50/p95를 계산하고 마지막 memory sample의 중앙값을
출력한다.

```bash
npm run measure:runtime -- run-1.json run-2.json run-3.json run-4.json run-5.json
npm run measure:runtime -- run-*.json --json
```

비교할 때는 commit, production/development mode, OS/architecture, CPU, physical memory,
display scale, project fixture, PDF page 수, Monaco options와 Tectonic cache 상태를 함께 기록한다.
startup cold run은 동일한 session fixture를 사용하고 compile은 cold-cache와 warm-cache 결과를
분리한다.

## Monaco versus CodeMirror A/B Gate

Phase 8에서 같은 commit, production build, OS/architecture와 fixture로 두 adapter를 비교한다.
각 결과에는 commit, Node/runtime version, CPU, memory, OS, build command와 5회 cold-run의
median을 함께 기록한다. typing frame/latency처럼 반복 sample이 있는 지표는 p95도 기록한다.

| Scenario | 측정값 |
| --- | --- |
| App 시작 후 editor interactive | cold-run median, 최초 focus/입력 가능 시점 |
| Editor bundle | editor lazy chunk raw/gzip과 전체 renderer bytes |
| 100 KiB / 1 MiB `.tex` open | model 생성부터 첫 interactive frame까지 |
| Continuous typing | input-to-render p50/p95, long task count |
| Search | 고정 query의 완료 시간과 결과 수 |
| 1,000 diagnostics | marker 적용 시간, frame p95와 memory delta |
| 1,000 decorations | tracked range 적용/edit remap 시간과 memory delta |
| 10 open tabs | 전환 p95와 idle resident/private memory |
| Undo/redo, IME, multi-cursor | correctness와 latency |
| LaTeX features | completion, fold, hover, CodeLens, Vim, SyncTeX 회귀 여부 |

CodeMirror 채택은 bundle 하나만 작다는 이유로 결정하지 않는다. 필수 editor feature와
accessibility/IME가 동등하고, 대표적인 시작 시간 또는 idle memory가 유의미하게 개선되며,
typing p95가 회귀하지 않을 때만 별도 migration으로 제안한다. 그렇지 않으면 Monaco adapter를
유지한다.

## TextEx 2.0 Sequence

```text
Phase 0  reproducible performance baseline
Phase 1  EditorAdapter + DocumentModel, Monaco retained
Phase 2  Tauri shell/filesystem parity
Phase 3  Rust ProjectManager + watcher
Phase 4  revision-aware CompileManager + Tectonic
Phase 5  PDF delivery + virtualization
Phase 6  TexLab manager and streaming
Phase 7  PTY
Phase 8  Monaco/CodeMirror A/B decision
Phase 9  Electron removal after platform/release parity
```

현재 repository에는 Phase 2의 Tauri filesystem vertical slice가 먼저 존재한다. 이를
되돌리지 않고 Phase 1 경계를 적용한 뒤 이후 service가 revision-aware snapshot을 소비하게
한다. 구현 상태와 release 제한은 계속 [TAURI_MIGRATION.md](TAURI_MIGRATION.md)에 기록한다.
