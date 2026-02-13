/**
 * SQLite cache database management
 * Handles DB lifecycle, pragma configuration, and schema migrations
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync, unlinkSync, statSync } from 'fs';
import { join, dirname } from 'path';

const CURRENT_SCHEMA_VERSION = 4;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
INSERT INTO schema_version (version) VALUES (${CURRENT_SCHEMA_VERSION});

CREATE TABLE IF NOT EXISTS parsed_files (
  file_path     TEXT    NOT NULL PRIMARY KEY,
  content_hash  TEXT    NOT NULL,
  language      TEXT    NOT NULL,
  imports_json  TEXT    NOT NULL,
  export_sig    TEXT    NOT NULL,
  cached_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_parsed_files_cached_at ON parsed_files (cached_at);

CREATE TABLE IF NOT EXISTS embeddings (
  file_path      TEXT    NOT NULL PRIMARY KEY,
  content_hash   TEXT    NOT NULL,
  embedding_json TEXT    NOT NULL,
  model_id       TEXT    NOT NULL,
  cached_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO auth_config (key, value) VALUES ('enabled', 'false');

CREATE TABLE IF NOT EXISTS users (
  id            TEXT    PRIMARY KEY,
  username      TEXT    NOT NULL UNIQUE,
  display_name  TEXT,
  password_hash TEXT,
  role          TEXT    NOT NULL DEFAULT 'viewer',
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id             TEXT    PRIMARY KEY,
  user_id        TEXT    NOT NULL REFERENCES users(id),
  key_hash       TEXT    NOT NULL UNIQUE,
  label          TEXT    NOT NULL,
  scope_override TEXT,
  last_used_at   INTEGER,
  expires_at     INTEGER,
  created_at     INTEGER NOT NULL,
  revoked        INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp   INTEGER NOT NULL,
  action      TEXT    NOT NULL,
  severity    TEXT    DEFAULT 'info',
  user_id     TEXT,
  username    TEXT,
  source      TEXT    NOT NULL,
  success     INTEGER DEFAULT 1,
  details     TEXT,
  duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log (timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log (action);

CREATE TABLE IF NOT EXISTS vector_sync_state (
  file_path     TEXT NOT NULL PRIMARY KEY,
  content_hash  TEXT NOT NULL,
  provider      TEXT NOT NULL,
  synced_at     INTEGER NOT NULL
);
`;

const MIGRATION_V1_TO_V2 = `
CREATE TABLE IF NOT EXISTS embeddings (
  file_path      TEXT    NOT NULL PRIMARY KEY,
  content_hash   TEXT    NOT NULL,
  embedding_json TEXT    NOT NULL,
  model_id       TEXT    NOT NULL,
  cached_at      INTEGER NOT NULL
);
UPDATE schema_version SET version = 2;
`;

const MIGRATION_V2_TO_V3 = `
CREATE TABLE IF NOT EXISTS auth_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO auth_config (key, value) VALUES ('enabled', 'false');

CREATE TABLE IF NOT EXISTS users (
  id            TEXT    PRIMARY KEY,
  username      TEXT    NOT NULL UNIQUE,
  display_name  TEXT,
  password_hash TEXT,
  role          TEXT    NOT NULL DEFAULT 'viewer',
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id             TEXT    PRIMARY KEY,
  user_id        TEXT    NOT NULL REFERENCES users(id),
  key_hash       TEXT    NOT NULL UNIQUE,
  label          TEXT    NOT NULL,
  scope_override TEXT,
  last_used_at   INTEGER,
  expires_at     INTEGER,
  created_at     INTEGER NOT NULL,
  revoked        INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp   INTEGER NOT NULL,
  action      TEXT    NOT NULL,
  severity    TEXT    DEFAULT 'info',
  user_id     TEXT,
  username    TEXT,
  source      TEXT    NOT NULL,
  success     INTEGER DEFAULT 1,
  details     TEXT,
  duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log (timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log (action);

UPDATE schema_version SET version = 3;
`;

const MIGRATION_V3_TO_V4 = `
CREATE TABLE IF NOT EXISTS vector_sync_state (
  file_path     TEXT NOT NULL PRIMARY KEY,
  content_hash  TEXT NOT NULL,
  provider      TEXT NOT NULL,
  synced_at     INTEGER NOT NULL
);

UPDATE schema_version SET version = 4;
`;

export class CacheDb {
  private db: Database.Database | null = null;
  private readonly dbPath: string;

  constructor(repoRoot: string, cacheDir?: string) {
    const baseDir = cacheDir ?? join(repoRoot, '.topology');
    this.dbPath = join(baseDir, 'cache.db');
  }

  get database(): Database.Database {
    if (!this.db) {
      throw new Error('CacheDb is not open. Call open() first.');
    }
    return this.db;
  }

  get path(): string {
    return this.dbPath;
  }

  open(): void {
    // Ensure directory exists
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    try {
      this.db = new Database(this.dbPath);
      this.configurePragmas();
      this.migrate();
    } catch (err) {
      // Corrupted DB — delete and recreate
      console.warn(`⚠️  Cache DB corrupted, rebuilding: ${(err as Error).message}`);
      this.destroyAndRecreate();
    }
  }

  close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // Ignore close errors
      }
      this.db = null;
    }
  }

  getStats(): { entries: number; sizeBytes: number } {
    if (!this.db) {
      return { entries: 0, sizeBytes: 0 };
    }
    try {
      const row = this.db.prepare('SELECT COUNT(*) as count FROM parsed_files').get() as { count: number };
      let sizeBytes = 0;
      if (existsSync(this.dbPath)) {
        sizeBytes = statSync(this.dbPath).size;
      }
      return { entries: row.count, sizeBytes };
    } catch {
      return { entries: 0, sizeBytes: 0 };
    }
  }

  private configurePragmas(): void {
    if (!this.db) return;
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('busy_timeout = 5000');
  }

  private migrate(): void {
    if (!this.db) return;

    try {
      // Check if schema_version table exists
      const tableExists = this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
      ).get();

      if (!tableExists) {
        // Fresh DB — run full schema
        this.db.exec(SCHEMA_SQL);
        return;
      }

      const row = this.db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | undefined;
      const currentVersion = row?.version ?? 0;

      if (currentVersion < CURRENT_SCHEMA_VERSION) {
        // Run incremental migrations
        if (currentVersion < 2) {
          this.db.exec(MIGRATION_V1_TO_V2);
        }
        if (currentVersion < 3) {
          this.db.exec(MIGRATION_V2_TO_V3);
        }
        if (currentVersion < 4) {
          this.db.exec(MIGRATION_V3_TO_V4);
        }
      }
    } catch (err) {
      console.warn(`⚠️  Cache migration failed, rebuilding: ${(err as Error).message}`);
      this.destroyAndRecreate();
    }
  }

  private destroyAndRecreate(): void {
    this.close();
    try {
      if (existsSync(this.dbPath)) {
        unlinkSync(this.dbPath);
      }
      // Also clean up WAL/SHM files
      const walPath = this.dbPath + '-wal';
      const shmPath = this.dbPath + '-shm';
      if (existsSync(walPath)) unlinkSync(walPath);
      if (existsSync(shmPath)) unlinkSync(shmPath);
    } catch {
      // Ignore deletion errors
    }

    try {
      const dir = dirname(this.dbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      this.db = new Database(this.dbPath);
      this.configurePragmas();
      this.db.exec(SCHEMA_SQL);
    } catch (err) {
      console.warn(`⚠️  Failed to recreate cache DB: ${(err as Error).message}`);
      this.db = null;
    }
  }
}
