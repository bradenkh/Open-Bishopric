const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'todos.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    migrate(db);
  }
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace   TEXT    NOT NULL,
      task        TEXT    NOT NULL,
      added_by    TEXT    NOT NULL,
      assigned_to TEXT,
      priority    TEXT    NOT NULL DEFAULT 'normal',
      done        INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      done_at     TEXT
    )
  `);
}

// ── Queries ──────────────────────────────────────────────────────────────────

function addTodo(workspace, task, addedBy, assignedTo = null, priority = 'normal') {
  const stmt = getDb().prepare(`
    INSERT INTO todos (workspace, task, added_by, assigned_to, priority)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(workspace, task, addedBy, assignedTo, priority);
  return result.lastInsertRowid;
}

function getTodos(workspace, { includeDone = false } = {}) {
  const query = includeDone
    ? `SELECT * FROM todos WHERE workspace = ? ORDER BY done ASC, created_at DESC`
    : `SELECT * FROM todos WHERE workspace = ? AND done = 0 ORDER BY priority DESC, created_at DESC`;
  return getDb().prepare(query).all(workspace);
}

function getTodo(id, workspace) {
  return getDb().prepare('SELECT * FROM todos WHERE id = ? AND workspace = ?').get(id, workspace);
}

function markDone(id, workspace) {
  const result = getDb()
    .prepare(`UPDATE todos SET done = 1, done_at = datetime('now') WHERE id = ? AND workspace = ? AND done = 0`)
    .run(id, workspace);
  return result.changes > 0;
}

function deleteTodo(id, workspace) {
  const result = getDb()
    .prepare('DELETE FROM todos WHERE id = ? AND workspace = ?')
    .run(id, workspace);
  return result.changes > 0;
}

function assignTodo(id, workspace, userId) {
  const result = getDb()
    .prepare('UPDATE todos SET assigned_to = ? WHERE id = ? AND workspace = ? AND done = 0')
    .run(userId, id, workspace);
  return result.changes > 0;
}

function setPriority(id, workspace, priority) {
  const result = getDb()
    .prepare('UPDATE todos SET priority = ? WHERE id = ? AND workspace = ? AND done = 0')
    .run(priority, id, workspace);
  return result.changes > 0;
}

module.exports = { addTodo, getTodos, getTodo, markDone, deleteTodo, assignTodo, setPriority };
