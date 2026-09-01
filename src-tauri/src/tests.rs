use super::{models::*, store::Store};
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::Connection;
use std::{
    fs,
    io::{Read, Write},
    path::Path,
};
use tempfile::TempDir;
use uuid::Uuid;
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

fn setup() -> (TempDir, Store) {
    let temp = TempDir::new().unwrap();
    let store = Store::open(temp.path().join("枝序数据")).unwrap();
    (temp, store)
}

fn day_one() -> chrono::NaiveDate {
    chrono::NaiveDate::from_ymd_opt(2026, 9, 1).unwrap()
}
fn day_two() -> chrono::NaiveDate {
    day_one().succ_opt().unwrap()
}
fn day_three() -> chrono::NaiveDate {
    day_two().succ_opt().unwrap()
}

#[test]
fn daily_check_in_is_idempotent_across_restarts_and_clock_rollback() {
    let (_temp, mut store) = setup();
    store.today = day_one;
    let first = store.mutate(Mutation::CheckIn).unwrap();
    assert_eq!(first.xp_earned, 10);
    let earned_at = first.growth.tasks[0].completed_at.clone();
    assert_eq!(store.mutate(Mutation::CheckIn).unwrap().xp_earned, 0);
    let mut reopened = Store::open(store.root.clone()).unwrap();
    reopened.today = day_one;
    let repeated = reopened.mutate(Mutation::CheckIn).unwrap();
    assert_eq!(repeated.growth.total_xp, 10);
    assert_eq!(repeated.growth.tasks[0].completed_at, earned_at);
    reopened.today = day_two;
    let tomorrow = reopened.snapshot(vec![]).unwrap();
    assert_eq!(tomorrow.growth.today_xp, 0);
    assert!(tomorrow
        .growth
        .tasks
        .iter()
        .all(|t| t.completed_at.is_none()));
    assert_eq!(reopened.mutate(Mutation::CheckIn).unwrap().xp_earned, 10);
    reopened.today = day_one;
    let rolled_back = reopened.mutate(Mutation::CheckIn).unwrap();
    assert_eq!(rolled_back.xp_earned, 0);
    assert_eq!(rolled_back.growth.total_xp, 20);
}

#[test]
fn daily_writing_requires_changed_nonempty_body_and_is_once_per_day() {
    let (_temp, mut store) = setup();
    store.today = day_one;
    let mut note = input();
    note.body = " \n".into();
    assert_eq!(store.save_note(note.clone()).unwrap().xp_earned, 0);
    note.revision += 1;
    note.body = "今天写下的想法".into();
    assert_eq!(store.save_note(note.clone()).unwrap().xp_earned, 30);
    assert_eq!(store.save_note(input()).unwrap().xp_earned, 0);
    store.today = day_two;
    note.revision += 1;
    note.title = "只改标题".into();
    note.favorite = true;
    assert_eq!(store.save_note(note.clone()).unwrap().xp_earned, 0);
    note.revision += 1;
    note.body.push_str("  \n");
    assert_eq!(store.save_note(note.clone()).unwrap().xp_earned, 0);
    note.revision += 1;
    note.body.push_str("第二天继续补充。");
    let tomorrow = store.save_note(note.clone()).unwrap();
    assert_eq!(tomorrow.xp_earned, 30);
    assert_eq!(tomorrow.growth.total_xp, 60);
    assert_eq!(tomorrow.growth.today_xp, 30);
    // A stale revision cannot commit either content or experience.
    store.today = day_three;
    assert!(store.save_note(note).is_err());
    assert_eq!(store.snapshot(vec![]).unwrap().growth.today_xp, 0);
}

#[test]
fn deletion_and_restore_do_not_erase_or_award_experience() {
    let (_temp, mut store) = setup();
    store.today = day_one;
    let note = input();
    store.save_note(note.clone()).unwrap();
    store.today = day_two;
    store
        .mutate(Mutation::TrashNote {
            id: note.id.clone(),
        })
        .unwrap();
    let restored = store
        .mutate(Mutation::RestoreNote {
            id: note.id.clone(),
        })
        .unwrap();
    assert_eq!(restored.growth.total_xp, 30);
    assert_eq!(restored.growth.today_xp, 0);
    store
        .mutate(Mutation::TrashNote {
            id: note.id.clone(),
        })
        .unwrap();
    let deleted = store.mutate(Mutation::DeleteNote { id: note.id }).unwrap();
    assert_eq!(deleted.growth.history.len(), 1);
    assert_eq!(deleted.growth.total_xp, 30);
}

#[test]
fn levels_change_at_the_exact_experience_boundary_without_deducting_total() {
    let (_temp, mut store) = setup();
    store.today = day_one;
    store.mutate(Mutation::CheckIn).unwrap();
    store.save_note(input()).unwrap();
    store.today = day_two;
    store.mutate(Mutation::CheckIn).unwrap();
    store.save_note(input()).unwrap();
    store.today = day_three;
    let before = store.mutate(Mutation::CheckIn).unwrap();
    assert_eq!((before.growth.level, before.growth.level_xp), (1, 90));
    let after = store.save_note(input()).unwrap();
    assert_eq!(
        (
            after.growth.total_xp,
            after.growth.level,
            after.growth.level_xp
        ),
        (120, 2, 20)
    );
    // Independent boundary check for the projection of a valid ledger.
    let db = store.connection().unwrap();
    db.execute(
        "DELETE FROM experience_events WHERE task='check-in' AND day<>?1",
        [day_three().to_string()],
    )
    .unwrap();
    let boundary = store.snapshot(vec![]).unwrap();
    assert_eq!(
        (
            boundary.growth.total_xp,
            boundary.growth.level,
            boundary.growth.level_xp
        ),
        (100, 2, 0)
    );
}

#[test]
fn experience_failure_rolls_back_note_count_and_badge_in_the_same_transaction() {
    let (_temp, mut store) = setup();
    store.connection().unwrap().execute_batch("CREATE TRIGGER fail_xp BEFORE INSERT ON experience_events BEGIN SELECT RAISE(ABORT,'experience write failed'); END;").unwrap();
    assert!(store.save_note(input()).is_err());
    assert!(store.mutate(Mutation::CheckIn).is_err());
    let data = store.snapshot(vec![]).unwrap();
    assert!(data.notes.is_empty());
    assert_eq!(data.written_count, 0);
    assert_eq!(data.growth.total_xp, 0);
    assert!(data.achievements.iter().all(|a| a.unlocked_at.is_none()));
    store
        .connection()
        .unwrap()
        .execute_batch("DROP TRIGGER fail_xp")
        .unwrap();
    assert_eq!(store.save_note(input()).unwrap().xp_earned, 30);
}

#[test]
fn experience_roundtrip_preserves_daily_awards_and_old_backup_migrates() {
    let (temp, mut store) = setup();
    store.today = day_one;
    store.mutate(Mutation::CheckIn).unwrap();
    store.save_note(input()).unwrap();
    let backup = temp.path().join("growth.zhixu");
    store.create_backup(&backup).unwrap();
    store.today = day_two;
    store.mutate(Mutation::CheckIn).unwrap();
    store.restore_backup(&backup).unwrap();
    store.today = day_one;
    let restored = store.mutate(Mutation::CheckIn).unwrap();
    assert_eq!((restored.growth.total_xp, restored.xp_earned), (40, 0));
    assert_eq!(restored.growth.history.len(), 2);
    // Recreate a real V1 database/manifest, not just a changed version label.
    store
        .connection()
        .unwrap()
        .execute_batch("DROP TABLE experience_events; PRAGMA user_version=1;")
        .unwrap();
    let old_backup = temp.path().join("v1.zhixu");
    store.create_backup(&old_backup).unwrap();
    store.restore_backup(&old_backup).unwrap();
    let legacy = store.snapshot(vec![]).unwrap();
    assert_eq!(legacy.notes.len(), 1);
    assert_eq!(legacy.written_count, 1);
    assert_eq!(legacy.growth.total_xp, 0);
}

#[test]
fn v1_upgrade_backs_up_original_data_without_backfilling_experience() {
    let (_temp, mut store) = setup();
    store.save_note(input()).unwrap();
    store
        .connection()
        .unwrap()
        .execute_batch("DROP TABLE experience_events; PRAGMA user_version=1;")
        .unwrap();
    let upgraded = Store::open(store.root.clone()).unwrap();
    let data = upgraded.snapshot(vec![]).unwrap();
    assert_eq!(data.notes.len(), 1);
    assert_eq!(data.written_count, 1);
    assert_eq!(data.growth.level, 1);
    assert_eq!(data.growth.total_xp, 0);
    assert!(data
        .backups
        .iter()
        .any(|b| b.name.starts_with("migration-")));
}

#[test]
fn failed_v2_migration_keeps_v1_schema_and_data_intact() {
    let (_temp, mut store) = setup();
    store.save_note(input()).unwrap();
    let mut db = store.connection().unwrap();
    db.execute_batch("DROP TABLE experience_events; PRAGMA user_version=1; CREATE TABLE experience_events (sentinel TEXT); INSERT INTO experience_events VALUES ('keep');").unwrap();
    assert!(Store::migrate(&mut db).is_err());
    assert_eq!(
        db.pragma_query_value::<i64, _>(None, "user_version", |r| r.get(0))
            .unwrap(),
        1
    );
    assert_eq!(
        db.query_row::<String, _, _>("SELECT sentinel FROM experience_events", [], |r| r.get(0))
            .unwrap(),
        "keep"
    );
    assert_eq!(
        db.query_row::<i64, _, _>("SELECT COUNT(*) FROM notes", [], |r| r.get(0))
            .unwrap(),
        1
    );
}

#[test]
fn invalid_experience_backups_never_replace_live_data() {
    let (_temp, mut live) = setup();
    live.save_note(input()).unwrap();
    for missing_unique in [false, true] {
        let (archive_dir, source) = setup();
        let db = source.connection().unwrap();
        if missing_unique {
            db.execute_batch("DROP TABLE experience_events; CREATE TABLE experience_events(day TEXT,task TEXT,xp INTEGER,completed_at TEXT);").unwrap();
        } else {
            db.execute("INSERT INTO experience_events VALUES ('2026-13-01','check-in',10,'2026-09-01T00:00:00Z')", []).unwrap();
        }
        drop(db);
        let backup = archive_dir.path().join("invalid-experience.zhixu");
        source.create_backup(&backup).unwrap();
        assert!(live.restore_backup(&backup).is_err());
        let unchanged = live.snapshot(vec![]).unwrap();
        assert_eq!(unchanged.growth.total_xp, 30);
        assert_eq!(unchanged.notes.len(), 1);
    }
}
fn input() -> NoteInput {
    NoteInput {
        id: Uuid::new_v4().to_string(),
        title: "中文标题".into(),
        body: "记录知识".into(),
        folder_id: None,
        tags: vec!["学习".into()],
        favorite: false,
        revision: 0,
    }
}
fn achievement(mode: &str, target: i64) -> AchievementInput {
    AchievementInput {
        id: None,
        name: "我的目标".into(),
        description: "记录进展".into(),
        badge: "star".into(),
        mode: mode.into(),
        target,
        unit: "次".into(),
    }
}

#[test]
fn counting_and_unlocks_are_idempotent_across_deletion_and_restarts() {
    let (temp, mut store) = setup();
    let mut note = input();
    note.body = " \n ".into();
    let empty = store.save_note(note.clone()).unwrap();
    assert_eq!(empty.written_count, 0);
    note.revision = 1;
    note.body = "正文".into();
    let first = store.save_note(note.clone()).unwrap();
    assert_eq!(first.written_count, 1);
    assert_eq!(first.unlocked, vec!["builtin-notes-1"]);
    let award = first.achievements[0].unlocked_at.clone();
    note.revision = 2;
    let again = store.save_note(note.clone()).unwrap();
    assert_eq!(again.written_count, 1);
    assert!(again.unlocked.is_empty());
    store
        .mutate(Mutation::TrashNote {
            id: note.id.clone(),
        })
        .unwrap();
    store
        .mutate(Mutation::RestoreNote {
            id: note.id.clone(),
        })
        .unwrap();
    store
        .mutate(Mutation::TrashNote {
            id: note.id.clone(),
        })
        .unwrap();
    let deleted = store
        .mutate(Mutation::DeleteNote {
            id: note.id.clone(),
        })
        .unwrap();
    assert_eq!(deleted.written_count, 1);
    drop(store);
    let reopened = Store::open(temp.path().join("枝序数据")).unwrap();
    let data = reopened.snapshot(vec![]).unwrap();
    assert!(data.notes.is_empty());
    assert_eq!(data.written_count, 1);
    assert_eq!(data.achievements[0].unlocked_at, award);
}
#[test]
fn stale_writes_never_replace_newer_content() {
    let (_temp, mut store) = setup();
    let note = input();
    store.save_note(note.clone()).unwrap();
    assert!(store.save_note(note).is_err());
    assert_eq!(store.snapshot(vec![]).unwrap().notes[0].body, "记录知识");
}
#[test]
fn failed_achievement_update_rolls_back_note_and_ledger() {
    let (_temp, mut store) = setup();
    store.connection().unwrap().execute_batch("CREATE TRIGGER test_failure BEFORE UPDATE ON achievements BEGIN SELECT RAISE(ABORT,'injected failure'); END;").unwrap();
    assert!(store.save_note(input()).is_err());
    let data = store.snapshot(vec![]).unwrap();
    assert!(data.notes.is_empty());
    assert_eq!(data.written_count, 0);
}
#[test]
fn manual_progress_completion_undo_and_builtin_protection() {
    let (_temp, mut store) = setup();
    let data = store
        .mutate(Mutation::SaveAchievement {
            achievement: achievement("counter", 3),
        })
        .unwrap();
    let id = data
        .achievements
        .iter()
        .find(|a| !a.builtin)
        .unwrap()
        .id
        .clone();
    let earned = store
        .mutate(Mutation::SetProgress {
            id: id.clone(),
            progress: 3,
        })
        .unwrap();
    assert_eq!(earned.unlocked, vec![id.clone()]);
    let duplicate = store
        .mutate(Mutation::SetProgress {
            id: id.clone(),
            progress: 3,
        })
        .unwrap();
    assert!(duplicate.unlocked.is_empty());
    let undo = store
        .mutate(Mutation::SetProgress {
            id: id.clone(),
            progress: 1,
        })
        .unwrap();
    assert!(undo
        .achievements
        .iter()
        .find(|a| a.id == id)
        .unwrap()
        .unlocked_at
        .is_none());
    assert!(store
        .mutate(Mutation::SetProgress { id, progress: 4 })
        .is_err());
    assert!(store
        .mutate(Mutation::DeleteAchievement {
            id: "builtin-notes-1".into()
        })
        .is_err());
    assert!(store
        .mutate(Mutation::SetProgress {
            id: "builtin-notes-1".into(),
            progress: 1
        })
        .is_err());
}
#[test]
fn new_auto_achievement_uses_existing_history() {
    let (_temp, mut store) = setup();
    store.save_note(input()).unwrap();
    let data = store
        .mutate(Mutation::SaveAchievement {
            achievement: achievement("auto", 1),
        })
        .unwrap();
    let added = data.achievements.iter().find(|a| !a.builtin).unwrap();
    assert!(added.unlocked_at.is_some());
    assert_eq!(added.progress, 1);
}
#[test]
fn deleting_folder_preserves_notes_tags_and_favorites() {
    let (_temp, mut store) = setup();
    let data = store
        .mutate(Mutation::SaveFolder {
            id: None,
            name: "学习".into(),
        })
        .unwrap();
    let id = data.folders[0].id.clone();
    let mut note = input();
    note.folder_id = Some(id.clone());
    note.favorite = true;
    store.save_note(note).unwrap();
    let data = store.mutate(Mutation::DeleteFolder { id }).unwrap();
    assert!(data.notes[0].folder_id.is_none());
    assert!(data.notes[0].favorite);
    assert_eq!(data.notes[0].tags, vec!["学习"]);
    assert_eq!(data.notes[0].revision, 2);
}
#[test]
fn full_backup_roundtrip_includes_images_and_settings() {
    let (temp, mut store) = setup();
    let note = input();
    store.save_note(note.clone()).unwrap();
    let bytes = b"\x89PNG\r\n\x1a\nfixture";
    let image = store
        .import_image(note.id.clone(), STANDARD.encode(bytes))
        .unwrap();
    store
        .mutate(Mutation::SaveSettings {
            settings: Settings {
                theme: "dark".into(),
                celebrations: false,
            },
        })
        .unwrap();
    let backup = temp.path().join("完整备份.zhixu");
    store.create_backup(&backup).unwrap();
    let mut later = note.clone();
    later.revision = 1;
    later.body = "later content".into();
    store.save_note(later).unwrap();
    fs::remove_file(store.content().join(&image.markdown_path)).unwrap();
    store.restore_backup(&backup).unwrap();
    let data = store.snapshot(vec![]).unwrap();
    assert_eq!(data.notes[0].body, note.body);
    assert_eq!(data.settings.theme, "dark");
    assert!(!data.settings.celebrations);
    assert_eq!(
        fs::read(store.content().join(image.markdown_path)).unwrap(),
        bytes
    );
    assert!(data
        .backups
        .iter()
        .any(|b| b.name.starts_with("before-restore-")));
    assert_eq!(data.written_count, 1);
}

fn alter_archive(
    source: &Path,
    destination: &Path,
    alter: impl Fn(&str, Vec<u8>) -> Vec<u8>,
    extra: Option<(&str, &[u8])>,
) {
    let mut archive = ZipArchive::new(fs::File::open(source).unwrap()).unwrap();
    let mut writer = ZipWriter::new(fs::File::create(destination).unwrap());
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).unwrap();
        let name = entry.name().to_string();
        let mut data = vec![];
        entry.read_to_end(&mut data).unwrap();
        writer
            .start_file(&name, SimpleFileOptions::default())
            .unwrap();
        writer.write_all(&alter(&name, data)).unwrap();
    }
    if let Some((name, data)) = extra {
        writer
            .start_file(name, SimpleFileOptions::default())
            .unwrap();
        writer.write_all(data).unwrap();
    }
    writer.finish().unwrap();
}
#[test]
fn corrupt_or_newer_backups_never_replace_live_data() {
    let (temp, mut store) = setup();
    store.save_note(input()).unwrap();
    let original = temp.path().join("original.zhixu");
    store.create_backup(&original).unwrap();
    let corrupt = temp.path().join("corrupt.zhixu");
    alter_archive(
        &original,
        &corrupt,
        |name, mut data| {
            if name == "growlog.sqlite" {
                data[30] ^= 0xff;
            }
            data
        },
        None,
    );
    assert!(store.restore_backup(&corrupt).is_err());
    assert_eq!(store.snapshot(vec![]).unwrap().written_count, 1);
    let future = temp.path().join("future.zhixu");
    alter_archive(
        &original,
        &future,
        |name, data| {
            if name == "manifest.json" {
                let mut m: serde_json::Value = serde_json::from_slice(&data).unwrap();
                m["schemaVersion"] = 999.into();
                serde_json::to_vec(&m).unwrap()
            } else {
                data
            }
        },
        None,
    );
    assert!(store.restore_backup(&future).is_err());
    assert_eq!(store.snapshot(vec![]).unwrap().notes[0].body, "记录知识");
}
#[test]
fn malicious_archive_paths_are_rejected() {
    let (temp, mut store) = setup();
    store.save_note(input()).unwrap();
    let original = temp.path().join("original.zhixu");
    store.create_backup(&original).unwrap();
    let malicious = temp.path().join("malicious.zhixu");
    alter_archive(
        &original,
        &malicious,
        |_, d| d,
        Some(("../escaped.txt", b"no")),
    );
    assert!(store.restore_backup(&malicious).is_err());
    assert!(!store.root.join("escaped.txt").exists());
    assert_eq!(store.snapshot(vec![]).unwrap().written_count, 1);
}
#[test]
fn migration_is_transactional_and_does_not_drop_existing_tables() {
    let mut db = Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE notes (body TEXT); INSERT INTO notes VALUES ('preserve me');")
        .unwrap();
    assert!(Store::migrate(&mut db).is_err());
    assert_eq!(
        db.query_row::<String, _, _>("SELECT body FROM notes", [], |r| r.get(0))
            .unwrap(),
        "preserve me"
    );
    assert_eq!(
        db.pragma_query_value::<i64, _>(None, "user_version", |r| r.get(0))
            .unwrap(),
        0
    );
    assert!(!db
        .prepare("SELECT 1 FROM sqlite_master WHERE name='folders'")
        .unwrap()
        .exists([])
        .unwrap());
}
#[test]
fn migration_is_repeatable_and_future_database_is_rejected() {
    let (temp, store) = setup();
    let mut db = store.connection().unwrap();
    Store::migrate(&mut db).unwrap();
    Store::migrate(&mut db).unwrap();
    assert_eq!(
        db.query_row::<i64, _, _>("SELECT COUNT(*) FROM achievements", [], |r| r.get(0))
            .unwrap(),
        4
    );
    db.pragma_update(None, "user_version", 999).unwrap();
    drop(db);
    drop(store);
    assert!(Store::open(temp.path().join("枝序数据")).is_err());
    let db = Connection::open(temp.path().join("枝序数据/content/growlog.sqlite")).unwrap();
    assert_eq!(
        db.pragma_query_value::<i64, _>(None, "user_version", |r| r.get(0))
            .unwrap(),
        999
    );
}
#[test]
fn interrupted_restore_directory_swap_recovers_old_data() {
    let (temp, mut store) = setup();
    store.save_note(input()).unwrap();
    fs::rename(store.content(), store.root.join("restore-previous")).unwrap();
    drop(store);
    let store = Store::open(temp.path().join("枝序数据")).unwrap();
    assert_eq!(store.snapshot(vec![]).unwrap().notes.len(), 1);
}
#[test]
fn daily_backup_is_once_per_day_and_keeps_seven_automatic_archives() {
    let (_temp, mut store) = setup();
    for day in 1..=12 {
        fs::write(
            store
                .root
                .join("backups")
                .join(format!("auto-2000-01-{day:02}.zhixu")),
            b"old fixture",
        )
        .unwrap();
    }
    store.try_daily_backup();
    let before = store.list_backups().unwrap();
    store.try_daily_backup();
    let after = store.list_backups().unwrap();
    assert_eq!(before.len(), 7);
    assert_eq!(after.len(), 7);
    assert!(store.backup_warning.is_none());
}
#[test]
fn rejects_non_image_content_and_invalid_note_foreign_keys() {
    let (_temp, mut store) = setup();
    let mut note = input();
    store.save_note(note.clone()).unwrap();
    assert!(store
        .import_image(
            note.id.clone(),
            STANDARD.encode(b"<svg><script>bad</script></svg>")
        )
        .is_err());
    note.revision = 1;
    note.folder_id = Some("missing-folder".into());
    assert!(store.save_note(note).is_err());
    assert_eq!(store.snapshot(vec![]).unwrap().notes[0].revision, 1);
}

#[test]
fn invalid_settings_in_an_otherwise_valid_backup_do_not_replace_data() {
    let (source_temp, source) = setup();
    source
        .connection()
        .unwrap()
        .execute(
            "INSERT INTO settings(key,value) VALUES ('preferences','not-json')",
            [],
        )
        .unwrap();
    let backup = source_temp.path().join("invalid-settings.zhixu");
    source.create_backup(&backup).unwrap();
    let (_target_temp, mut target) = setup();
    target.save_note(input()).unwrap();
    assert!(target.restore_backup(&backup).is_err());
    assert_eq!(target.snapshot(vec![]).unwrap().notes[0].title, "中文标题");
}

#[test]
fn built_in_milestones_are_in_numeric_order() {
    let (_temp, store) = setup();
    assert_eq!(
        store
            .snapshot(vec![])
            .unwrap()
            .achievements
            .iter()
            .map(|a| a.target)
            .collect::<Vec<_>>(),
        vec![1, 10, 50, 100]
    );
}
