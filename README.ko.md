# TextEx

[![Build Status](https://github.com/Topasm/textex/actions/workflows/build.yml/badge.svg)](https://github.com/Topasm/textex/actions/workflows/build.yml)

Electron 기반의 독립형 데스크톱 LaTeX 에디터입니다. TextEx는 왼쪽에는 Monaco 코드 에디터, 오른쪽에는 실시간 PDF 미리보기를 제공하는 분할 화면 인터페이스를 갖추고 있습니다. [Tectonic](https://tectonic-typesetting.github.io/) 엔진이 내장되어 있어 TeX Live나 MiKTeX 같은 별도의 TeX 배포판을 설치할 필요가 **없습니다**.

## 주요 기능

- **실시간 미리보기:** 입력하는 즉시 PDF가 자동으로 업데이트됩니다.
- **설치 불필요:** 모든 것이 포함되어 있어 추가 설정이 필요 없습니다.
- **최신 에디터:** 구문 강조, 자동 완성, 스니펫 기능을 제공합니다.
- **멀티 파일 프로젝트:** 사이드바 파일 트리로 복잡한 문서를 관리할 수 있습니다.
- **참고문헌 관리:** BibTeX 지원 및 인용 자동 완성 기능 내장.
- **Zotero 연동:** Zotero 라이브러리를 검색하고 인용을 삽입할 수 있습니다 (`Ctrl+Shift+Z`).
- **내보내기 옵션:** Word, HTML 등 다양한 형식으로 변환 가능합니다.
- **크로스 플랫폼:** Windows, macOS, Linux에서 작동합니다.
- **Git 통합:** 버전 관리 기능이 내장되어 있습니다.
- **AI 작문 도우미:** OpenAI/Anthropic 키를 사용하여 글 초안을 작성할 수 있습니다.
- **사용자 프로필:** 이름, 이메일, 소속 정보를 템플릿에 자동으로 채워줍니다.
- **시각적 표 에디터:** 스프레드시트와 같은 인터페이스로 LaTeX 표를 편집할 수 있습니다.
- **MathLive 수식 에디터:** 시각적 에디터로 복잡한 수식을 쉽게 입력할 수 있습니다.
- **스마트 이미지 드롭:** 이미지를 드래그 앤 드롭하면 자동으로 그림 코드가 생성됩니다.
- **PDF 검색:** 에디터와 동기화된 하이라이팅으로 PDF 내 텍스트를 검색할 수 있습니다.
- **생산성 도구:** 할 일 목록(Todo) 및 메모장(Memo) 기능이 내장되어 있습니다.
- **맞춤법 검사기:** 문서 작성 중 실시간으로 맞춤법을 검사합니다.
- **로컬 히스토리:** 파일 버전을 관리하고 변경 사항을 비교할 수 있는 간소화된 "타임머신" 기능입니다.

## 다운로드

[GitHub Actions](../../actions/workflows/build.yml)에서 최신 빌드를 다운로드하세요.

| 플랫폼 | 아티팩트 | 파일 |
|----------|----------|------|
| Linux x64 | TextEx-linux | `.AppImage` |
| macOS Intel | TextEx-mac-x64 | `.dmg` |
| macOS Apple Silicon | TextEx-mac-arm64 | `.dmg` |
| Windows x64 | TextEx-win | `.exe` 설치 파일 |

### macOS 참고 사항
앱이 격리될 수 있습니다. 설치 후 다음 명령어를 실행하세요:
```bash
xattr -cr /Applications/TextEx.app
```
또는 앱을 우클릭하고 **열기** > **열기**를 선택하세요.

### Linux 참고 사항
AppImage를 실행 가능하게 만드세요:
```bash
chmod +x TextEx-1.0.0.AppImage
./TextEx-1.0.0.AppImage
```

## 단축키

| 단축키 | 동작 |
|----------|--------|
| `Ctrl/Cmd + O` | 파일 열기 |
| `Ctrl/Cmd + S` | 저장 |
| `Ctrl/Cmd + Shift + S` | 다른 이름으로 저장 |
| `Ctrl/Cmd + Enter` | 수동 컴파일 |
| `Ctrl/Cmd + L` | 로그 패널 토글 |
| `Ctrl/Cmd + Shift + =` | 글꼴 크기 확대 |
| `Ctrl/Cmd + Shift + -` | 글꼴 크기 축소 |
| `Ctrl/Cmd + B` | 사이드바 토글 |
| `Ctrl/Cmd + W` | 현재 탭 닫기 |
| `Ctrl/Cmd + Tab` | 다음 탭 |
| `Ctrl/Cmd + Shift + Tab` | 이전 탭 |
| `Ctrl/Cmd + Shift + N` | 템플릿으로 새로 만들기 |
| `Shift + Alt + F` | 문서 포맷팅 |

## 문서

고급 사용법 및 개발 관련:

- [개발 가이드](docs/DEVELOPMENT.md) — 빌드 방법 및 개발 워크플로우.
- [CLI 레퍼런스](docs/CLI.md) — 헤드리스 컴파일 및 프로젝트 도구.
- [Zotero 연동](docs/ZOTERO.md) — 인용 관리 설정 및 사용 가이드.
- [MCP 서버](docs/MCP.md) — AI 어시스턴트 통합 세부 정보.
- [아키텍처](docs/ARCHITECTURE.md) — 시스템 설계 및 구현 세부 정보.
- [라이선스](docs/LICENSES.md) — 서드파티 라이선스 정보.

## 라이선스

[MIT](LICENSE)
