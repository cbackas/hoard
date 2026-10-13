import type { Database, SQLQueryBindings } from "bun:sqlite";
import type { SqliteDatabase } from "kysely";

/**
 * Adapts a bun:sqlite Database to the shape Kysely's built-in SqliteDialect expects (modelled on
 * better-sqlite3), so Kysely's own SQLite driver and compiler can run on Bun. The only real gap is
 * `reader`; bun:sqlite statements don't have it, so it's derived from the result columns, as kysely-bun-worker does.
 */
export function bunSqlite(db: Database): SqliteDatabase {
  return {
    close: () => db.close(),
    prepare(sql) {
      const stmt = db.prepare<unknown, SQLQueryBindings[]>(sql);
      return {
        // True for SELECTs and for writes with a RETURNING clause.
        reader: stmt.columnNames.length > 0,
        all: (parameters) => stmt.all(...(parameters as SQLQueryBindings[])),
        run: (parameters) => stmt.run(...(parameters as SQLQueryBindings[])),
        iterate: (parameters) => stmt.iterate(...(parameters as SQLQueryBindings[])),
      };
    },
  };
}
