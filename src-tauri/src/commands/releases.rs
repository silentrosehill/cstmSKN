//! Read the project's GitHub releases so the Windows preview can tell people about a newer build.
use std::time::Duration;

const RELEASES_URL: &str =
    "https://api.github.com/repos/silentrosehill/cstmSKN/releases?per_page=30";
const PAGE_PREFIX: &str = "https://github.com/silentrosehill/cstmSKN/releases/";

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    tag: String,
    url: String,
    notes: String,
    assets: Vec<String>,
}

fn parse(text: &str) -> Result<Vec<ReleaseInfo>, String> {
    let list: Vec<serde_json::Value> =
        serde_json::from_str(text).map_err(|_| "GitHub sent an unexpected answer.".to_string())?;
    Ok(list
        .iter()
        .filter(|r| !r["draft"].as_bool().unwrap_or(false))
        .filter_map(|r| {
            let url = r["html_url"].as_str()?;
            // Only ever hand the app a link to this project's own release pages.
            if !url.starts_with(PAGE_PREFIX) || url.chars().any(char::is_control) {
                return None;
            }
            Some(ReleaseInfo {
                tag: r["tag_name"].as_str()?.to_owned(),
                url: url.to_owned(),
                notes: r["body"]
                    .as_str()
                    .unwrap_or_default()
                    .chars()
                    .take(4000)
                    .collect(),
                assets: r["assets"]
                    .as_array()
                    .map(|a| {
                        a.iter()
                            .filter_map(|x| x["name"].as_str().map(str::to_owned))
                            .collect()
                    })
                    .unwrap_or_default(),
            })
        })
        .collect())
}

#[tauri::command]
pub async fn list_releases() -> Result<Vec<ReleaseInfo>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let agent = ureq::AgentBuilder::new()
            .timeout(Duration::from_secs(15))
            .redirects(0)
            .build();
        let text = agent
            .get(RELEASES_URL)
            .set("Accept", "application/vnd.github+json")
            .set("User-Agent", "cstmSKN")
            .call()
            .map_err(|_| "Couldn't reach GitHub. Check your connection and try again.".to_string())?
            .into_string()
            .map_err(|e| e.to_string())?;
        parse(&text)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn keeps_published_project_releases_only() {
        let text = r#"[
            {"tag_name":"v1.0.2-windows-alpha.1","html_url":"https://github.com/silentrosehill/cstmSKN/releases/tag/v1.0.2-windows-alpha.1","body":"Notes","draft":false,"assets":[{"name":"cstmSKN-Windows-x64-setup.exe"}]},
            {"tag_name":"v9.9.9","html_url":"https://github.com/silentrosehill/cstmSKN/releases/tag/v9.9.9","draft":true,"assets":[]},
            {"tag_name":"v9.9.8","html_url":"https://evil.example/releases/v9.9.8","draft":false,"assets":[]}
        ]"#;
        let releases = parse(text).unwrap();
        assert_eq!(releases.len(), 1);
        assert_eq!(releases[0].tag, "v1.0.2-windows-alpha.1");
        assert_eq!(releases[0].assets, vec!["cstmSKN-Windows-x64-setup.exe"]);
        assert!(parse("not json").is_err());
    }
}
