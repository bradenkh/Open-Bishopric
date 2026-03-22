CREATE TABLE IF NOT EXISTS scheduling_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    interview_id INTEGER NOT NULL REFERENCES interviews(id),
    bishopric_member_id INTEGER NOT NULL REFERENCES bishopric_members(id),
    proposed_times TEXT NOT NULL,        -- JSON list: ["2026-03-22 10:00","2026-03-22 11:00"]
    status TEXT NOT NULL DEFAULT 'pending_member',
    -- statuses: pending_member, confirmed, rejected
    confirmed_time TEXT,
    slack_message_ts TEXT,
    requested_by TEXT,                   -- slack_user_id of exec secretary
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
