use crate::models::{DailyTask, ExperienceEntry, Growth};
use anyhow::{ensure, Result};
use chrono::NaiveDate;
use rusqlite::{params, Connection, OptionalExtension, Transaction};

const TASKS: [(&str, &str, &str, i64); 2] = [
    (
        "check-in",
        "每日签到",
        "来看看今天的自己，点击签到即可完成。",
        10,
    ),
    (
        "write-note",
        "每日记笔记",
        "新写或修改一篇非空笔记正文，保存成功后自动完成。",
        30,
    ),
];
pub const XP_PER_LEVEL: i64 = 100;

pub fn award(tx: &Transaction<'_>, day: NaiveDate, task: &str) -> Result<i64> {
    let xp = TASKS.iter().find(|t| t.0 == task).map(|t| t.3);
    let xp = xp.ok_or_else(|| anyhow::anyhow!("未知的每日任务"))?;
    let added = tx.execute(
        "INSERT INTO experience_events(day,task,xp,completed_at) VALUES (?1,?2,?3,?4) ON CONFLICT(day,task) DO NOTHING",
        params![day.to_string(), task, xp, crate::store::now()],
    )?;
    Ok(if added == 1 { xp } else { 0 })
}

pub fn snapshot(db: &Connection, day: NaiveDate) -> Result<Growth> {
    let total_xp: i64 = db.query_row(
        "SELECT COALESCE(SUM(xp),0) FROM experience_events",
        [],
        |r| r.get(0),
    )?;
    let day = day.to_string();
    let today_xp = db.query_row(
        "SELECT COALESCE(SUM(xp),0) FROM experience_events WHERE day=?1",
        [&day],
        |r| r.get(0),
    )?;
    let tasks = TASKS
        .iter()
        .map(|(id, name, description, xp)| {
            Ok(DailyTask {
                id: (*id).into(),
                name: (*name).into(),
                description: (*description).into(),
                xp: *xp,
                completed_at: db
                    .query_row(
                        "SELECT completed_at FROM experience_events WHERE day=?1 AND task=?2",
                        params![day, id],
                        |r| r.get(0),
                    )
                    .optional()?,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let history = db.prepare("SELECT day,task,xp,completed_at FROM experience_events ORDER BY day DESC,completed_at DESC,task LIMIT 30")?
        .query_map([], |r| Ok(ExperienceEntry { day:r.get(0)?, task:r.get(1)?, xp:r.get(2)?, completed_at:r.get(3)? }))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(Growth {
        day,
        total_xp,
        level: total_xp / XP_PER_LEVEL + 1,
        level_xp: total_xp % XP_PER_LEVEL,
        next_level_xp: XP_PER_LEVEL,
        today_xp,
        tasks,
        history,
    })
}

pub fn validate(db: &Connection) -> Result<()> {
    // Preparing this statement also verifies the actual uniqueness constraint.
    // Column names alone are not sufficient for a safely restorable ledger.
    db.prepare("INSERT INTO experience_events(day,task,xp,completed_at) VALUES (?1,?2,?3,?4) ON CONFLICT(day,task) DO NOTHING")?;
    let mut query = db.prepare("SELECT day,task,xp,completed_at FROM experience_events")?;
    let rows = query.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, i64>(2)?,
            r.get::<_, String>(3)?,
        ))
    })?;
    for row in rows {
        let (day, task, xp, completed_at) = row?;
        let date = NaiveDate::parse_from_str(&day, "%Y-%m-%d")?;
        ensure!(date.to_string() == day, "经验记录日期无效");
        ensure!(
            TASKS.iter().any(|t| t.0 == task && t.3 == xp),
            "经验记录奖励无效"
        );
        chrono::DateTime::parse_from_rfc3339(&completed_at)?;
    }
    ensure!(
        !db.prepare("SELECT 1 FROM experience_events GROUP BY day,task HAVING COUNT(*)>1")?
            .exists([])?,
        "经验记录重复"
    );
    Ok(())
}
