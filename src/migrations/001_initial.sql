-- Full schema for ALMA database
-- This is the consolidated initial migration.

CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS interviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL REFERENCES members(id),
    interviewer_slack_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    -- statuses: pending, contacted, scheduled, completed, no_show, follow_up
    contacted_at TIMESTAMP,
    scheduled_at TIMESTAMP,
    completed_at TIMESTAMP,
    needs_follow_up INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL  -- slack_user_id of who added it
);

CREATE TABLE IF NOT EXISTS contact_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    interview_id INTEGER NOT NULL REFERENCES interviews(id),
    method TEXT NOT NULL,  -- 'email'
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_sent INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bishopric_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slack_id TEXT UNIQUE,            -- nullable, only set if the member uses Slack
    name TEXT NOT NULL,
    role TEXT NOT NULL,              -- 'bishop', 'first_counselor', 'second_counselor', 'exec_secretary'
    email TEXT,
    phone TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS availability_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bishopric_member_id INTEGER NOT NULL REFERENCES bishopric_members(id),
    day_of_week INTEGER NOT NULL,  -- 0=Monday..6=Sunday (Python weekday convention)
    block_time TEXT NOT NULL,       -- 'HH:MM' 24h format (e.g., '09:00', '09:15')
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bishopric_member_id, day_of_week, block_time)
);

CREATE INDEX IF NOT EXISTS idx_avail_member_day ON availability_blocks(bishopric_member_id, day_of_week);

CREATE TABLE IF NOT EXISTS availability_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bishopric_member_id INTEGER NOT NULL REFERENCES bishopric_members(id),
    start_date TEXT NOT NULL,  -- 'YYYY-MM-DD'
    end_date TEXT NOT NULL,    -- 'YYYY-MM-DD'
    reason TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
