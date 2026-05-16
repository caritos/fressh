// Database adapter that works with both Node (better-sqlite3) and Bun (bun:sqlite)
export function createDatabase(path) {
    const isBun = typeof Bun !== 'undefined';
    if (isBun) {
        // Use Bun's built-in SQLite
        const { Database } = require('bun:sqlite');
        const db = new Database(path);
        return {
            prepare(sql) {
                const stmt = db.prepare(sql);
                return {
                    run(...params) {
                        const result = stmt.run(...params);
                        // Bun's run returns the statement itself, changes is on db
                        const changes = db.changes;
                        return { changes };
                    },
                    get(...params) {
                        return stmt.get(...params);
                    },
                    all(...params) {
                        return stmt.all(...params);
                    },
                };
            },
            exec(sql) {
                db.exec(sql);
            },
            pragma(pragma) {
                db.exec(`PRAGMA ${pragma}`);
            },
            transaction(fn) {
                // Bun's transaction API
                return db.transaction(fn);
            },
            close() {
                db.close();
            },
        };
    }
    else {
        // Use better-sqlite3 for Node
        const BetterSqlite3 = require('better-sqlite3');
        const db = new BetterSqlite3(path);
        return {
            prepare(sql) {
                const stmt = db.prepare(sql);
                return {
                    run(...params) {
                        return stmt.run(...params);
                    },
                    get(...params) {
                        return stmt.get(...params);
                    },
                    all(...params) {
                        return stmt.all(...params);
                    },
                };
            },
            exec(sql) {
                db.exec(sql);
            },
            pragma(pragma) {
                db.pragma(pragma);
            },
            transaction(fn) {
                // better-sqlite3's transaction API
                return db.transaction(fn);
            },
            close() {
                db.close();
            },
        };
    }
}
//# sourceMappingURL=database-adapter.js.map