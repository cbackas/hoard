import { Database } from "bun:sqlite";
import { mkdirSync, promises as fs } from "node:fs";
import path from "node:path";
import { Kysely, SqliteDialect } from "kysely";
import { FileMigrationProvider, Migrator } from "kysely/migration";
import { config } from "../config.ts";
import { bunSqlite } from "./bunSqlite.ts";
import type { DB } from "./schema.ts";

const MIGRATIONS_DIR = path.resolve(import.meta.dir, "migrations");

function open(): Database {
  const file = path.resolve(config.dbPath);
  mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file, { create: true });
  // WAL lets reads carry on during a write, and is the usual choice for a long-running server.
  sqlite.run("PRAGMA journal_mode = WAL");
  console.info(`Opened database ${file}`);
  return sqlite;
}

export const db = new Kysely<DB>({
  dialect: new SqliteDialect({ database: bunSqlite(open()) }),
});

async function migrateToLatest() {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: MIGRATIONS_DIR }),
  });
  const { error, results = [] } = await migrator.migrateToLatest();
  for (const result of results) {
    if (result.status === "Success") console.info(`Applied migration ${result.migrationName}`);
    else console.error(`Migration ${result.migrationName} ${result.status === "Error" ? "failed" : "not run"}`);
  }
  if (error) throw new Error("Database migration failed", { cause: error });
  if (results.length === 0) console.debug("Database schema is up to date");
}

// Run at import so nothing can query the database before its schema exists.
await migrateToLatest();
