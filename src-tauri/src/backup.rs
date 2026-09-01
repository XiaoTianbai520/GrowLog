use crate::{
    models::BackupInfo,
    store::{now, Store, SCHEMA_VERSION},
};
use anyhow::{ensure, Context, Result};
use chrono::Local;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    fs::{self, File},
    io::{Read, Write},
    path::Path,
};
use uuid::Uuid;
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    sha256: String,
    size: u64,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    format_version: u32,
    schema_version: i64,
    created_at: String,
    files: BTreeMap<String, Entry>,
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

impl Store {
    pub fn list_backups(&self) -> Result<Vec<BackupInfo>> {
        let mut backups = vec![];
        for entry in fs::read_dir(self.root.join("backups"))? {
            let entry = entry?;
            if entry.path().extension().is_some_and(|e| e == "zhixu") {
                backups.push(BackupInfo {
                    name: entry.file_name().to_string_lossy().into(),
                    path: entry.path().to_string_lossy().into(),
                    size: entry.metadata()?.len(),
                });
            }
        }
        backups.sort_by(|a, b| b.name.cmp(&a.name));
        Ok(backups)
    }

    pub fn try_daily_backup(&mut self) {
        self.backup_warning = self
            .daily_backup()
            .err()
            .map(|e| format!("自动备份未完成：{e}。笔记仍保存在本机，请检查磁盘空间或手动导出。"));
    }

    fn daily_backup(&self) -> Result<()> {
        let name = format!("auto-{}.zhixu", Local::now().format("%Y-%m-%d"));
        let path = self.root.join("backups").join(name);
        if !path.exists() {
            self.create_backup(&path)?;
        }
        let autos: Vec<_> = self
            .list_backups()?
            .into_iter()
            .filter(|b| b.name.starts_with("auto-"))
            .collect();
        for old in autos.into_iter().skip(7) {
            fs::remove_file(old.path)?;
        }
        Ok(())
    }

    pub fn create_backup(&self, destination: &Path) -> Result<()> {
        ensure!(
            destination.extension().is_some_and(|x| x == "zhixu"),
            "备份文件需要使用 .zhixu 扩展名"
        );
        let parent = destination.parent().context("无效的备份位置")?;
        fs::create_dir_all(parent)?;
        let resolved_parent = fs::canonicalize(parent)?;
        ensure!(
            !resolved_parent.starts_with(fs::canonicalize(self.content())?),
            "不能把备份写入内部数据目录，请选择其他位置。"
        );
        // Never truncate a previous backup. Publish the fully synced archive only at the end.
        let temp = parent.join(format!(".backup-{}.tmp", Uuid::new_v4()));
        let sqlite_temp = self
            .root
            .join(format!(".snapshot-{}.sqlite", Uuid::new_v4()));
        let result = (|| -> Result<()> {
            let db = self.connection()?;
            db.backup(rusqlite::DatabaseName::Main, &sqlite_temp, None)?;
            let version: i64 = db.pragma_query_value(None, "user_version", |r| r.get(0))?;
            let mut manifest = Manifest {
                format_version: 1,
                schema_version: version,
                created_at: now(),
                files: BTreeMap::new(),
            };
            let mut writer = ZipWriter::new(File::create(&temp)?);
            let options =
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            let mut total_size = 0u64;
            let mut add = |name: String, path: &Path| -> Result<()> {
                total_size = total_size
                    .checked_add(fs::metadata(path)?.len())
                    .context("备份体积异常")?;
                ensure!(
                    total_size <= 2 * 1024 * 1024 * 1024,
                    "备份数据超过 V1 的 2 GB 上限，请先整理附件。"
                );
                ensure!(manifest.files.len() < 99_999, "备份文件数量超过 V1 上限");
                let data = fs::read(path)?;
                manifest.files.insert(
                    name.clone(),
                    Entry {
                        sha256: hash(&data),
                        size: data.len() as u64,
                    },
                );
                writer.start_file(name, options)?;
                writer.write_all(&data)?;
                Ok(())
            };
            add("growlog.sqlite".into(), &sqlite_temp)?;
            for file in fs::read_dir(self.content().join("attachments"))? {
                let file = file?;
                if file.file_type()?.is_file() {
                    add(
                        format!("attachments/{}", file.file_name().to_string_lossy()),
                        &file.path(),
                    )?;
                }
            }
            writer.start_file("manifest.json", options)?;
            writer.write_all(&serde_json::to_vec_pretty(&manifest)?)?;
            writer.finish()?.sync_all()?;
            // Windows rename cannot replace an existing destination. Preserve it until publication.
            let previous = parent.join(format!(".backup-old-{}.zhixu", Uuid::new_v4()));
            let had_previous = destination.exists();
            if had_previous {
                fs::rename(destination, &previous)
                    .context("无法替换备份文件，请关闭占用它的程序")?;
            }
            if let Err(error) = fs::rename(&temp, destination) {
                if had_previous {
                    let _ = fs::rename(&previous, destination);
                }
                return Err(error.into());
            }
            if had_previous {
                let _ = fs::remove_file(previous);
            }
            Ok(())
        })();
        let _ = fs::remove_file(&sqlite_temp);
        let _ = fs::remove_file(&temp);
        result.context("备份失败")
    }

    pub fn restore_backup(&mut self, source: &Path) -> Result<()> {
        let stage = self.root.join(format!(".restore-{}", Uuid::new_v4()));
        fs::create_dir_all(stage.join("attachments"))?;
        let result = (|| -> Result<()> {
            let mut archive = ZipArchive::new(File::open(source).context("无法打开备份文件")?)
                .context("这不是有效的枝序备份")?;
            ensure!(archive.len() <= 100_000, "备份包含过多文件");
            let manifest: Manifest = {
                let mut file = archive.by_name("manifest.json").context("备份缺少清单")?;
                ensure!(file.size() <= 16 * 1024 * 1024, "备份清单异常");
                let mut text = String::new();
                file.read_to_string(&mut text)?;
                serde_json::from_str(&text).context("备份清单损坏")?
            };
            ensure!(
                manifest.format_version == 1
                    && manifest.schema_version <= SCHEMA_VERSION
                    && manifest.schema_version >= 1,
                "备份来自不兼容或较新的版本，请升级软件。"
            );
            ensure!(
                manifest.files.contains_key("growlog.sqlite"),
                "备份缺少数据库"
            );
            let mut seen = HashSet::new();
            let mut total = 0u64;
            for i in 0..archive.len() {
                let mut entry = archive.by_index(i)?;
                let name = entry.name().to_string();
                ensure!(seen.insert(name.clone()), "备份包含重复文件");
                if name == "manifest.json" {
                    continue;
                }
                let safe_asset = name.strip_prefix("attachments/").is_some_and(|s| {
                    let Some((id, ext)) = s.rsplit_once('.') else {
                        return false;
                    };
                    Uuid::parse_str(id).is_ok() && ["png", "jpg", "gif", "webp"].contains(&ext)
                });
                ensure!(
                    name == "growlog.sqlite" || safe_asset,
                    "备份包含非法文件路径"
                );
                ensure!(
                    !entry.is_dir() && !entry.is_symlink(),
                    "备份包含不允许的文件类型"
                );
                let expected = manifest.files.get(&name).context("备份存在未登记文件")?;
                ensure!(entry.size() == expected.size, "备份文件长度校验失败");
                total = total.checked_add(entry.size()).context("备份体积异常")?;
                ensure!(total <= 2 * 1024 * 1024 * 1024, "备份解压后超过 2 GB");
                if safe_asset {
                    ensure!(entry.size() <= 20 * 1024 * 1024, "备份图片超过 20 MB");
                }
                let mut file = File::create(stage.join(&name))?;
                let mut digest = Sha256::new();
                let mut buffer = [0u8; 64 * 1024];
                let mut written = 0u64;
                loop {
                    let n = entry.read(&mut buffer)?;
                    if n == 0 {
                        break;
                    }
                    written += n as u64;
                    ensure!(written <= expected.size, "备份解压长度异常");
                    digest.update(&buffer[..n]);
                    file.write_all(&buffer[..n])?;
                }
                ensure!(
                    written == expected.size
                        && format!("{:x}", digest.finalize()) == expected.sha256,
                    "备份内容校验失败，原数据未修改。"
                );
                file.sync_all()?;
            }
            ensure!(seen.len() == manifest.files.len() + 1, "备份缺少文件");
            let mut restored = Connection::open(stage.join("growlog.sqlite"))?;
            let version: i64 = restored.pragma_query_value(None, "user_version", |r| r.get(0))?;
            ensure!(version == manifest.schema_version, "数据库版本与清单不符");
            Self::migrate(&mut restored)?;
            Self::validate_database(&restored)?;
            let mut statement = restored.prepare("SELECT filename FROM attachments")?;
            for filename in statement.query_map([], |r| r.get::<_, String>(0))? {
                let name = format!("attachments/{}", filename?);
                ensure!(
                    manifest.files.contains_key(&name),
                    "备份缺少数据库引用的图片"
                );
            }
            drop(statement);
            drop(restored);
            // All validation happens before touching live data.
            self.create_backup(&self.root.join("backups").join(format!(
                "before-restore-{}.zhixu",
                Local::now().format("%Y%m%d-%H%M%S-%f")
            )))?;
            let previous = self.root.join("restore-previous");
            if previous.exists() {
                fs::remove_dir_all(&previous)?;
            }
            fs::rename(self.content(), &previous)
                .context("无法切换数据目录，请关闭占用数据的程序")?;
            if let Err(error) = fs::rename(&stage, self.content()) {
                fs::rename(&previous, self.content())
                    .context("恢复中断：旧数据保留于 restore-previous，重启后会自动恢复")?;
                return Err(error.into());
            }
            // Keep restore-previous until the next successful restore for crash recovery.
            Ok(())
        })();
        if stage.exists() {
            let _ = fs::remove_dir_all(&stage);
        }
        result?;
        self.try_daily_backup();
        Ok(())
    }
}
