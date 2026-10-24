[**English**](README.md)

<p align="center">
  <img src="docs/images/logo.png" alt="TextEx 로고" width="96" />
</p>

<h1 align="center">TextEx</h1>

<p align="center">
  실시간 PDF 미리보기를 갖춘 무료 로컬 우선 LaTeX 에디터.<br />
  TeX 설치도, 계정도, 클라우드도 필요 없습니다.
</p>

<p align="center">
  <a href="https://github.com/Topasm/textex/actions/workflows/build.yml"><img src="https://github.com/Topasm/textex/actions/workflows/build.yml/badge.svg" alt="빌드 상태" /></a>
  <a href="https://github.com/Topasm/textex/releases/latest"><img src="https://img.shields.io/github/v/release/Topasm/textex?include_prereleases&label=latest" alt="최신 릴리스" /></a>
  <a href="https://github.com/Topasm/textex/releases"><img src="https://img.shields.io/github/downloads/Topasm/textex/total?label=downloads" alt="다운로드 수" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Topasm/textex" alt="라이선스" /></a>
  <img src="https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-5c4a32" alt="Windows, macOS, Linux" />
</p>

<p align="center">
  <a href="https://github.com/Topasm/textex/releases/latest"><b>Windows 다운로드</b> (.exe)</a> ·
  <a href="https://github.com/Topasm/textex/releases/latest"><b>macOS</b> (Apple Silicon .dmg)</a> ·
  <a href="https://github.com/Topasm/textex/releases/latest"><b>Linux</b> (.AppImage / .deb)</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/hero-dark.png" />
    <img src="docs/images/hero-light.png" alt="TextEx — 왼쪽에 소스, 오른쪽에 실시간 PDF 미리보기" width="900" />
  </picture>
</p>

<p align="center">
  <img src="docs/images/hero.gif" alt="문장을 고치고 저장하면 PDF가 다시 컴파일되고, PDF를 Ctrl+클릭하면 소스로 돌아갑니다" width="900" />
  <br />
  <sub>편집 → 저장 → PDF 재컴파일 → PDF를 Ctrl+클릭하면 해당 소스 줄로 이동합니다.</sub>
</p>

## 왜 TextEx인가

- **설치 없이 바로 시작.** [Tectonic](https://tectonic-typesetting.github.io/) 엔진이 내장되어 있어 TeX Live나 MiKTeX를 설치할 필요가 없습니다. 원하면 설정에서 시스템 pdfLaTeX를 선택할 수도 있습니다.
- **로컬 우선.** 문서는 내 컴퓨터에만 남습니다. 계정도 클라우드 서비스도 없으며, 선택적인 AI 제공자와 온라인 논문 검색만 네트워크를 사용합니다.
- **PDF에서 바로 작업.** 미리보기에서 Ctrl/⌘+클릭하면 소스로 이동하고, 문장을 더블클릭하면 그 자리에서 편집하며, 스크롤 동기화로 두 패널이 함께 움직입니다.
- **논문 작성에 맞춘 도구.** Zotero와 Crossref/arXiv 검색이 되는 References 사이드바, BibTeX 자동 완성, 제출 점검, Git, 로컬 히스토리, Overleaf용 ZIP 내보내기.

## 기능

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/images/synctex-highlight.png" alt="PDF에서 소스로 이동하는 SyncTeX" />
      <p><b>실시간 미리보기 &amp; SyncTeX.</b> 저장하면 다시 컴파일됩니다. PDF를 Ctrl/⌘+클릭하면 소스 줄로 이동하고, 스크롤 동기화가 두 패널을 맞춰 줍니다.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/images/pdf-workspace.png" alt="소스 편집 서랍이 있는 PDF 전용 워크스페이스" />
      <p><b>PDF에서 편집.</b> PDF 전용 워크스페이스에서 문장을 더블클릭해 직접 고치거나 AI로 다듬은 뒤 적용하고 새로고침합니다.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/images/references-panel.png" alt="프로젝트 참고문헌과 Zotero 라이브러리가 있는 References 사이드바" />
      <p><b>References &amp; Zotero.</b> 인용된 항목, 누락, 미사용을 한눈에 보고, Zotero 라이브러리나 Crossref/arXiv를 검색해 논문을 에디터로 끌어다 인용합니다.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/images/prose-view.png" alt="페어 프로즈 워크스페이스: Markdown 투영과 실시간 렌더링" />
      <p><b>프로즈 뷰.</b> <code>.tex</code>를 원본으로 유지한 채, 집중용 Markdown 투영과 실시간 렌더링을 나란히 두고 초안을 씁니다.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/images/git-panel.png" alt="스테이징된 변경이 있는 Git 패널" />
      <p><b>Git &amp; 타임라인.</b> 사이드바에서 스테이징, 커밋, Fetch, Pull, Push를 하고, 타임라인에서 이전 로컬 저장 상태로 되돌립니다.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/images/template-gallery.png" alt="템플릿 갤러리" />
      <p><b>템플릿 &amp; 내보내기.</b> 논문, 보고서, CV 템플릿으로 시작하고, 깔끔한 Overleaf ZIP이나 Pandoc을 통한 DOCX/ODT/HTML/EPUB으로 내보냅니다.</p>
    </td>
  </tr>
</table>

<details>
<summary><b>더 보기: 리서치 챗, 개요, 인앱 가이드</b></summary>

<p align="center">
  <img src="docs/images/research-panel.png" alt="리서치 챗 패널" width="900" />
  <br /><sub><b>리서치 챗.</b> API 제공자, Claude Code, Codex CLI를 통해 논문, 현재 문서, 첨부한 참고문헌에 대해 질문합니다. 직접 켜기 전까지는 꺼져 있습니다.</sub>
</p>

<p align="center">
  <img src="docs/images/sidebar-outline.png" alt="개요 사이드바" width="900" />
  <br /><sub><b>개요.</b> 거터의 섹션 밴드와 클릭 가능한 문서 개요.</sub>
</p>

앱 안에서 <kbd>F1</kbd>을 누르면 트랙패드 제스처와 3분 체크리스트가 포함된 검색 가능한 가이드가 열립니다.

</details>

> **선택적 연동.** AI 제공자와 온라인 논문 검색에는 네트워크가 필요합니다. Claude Code 및 Codex CLI 기능은 해당 실행 파일이 `PATH`에 있어야 합니다. 편집기와 내장 컴파일러는 이들 없이도 동작합니다.

## 빠른 시작

1. **다운로드:** [Releases 페이지](https://github.com/Topasm/textex/releases/latest)에서 Windows `.exe` 설치 파일, macOS Apple Silicon `.dmg`, Linux `.AppImage` / `.deb` 중 하나를 받습니다.
2. **폴더 열기** 또는 홈 화면의 **New from Template**를 선택합니다. 가이드 데모 논문은 인용, 리서치 챗, 제출 점검, Overleaf 내보내기를 차례로 안내합니다.
3. <kbd>Ctrl/⌘ + S</kbd>로 **저장**하면 문서가 컴파일되고 미리보기가 갱신됩니다. 첫 컴파일에서는 TeX 지원 파일을 내려받을 수 있으며, 이후에는 오프라인에서도 컴파일됩니다.

**macOS:** 앱이 격리(quarantine)될 수 있습니다. 앱을 우클릭해 **열기**를 선택하거나 다음을 실행하세요.

```bash
xattr -cr /Applications/TextEx.app
```

**Linux:** AppImage에 실행 권한을 부여하세요.

```bash
chmod +x TextEx_*.AppImage
./TextEx_*.AppImage
```

## 키보드 단축키

| 단축키 | 동작 |
|--------|------|
| `Ctrl/Cmd + S` | 저장 (및 컴파일) |
| `Ctrl/Cmd + Enter` | 컴파일 |
| `Ctrl/Cmd + P` | 프로젝트 파일 열기 |
| `Ctrl/Cmd + Shift + P` | 커맨드 팔레트 |
| `Ctrl/Cmd + B` | 사이드바 토글 |
| `Ctrl/Cmd + L` | 로그 패널 토글 |
| `Ctrl/Cmd + F` | 현재 문서에서 찾기 |
| `Ctrl/Cmd + Shift + C` | 인용 검색 |
| `Ctrl/Cmd + Shift + F` | PDF 텍스트 검색 |
| `Shift + Alt + F` | 문서 포맷 |
| `Ctrl/Cmd + 0` / `9` | PDF 너비 / 높이 맞춤 |
| `F1` | 인앱 가이드 |

## 더 알아보기

- [사용자 가이드](docs/USER_GUIDE.ko.md) — 프로젝트, 편집, 컴파일, SyncTeX, 인용, 생산성 도구
- [설정 참조](docs/SETTINGS.md) · [Zotero 연동](docs/ZOTERO.md) · [연구 프로필 & 챗](docs/RESEARCH_PROFILE.md)
- [CLI 참조](docs/CLI.md) · [MCP 서버](docs/MCP.md)
- [개발 가이드](docs/DEVELOPMENT.md) · [아키텍처](docs/ARCHITECTURE.md) · [패키징](docs/PACKAGING.md)

TextEx는 영어, 한국어, 스페인어, 프랑스어, 독일어, 포르투갈어, 중국어를 지원합니다.

## 오픈소스 고지

번들된 고지 파일은 npm 및 Rust 의존성 고지와 Tectonic 라이선스 파일을 포함해
`resources/licenses/`에 있습니다. [docs/LICENSES.md](docs/LICENSES.md)는 사람이
읽기 쉬운 요약본이며, 전체 번들 고지 세트는 아닙니다.

## 라이선스

[MIT](LICENSE)
