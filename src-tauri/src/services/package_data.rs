use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

use serde_json::Value;
use tauri::{AppHandle, Manager};
use tokio::fs;

use crate::{
    error::{AppError, AppResult},
    models::{PackageData, PackageDataMap, PackageEnvironment, PackageMacro},
};

const MAX_REQUESTED_PACKAGES: usize = 128;
const MAX_PACKAGE_NAME_BYTES: usize = 128;
const MAX_METADATA_FILE_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Default)]
pub struct PackageDataState {
    cache: Mutex<HashMap<String, Option<PackageData>>>,
}

pub async fn load_package_data(
    app: &AppHandle,
    state: &PackageDataState,
    package_names: Vec<String>,
) -> AppResult<PackageDataMap> {
    if package_names.len() > MAX_REQUESTED_PACKAGES {
        return Err(AppError::PackageData(format!(
            "at most {MAX_REQUESTED_PACKAGES} packages may be requested at once"
        )));
    }

    let metadata_directory = resolve_metadata_directory(app)?;
    let mut pending = VecDeque::new();
    for package_name in package_names {
        // Invalid or path-like names are ignored while valid names in the same
        // request still load.
        if validate_package_name(&package_name).is_ok() {
            pending.push_back(package_name);
        }
    }

    let mut loaded = HashSet::new();
    let mut result = HashMap::new();
    while let Some(package_name) = pending.pop_front() {
        if !loaded.insert(package_name.clone()) {
            continue;
        }

        let package_data = if let Some(cached) = cached_package(state, &package_name)? {
            cached
        } else {
            let loaded_data = read_package_file(&metadata_directory, &package_name).await?;
            cache_package(state, package_name.clone(), loaded_data.clone())?;
            loaded_data
        };

        let Some(package_data) = package_data else {
            continue;
        };
        for dependency in &package_data.deps {
            if validate_package_name(dependency).is_ok() && !loaded.contains(dependency) {
                pending.push_back(dependency.clone());
            }
        }
        result.insert(package_name, package_data);
    }

    Ok(result)
}

fn resolve_metadata_directory(app: &AppHandle) -> AppResult<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(resource_directory) = app.path().resource_dir() {
        candidates.push(resource_directory.join("data").join("packages"));
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("resources")
            .join("data")
            .join("packages"),
    );

    candidates
        .iter()
        .find(|candidate| candidate.is_dir())
        .cloned()
        .ok_or_else(|| {
            AppError::PackageData(format!(
                "package metadata directory was not found; checked {}",
                candidates
                    .iter()
                    .map(|path| path.to_string_lossy())
                    .collect::<Vec<_>>()
                    .join(", ")
            ))
        })
}

async fn read_package_file(directory: &Path, package_name: &str) -> AppResult<Option<PackageData>> {
    let path = directory.join(format!("{package_name}.json"));
    let metadata = match fs::metadata(&path).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(AppError::PackageData(format!(
                "could not inspect {}: {error}",
                path.to_string_lossy()
            )));
        }
    };
    if !metadata.is_file() {
        return Ok(None);
    }
    if metadata.len() > MAX_METADATA_FILE_BYTES {
        return Err(AppError::PackageData(format!(
            "{} exceeds the 2 MiB metadata limit",
            path.to_string_lossy()
        )));
    }

    let content = fs::read_to_string(&path).await.map_err(|error| {
        AppError::PackageData(format!(
            "could not read {}: {error}",
            path.to_string_lossy()
        ))
    })?;
    let value: Value = serde_json::from_str(&content).map_err(|error| {
        AppError::PackageData(format!(
            "could not parse {}: {error}",
            path.to_string_lossy()
        ))
    })?;
    Ok(Some(parse_package_data(&value)))
}

fn parse_package_data(value: &Value) -> PackageData {
    PackageData {
        macros: parse_macros(value.get("macros")),
        envs: parse_environments(value.get("envs")),
        deps: parse_dependencies(value.get("deps")),
    }
}

fn parse_dependencies(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|dependency| {
            dependency.as_str().or_else(|| {
                dependency
                    .as_object()
                    .and_then(|object| object.get("name"))
                    .and_then(Value::as_str)
            })
        })
        .map(str::to_owned)
        .collect()
}

fn parse_macros(value: Option<&Value>) -> Vec<PackageMacro> {
    match value {
        Some(Value::Array(macros)) => macros
            .iter()
            .filter(|item| {
                !item
                    .get("unusual")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
            })
            .filter_map(|item| {
                let name = item.get("name")?.as_str()?.to_owned();
                let snippet = item
                    .get("arg")
                    .and_then(|arg| arg.get("snippet"))
                    .and_then(Value::as_str)
                    .map(str::to_owned);
                let detail = item
                    .get("detail")
                    .or_else(|| item.get("doc"))
                    .and_then(Value::as_str)
                    .map(str::to_owned);
                Some(PackageMacro {
                    name,
                    snippet,
                    detail,
                })
            })
            .collect(),
        Some(Value::Object(macros)) => macros
            .iter()
            .map(|(name, item)| PackageMacro {
                name: name.strip_prefix('\\').unwrap_or(name).to_owned(),
                snippet: item
                    .get("snippet")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                detail: item
                    .get("detail")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn parse_environments(value: Option<&Value>) -> Vec<PackageEnvironment> {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|item| {
            !item
                .get("unusual")
                .and_then(Value::as_bool)
                .unwrap_or(false)
        })
        .filter_map(|item| {
            let name = item.get("name")?.as_str()?.to_owned();
            let arg_snippet = item
                .get("argSnippet")
                .or_else(|| item.get("arg").and_then(|arg| arg.get("snippet")))
                .and_then(Value::as_str)
                .map(str::to_owned);
            Some(PackageEnvironment { name, arg_snippet })
        })
        .collect()
}

fn validate_package_name(package_name: &str) -> AppResult<()> {
    let valid = !package_name.is_empty()
        && package_name.len() <= MAX_PACKAGE_NAME_BYTES
        && package_name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'));
    if valid {
        Ok(())
    } else {
        Err(AppError::PackageData(format!(
            "invalid package name: {package_name}"
        )))
    }
}

fn cached_package(
    state: &PackageDataState,
    package_name: &str,
) -> AppResult<Option<Option<PackageData>>> {
    Ok(lock_cache(state)?.get(package_name).cloned())
}

fn cache_package(
    state: &PackageDataState,
    package_name: String,
    package_data: Option<PackageData>,
) -> AppResult<()> {
    lock_cache(state)?.insert(package_name, package_data);
    Ok(())
}

fn lock_cache(
    state: &PackageDataState,
) -> AppResult<MutexGuard<'_, HashMap<String, Option<PackageData>>>> {
    state
        .cache
        .lock()
        .map_err(|_| AppError::PackageData("package metadata cache lock was poisoned".to_owned()))
}

#[cfg(test)]
mod tests {
    use super::{parse_package_data, read_package_file, validate_package_name};
    use serde_json::json;
    use std::path::PathBuf;

    #[test]
    fn parses_both_supported_package_metadata_shapes() {
        let data = parse_package_data(&json!({
            "macros": [
                { "name": "frac", "arg": { "snippet": "{$1}{$2}" }, "doc": "fraction" },
                { "name": "hidden", "unusual": true }
            ],
            "envs": [
                { "name": "align", "arg": { "snippet": "[$1]" } },
                { "name": "hidden", "unusual": true }
            ],
            "deps": ["amsbsy", { "name": "amstext" }]
        }));
        assert_eq!(data.macros.len(), 1);
        assert_eq!(data.macros[0].name, "frac");
        assert_eq!(data.macros[0].detail.as_deref(), Some("fraction"));
        assert_eq!(data.envs[0].arg_snippet.as_deref(), Some("[$1]"));
        assert_eq!(data.deps, ["amsbsy", "amstext"]);

        let object_data = parse_package_data(&json!({
            "macros": { "\\includegraphics": { "snippet": "{$1}", "detail": "image" } }
        }));
        assert_eq!(object_data.macros[0].name, "includegraphics");
    }

    #[test]
    fn rejects_package_name_path_traversal() {
        assert!(validate_package_name("amsmath").is_ok());
        assert!(validate_package_name("latex-3").is_ok());
        assert!(validate_package_name("../settings").is_err());
        assert!(validate_package_name("x/y").is_err());
    }

    #[tokio::test(flavor = "current_thread")]
    async fn reads_the_bundled_metadata_format() {
        let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("resources")
            .join("data")
            .join("packages");
        let amsmath = read_package_file(&directory, "amsmath")
            .await
            .expect("read amsmath metadata")
            .expect("amsmath metadata exists");

        assert!(!amsmath.macros.is_empty());
        assert!(amsmath
            .deps
            .iter()
            .any(|dependency| dependency == "amstext"));
        assert!(read_package_file(&directory, "does-not-exist")
            .await
            .expect("missing metadata is not an error")
            .is_none());
    }
}
