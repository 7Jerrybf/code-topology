/**
 * Parse result cache using SQLite
 * Stores ParsedFile results keyed by file path with content hash validation
 */

import type Database from 'better-sqlite3';
import type { Language } from '@topology/protocol';
import type { ParsedFile, ParsedImport } from '../parser/index.js';
import type { CacheDb } from './db.js';

interface CachedRow {
  file_path: string;
  content_hash: string;
  language: string;
  imports_json: string;
  export_sig: string;
  cached_at: number;
}

export interface CacheStats {
  entries: number;
  sizeBytes: number;
}

export class ParseCache {
  private readonly db: Database.Database;
  private readonly stmtGet: Database.Statement;
  private readonly stmtUpsert: Database.Statement;
  private readonly stmtDelete: Database.Statement;

  constructor(cacheDb: CacheDb) {
    this.db = cacheDb.database;

    this.stmtGet = this.db.prepare(
      'SELECT * FROM parsed_files WHERE file_path = ? AND content_hash = ?'
    );

    this.stmtUpsert = this.db.prepare(`
      INSERT INTO parsed_files (file_path, content_hash, language, imports_json, export_sig, cached_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        content_hash = excluded.content_hash,
        language = excluded.language,
        imports_json = excluded.imports_json,
        export_sig = excluded.export_sig,
        cached_at = excluded.cached_at
    `);

    this.stmtDelete = this.db.prepare('DELETE FROM parsed_files WHERE file_path = ?');
  }

  get(filePath: string, currentContentHash: string): ParsedFile | null {
    const row = this.stmtGet.get(filePath, currentContentHash) as CachedRow | undefined;
    if (!row) return null;
    return this.rowToParsedFile(row);
  }

  set(parsed: ParsedFile): void {
    this.stmtUpsert.run(
      parsed.filePath,
      parsed.contentHash,
      parsed.language,
      JSON.stringify(parsed.imports),
      parsed.exportSignature,
      Date.now(),
    );
  }

  setBatch(parsedFiles: ParsedFile[]): void {
    const transaction = this.db.transaction((files: ParsedFile[]) => {
      for (const parsed of files) {
        this.stmtUpsert.run(
          parsed.filePath,
          parsed.contentHash,
          parsed.language,
          JSON.stringify(parsed.imports),
          parsed.exportSignature,
          Date.now(),
        );
      }
    });
    transaction(parsedFiles);
  }

  prune(existingFiles: Set<string>): number {
    const allRows = this.db.prepare('SELECT file_path FROM parsed_files').all() as { file_path: string }[];
    let pruned = 0;
    const transaction = this.db.transaction(() => {
      for (const row of allRows) {
        if (!existingFiles.has(row.file_path)) {
          this.stmtDelete.run(row.file_path);
          pruned++;
        }
      }
    });
    transaction();
    return pruned;
  }

  private rowToParsedFile(row: CachedRow): ParsedFile {
    return {
      filePath: row.file_path,
      contentHash: row.content_hash,
      language: row.language as Language,
      imports: JSON.parse(row.imports_json) as ParsedImport[],
      exportSignature: row.export_sig,
    };
  }
}
