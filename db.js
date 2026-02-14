// office/db.js
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'chat.db');

const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.exec('PRAGMA journal_mode=WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    agent TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    idempotency_key TEXT UNIQUE,
    metadata TEXT
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_messages_agent
  ON messages(agent, seq)
`);

// Prepared statements
const insertMsg = db.prepare(
  'INSERT INTO messages (agent, role, content, timestamp, idempotency_key, metadata) VALUES (?, ?, ?, ?, ?, ?)'
);

const getByAgent = db.prepare(
  'SELECT * FROM messages WHERE agent = ? ORDER BY seq'
);

const getByAgentSince = db.prepare(
  'SELECT * FROM messages WHERE agent = ? AND seq > ? ORDER BY seq'
);

const checkIdempotency = db.prepare(
  'SELECT seq FROM messages WHERE idempotency_key = ?'
);

function addMessage(agent, role, content, timestamp, idempotencyKey = null, metadata = null) {
  // If idempotency key provided, check for duplicate first
  if (idempotencyKey) {
    const existing = checkIdempotency.get(idempotencyKey);
    if (existing) {
      return { seq: existing.seq, duplicate: true };
    }
  }

  try {
    const result = insertMsg.run(agent, role, content, timestamp, idempotencyKey, metadata ? JSON.stringify(metadata) : null);
    return { seq: Number(result.lastInsertRowid), duplicate: false };
  } catch (e) {
    // UNIQUE constraint violation on idempotency_key = duplicate
    if (e.message.includes('UNIQUE constraint')) {
      const existing = checkIdempotency.get(idempotencyKey);
      return { seq: existing?.seq, duplicate: true };
    }
    throw e;
  }
}

function getMessages(agent) {
  return getByAgent.all(agent);
}

function getMessagesSince(agent, sinceSeq) {
  return getByAgentSince.all(agent, sinceSeq);
}

module.exports = { addMessage, getMessages, getMessagesSince, db };
