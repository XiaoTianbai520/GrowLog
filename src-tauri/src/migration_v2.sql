-- Each task can award experience once per local calendar day.
-- This ledger is independent of notes: deleting a note must not delete experience.
CREATE TABLE experience_events (
    day TEXT NOT NULL CHECK(length(day)=10),
    task TEXT NOT NULL CHECK(task IN ('check-in','write-note')),
    xp INTEGER NOT NULL CHECK((task='check-in' AND xp=10) OR (task='write-note' AND xp=30)),
    completed_at TEXT NOT NULL,
    PRIMARY KEY(day, task)
);
