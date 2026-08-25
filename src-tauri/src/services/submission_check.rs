use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::{Component, Path, PathBuf},
    sync::OnceLock,
};

use regex::Regex;

use crate::{
    error::{AppError, AppResult},
    models::{
        SubmissionCheckFinding, SubmissionCheckResult, SubmissionCheckSeverity,
        SubmissionCheckSummary,
    },
};

const MAX_TEX_FILES: usize = 256;
const MAX_SOURCE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_TOTAL_SOURCE_BYTES: u64 = 16 * 1024 * 1024;
const GRAPHIC_EXTENSIONS: &[&str] = &["pdf", "png", "jpg", "jpeg", "eps", "svg"];

#[derive(Clone)]
struct Location {
    file: String,
    line: u32,
}

struct KeyUse {
    key: String,
    location: Location,
}

#[derive(Default)]
struct ScanState {
    findings: Vec<SubmissionCheckFinding>,
    labels: HashMap<String, Location>,
    references: Vec<KeyUse>,
    citations: Vec<KeyUse>,
    bibliography_keys: HashSet<String>,
    bibliography_files: HashSet<PathBuf>,
    classic_bibliography: Option<Location>,
    bibliography_style: bool,
    graphic_paths: Vec<PathBuf>,
    saw_author_risk: bool,
    saw_email_risk: bool,
    saw_acknowledgement_risk: bool,
}

pub fn run(project_root: &Path, requested_root_file: &str) -> AppResult<SubmissionCheckResult> {
    let project_root = dunce::canonicalize(project_root).map_err(|source| {
        AppError::io(
            "resolve submission-check project",
            project_root.to_string_lossy(),
            source,
        )
    })?;
    let root_file = validate_root_file(&project_root, requested_root_file)?;
    let mut queue = VecDeque::from([root_file.clone()]);
    let mut visited = HashSet::new();
    let mut total_bytes = 0_u64;
    let mut scan = ScanState::default();

    while let Some(file) = queue.pop_front() {
        if visited.contains(&file) {
            continue;
        }
        if visited.len() >= MAX_TEX_FILES {
            return Err(AppError::SubmissionCheck(format!(
                "source graph exceeds {MAX_TEX_FILES} TeX files"
            )));
        }
        let metadata = std::fs::metadata(&file).map_err(|source| {
            AppError::io("inspect submission source", file.to_string_lossy(), source)
        })?;
        if !metadata.is_file() {
            return Err(AppError::NotAFile(file.to_string_lossy().into_owned()));
        }
        if metadata.len() > MAX_SOURCE_BYTES {
            return Err(AppError::SubmissionCheck(format!(
                "source file exceeds 2 MiB: {}",
                file.to_string_lossy()
            )));
        }
        total_bytes = total_bytes.saturating_add(metadata.len());
        if total_bytes > MAX_TOTAL_SOURCE_BYTES {
            return Err(AppError::SubmissionCheck(
                "submission source graph exceeds 16 MiB".to_owned(),
            ));
        }
        let content = std::fs::read_to_string(&file).map_err(|source| {
            AppError::io("read submission source", file.to_string_lossy(), source)
        })?;
        visited.insert(file.clone());
        scan_source(&project_root, &file, &content, &mut queue, &mut scan);
    }

    load_bibliographies(&project_root, &mut scan)?;
    finish_findings(&root_file, &mut scan);
    sort_findings(&mut scan.findings);
    let summary = summarize(&scan.findings);

    Ok(SubmissionCheckResult {
        root_file: root_file.to_string_lossy().into_owned(),
        scanned_files: u32::try_from(visited.len()).unwrap_or(u32::MAX),
        findings: scan.findings,
        summary,
    })
}

fn validate_root_file(project_root: &Path, requested: &str) -> AppResult<PathBuf> {
    if requested.is_empty() || requested.contains('\0') {
        return Err(AppError::InvalidPath(requested.to_owned()));
    }
    let requested_path = PathBuf::from(requested);
    if !requested_path.is_absolute()
        || !requested_path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("tex"))
    {
        return Err(AppError::InvalidPath(requested.to_owned()));
    }
    let canonical = dunce::canonicalize(&requested_path)
        .map_err(|source| AppError::io("resolve submission root", requested.to_owned(), source))?;
    if !path_is_within(project_root, &canonical) {
        return Err(AppError::OutsideProject(
            canonical.to_string_lossy().into_owned(),
        ));
    }
    Ok(canonical)
}

fn scan_source(
    project_root: &Path,
    file: &Path,
    content: &str,
    queue: &mut VecDeque<PathBuf>,
    scan: &mut ScanState,
) {
    let display = file.to_string_lossy().into_owned();
    let source_dir = file.parent().unwrap_or(project_root);

    for (line_index, original_line) in content.lines().enumerate() {
        let line_number = u32::try_from(line_index + 1).unwrap_or(u32::MAX);
        let line = strip_latex_comment(original_line);
        let location = || Location {
            file: display.clone(),
            line: line_number,
        };

        for captures in label_regex().captures_iter(line) {
            let Some(key) = capture_trimmed(&captures, 1) else {
                continue;
            };
            if let Some(previous) = scan.labels.insert(key.clone(), location()) {
                add_finding(
                    scan,
                    SubmissionCheckSeverity::Error,
                    "duplicate-label",
                    format!(
                        "Label `{key}` is also defined at {}:{}.",
                        previous.file, previous.line
                    ),
                    location(),
                );
            }
        }
        for captures in reference_regex().captures_iter(line) {
            let Some(keys) = captures.get(1) else {
                continue;
            };
            push_key_uses(&mut scan.references, keys.as_str(), location());
        }
        for captures in citation_regex().captures_iter(line) {
            let Some(keys) = captures.get(1) else {
                continue;
            };
            push_key_uses(&mut scan.citations, keys.as_str(), location());
        }
        for captures in include_regex().captures_iter(line) {
            let Some(raw) = capture_trimmed(&captures, 1) else {
                continue;
            };
            if raw.contains('\\') {
                continue;
            }
            let mut relative = PathBuf::from(raw);
            if relative.extension().is_none() {
                relative.set_extension("tex");
            }
            match resolve_existing_within(project_root, source_dir, &relative) {
                Some(path) => queue.push_back(path),
                None => add_finding(
                    scan,
                    SubmissionCheckSeverity::Error,
                    "missing-input",
                    format!(
                        "Included TeX file `{}` was not found in the project.",
                        relative.display()
                    ),
                    location(),
                ),
            }
        }
        for captures in graphic_path_regex().captures_iter(line) {
            let Some(paths) = captures.get(1) else {
                continue;
            };
            for path_capture in braced_path_regex().captures_iter(paths.as_str()) {
                let Some(raw) = capture_trimmed(&path_capture, 1) else {
                    continue;
                };
                if !raw.contains('\\') {
                    if let Some(path) =
                        lexical_join_within(project_root, source_dir, Path::new(&raw))
                    {
                        scan.graphic_paths.push(path);
                    }
                }
            }
        }
        for captures in include_graphics_regex().captures_iter(line) {
            let Some(raw) = capture_trimmed(&captures, 1) else {
                continue;
            };
            if raw.contains('\\')
                || graphic_exists(project_root, source_dir, &raw, &scan.graphic_paths)
            {
                continue;
            }
            add_finding(
                scan,
                SubmissionCheckSeverity::Error,
                "missing-figure",
                format!("Figure `{raw}` was not found in the project."),
                location(),
            );
        }
        for captures in classic_bibliography_regex().captures_iter(line) {
            scan.classic_bibliography.get_or_insert_with(location);
            if let Some(files) = captures.get(1) {
                register_bibliographies(project_root, source_dir, files.as_str(), location(), scan);
            }
        }
        for captures in add_bib_resource_regex().captures_iter(line) {
            if let Some(resource) = capture_trimmed(&captures, 1) {
                register_bibliographies(project_root, source_dir, &resource, location(), scan);
            }
        }
        if bibliography_style_regex().is_match(line) {
            scan.bibliography_style = true;
        }

        if !scan.saw_author_risk {
            if let Some(captures) = author_regex().captures(line) {
                let author = captures.get(1).map_or("", |value| value.as_str()).trim();
                if !author.is_empty() && !author.to_ascii_lowercase().contains("anonymous") {
                    scan.saw_author_risk = true;
                    add_finding(
                        scan,
                        SubmissionCheckSeverity::Warning,
                        "anonymity-author",
                        "Author information remains in the source.".to_owned(),
                        location(),
                    );
                }
            }
        }
        if !scan.saw_email_risk
            && (email_command_regex().is_match(line) || email_regex().is_match(line))
        {
            scan.saw_email_risk = true;
            add_finding(
                scan,
                SubmissionCheckSeverity::Warning,
                "anonymity-email",
                "An email address remains in the source.".to_owned(),
                location(),
            );
        }
        if !scan.saw_acknowledgement_risk && acknowledgement_regex().is_match(line) {
            scan.saw_acknowledgement_risk = true;
            add_finding(
                scan,
                SubmissionCheckSeverity::Warning,
                "anonymity-acknowledgement",
                "An acknowledgement section or command remains in the source.".to_owned(),
                location(),
            );
        }
    }
}

fn register_bibliographies(
    project_root: &Path,
    source_dir: &Path,
    files: &str,
    location: Location,
    scan: &mut ScanState,
) {
    for raw in files
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if raw.contains('\\') {
            continue;
        }
        let mut relative = PathBuf::from(raw);
        if relative.extension().is_none() {
            relative.set_extension("bib");
        }
        if let Some(path) = resolve_existing_within(project_root, source_dir, &relative) {
            scan.bibliography_files.insert(path);
        } else {
            add_finding(
                scan,
                SubmissionCheckSeverity::Error,
                "missing-bibliography",
                format!(
                    "Bibliography file `{}` was not found in the project.",
                    relative.display()
                ),
                location.clone(),
            );
        }
    }
}

fn load_bibliographies(project_root: &Path, scan: &mut ScanState) -> AppResult<()> {
    let files = scan.bibliography_files.iter().cloned().collect::<Vec<_>>();
    let mut total_bytes = 0_u64;
    for file in files {
        if !path_is_within(project_root, &file) {
            return Err(AppError::OutsideProject(
                file.to_string_lossy().into_owned(),
            ));
        }
        let metadata = std::fs::metadata(&file).map_err(|source| {
            AppError::io(
                "inspect submission bibliography",
                file.to_string_lossy(),
                source,
            )
        })?;
        if metadata.len() > MAX_SOURCE_BYTES {
            return Err(AppError::SubmissionCheck(format!(
                "bibliography exceeds 2 MiB: {}",
                file.to_string_lossy()
            )));
        }
        total_bytes = total_bytes.saturating_add(metadata.len());
        if total_bytes > MAX_TOTAL_SOURCE_BYTES {
            return Err(AppError::SubmissionCheck(
                "submission bibliographies exceed 16 MiB".to_owned(),
            ));
        }
        let content = std::fs::read_to_string(&file).map_err(|source| {
            AppError::io(
                "read submission bibliography",
                file.to_string_lossy(),
                source,
            )
        })?;
        for captures in bib_key_regex().captures_iter(&content) {
            if let Some(key) = capture_trimmed(&captures, 1) {
                scan.bibliography_keys.insert(key);
            }
        }
    }
    Ok(())
}

fn finish_findings(root_file: &Path, scan: &mut ScanState) {
    let referenced_labels = scan
        .references
        .iter()
        .map(|reference| reference.key.clone())
        .collect::<HashSet<_>>();
    let references = std::mem::take(&mut scan.references);
    for reference in references {
        if !scan.labels.contains_key(&reference.key) {
            add_finding(
                scan,
                SubmissionCheckSeverity::Error,
                "undefined-reference",
                format!("Reference `{}` has no matching label.", reference.key),
                reference.location,
            );
        }
    }
    let unused_labels = scan
        .labels
        .iter()
        .filter(|(key, _)| !referenced_labels.contains(*key))
        .map(|(key, location)| (key.clone(), location.clone()))
        .collect::<Vec<_>>();
    for (key, location) in unused_labels {
        add_finding(
            scan,
            SubmissionCheckSeverity::Info,
            "unused-label",
            format!("Label `{key}` is not referenced."),
            location,
        );
    }

    let citations = std::mem::take(&mut scan.citations);
    for citation in citations {
        if citation.key != "*" && !scan.bibliography_keys.contains(&citation.key) {
            add_finding(
                scan,
                SubmissionCheckSeverity::Error,
                "undefined-citation",
                format!(
                    "Citation `{}` is not present in a declared bibliography.",
                    citation.key
                ),
                citation.location,
            );
        }
    }
    if let Some(location) = scan.classic_bibliography.clone() {
        if !scan.bibliography_style {
            add_finding(
                scan,
                SubmissionCheckSeverity::Warning,
                "missing-bibliography-style",
                "A classic bibliography is used without \\bibliographystyle.".to_owned(),
                location,
            );
        }
    }

    if scan.findings.is_empty() {
        add_finding(
            scan,
            SubmissionCheckSeverity::Info,
            "source-checks-passed",
            "No source-level submission issues were found.".to_owned(),
            Location {
                file: root_file.to_string_lossy().into_owned(),
                line: 1,
            },
        );
    }
}

fn graphic_exists(
    project_root: &Path,
    source_dir: &Path,
    raw: &str,
    graphic_paths: &[PathBuf],
) -> bool {
    let relative = Path::new(raw);
    let mut bases = Vec::with_capacity(graphic_paths.len() + 2);
    bases.push(source_dir.to_path_buf());
    bases.extend(graphic_paths.iter().cloned());
    if source_dir != project_root {
        bases.push(project_root.to_path_buf());
    }
    bases.into_iter().any(|base| {
        if relative.extension().is_some() {
            existing_regular_file_within(project_root, &base, relative)
        } else {
            GRAPHIC_EXTENSIONS.iter().any(|extension| {
                existing_regular_file_within(
                    project_root,
                    &base,
                    &relative.with_extension(extension),
                )
            })
        }
    })
}

fn existing_regular_file_within(project_root: &Path, base: &Path, relative: &Path) -> bool {
    resolve_existing_within(project_root, base, relative)
        .and_then(|path| std::fs::metadata(path).ok())
        .is_some_and(|metadata| metadata.is_file())
}

fn resolve_existing_within(project_root: &Path, base: &Path, relative: &Path) -> Option<PathBuf> {
    let candidate = lexical_join_within(project_root, base, relative)?;
    let canonical = dunce::canonicalize(candidate).ok()?;
    path_is_within(project_root, &canonical).then_some(canonical)
}

fn lexical_join_within(project_root: &Path, base: &Path, relative: &Path) -> Option<PathBuf> {
    if relative.is_absolute() {
        return None;
    }
    let mut joined = base.to_path_buf();
    for component in relative.components() {
        match component {
            Component::CurDir => {}
            Component::Normal(part) => joined.push(part),
            Component::ParentDir => {
                if joined == project_root || !joined.pop() {
                    return None;
                }
            }
            Component::RootDir | Component::Prefix(_) => return None,
        }
    }
    path_is_within(project_root, &joined).then_some(joined)
}

fn push_key_uses(target: &mut Vec<KeyUse>, keys: &str, location: Location) {
    for key in keys.split(',').map(str::trim) {
        if !key.is_empty() && !key.chars().any(char::is_control) {
            target.push(KeyUse {
                key: key.to_owned(),
                location: location.clone(),
            });
        }
    }
}

fn capture_trimmed(captures: &regex::Captures<'_>, index: usize) -> Option<String> {
    captures
        .get(index)
        .map(|value| value.as_str().trim())
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn add_finding(
    scan: &mut ScanState,
    severity: SubmissionCheckSeverity,
    code: &str,
    message: String,
    location: Location,
) {
    scan.findings.push(SubmissionCheckFinding {
        severity,
        code: code.to_owned(),
        message,
        file: location.file,
        line: location.line,
    });
}

fn sort_findings(findings: &mut [SubmissionCheckFinding]) {
    findings.sort_by(|left, right| {
        left.severity
            .cmp(&right.severity)
            .then_with(|| left.file.cmp(&right.file))
            .then_with(|| left.line.cmp(&right.line))
            .then_with(|| left.code.cmp(&right.code))
            .then_with(|| left.message.cmp(&right.message))
    });
}

fn summarize(findings: &[SubmissionCheckFinding]) -> SubmissionCheckSummary {
    let mut summary = SubmissionCheckSummary::default();
    for finding in findings {
        match finding.severity {
            SubmissionCheckSeverity::Error => summary.errors += 1,
            SubmissionCheckSeverity::Warning => summary.warnings += 1,
            SubmissionCheckSeverity::Info => summary.info += 1,
        }
    }
    summary
}

fn strip_latex_comment(line: &str) -> &str {
    let bytes = line.as_bytes();
    for (index, byte) in bytes.iter().enumerate() {
        if *byte == b'%' {
            let backslashes = bytes[..index]
                .iter()
                .rev()
                .take_while(|candidate| **candidate == b'\\')
                .count();
            if backslashes % 2 == 0 {
                return &line[..index];
            }
        }
    }
    line
}

macro_rules! static_regex {
    ($name:ident, $pattern:literal) => {
        fn $name() -> &'static Regex {
            static REGEX: OnceLock<Regex> = OnceLock::new();
            REGEX.get_or_init(|| Regex::new($pattern).expect("valid submission-check regex"))
        }
    };
}

static_regex!(label_regex, r"\\label\s*\{([^}]+)\}");
static_regex!(
    reference_regex,
    r"\\(?:ref|eqref|pageref|autoref|cref|Cref)\*?\s*\{([^}]+)\}"
);
static_regex!(
    citation_regex,
    r"\\(?:cite|citep|citet|citealt|citealp|citeauthor|citeyear|citeyearpar|parencite|textcite|smartcite|autocite|footcite|supercite)\*?(?:\s*\[[^\]]*\]){0,2}\s*\{([^}]*)\}"
);
static_regex!(include_regex, r"\\(?:input|include|subfile)\s*\{([^}]+)\}");
static_regex!(
    include_graphics_regex,
    r"\\includegraphics\*?(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}"
);
static_regex!(graphic_path_regex, r"\\graphicspath\s*\{(.+)\}");
static_regex!(braced_path_regex, r"\{([^{}]+)\}");
static_regex!(classic_bibliography_regex, r"\\bibliography\s*\{([^}]+)\}");
static_regex!(
    add_bib_resource_regex,
    r"\\addbibresource(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}"
);
static_regex!(bibliography_style_regex, r"\\bibliographystyle\s*\{[^}]+\}");
static_regex!(bib_key_regex, r"(?im)^\s*@(?:[a-z]+)\s*\{\s*([^,\s]+)\s*,");
static_regex!(author_regex, r"\\author\s*\{([^}]*)\}");
static_regex!(email_command_regex, r"\\email\s*\{");
static_regex!(email_regex, r"(?i)[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}");
static_regex!(
    acknowledgement_regex,
    r"(?i)\\(?:begin\s*\{acknowledg(?:e)?ments?\}|section\*?\s*\{acknowledg(?:e)?ments?\}|acknowledg(?:e)?ments?\s*\{)"
);

#[cfg(not(windows))]
fn path_is_within(root: &Path, candidate: &Path) -> bool {
    candidate.starts_with(root)
}

#[cfg(windows)]
fn path_is_within(root: &Path, candidate: &Path) -> bool {
    let mut candidate_components = candidate.components();
    root.components().all(|root_component| {
        candidate_components
            .next()
            .is_some_and(|candidate_component| {
                root_component
                    .as_os_str()
                    .to_string_lossy()
                    .eq_ignore_ascii_case(&candidate_component.as_os_str().to_string_lossy())
            })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, content: &str) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(path, content).unwrap();
    }

    #[test]
    fn reports_source_level_submission_findings_and_follows_inputs() {
        let project = tempfile::tempdir().unwrap();
        let root = project.path().join("main.tex");
        write(
            &root,
            r#"\author{Ada Example}
\email{ada@example.test}
\input{sections/method}
\includegraphics{figures/missing.png}
\bibliography{references}
\cite{known,missing}
\ref{does-not-exist}
"#,
        );
        write(
            &project.path().join("sections/method.tex"),
            "\\label{sec:unused}\n\\section*{Acknowledgements}\n",
        );
        write(
            &project.path().join("references.bib"),
            "@article{known, title={Known}}\n",
        );

        let result = run(project.path(), root.to_str().unwrap()).unwrap();
        let codes = result
            .findings
            .iter()
            .map(|finding| finding.code.as_str())
            .collect::<HashSet<_>>();
        assert_eq!(result.scanned_files, 2);
        assert!(codes.contains("anonymity-author"));
        assert!(codes.contains("anonymity-email"));
        assert!(codes.contains("anonymity-acknowledgement"));
        assert!(codes.contains("missing-figure"));
        assert!(codes.contains("undefined-citation"));
        assert!(codes.contains("undefined-reference"));
        assert!(codes.contains("unused-label"));
        assert!(codes.contains("missing-bibliography-style"));
        assert_eq!(result.summary.errors, 3);
    }

    #[test]
    fn accepts_biblatex_graphic_paths_and_escaped_comments() {
        let project = tempfile::tempdir().unwrap();
        let root = project.path().join("main.tex");
        write(
            &root,
            r#"\graphicspath{{images/}}
\includegraphics{result}
\addbibresource{refs.bib}
\cite{paper}
\label{sec:a}\ref{sec:a}
contact\%not-a-comment
"#,
        );
        write(&project.path().join("images/result.pdf"), "%PDF");
        write(
            &project.path().join("refs.bib"),
            "@inproceedings{paper, title={Paper}}",
        );

        let result = run(project.path(), root.to_str().unwrap()).unwrap();
        assert_eq!(result.findings.len(), 1);
        assert_eq!(result.findings[0].code, "source-checks-passed");
    }

    #[test]
    fn rejects_roots_outside_the_project() {
        let project = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let root = outside.path().join("main.tex");
        write(&root, "\\documentclass{article}");

        assert!(matches!(
            run(project.path(), root.to_str().unwrap()),
            Err(AppError::OutsideProject(_))
        ));
    }

    #[cfg(unix)]
    #[test]
    fn does_not_follow_included_symlinks_outside_the_project() {
        use std::os::unix::fs::symlink;

        let project = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let root = project.path().join("main.tex");
        write(&root, "\\input{escape}");
        write(&outside.path().join("secret.tex"), "secret");
        symlink(
            outside.path().join("secret.tex"),
            project.path().join("escape.tex"),
        )
        .unwrap();

        let result = run(project.path(), root.to_str().unwrap()).unwrap();
        assert_eq!(result.findings[0].code, "missing-input");
    }
}
