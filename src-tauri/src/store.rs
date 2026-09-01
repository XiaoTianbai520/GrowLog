use crate::models::*;
use anyhow::{bail, ensure, Context, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::{Local, NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};
use uuid::Uuid;

pub const SCHEMA_VERSION: i64 = 2;
pub fn now() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
pub fn valid_id(id: &str) -> Result<()> {
    Uuid::parse_str(id).context("无效的记录编号")?;
    Ok(())
}

pub struct Store {
    pub root: PathBuf,
    pub backup_warning: Option<String>,
    pub(crate) today: fn() -> NaiveDate,
}

/// Metrics are deliberately small: new tools can supply another metric here later.
pub trait MetricProvider {
    fn written_notes(&self) -> Result<i64>;
}
impl MetricProvider for Connection {
    fn written_notes(&self) -> Result<i64> {
        Ok(self.query_row("SELECT COUNT(*) FROM counted_notes", [], |r| r.get(0))?)
    }
}

impl Store {
    pub fn open(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(&root).context("无法创建数据目录")?;
        let content = root.join("content");
        let previous = root.join("restore-previous");
        // Recover an interrupted directory swap before opening any database.
        if !content.exists() && previous.exists() {
            fs::rename(&previous, &content)?;
        }
        fs::create_dir_all(content.join("attachments"))?;
        fs::create_dir_all(root.join("backups"))?;
        let mut store = Self {
            root,
            backup_warning: None,
            today: || Local::now().date_naive(),
        };
        let mut db = store.connection()?;
        let version: i64 = db.pragma_query_value(None, "user_version", |r| r.get(0))?;
        ensure!(
            version <= SCHEMA_VERSION,
            "数据来自较新的枝序版本，请升级软件；原数据未修改。"
        );
        let has_tables: i64 = db.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table'",
            [],
            |r| r.get(0),
        )?;
        if version < SCHEMA_VERSION && has_tables > 0 {
            drop(db);
            store.create_backup(
                &store
                    .root
                    .join("backups")
                    .join(format!("migration-{}.zhixu", Uuid::new_v4())),
            )?;
            db = store.connection()?;
        }
        Self::migrate(&mut db)?;
        Self::validate_database(&db)?;
        drop(db);
        store.try_daily_backup();
        Ok(store)
    }

    pub fn content(&self) -> PathBuf {
        self.root.join("content")
    }
    pub fn database(&self) -> PathBuf {
        self.content().join("growlog.sqlite")
    }
    pub fn connection(&self) -> Result<Connection> {
        let db = Connection::open(self.database()).context("无法打开笔记数据库")?;
        db.busy_timeout(Duration::from_secs(5))?;
        db.pragma_update(None, "foreign_keys", "ON")?;
        db.pragma_update(None, "synchronous", "FULL")?;
        Ok(db)
    }

    pub fn migrate(db: &mut Connection) -> Result<()> {
        let version: i64 = db.pragma_query_value(None, "user_version", |r| r.get(0))?;
        ensure!(
            version <= SCHEMA_VERSION,
            "备份版本比当前软件新，无法恢复。"
        );
        if version == SCHEMA_VERSION {
            return Ok(());
        }
        let tx = db.transaction()?;
        if version == 0 {
            tx.execute_batch(include_str!("schema.sql"))?;
            for (target, name, badge) in [
                (1, "第一篇笔记", "sprout"),
                (10, "十页微光", "book"),
                (50, "渐成枝叶", "branch"),
                (100, "自成一林", "award"),
            ] {
                tx.execute("INSERT INTO achievements (id,name,description,badge,mode,target,unit,builtin,created_at) VALUES (?1,?2,?3,?4,'auto',?5,'篇',1,?6)",
                    params![format!("builtin-notes-{target}"),name,format!("累计写成 {target} 篇笔记"),badge,target,now()])?;
            }
        }
        if version < 2 {
            tx.execute_batch(include_str!("migration_v2.sql"))?;
        }
        tx.pragma_update(None, "user_version", SCHEMA_VERSION)?;
        // Validate before committing so a malformed old database remains untouched.
        Self::validate_database(&tx)?;
        tx.commit()?;
        Ok(())
    }

    pub fn validate_database(db: &Connection) -> Result<()> {
        let integrity: String = db.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
        ensure!(integrity == "ok", "数据库完整性校验失败，原数据未修改。");
        let foreign_error = db.prepare("PRAGMA foreign_key_check")?.exists([])?;
        ensure!(!foreign_error, "数据库关联校验失败。");
        // Check the actual schema instead of trusting only user_version.
        db.prepare("SELECT n.id,n.title,n.body,n.folder_id,n.favorite,n.created_at,n.updated_at,n.deleted_at,n.revision,t.name FROM notes n LEFT JOIN note_tags nt ON nt.note_id=n.id LEFT JOIN tags t ON t.id=nt.tag_id")?;
        db.prepare("SELECT id,name,description,badge,mode,target,unit,progress,builtin,unlocked_at,created_at FROM achievements")?;
        db.prepare("SELECT id,name FROM folders")?;
        db.prepare("SELECT note_id,written_at FROM counted_notes")?;
        db.prepare("SELECT id,note_id,filename FROM attachments")?;
        db.prepare("SELECT key,value FROM settings")?;
        crate::growth::validate(db)?;
        let preferences: Option<String> = db
            .query_row(
                "SELECT value FROM settings WHERE key='preferences'",
                [],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(json) = preferences {
            let preferences: Settings =
                serde_json::from_str(&json).context("备份中的设置数据损坏")?;
            ensure!(
                ["light", "dark", "system"].contains(&preferences.theme.as_str()),
                "备份中的主题设置无效"
            );
        }
        Ok(())
    }

    pub fn snapshot(&self, unlocked: Vec<String>) -> Result<Snapshot> {
        let db = self.connection()?;
        let mut statement = db.prepare("SELECT id,title,body,folder_id,favorite,created_at,updated_at,deleted_at,revision FROM notes ORDER BY updated_at DESC,id")?;
        let mut notes: Vec<Note> = statement
            .query_map([], |r| {
                Ok(Note {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    body: r.get(2)?,
                    folder_id: r.get(3)?,
                    favorite: r.get(4)?,
                    created_at: r.get(5)?,
                    updated_at: r.get(6)?,
                    deleted_at: r.get(7)?,
                    revision: r.get(8)?,
                    tags: vec![],
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        for note in &mut notes {
            note.tags = db.prepare("SELECT t.name FROM tags t JOIN note_tags nt ON nt.tag_id=t.id WHERE nt.note_id=?1 ORDER BY t.name")?.query_map([&note.id], |r| r.get(0))?.collect::<rusqlite::Result<_>>()?;
        }
        let folders = db
            .prepare("SELECT id,name FROM folders ORDER BY name")?
            .query_map([], |r| {
                Ok(Folder {
                    id: r.get(0)?,
                    name: r.get(1)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        let tags = db
            .prepare(
                "SELECT name FROM tags WHERE id IN (SELECT tag_id FROM note_tags) ORDER BY name",
            )?
            .query_map([], |r| r.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        let achievements = db.prepare("SELECT id,name,description,badge,mode,target,unit,progress,builtin,unlocked_at,created_at FROM achievements ORDER BY builtin DESC,CASE WHEN builtin=1 THEN target ELSE 0 END,created_at,id")?.query_map([], |r| Ok(Achievement { id:r.get(0)?,name:r.get(1)?,description:r.get(2)?,badge:r.get(3)?,mode:r.get(4)?,target:r.get(5)?,unit:r.get(6)?,progress:r.get(7)?,builtin:r.get(8)?,unlocked_at:r.get(9)?,created_at:r.get(10)? }))?.collect::<rusqlite::Result<_>>()?;
        let setting: Option<String> = db
            .query_row(
                "SELECT value FROM settings WHERE key='preferences'",
                [],
                |r| r.get(0),
            )
            .optional()?;
        let settings = match setting {
            Some(s) => serde_json::from_str(&s).context("设置数据损坏")?,
            None => Settings::default(),
        };
        Ok(Snapshot {
            notes,
            folders,
            tags,
            achievements,
            settings,
            written_count: db.written_notes()?,
            data_dir: self.root.to_string_lossy().into(),
            attachment_dir: self.content().join("attachments").to_string_lossy().into(),
            backups: self.list_backups()?,
            backup_warning: self.backup_warning.clone(),
            unlocked,
            growth: crate::growth::snapshot(&db, (self.today)())?,
            xp_earned: 0,
        })
    }

    fn evaluate(tx: &Transaction<'_>) -> Result<Vec<String>> {
        let count = tx.written_notes()?;
        let unlocked: Vec<String> = tx.prepare("SELECT id FROM achievements WHERE mode='auto' AND unlocked_at IS NULL AND target<=?1")?.query_map([count], |r| r.get(0))?.collect::<rusqlite::Result<_>>()?;
        tx.execute(
            "UPDATE achievements SET progress=MIN(target,?1) WHERE mode='auto'",
            [count],
        )?;
        tx.execute("UPDATE achievements SET unlocked_at=?1 WHERE mode='auto' AND unlocked_at IS NULL AND target<=?2", params![now(),count])?;
        Ok(unlocked)
    }

    pub fn save_note(&mut self, input: NoteInput) -> Result<Snapshot> {
        valid_id(&input.id)?;
        ensure!(
            input.title.chars().count() <= 200,
            "标题不能超过 200 个字符"
        );
        ensure!(input.body.len() <= 5 * 1024 * 1024, "单篇笔记不能超过 5 MB");
        ensure!(input.tags.len() <= 30, "每篇笔记最多使用 30 个标签");
        let mut db = self.connection()?;
        let tx = db.transaction()?;
        let existing: Option<(i64, Option<String>, String)> = tx
            .query_row(
                "SELECT revision,deleted_at,body FROM notes WHERE id=?1",
                [&input.id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()?;
        let body_changed = existing
            .as_ref()
            .is_none_or(|(_, _, body)| body.trim() != input.body.trim());
        match existing {
            Some((revision, deleted, _)) => {
                ensure!(deleted.is_none(), "这篇笔记已进入回收站，请先恢复。");
                ensure!(
                    revision == input.revision,
                    "笔记版本已变化，未覆盖已有内容。请保留当前草稿后重新打开。"
                );
                tx.execute("UPDATE notes SET title=?1,body=?2,folder_id=?3,favorite=?4,updated_at=?5,revision=revision+1 WHERE id=?6",params![input.title.trim(),input.body,input.folder_id,input.favorite,now(),input.id])?;
            }
            None => {
                ensure!(input.revision == 0, "笔记已不存在，未重新创建。");
                tx.execute("INSERT INTO notes (id,title,body,folder_id,favorite,created_at,updated_at,revision) VALUES (?1,?2,?3,?4,?5,?6,?6,1)",params![input.id,input.title.trim(),input.body,input.folder_id,input.favorite,now()])?;
            }
        }
        tx.execute("DELETE FROM note_tags WHERE note_id=?1", [&input.id])?;
        for tag in &input.tags {
            let name = tag.trim();
            ensure!(
                !name.is_empty() && name.chars().count() <= 32,
                "标签需要 1–32 个字符"
            );
            tx.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", [name])?;
            tx.execute("INSERT OR IGNORE INTO note_tags (note_id,tag_id) SELECT ?1,id FROM tags WHERE name=?2", params![input.id,name])?;
        }
        if !input.body.trim().is_empty() {
            tx.execute(
                "INSERT OR IGNORE INTO counted_notes (note_id,written_at) VALUES (?1,?2)",
                params![input.id, now()],
            )?;
        }
        let unlocked = Self::evaluate(&tx)?;
        let xp_earned = if body_changed && !input.body.trim().is_empty() {
            crate::growth::award(&tx, (self.today)(), "write-note")?
        } else {
            0
        };
        tx.commit()?;
        drop(db);
        self.try_daily_backup();
        let mut snapshot = self.snapshot(unlocked)?;
        snapshot.xp_earned = xp_earned;
        Ok(snapshot)
    }

    pub fn mutate(&mut self, mutation: Mutation) -> Result<Snapshot> {
        let mut db = self.connection()?;
        let tx = db.transaction()?;
        let mut unlocked = vec![];
        let mut xp_earned = 0;
        match mutation {
            Mutation::CheckIn => {
                xp_earned = crate::growth::award(&tx, (self.today)(), "check-in")?;
            }
            Mutation::TrashNote { id } => {
                tx.execute("UPDATE notes SET deleted_at=?1,revision=revision+1 WHERE id=?2 AND deleted_at IS NULL",params![now(),id])?;
            }
            Mutation::RestoreNote { id } => {
                tx.execute("UPDATE notes SET deleted_at=NULL,revision=revision+1 WHERE id=?1 AND deleted_at IS NOT NULL",[id])?;
            }
            Mutation::DeleteNote { id } => {
                let deleted = tx.execute(
                    "DELETE FROM notes WHERE id=?1 AND deleted_at IS NOT NULL",
                    [id],
                )?;
                ensure!(deleted == 1, "只能永久删除回收站中的笔记。");
                // Keep attachment files: another Markdown note may still reference them.
            }
            Mutation::SaveFolder { id, name } => {
                let name = name.trim();
                ensure!(
                    !name.is_empty() && name.chars().count() <= 40,
                    "文件夹名称需要 1–40 个字符"
                );
                if let Some(id) = id {
                    ensure!(
                        tx.execute("UPDATE folders SET name=?1 WHERE id=?2", params![name, id])?
                            == 1,
                        "文件夹不存在"
                    );
                } else {
                    tx.execute(
                        "INSERT INTO folders (id,name) VALUES (?1,?2)",
                        params![Uuid::new_v4().to_string(), name],
                    )?;
                }
            }
            Mutation::DeleteFolder { id } => {
                // Deleting a folder preserves its notes and invalidates any stale editor copy.
                tx.execute(
                    "UPDATE notes SET folder_id=NULL,revision=revision+1 WHERE folder_id=?1",
                    [&id],
                )?;
                tx.execute("DELETE FROM folders WHERE id=?1", [id])?;
            }
            Mutation::SaveAchievement { achievement: a } => {
                ensure!(
                    !a.name.trim().is_empty() && a.name.chars().count() <= 60,
                    "成就名称需要 1–60 个字符"
                );
                ensure!(
                    a.description.chars().count() <= 500,
                    "描述不能超过 500 个字符"
                );
                ensure!(
                    ["sprout", "book", "branch", "award", "mountain", "star", "coffee", "heart"]
                        .contains(&a.badge.as_str()),
                    "请选择预设徽章"
                );
                ensure!(
                    ["auto", "once", "counter"].contains(&a.mode.as_str()),
                    "无效的完成方式"
                );
                ensure!(
                    a.target > 0 && a.target <= 1_000_000,
                    "目标需要是 1–1000000 的整数"
                );
                ensure!(a.unit.chars().count() <= 12, "单位不能超过 12 个字符");
                let target = if a.mode == "once" { 1 } else { a.target };
                let unit = if a.mode == "auto" {
                    "篇"
                } else {
                    a.unit.trim()
                };
                if let Some(id) = a.id {
                    let (builtin, old_mode, earned): (bool, String, Option<String>) = tx
                        .query_row(
                            "SELECT builtin,mode,unlocked_at FROM achievements WHERE id=?1",
                            [&id],
                            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                        )?;
                    ensure!(!builtin, "内置成就不可修改");
                    // Changing a rule starts a fresh goal; ordinary text edits retain its award date.
                    let old_target: i64 =
                        tx.query_row("SELECT target FROM achievements WHERE id=?1", [&id], |r| {
                            r.get(0)
                        })?;
                    let reset = old_mode != a.mode || old_target != target;
                    tx.execute("UPDATE achievements SET name=?1,description=?2,badge=?3,mode=?4,target=?5,unit=?6,progress=CASE WHEN ?7 THEN 0 ELSE progress END,unlocked_at=?8 WHERE id=?9",params![a.name.trim(),a.description.trim(),a.badge,a.mode,target,unit,reset,if reset {None} else {earned},id])?;
                } else {
                    tx.execute("INSERT INTO achievements (id,name,description,badge,mode,target,unit,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",params![Uuid::new_v4().to_string(),a.name.trim(),a.description.trim(),a.badge,a.mode,target,unit,now()])?;
                }
                unlocked = Self::evaluate(&tx)?;
            }
            Mutation::DeleteAchievement { id } => {
                ensure!(
                    tx.execute("DELETE FROM achievements WHERE id=?1 AND builtin=0", [id])? == 1,
                    "内置成就不可删除"
                );
            }
            Mutation::SetProgress { id, progress } => {
                let (mode, target, earned): (String, i64, Option<String>) = tx.query_row(
                    "SELECT mode,target,unlocked_at FROM achievements WHERE id=?1",
                    [&id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )?;
                ensure!(mode != "auto", "自动成就的进度由笔记记录计算");
                ensure!(
                    progress >= 0 && progress <= target,
                    "进度需要在 0 与目标值之间"
                );
                let award = if progress == target {
                    Some(earned.clone().unwrap_or_else(now))
                } else {
                    None
                };
                if earned.is_none() && award.is_some() {
                    unlocked.push(id.clone());
                }
                tx.execute(
                    "UPDATE achievements SET progress=?1,unlocked_at=?2 WHERE id=?3",
                    params![progress, award, id],
                )?;
            }
            Mutation::SaveSettings { settings } => {
                ensure!(
                    ["light", "dark", "system"].contains(&settings.theme.as_str()),
                    "无效主题"
                );
                tx.execute("INSERT INTO settings (key,value) VALUES ('preferences',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[serde_json::to_string(&settings)?])?;
            }
        }
        tx.commit()?;
        drop(db);
        self.try_daily_backup();
        let mut snapshot = self.snapshot(unlocked)?;
        snapshot.xp_earned = xp_earned;
        Ok(snapshot)
    }

    pub fn import_image(&mut self, note_id: String, data: String) -> Result<ImportedImage> {
        valid_id(&note_id)?;
        ensure!(data.len() <= 28 * 1024 * 1024, "图片不能超过 20 MB");
        let bytes = STANDARD.decode(data).context("无法读取图片内容")?;
        ensure!(bytes.len() <= 20 * 1024 * 1024, "图片不能超过 20 MB");
        let extension = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            "png"
        } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
            "jpg"
        } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
            "gif"
        } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
            "webp"
        } else {
            bail!("支持 PNG、JPEG、GIF 和 WebP 图片，不支持 SVG 或其他文件。");
        };
        let db = self.connection()?;
        ensure!(
            db.prepare("SELECT 1 FROM notes WHERE id=?1 AND deleted_at IS NULL")?
                .exists([&note_id])?,
            "请先保存笔记再插入图片"
        );
        let id = Uuid::new_v4().to_string();
        let filename = format!("{id}.{extension}");
        let path = self.content().join("attachments").join(&filename);
        let mut file = fs::File::create(&path)?;
        std::io::Write::write_all(&mut file, &bytes)?;
        file.sync_all()?;
        if let Err(error) = db.execute(
            "INSERT INTO attachments (id,note_id,filename) VALUES (?1,?2,?3)",
            params![id, note_id, filename],
        ) {
            let _ = fs::remove_file(path);
            return Err(error.into());
        }
        Ok(ImportedImage {
            markdown_path: format!("attachments/{filename}"),
        })
    }

    pub fn import_image_file(&mut self, note_id: String, path: &Path) -> Result<ImportedImage> {
        ensure!(
            fs::metadata(path)?.len() <= 20 * 1024 * 1024,
            "图片不能超过 20 MB"
        );
        self.import_image(note_id, STANDARD.encode(fs::read(path)?))
    }
}
