import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "wautochat.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initializeDatabase(db);
  }
  return db;
}

function initializeDatabase(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'disconnected',
      device_name TEXT DEFAULT 'WAutoChat',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      wpp_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      push_name TEXT,
      phone TEXT NOT NULL DEFAULT '',
      profile_pic_url TEXT,
      is_my_contact INTEGER NOT NULL DEFAULT 0,
      is_wa_contact INTEGER NOT NULL DEFAULT 1,
      is_blocked INTEGER NOT NULL DEFAULT 0,
      labels TEXT NOT NULL DEFAULT '[]',
      last_seen TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      UNIQUE(session_id, wpp_id)
    );

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      wpp_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      is_group INTEGER NOT NULL DEFAULT 0,
      unread_count INTEGER NOT NULL DEFAULT 0,
      last_message_id TEXT,
      profile_pic_url TEXT,
      is_archived INTEGER NOT NULL DEFAULT 0,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_muted INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      UNIQUE(session_id, wpp_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      wpp_id TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'text',
      body TEXT NOT NULL DEFAULT '',
      sender TEXT NOT NULL DEFAULT '',
      sender_name TEXT,
      from_me INTEGER NOT NULL DEFAULT 0,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'sent',
      quoted_msg_id TEXT,
      media_url TEXT,
      media_type TEXT,
      caption TEXT,
      is_forwarded INTEGER NOT NULL DEFAULT 0,
      labels TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS groups_table (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      wpp_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      description TEXT,
      profile_pic_url TEXT,
      participant_count INTEGER NOT NULL DEFAULT 0,
      admins TEXT NOT NULL DEFAULT '[]',
      is_admin INTEGER NOT NULL DEFAULT 0,
      invite_link TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      UNIQUE(session_id, wpp_id)
    );

    CREATE TABLE IF NOT EXISTS labels (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#25D366',
      count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS flows (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      trigger_config TEXT NOT NULL DEFAULT '{}',
      nodes TEXT NOT NULL DEFAULT '[]',
      edges TEXT NOT NULL DEFAULT '[]',
      variables TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS broadcasts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      recipients TEXT NOT NULL DEFAULT '[]',
      message_template TEXT NOT NULL DEFAULT '',
      message_type TEXT NOT NULL DEFAULT 'text',
      status TEXT NOT NULL DEFAULT 'draft',
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      total_count INTEGER NOT NULL DEFAULT 0,
      scheduled_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL DEFAULT 0,
      sale_price REAL,
      currency TEXT NOT NULL DEFAULT 'XOF',
      image_url TEXT,
      is_visible INTEGER NOT NULL DEFAULT 1,
      url TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      product_ids TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    -- Application-wide key/value settings (AI provider config, etc.)
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_contacts_session ON contacts(session_id);
    CREATE INDEX IF NOT EXISTS idx_chats_session ON chats(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_flows_session ON flows(session_id);
    CREATE INDEX IF NOT EXISTS idx_groups_session ON groups_table(session_id);
  `);

  // Messages deduplication: enforce one row per (session, chat, wpp_id).
  // We apply this as a partial unique index (excluding empty wpp_id which
  // belongs to optimistic/temp client-side messages). Before creating the
  // index we clean up any existing duplicates that crept in before the
  // constraint existed.
  try {
    db.exec(`
      DELETE FROM messages
      WHERE wpp_id != ''
        AND rowid NOT IN (
          SELECT MIN(rowid) FROM messages
          WHERE wpp_id != ''
          GROUP BY session_id, chat_id, wpp_id
        );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_unique_wpp
        ON messages(session_id, chat_id, wpp_id)
        WHERE wpp_id != '';
    `);
  } catch (err) {
    // If deduplication fails (e.g. locked DB), log and continue — the index
    // still helps on subsequent inserts.
    console.error('[db] Messages dedup/migration failed:', err);
  }
}
