# TextEx

[![Build Status](https://github.com/Topasm/textex/actions/workflows/build.yml/badge.svg)](https://github.com/Topasm/textex/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/Topasm/textex?include_prereleases&label=latest)](https://github.com/Topasm/textex/releases/latest)

**무료**, **로컬 우선** 데스크톱 LaTeX 에디터입니다. TextEx는 전적으로 사용자의 컴퓨터에서 실행되며 — 계정도, 클라우드도, 인터넷도 필요 없습니다. 왼쪽에는 Monaco 코드 에디터, 오른쪽에는 실시간 PDF 미리보기를 제공하는 분할 화면 인터페이스를 갖추고 있으며, [Tectonic](https://tectonic-typesetting.github.io/) 엔진이 내장되어 있어 TeX Live나 MiKTeX 같은 별도의 TeX 배포판을 설치할 필요가 **없습니다**.

<p align="center">
  <img src="docs/images/main-editor.png" alt="TextEx — 실시간 PDF 미리보기를 갖춘 분할 화면 LaTeX 에디터" width="900" />
</p>

## 주요 기능

| 기능 | 설명 |
|------|------|
| **무료 & 로컬 우선** | 계정 불필요, 클라우드 불필요, 인터넷 불필요 — 문서는 사용자의 컴퓨터에 보관됩니다 |
| **설치 불필요** | Tectonic 엔진 내장 — TeX 설치 불필요 |
| **실시간 PDF 미리보기** | 저장 시 자동 컴파일 및 분할 화면 미리보기 |
| **스크롤 동기화** | 에디터와 PDF 간 양방향 스크롤 동기화 |
| **SyncTeX** | Ctrl+클릭으로 소스 코드와 PDF 위치 간 이동 |
| **OmniSearch** | 인용, PDF 텍스트, 에디터 텍스트를 통합 검색 |
| **Monaco 에디터** | 구문 강조, 자동 완성, 스니펫, Vim 모드 |
| **멀티 파일 프로젝트** | 사이드바 파일 트리, 탭 바, `\input`/`\include` 탐색 |
| **인용 관리** | BibTeX 자동 완성 + Zotero 연동 |
| **AI 어시스턴트** | 노트에서 LaTeX 생성, 문법 수정, 학술 스타일 변환 |
| **Git 통합** | 내장 스테이징, 커밋, 디프, 브랜치 정보 |
| **내보내기** | Pandoc을 통해 Word, HTML, Markdown으로 변환 |
| **7개 언어** | EN, KO, ES, FR, DE, PT, ZH |

---

## 시작하기

<p align="center">
  <img src="docs/images/home-screen.png" alt="TextEx 홈 화면 — 검색 바, 폴더 열기, 템플릿에서 새로 만들기" width="900" />
</p>

### 1. 다운로드 및 설치

[릴리스 페이지](https://github.com/Topasm/textex/releases/latest)에서 최신 버전을 다운로드하거나, [GitHub Actions](../../actions/workflows/build.yml)에서 개발 빌드를 받으세요.

| 플랫폼 | 파일 |
|----------|------|
| Windows x64 | `.exe` 설치 파일 |
| macOS Intel | `.dmg` |
| macOS Apple Silicon | `.dmg` |
| Linux x64 | `.AppImage` |

### 2. OS별 설정

**macOS:**
앱이 격리될 수 있습니다. 설치 후 다음 명령어를 실행하세요:
```bash
xattr -cr /Applications/TextEx.app
```
또는 앱을 우클릭 > **열기** > **열기**를 선택하세요.

**Linux:**
AppImage를 실행 가능하게 만드세요:
```bash
chmod +x TextEx-1.0.0.AppImage
./TextEx-1.0.0.AppImage
```

---

## 사용 가이드

### 새 프로젝트 만들기
- **폴더 열기**: 파일 메뉴 > **Open Folder**를 클릭하여 프로젝트 디렉토리를 선택합니다.
- **템플릿 사용**: **New from Template**을 사용하여 미리 구성된 LaTeX 템플릿(article, beamer, thesis, letter 등)으로 빠르게 시작하세요.

<p align="center">
  <img src="docs/images/template-gallery.png" alt="내장 LaTeX 템플릿이 있는 템플릿 갤러리" width="900" />
</p>

### 멀티 파일 프로젝트

폴더를 열면 사이드바 파일 트리, 탭, `\input`/`\include` 탐색이 포함된 전체 프로젝트 뷰를 사용할 수 있습니다.

<p align="center">
  <img src="docs/images/sidebar-files.png" alt="멀티 파일 LaTeX 프로젝트의 사이드바 파일 트리" width="900" />
</p>

### 문서 작성하기
TextEx는 다음과 같은 기능을 갖춘 최신 Monaco 기반 에디터를 제공합니다:
- **구문 강조**: 시맨틱 컬러링을 갖춘 완전한 LaTeX 구문 지원.
- **자동 완성**: 명령어, 환경, 라벨, 인용 키에 대한 지능형 제안.
- **스니펫**: 일반적인 패턴(예: `begin`, `figure`, `table`)을 빠르게 삽입.
- **수학 미리보기**: `$...$` 또는 `\[...\]` 내에서 입력하는 즉시 수식 렌더링.
- **섹션 하이라이트**: 거터에서 `\section` 제목에 대한 색상 코드 밴드.
- **시각적 표 에디터**: `tabular` 위의 CodeLens를 클릭하여 시각적 에디터 열기.

### 컴파일 및 미리보기
- **자동 컴파일**: 저장(`Ctrl+S`) 시 PDF 미리보기가 자동으로 업데이트됩니다.
- **수동 컴파일**: `Ctrl+Enter`를 눌러 언제든지 강제 컴파일할 수 있습니다.
- **PDF 보기 모드**: 설정 > 외관에서 연속 스크롤과 단일 페이지 보기 간 전환.

### 스크롤 동기화

<p align="center">
  <img src="docs/images/settings-appearance.png" alt="설정 — 스크롤 동기화, PDF 보기 모드, 테마 옵션이 있는 외관 탭" width="900" />
</p>

설정 > 외관에서 **스크롤 동기화**를 활성화하여 에디터와 PDF를 정렬하세요:
- **에디터**에서 스크롤하면 PDF가 해당 콘텐츠로 자동 스크롤됩니다.
- **PDF**에서 스크롤하면 에디터가 해당 소스 라인으로 자동 스크롤됩니다.
- 사전 계산된 SyncTeX 라인 맵을 사용하여 즉시 조회 (지연 없음).
- 내장 피드백 루프 방지 — 바운싱이나 떨림 없음.

### SyncTeX (클릭하여 이동)
- **코드 → PDF**: "Sync Code to PDF" 툴바 버튼을 클릭하여 PDF에서 현재 줄을 하이라이트.
- **PDF → 코드**: PDF 아무 곳에서나 `Ctrl+클릭`하여 해당 소스 라인으로 이동.

<p align="center">
  <img src="docs/images/synctex-highlight.png" alt="소스에서 PDF로의 이동을 보여주는 SyncTeX 하이라이트" width="900" />
</p>

### 이미지 삽입 (스마트 드롭)
- 컴퓨터에서 이미지 파일을 에디터로 직접 **드래그 앤 드롭**하세요.
- TextEx가 자동으로:
  1. 이미지를 프로젝트의 `images/` 폴더로 복사합니다.
  2. `\begin{figure} ... \end{figure}` 스니펫을 삽입합니다.

### 인용 관리
- **BibTeX 지원**: `.bib` 파일을 감지하고 `\cite{...}` 키를 자동 완성합니다.
- **인용 툴팁**: PDF 미리보기에서 인용 위에 마우스를 올리면 제목, 저자, 연도를 확인할 수 있습니다.
- **Zotero 연동**:
  1. Better BibTeX가 설치된 Zotero가 실행 중인지 확인하세요.
  2. `Ctrl+Shift+Z`를 눌러 Zotero 라이브러리를 검색합니다.
  3. 논문을 선택하여 인용 키를 삽입합니다.

### AI 어시스턴트
- 툴바의 **AI Draft**를 클릭하거나 `Ctrl+Shift+D`를 누르세요.
- LaTeX 콘텐츠를 생성할 프롬프트를 입력하세요.
- 에디터 내 기능: 텍스트를 선택한 후 문법 수정, 학술 스타일 변환, 요약, 더 길게/짧게 만들기 사용.
- OpenAI, Anthropic, Gemini 지원. 설정 > AI에서 구성하세요.

### 생산성 도구

<p align="center">
  <img src="docs/images/omnisearch.png" alt="검색 결과가 표시된 OmniSearch 대화상자" width="900" />
</p>

- **OmniSearch**: `Ctrl+P`를 눌러 파일, 인용, PDF 텍스트, 명령어를 통합 검색.
- **할 일 패널**: 사이드바에서 집필 작업을 관리.
- **메모 패널**: 아이디어를 위한 빠른 메모장.
- **타임라인**: 로컬 파일 히스토리를 보고 이전 저장 상태로 복원.
- **Git 패널**: 에디터를 떠나지 않고 스테이징, 커밋, 디프 확인.

---

## 단축키

| 단축키 | 동작 |
|----------|--------|
| `Ctrl/Cmd + S` | 저장 |
| `Ctrl/Cmd + Enter` | 컴파일 |
| `Ctrl/Cmd + P` | OmniSearch |
| `Ctrl/Cmd + L` | 로그 패널 토글 |
| `Ctrl/Cmd + B` | 사이드바 토글 |
| `Ctrl/Cmd + F` | 에디터 / PDF에서 찾기 |
| `Ctrl/Cmd + Shift + Z` | Zotero 검색 |
| `Ctrl/Cmd + Shift + D` | AI Draft |
| `Shift + Alt + F` | 문서 포맷팅 |
| `Ctrl/Cmd + 0` | PDF 너비에 맞추기 |
| `Ctrl/Cmd + 9` | PDF 높이에 맞추기 |

---

## 문서 참조

- [개발 가이드](docs/DEVELOPMENT.md)
- [아키텍처](docs/ARCHITECTURE.md)
- [IPC 사양](docs/IPC_SPEC.md)
- [설정 레퍼런스](docs/SETTINGS.md)
- [Zotero 연동](docs/ZOTERO.md)
- [CLI 레퍼런스](docs/CLI.md)
- [MCP 서버](docs/MCP.md)

## 라이선스

[MIT](LICENSE)
