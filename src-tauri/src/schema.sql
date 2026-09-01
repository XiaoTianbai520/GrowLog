CREATE TABLE folders (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE notes (
 id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
 folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
 favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
 revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX notes_updated ON notes(updated_at DESC);
CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE note_tags (
 note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
 tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
 PRIMARY KEY(note_id,tag_id)
);
CREATE TABLE counted_notes (note_id TEXT PRIMARY KEY, written_at TEXT NOT NULL);
CREATE TABLE attachments (
 id TEXT PRIMARY KEY, note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
 filename TEXT NOT NULL UNIQUE
);
CREATE TABLE achievements (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 badge TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('auto','once','counter')),
 target INTEGER NOT NULL CHECK(target>0), unit TEXT NOT NULL DEFAULT '',
 progress INTEGER NOT NULL DEFAULT 0 CHECK(progress>=0 AND progress<=target),
 builtin INTEGER NOT NULL DEFAULT 0 CHECK(builtin IN (0,1)),
 unlocked_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
