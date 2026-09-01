export type Route = 'home' | 'notes' | 'daily' | 'achievements' | 'tools' | 'settings';
export type Theme = 'light' | 'dark' | 'system';
export interface NoteInput {
  id: string;
  title: string;
  body: string;
  folderId: string | null;
  tags: string[];
  favorite: boolean;
  revision: number;
}
export interface Note extends NoteInput {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface Folder {
  id: string;
  name: string;
}
export type BadgeName = 'sprout' | 'book' | 'branch' | 'award' | 'mountain' | 'star' | 'coffee' | 'heart';
export interface AchievementInput {
  id?: string;
  name: string;
  description: string;
  badge: BadgeName;
  mode: 'auto' | 'once' | 'counter';
  target: number;
  unit: string;
}
export interface Achievement extends Omit<AchievementInput, 'id'> {
  id: string;
  progress: number;
  builtin: boolean;
  unlockedAt: string | null;
  createdAt: string;
}
export interface Settings {
  theme: Theme;
  celebrations: boolean;
}
export interface BackupInfo {
  name: string;
  path: string;
  size: number;
}
export interface Snapshot {
  notes: Note[];
  folders: Folder[];
  tags: string[];
  achievements: Achievement[];
  settings: Settings;
  writtenCount: number;
  dataDir: string;
  attachmentDir: string;
  backups: BackupInfo[];
  backupWarning: string | null;
  unlocked: string[];
  growth: Growth;
  xpEarned: number;
}
export interface Growth {
  day: string;
  totalXp: number;
  level: number;
  levelXp: number;
  nextLevelXp: number;
  todayXp: number;
  tasks: {
    id: 'check-in' | 'write-note';
    name: string;
    description: string;
    xp: number;
    completedAt: string | null;
  }[];
  history: { day: string; task: 'check-in' | 'write-note'; xp: number; completedAt: string }[];
}
export type Mutation =
  | { kind: 'checkIn' }
  | { kind: 'trashNote' | 'restoreNote' | 'deleteNote'; id: string }
  | { kind: 'saveFolder'; id?: string; name: string }
  | { kind: 'deleteFolder'; id: string }
  | { kind: 'saveAchievement'; achievement: AchievementInput }
  | { kind: 'deleteAchievement'; id: string }
  | { kind: 'setProgress'; id: string; progress: number }
  | { kind: 'saveSettings'; settings: Settings };
