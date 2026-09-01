use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    pub body: String,
    pub folder_id: Option<String>,
    pub tags: Vec<String>,
    pub favorite: bool,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteInput {
    pub id: String,
    pub title: String,
    pub body: String,
    pub folder_id: Option<String>,
    pub tags: Vec<String>,
    pub favorite: bool,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Achievement {
    pub id: String,
    pub name: String,
    pub description: String,
    pub badge: String,
    pub mode: String,
    pub target: i64,
    pub unit: String,
    pub progress: i64,
    pub builtin: bool,
    pub unlocked_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AchievementInput {
    pub id: Option<String>,
    pub name: String,
    pub description: String,
    pub badge: String,
    pub mode: String,
    pub target: i64,
    pub unit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub celebrations: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            celebrations: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub notes: Vec<Note>,
    pub folders: Vec<Folder>,
    pub tags: Vec<String>,
    pub achievements: Vec<Achievement>,
    pub settings: Settings,
    pub written_count: i64,
    pub data_dir: String,
    pub attachment_dir: String,
    pub backups: Vec<BackupInfo>,
    pub backup_warning: Option<String>,
    pub unlocked: Vec<String>,
    pub growth: Growth,
    pub xp_earned: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExperienceEntry {
    pub day: String,
    pub task: String,
    pub xp: i64,
    pub completed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyTask {
    pub id: String,
    pub name: String,
    pub description: String,
    pub xp: i64,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Growth {
    pub day: String,
    pub total_xp: i64,
    pub level: i64,
    pub level_xp: i64,
    pub next_level_xp: i64,
    pub today_xp: i64,
    pub tasks: Vec<DailyTask>,
    pub history: Vec<ExperienceEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Mutation {
    CheckIn,
    TrashNote { id: String },
    RestoreNote { id: String },
    DeleteNote { id: String },
    SaveFolder { id: Option<String>, name: String },
    DeleteFolder { id: String },
    SaveAchievement { achievement: AchievementInput },
    DeleteAchievement { id: String },
    SetProgress { id: String, progress: i64 },
    SaveSettings { settings: Settings },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedImage {
    pub markdown_path: String,
}
