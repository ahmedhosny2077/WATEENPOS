use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::error::{AppError, AppResult};
use crate::paths;

const GITHUB_USER: &str = "ahmedhosny2077";
const GITHUB_REPO: &str = "WATEENPOS";
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

static UPDATING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Deserialize)]
struct GitHubContent {
    content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionInfo {
    pub version: String,
    pub download_url: String,
    pub release_notes_ar: String,
    pub file_size_mb: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateCheck {
    pub current_version: String,
    pub available: bool,
    pub info: Option<VersionInfo>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub percent: u32,
    pub downloaded_mb: f64,
    pub total_mb: f64,
}

fn parse_version(v: &str) -> Vec<u32> {
    v.trim()
        .trim_start_matches('v')
        .split('.')
        .filter_map(|s| s.parse::<u32>().ok())
        .collect()
}

fn is_newer(remote: &str, local: &str) -> bool {
    let r = parse_version(remote);
    let l = parse_version(local);
    for i in 0..r.len().max(l.len()) {
        let rv = r.get(i).copied().unwrap_or(0);
        let lv = l.get(i).copied().unwrap_or(0);
        if rv > lv {
            return true;
        }
        if rv < lv {
            return false;
        }
    }
    false
}

fn version_url() -> String {
    format!(
        "https://api.github.com/repos/{}/{}/contents/version.json",
        GITHUB_USER, GITHUB_REPO
    )
}

pub fn check_for_update() -> AppResult<UpdateCheck> {
    let url = version_url();
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(std::time::Duration::from_secs(10))
        .timeout_read(std::time::Duration::from_secs(15))
        .build();
    let resp = match agent
        .get(&url)
        .set("User-Agent", "WateenPOS-Updater/1.0")
        .set("Accept", "application/vnd.github.v3+json")
        .call()
    {
        Ok(r) => r,
        Err(ureq::Error::Status(404, _)) => {
            return Ok(UpdateCheck {
                current_version: CURRENT_VERSION.to_string(),
                available: false,
                info: None,
            });
        }
        Err(e) => {
            return Err(AppError::tech(
                "تعذر الاتصال بخادم التحديثات. تحقق من اتصال الإنترنت.",
                format!("{e}"),
            ));
        }
    };

    let body = resp
        .into_string()
        .map_err(|e| AppError::tech("خطأ في قراءة الاستجابة", format!("{e}")))?;

    let gh: GitHubContent = serde_json::from_str(&body)
        .map_err(|e| AppError::tech("خطأ في قراءة الاستجابة", format!("{e}")))?;

    let decoded = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        gh.content.replace('\n', "").replace('\r', ""),
    )
    .map_err(|e| AppError::tech("خطأ في فك التشفير", format!("{e}")))?;

    let info: VersionInfo = serde_json::from_slice(&decoded)
        .map_err(|e| AppError::tech("خطأ في قراءة بيانات النسخة", format!("{e}")))?;

    let available = is_newer(&info.version, CURRENT_VERSION);

    Ok(UpdateCheck {
        current_version: CURRENT_VERSION.to_string(),
        available,
        info: if available { Some(info) } else { None },
    })
}

fn installer_path() -> PathBuf {
    std::env::temp_dir().join("WATEEN_POS_Setup.exe")
}

pub fn download_update(
    url: &str,
    progress_cb: impl Fn(DownloadProgress),
) -> AppResult<PathBuf> {
    if UPDATING.swap(true, Ordering::SeqCst) {
        return Err(AppError::user("يوجد تحديث قيد التنزيل بالفعل."));
    }

    let result = (|| -> AppResult<PathBuf> {
        let resp = ureq::get(url)
            .set("User-Agent", "WateenPOS-Updater/1.0")
            .call()
            .map_err(|e| AppError::tech("فشل تنزيل التحديث", format!("{e}")))?;

        let total: u64 = resp
            .header("Content-Length")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);

        let total_mb = total as f64 / 1_048_576.0;
        let dest = installer_path();
        let mut file = fs::File::create(&dest)
            .map_err(|e| AppError::tech("فشل إنشاء ملف التحديث", format!("{e}")))?;

        let mut reader = resp.into_reader();
        let mut downloaded: u64 = 0;
        let mut buf = [0u8; 65536];
        let mut last_percent: u32 = 0;

        loop {
            let n = reader
                .read(&mut buf)
                .map_err(|e| AppError::tech("خطأ أثناء التنزيل", format!("{e}")))?;
            if n == 0 {
                break;
            }
            std::io::Write::write_all(&mut file, &buf[..n])
                .map_err(|e| AppError::tech("خطأ في الكتابة على القرص", format!("{e}")))?;
            downloaded += n as u64;

            let percent = if total > 0 {
                ((downloaded as f64 / total as f64) * 100.0) as u32
            } else {
                0
            };
            if percent != last_percent {
                last_percent = percent;
                progress_cb(DownloadProgress {
                    percent,
                    downloaded_mb: downloaded as f64 / 1_048_576.0,
                    total_mb,
                });
            }
        }

        Ok(dest)
    })();

    UPDATING.store(false, Ordering::SeqCst);
    result
}

pub fn install_and_restart(installer_path: &std::path::Path) -> AppResult<()> {
    use std::process::Command;

    if !installer_path.exists() {
        return Err(AppError::user("ملف التثبيت غير موجود."));
    }

    Command::new(installer_path)
        .args(["/SILENT", "/CLOSEAPPLICATIONS", "/RESTARTAPPLICATIONS"])
        .spawn()
        .map_err(|e| AppError::tech("فشل تشغيل المثبّت", format!("{e}")))?;

    std::process::exit(0);
}

fn just_updated_path() -> PathBuf {
    paths::data_dir().join("just_updated.txt")
}

fn last_version_path() -> PathBuf {
    paths::data_dir().join("last_version.txt")
}

pub fn sync_version_on_startup() {
    let last_path = last_version_path();
    let previous = fs::read_to_string(&last_path).unwrap_or_default();
    let previous = previous.trim().to_string();

    if !previous.is_empty() && previous != CURRENT_VERSION {
        let content = format!("{}|{}", previous, CURRENT_VERSION);
        let _ = fs::write(just_updated_path(), &content);
        tracing::info!(
            old = %previous,
            new = CURRENT_VERSION,
            "app was updated"
        );
    }

    let _ = fs::write(&last_path, CURRENT_VERSION);
}

pub fn check_just_updated() -> Option<(String, String)> {
    let path = just_updated_path();
    let content = fs::read_to_string(&path).ok()?;
    let parts: Vec<&str> = content.trim().split('|').collect();
    if parts.len() == 2 {
        Some((parts[0].to_string(), parts[1].to_string()))
    } else {
        None
    }
}

pub fn clear_just_updated() {
    let _ = fs::remove_file(just_updated_path());
}

pub fn current_version() -> &'static str {
    CURRENT_VERSION
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_comparison() {
        assert!(is_newer("1.1.0", "1.0.0"));
        assert!(is_newer("2.0.0", "1.9.9"));
        assert!(is_newer("1.0.1", "1.0.0"));
        assert!(!is_newer("1.0.0", "1.0.0"));
        assert!(!is_newer("1.0.0", "1.1.0"));
        assert!(is_newer("v1.2.0", "1.1.0"));
    }
}
