-- Migration 003: Replace interviews/members with unified task system
-- Also adds email tracking tables for reply matching

-- Drop old tables (order matters for foreign keys)
DROP TABLE IF EXISTS scheduling_requests;
DROP TABLE IF EXISTS contact_log;
DROP TABLE IF EXISTS interviews;
DROP TABLE IF EXISTS members;

-- Tasks: the core unit of work
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_type TEXT NOT NULL,            -- 'schedule_interview', 'follow_up', 'contact', 'general'
    status TEXT NOT NULL DEFAULT 'active',
    -- statuses: active, waiting_reply, completed, cancelled
    summary TEXT NOT NULL,              -- "Schedule interview for John Doe with Bishop"
    context TEXT NOT NULL DEFAULT '{}', -- JSON workflow state
    created_by TEXT,                    -- slack_user_id
    notify_channel TEXT,                -- slack channel/DM to post updates to
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_type_status ON tasks(task_type, status);

-- Outbound emails: track what ALMA sent so replies can be matched
CREATE TABLE IF NOT EXISTS outbound_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id),
    message_id TEXT NOT NULL UNIQUE,    -- RFC 2822 Message-ID header value
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_preview TEXT,                  -- first 200 chars for context
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outbound_message_id ON outbound_emails(message_id);

-- Inbound emails: log all received replies
CREATE TABLE IF NOT EXISTS inbound_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,                    -- NULL if unmatched
    from_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    in_reply_to TEXT,                   -- In-Reply-To header
    references_header TEXT,             -- References header
    matched INTEGER DEFAULT 0,          -- 1 if successfully matched to a task
    processed INTEGER DEFAULT 0,        -- 1 if agent has processed it
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
