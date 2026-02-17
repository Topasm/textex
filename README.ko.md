# TextEx

[![Build Status](https://github.com/Topasm/textex/actions/workflows/build.yml/badge.svg)](https://github.com/Topasm/textex/actions/workflows/build.yml)

Electron 기반의 독립형 데스크톱 LaTeX 에디터입니다. TextEx는 왼쪽에는 Monaco 코드 에디터, 오른쪽에는 실시간 PDF 미리보기를 제공하는 분할 화면 인터페이스를 갖추고 있습니다. [Tectonic](https://tectonic-typesetting.github.io/) 엔진이 내장되어 있어 TeX Live나 MiKTeX 같은 별도의 TeX 배포판을 설치할 필요가 **없습니다**.

## 시작하기

### 1. 다운로드 및 설치

[GitHub Actions](../../actions/workflows/build.yml)에서 최신 빌드를 다운로드하세요.

| 플랫폼 | 아티팩트 | 파일 |
|----------|----------|------|
| Linux x64 | TextEx-linux | `.AppImage` |
| macOS Intel | TextEx-mac-x64 | `.dmg` |
| macOS Apple Silicon | TextEx-mac-arm64 | `.dmg` |
| Windows x64 | TextEx-win | `.exe` 설치 파일 |

### 2. OS별 설정

**macOS:**
앱이 격리될 수 있습니다. 설치 후 다음 명령어를 실행하세요:
```bash
xattr -cr /Applications/TextEx.app
```
또는 앱을 우클릭하고 **열기** > **열기**를 선택하세요.

**Linux:**
AppImage를 실행 가능하게 만드세요:
```bash
chmod +x TextEx-1.0.0.AppImage
./TextEx-1.0.0.AppImage
```

---

## 사용 가이드

### 1. 새 프로젝트 만들기
-   **폴더 열기**: **File > Open Folder**를 클릭하여 프로젝트 디렉토리를 선택합니다.
-   **템플릿 사용**: **File > New from Template** (`Ctrl+Shift+N`)을 사용하여 미리 구성된 LaTeX 템플릿으로 빠르게 시작하세요.

### 2. 문서 작성하기
TextEx는 다음과 같은 기능을 갖춘 최신 Monaco 기반 에디터를 제공합니다:
-   **구문 강조**: 완전한 LaTeX 구문 지원.
-   **자동 완성**: 명령어 및 환경에 대한 지능형 제안.
-   **스니펫**: 일반적인 패턴(예: `begin`, `figure`, `table`)을 빠르게 삽입합니다.

### 3. 이미지 삽입 (스마트 드롭)
-   컴퓨터에서 이미지 파일을 에디터로 직접 **드래그 앤 드롭**하세요.
-   TextEx가 자동으로 다음 작업을 수행합니다:
    1.  이미지를 프로젝트의 `images/` 폴더로 복사합니다.
    2.  표준 LaTeX `\begin{figure} ... \end{figure}` 코드 스니펫을 삽입합니다.

### 4. 컴파일 및 미리보기
-   **실시간 미리보기**: 입력하는 즉시 PDF 미리보기가 자동으로 업데이트됩니다.
-   **수동 컴파일**: `Ctrl+Enter`를 눌러 강제로 컴파일할 수 있습니다.
-   **동기화 (Sync)**:
    -   **코드 → PDF**: 에디터에서 `Ctrl+클릭`하면 미리보기의 해당 위치로 이동합니다.
    -   **PDF → 코드**: PDF 미리보기에서 `Ctrl+클릭`하면 해당 코드 라인으로 이동합니다.
    -   **PDF 검색**: 미리보기 패널에서 `Ctrl+F`를 눌러 PDF 내에서 검색할 수 있습니다.

### 5. 인용 관리
-   **BibTeX 지원**: 프로젝트 내의 `.bib` 파일을 자동으로 감지하고 인용 키(`\cite{...}`)를 자동 완성합니다.
-   **Zotero 연동**:
    1.  Zotero가 실행 중인지 확인하세요.
    2.  `Ctrl+Shift+Z`를 눌러 Zotero 라이브러리를 검색합니다.
    3.  논문을 선택하면 인용 키가 삽입되고 참고문헌 파일에 항목이 자동으로 추가됩니다.

### 6. AI 작문 도우미 활용
-   툴바의 **AI Draft** 버튼을 클릭하거나 `Ctrl+Shift+D`를 누르세요.
-   생성할 LaTeX 콘텐츠에 대한 프롬프트를 입력하세요 (예: "양자 컴퓨팅 논문의 초록 작성해줘").
-   *참고: 설정에서 OpenAI 또는 Anthropic API 키가 필요합니다.*

### 7. 생산성 도구
-   **할 일 목록 (Todo)**: "Todo" 사이드바 패널에서 집필 작업을 관리하세요.
-   **메모 (Memo)**: "Memo" 패널을 사용하여 빠른 메모를 작성하세요.
-   **시각적 표 에디터**: table 환경을 우클릭하여 시각적 에디터를 엽니다.
-   **MathLive 에디터**: 시각적 수식 에디터를 열어 복잡한 수식을 쉽게 작성하세요.
-   **로컬 히스토리**: 탐색기에서 파일을 우클릭하여 "Local History"를 보고 변경 사항을 되돌릴 수 있습니다.

---

## 주요 기능

- **설치 불필요:** Tectonic 엔진 포함.
- **오프라인 사용:** 인터넷 없이 작동 (초기 패키지 다운로드 후).
- **멀티 파일 프로젝트:** 대규모 문서를 위한 사이드바 파일 트리 지원.
- **내보내기 옵션:** Word, HTML, Markdown 변환 지원.
- **Git 통합:** 버전 관리 기능 내장.

## 단축키

| 단축키 | 동작 |
|----------|--------|
| `Ctrl/Cmd + O` | 파일 열기 |
| `Ctrl/Cmd + S` | 저장 |
| `Ctrl/Cmd + Enter` | 수동 컴파일 |
| `Ctrl/Cmd + L` | 로그 패널 토글 |
| `Ctrl/Cmd + B` | 사이드바 토글 |
| `Ctrl/Cmd + Shift + Z` | Zotero 검색 |
| `Ctrl/Cmd + Shift + D` | AI Draft |
| `Shift + Alt + F` | 문서 포맷팅 |

## 문서 참조

- [개발 가이드](docs/DEVELOPMENT.md)
- [CLI 레퍼런스](docs/CLI.md)
- [Zotero 연동](docs/ZOTERO.md)
- [MCP 서버](docs/MCP.md)

## 라이선스

[MIT](LICENSE)
