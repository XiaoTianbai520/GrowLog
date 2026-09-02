use std::path::Path;

use anyhow::ensure;

const MAX_MARKDOWN_BYTES: u64 = 5 * 1024 * 1024;
const MAX_TITLE_CHARS: usize = 200;

pub fn export_markdown(path: &Path, body: &str) -> anyhow::Result<()> {
    ensure!(!path.as_os_str().is_empty(), "导出路径不能为空");
    std::fs::write(path, body)?;
    Ok(())
}

pub fn import_markdown(path: &Path) -> anyhow::Result<(String, String)> {
    let extension = path
        .extension()
        .and_then(|name| name.to_str())
        .map(|name| name.to_ascii_lowercase())
        .unwrap_or_default();
    ensure!(
        extension == "md" || extension == "markdown",
        "只能导入 .md 或 .markdown 文件"
    );
    let metadata = std::fs::metadata(path)
        .map_err(|_| anyhow::anyhow!("无法读取文件，它可能已被移动或删除"))?;
    ensure!(
        metadata.len() <= MAX_MARKDOWN_BYTES,
        "Markdown 文件不能超过 5 MB"
    );
    let title: String = path
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .trim()
        .chars()
        .take(MAX_TITLE_CHARS)
        .collect();
    ensure!(!title.is_empty(), "文件名不能作为笔记标题");
    let bytes = std::fs::read(path)?;
    let body = String::from_utf8_lossy(&bytes).to_string();
    Ok((title, body))
}
