// Database adapter that works with both Node (better-sqlite3) and Bun (bun:sqlite)

export interface DatabaseInstance {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  pragma(pragma: string): void;
  transaction<T>(fn: () => T): () => T;
  close(): void;
}

export interface Statement {
  run(...params: any[]): { changes: number };
  get(...params: any[]): any;
  all(...params: any[]): any[];
}

export function createDatabase(path: string): DatabaseInstance {
  const isBun = typeof Bun !== 'undefined';

  if (isBun) {
    // Use Bun's built-in SQLite
    const { Database } = require('bun:sqlite');
    const db = new Database(path);

    return {
      prepare(sql: string) {
        const stmt = db.prepare(sql);
        return {
          run(...params: any[]) {
            const result = stmt.run(...params);
            // Bun's run returns the statement itself, changes is on db
            const changes = db.changes;
            return { changes };
          },
          get(...params: any[]) {
            return stmt.get(...params);
          },
          all(...params: any[]) {
            return stmt.all(...params);
          },
        };
      },
      exec(sql: string) {
        db.exec(sql);
      },
      pragma(pragma: string) {
        db.exec(`PRAGMA ${pragma}`);
      },
      transaction<T>(fn: () => T): () => T {
        // Bun's transaction API
        return db.transaction(fn);
      },
      close() {
        db.close();
      },
    };
  } else {
    // Use better-sqlite3 for Node
    const BetterSqlite3 = require('better-sqlite3');
    const db = new BetterSqlite3(path);

    return {
      prepare(sql: string) {
        const stmt = db.prepare(sql);
        return {
          run(...params: any[]) {
            return stmt.run(...params);
          },
          get(...params: any[]) {
            return stmt.get(...params);
          },
          all(...params: any[]) {
            return stmt.all(...params);
          },
        };
      },
      exec(sql: string) {
        db.exec(sql);
      },
      pragma(pragma: string) {
        db.pragma(pragma);
      },
      transaction<T>(fn: () => T): () => T {
        // better-sqlite3's transaction API
        return db.transaction(fn);
      },
      close() {
        db.close();
      },
    };
  }
}
