use std::{
    collections::{BTreeMap, HashMap},
    ffi::OsStr,
    io::Read,
    path::{Path, PathBuf},
    sync::Arc,
    time::SystemTime,
};

use flate2::read::GzDecoder;
use tokio::{fs, sync::Mutex};

use crate::{
    error::{AppError, AppResult},
    models::{SyncTexForwardResult, SyncTexInverseResult, SyncTexLineMapEntry},
    services::compiler::{resolve_magic_root, validate_project_tex_file},
    state::AppState,
};

const SYNC_TEX_UNIT: f64 = 65_781.76;

#[derive(Clone, Debug)]
struct Block {
    block_type: char,
    page: u32,
    left: f64,
    bottom: f64,
    width: Option<f64>,
    height: f64,
}

impl Block {
    fn eligible(&self) -> bool {
        !matches!(self.block_type, 'k' | 'r')
    }

    fn rect(&self) -> Rectangle {
        Rectangle {
            top: self.bottom - self.height,
            bottom: self.bottom,
            left: self.left,
            right: self.left + self.width.unwrap_or(0.0),
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct Rectangle {
    top: f64,
    bottom: f64,
    left: f64,
    right: f64,
}

impl Rectangle {
    fn includes(self, other: Self) -> bool {
        self.left <= other.left
            && self.right >= other.right
            && self.bottom >= other.bottom
            && self.top <= other.top
    }

    fn distance_from_center(self, x: f64, y: f64) -> f64 {
        (((self.left + self.right) / 2.0 - x).powi(2)
            + ((self.bottom + self.top) / 2.0 - y).powi(2))
        .sqrt()
    }
}

type PageBlocks = HashMap<u32, Vec<Block>>;
type LineBlocks = BTreeMap<u32, PageBlocks>;

#[derive(Clone, Debug, Default)]
struct SyncTexDocument {
    offset_x: f64,
    offset_y: f64,
    blocks: HashMap<String, LineBlocks>,
}

#[derive(Clone)]
struct LoadedSyncTex {
    root_file: PathBuf,
    document: Arc<SyncTexDocument>,
}

struct CachedSyncTex {
    source_file: PathBuf,
    modified: SystemTime,
    loaded: LoadedSyncTex,
}

#[derive(Default)]
pub struct SyncTexState {
    cache: Mutex<Option<CachedSyncTex>>,
    build_directories: Mutex<HashMap<PathBuf, PathBuf>>,
}

impl SyncTexState {
    pub async fn register_build_output(&self, root_file: &str, pdf_path: &str) {
        let Some(build_dir) = Path::new(pdf_path).parent() else {
            return;
        };
        self.build_directories
            .lock()
            .await
            .insert(PathBuf::from(root_file), build_dir.to_path_buf());
        *self.cache.lock().await = None;
    }
}

pub async fn forward(
    state: &AppState,
    sync_state: &SyncTexState,
    tex_file: &str,
    line: u32,
) -> AppResult<Option<SyncTexForwardResult>> {
    let selected = validate_project_tex_file(state, tex_file).await?;
    let Some(loaded) = load(state, sync_state, &selected).await? else {
        return Ok(None);
    };
    let Some(input) = find_input(&selected, &loaded.root_file, &loaded.document) else {
        return Ok(None);
    };
    let Some(lines) = loaded.document.blocks.get(input) else {
        return Ok(None);
    };
    let Some((next_line, next_block)) = lines
        .range(line..)
        .find_map(|(line, pages)| first_eligible(pages).map(|block| (*line, block)))
        .or_else(|| {
            lines
                .iter()
                .rev()
                .find_map(|(line, pages)| first_eligible(pages).map(|block| (*line, block)))
        })
    else {
        return Ok(None);
    };

    let bottom = if next_line > line {
        lines
            .range(..next_line)
            .rev()
            .find_map(|(previous_line, pages)| {
                first_eligible(pages).map(|previous| (*previous_line, previous))
            })
            .filter(|(_, previous)| previous.bottom < next_block.bottom)
            .map_or(next_block.bottom, |(previous_line, previous)| {
                previous.bottom * f64::from(next_line - line) / f64::from(next_line - previous_line)
                    + next_block.bottom * f64::from(line - previous_line)
                        / f64::from(next_line - previous_line)
            })
    } else {
        next_block.bottom
    };

    Ok(Some(SyncTexForwardResult {
        page: next_block.page,
        x: next_block.left + loaded.document.offset_x,
        y: bottom + loaded.document.offset_y,
    }))
}

pub async fn inverse(
    state: &AppState,
    sync_state: &SyncTexState,
    tex_file: &str,
    page: u32,
    x: f64,
    y: f64,
) -> AppResult<Option<SyncTexInverseResult>> {
    let selected = validate_project_tex_file(state, tex_file).await?;
    let Some(loaded) = load(state, sync_state, &selected).await? else {
        return Ok(None);
    };
    let x = x - loaded.document.offset_x;
    let y = y - loaded.document.offset_y;
    let mut best: Option<(&str, u32, Rectangle, f64)> = None;

    for (input, lines) in &loaded.document.blocks {
        for (line, pages) in lines {
            let Some(blocks) = pages.get(&page) else {
                continue;
            };
            for block in blocks.iter().filter(|block| block.eligible()) {
                let rect = block.rect();
                let distance = rect.distance_from_center(x, y);
                let replace = best.is_none_or(|(_, _, best_rect, best_distance)| {
                    best_rect.includes(rect)
                        || (distance < best_distance && !rect.includes(best_rect))
                });
                if replace {
                    best = Some((input, *line, rect, distance));
                }
            }
        }
    }

    let Some((input, line, _, _)) = best else {
        return Ok(None);
    };
    let Some(candidate) = resolve_input_path(&loaded.root_file, input) else {
        return Ok(None);
    };
    let candidate_text = candidate
        .to_str()
        .ok_or_else(|| AppError::NonUtf8Path(candidate.to_string_lossy().into_owned()))?;
    let resolved = validate_project_tex_file(state, candidate_text).await?;

    Ok(Some(SyncTexInverseResult {
        file: resolved.to_string_lossy().into_owned(),
        line,
        column: 0,
    }))
}

pub async fn line_map(
    state: &AppState,
    sync_state: &SyncTexState,
    tex_file: &str,
) -> AppResult<Vec<SyncTexLineMapEntry>> {
    let selected = validate_project_tex_file(state, tex_file).await?;
    let Some(loaded) = load(state, sync_state, &selected).await? else {
        return Ok(Vec::new());
    };
    let Some(input) = find_input(&selected, &loaded.root_file, &loaded.document) else {
        return Ok(Vec::new());
    };
    let Some(lines) = loaded.document.blocks.get(input) else {
        return Ok(Vec::new());
    };

    Ok(lines
        .iter()
        .filter_map(|(line, pages)| {
            first_eligible(pages).map(|block| SyncTexLineMapEntry {
                line: *line,
                page: block.page,
                y: block.bottom + loaded.document.offset_y,
            })
        })
        .collect())
}

async fn load(
    state: &AppState,
    sync_state: &SyncTexState,
    selected: &Path,
) -> AppResult<Option<LoadedSyncTex>> {
    let root_file = resolve_magic_root(state, selected).await?;
    let build_dir = sync_state
        .build_directories
        .lock()
        .await
        .get(&root_file)
        .cloned();
    let plain = build_dir
        .as_ref()
        .map(|directory| output_path(directory, &root_file, "synctex"))
        .unwrap_or_else(|| root_file.with_extension("synctex"));
    let compressed = build_dir
        .as_ref()
        .map(|directory| output_path(directory, &root_file, "synctex.gz"))
        .unwrap_or_else(|| root_file.with_extension("synctex.gz"));

    let source_file = if plain.is_file() {
        plain
    } else if compressed.is_file() {
        compressed
    } else {
        return Ok(None);
    };
    let metadata = fs::metadata(&source_file).await.map_err(|source| {
        AppError::io(
            "inspect SyncTeX data",
            source_file.to_string_lossy(),
            source,
        )
    })?;
    let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
    if let Some(cached) = sync_state.cache.lock().await.as_ref() {
        if cached.source_file == source_file && cached.modified == modified {
            return Ok(Some(cached.loaded.clone()));
        }
    }

    let content = if source_file
        .extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| extension.eq_ignore_ascii_case("gz"))
    {
        let bytes = fs::read(&source_file).await.map_err(|source| {
            AppError::io(
                "read compressed SyncTeX data",
                source_file.to_string_lossy(),
                source,
            )
        })?;
        tauri::async_runtime::spawn_blocking(move || {
            let mut output = String::new();
            GzDecoder::new(bytes.as_slice())
                .read_to_string(&mut output)
                .map(|_| output)
        })
        .await
        .map_err(|error| AppError::SyncTex(error.to_string()))?
        .map_err(|error| AppError::SyncTex(format!("failed to decompress SyncTeX data: {error}")))?
    } else {
        fs::read_to_string(&source_file).await.map_err(|source| {
            AppError::io("read SyncTeX data", source_file.to_string_lossy(), source)
        })?
    };

    let document = tauri::async_runtime::spawn_blocking(move || parse(&content))
        .await
        .map_err(|error| AppError::SyncTex(format!("SyncTeX parser worker failed: {error}")))?;
    let loaded = LoadedSyncTex {
        root_file,
        document: Arc::new(document),
    };
    *sync_state.cache.lock().await = Some(CachedSyncTex {
        source_file,
        modified,
        loaded: loaded.clone(),
    });
    Ok(Some(loaded))
}

fn output_path(directory: &Path, root_file: &Path, extension: &str) -> PathBuf {
    directory
        .join(
            root_file
                .file_stem()
                .unwrap_or_else(|| OsStr::new("output")),
        )
        .with_extension(extension)
}

fn parse(content: &str) -> SyncTexDocument {
    let mut document = SyncTexDocument::default();
    let mut files = HashMap::<u32, String>::new();
    let mut current_page = None;
    let mut height_stack = Vec::new();

    for line in content.lines().skip(1) {
        if let Some(value) = line.strip_prefix("Input:") {
            let mut parts = value.splitn(2, ':');
            if let (Some(number), Some(path)) = (parts.next(), parts.next()) {
                if let Ok(number) = number.parse() {
                    files.insert(number, path.to_owned());
                }
            }
            continue;
        }
        if let Some(value) = line.strip_prefix("X Offset:") {
            document.offset_x = value.parse::<f64>().unwrap_or(0.0) / SYNC_TEX_UNIT;
            continue;
        }
        if let Some(value) = line.strip_prefix("Y Offset:") {
            document.offset_y = value.parse::<f64>().unwrap_or(0.0) / SYNC_TEX_UNIT;
            continue;
        }
        if let Some(value) = line.strip_prefix('{') {
            current_page = value.parse().ok();
            height_stack.clear();
            continue;
        }
        if line.starts_with('}') {
            current_page = None;
            height_stack.clear();
            continue;
        }
        if line.starts_with('[') || line.starts_with('(') {
            if let Some((_, dimensions)) = line.split_once(':') {
                let dimensions = dimensions
                    .split_once(':')
                    .map_or(dimensions, |(_, value)| value);
                let mut values = dimensions.split(',');
                let _width = values.next();
                let height = values
                    .next()
                    .and_then(|value| value.parse::<f64>().ok())
                    .unwrap_or(0.0)
                    / SYNC_TEX_UNIT;
                height_stack.push(height);
            }
            continue;
        }
        if line == "]" || line == ")" {
            height_stack.pop();
            continue;
        }
        let Some(page) = current_page else {
            continue;
        };
        let Some(block) = parse_element(
            line,
            page,
            height_stack.last().copied().unwrap_or(0.0),
            &files,
        ) else {
            continue;
        };
        let Some(input) = files.get(&block.0).cloned() else {
            continue;
        };
        document
            .blocks
            .entry(input)
            .or_default()
            .entry(block.1)
            .or_default()
            .entry(page)
            .or_default()
            .push(block.2);
    }
    document
}

fn parse_element(
    line: &str,
    page: u32,
    height: f64,
    files: &HashMap<u32, String>,
) -> Option<(u32, u32, Block)> {
    let block_type = line.chars().next()?;
    let value = line.get(block_type.len_utf8()..)?;
    let (source, coordinates) = value.split_once(':')?;
    let (file_number, line_number) = source.split_once(',')?;
    let file_number = file_number.parse().ok()?;
    if !files.contains_key(&file_number) {
        return None;
    }
    let line_number = line_number.parse().ok()?;
    let (left, rest) = coordinates.split_once(',')?;
    let (bottom, width) = rest
        .split_once(':')
        .map_or((rest, None), |(bottom, width)| (bottom, Some(width)));
    Some((
        file_number,
        line_number,
        Block {
            block_type,
            page,
            left: left.parse::<f64>().ok()? / SYNC_TEX_UNIT,
            bottom: bottom.parse::<f64>().ok()? / SYNC_TEX_UNIT,
            width: width
                .and_then(|value| value.parse::<f64>().ok())
                .map(|v| v / SYNC_TEX_UNIT),
            height,
        },
    ))
}

fn first_eligible(pages: &PageBlocks) -> Option<&Block> {
    let page = pages.keys().min()?;
    pages.get(page)?.iter().find(|block| block.eligible())
}

fn find_input<'a>(
    selected: &Path,
    root_file: &Path,
    document: &'a SyncTexDocument,
) -> Option<&'a str> {
    document.blocks.keys().find_map(|input| {
        resolve_input_candidates(root_file, input)
            .iter()
            .any(|candidate| paths_equal(candidate, selected))
            .then_some(input.as_str())
    })
}

fn resolve_input_path(root_file: &Path, input: &str) -> Option<PathBuf> {
    resolve_input_candidates(root_file, input)
        .into_iter()
        .find(|candidate| candidate.is_file())
}

fn resolve_input_candidates(root_file: &Path, input: &str) -> Vec<PathBuf> {
    let root = root_file.parent().unwrap_or_else(|| Path::new(""));
    let resolved = root.join(input);
    let mut candidates = vec![resolved.clone()];
    if resolved.extension().is_none() {
        candidates.push(resolved.with_extension("tex"));
    }
    candidates
}

#[cfg(not(windows))]
fn paths_equal(left: &Path, right: &Path) -> bool {
    left == right
}

#[cfg(windows)]
fn paths_equal(left: &Path, right: &Path) -> bool {
    left.to_string_lossy()
        .eq_ignore_ascii_case(&right.to_string_lossy())
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use tempfile::tempdir;

    use super::*;

    const FIXTURE: &str = "SyncTeX Version:1\nInput:1:chapters/chapter1.tex\nX Offset:0\nY Offset:0\n{1\n[1,2:0,100000:100000,50000,0\nx1,2:0,100000:100000\n]\n}1";

    #[test]
    fn parses_line_blocks_for_forward_and_inverse_lookup() {
        let document = parse(FIXTURE);
        let lines = document.blocks.get("chapters/chapter1.tex").unwrap();
        let block = first_eligible(lines.get(&2).unwrap()).unwrap();
        assert_eq!(block.page, 1);
        assert_eq!(block.left, 0.0);
        assert!(block.bottom > 1.5);
    }

    #[test]
    fn matches_extensionless_inputs() {
        let document = parse(&FIXTURE.replace("chapter1.tex", "chapter1"));
        let root = Path::new("/project/main.tex");
        let selected = Path::new("/project/chapters/chapter1.tex");
        assert_eq!(
            find_input(selected, root, &document),
            Some("chapters/chapter1")
        );
    }

    #[tokio::test(flavor = "current_thread")]
    async fn resolves_forward_inverse_and_line_map_through_magic_root() {
        let project = tempdir().unwrap();
        let chapter_dir = project.path().join("chapters");
        std::fs::create_dir(&chapter_dir).unwrap();
        let root = project.path().join("main.tex");
        let chapter = chapter_dir.join("chapter1.tex");
        std::fs::write(&root, "\\input{chapters/chapter1}\n").unwrap();
        std::fs::write(&chapter, "%! TeX root = ../main.tex\nBody\n").unwrap();
        std::fs::write(project.path().join("main.synctex"), FIXTURE).unwrap();

        let state = AppState::default();
        let sync_state = SyncTexState::default();
        state
            .set_project_root(dunce::canonicalize(project.path()).unwrap())
            .unwrap();
        let chapter = chapter.to_string_lossy();

        let forward = forward(&state, &sync_state, &chapter, 2)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(forward.page, 1);
        let inverse = inverse(&state, &sync_state, &chapter, 1, 0.5, 1.2)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(inverse.line, 2);
        assert!(inverse.file.ends_with("chapters/chapter1.tex"));
        assert_eq!(
            line_map(&state, &sync_state, &chapter).await.unwrap().len(),
            1
        );
    }

    #[tokio::test(flavor = "current_thread")]
    async fn reads_gzip_compressed_synctex() {
        let project = tempdir().unwrap();
        let root = project.path().join("main.tex");
        std::fs::write(&root, "Body\n").unwrap();
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder
            .write_all(
                &FIXTURE
                    .replace("chapters/chapter1.tex", "main.tex")
                    .into_bytes(),
            )
            .unwrap();
        std::fs::write(
            project.path().join("main.synctex.gz"),
            encoder.finish().unwrap(),
        )
        .unwrap();

        let state = AppState::default();
        let sync_state = SyncTexState::default();
        state
            .set_project_root(dunce::canonicalize(project.path()).unwrap())
            .unwrap();
        let result = forward(&state, &sync_state, &root.to_string_lossy(), 2)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(result.page, 1);
    }
}
