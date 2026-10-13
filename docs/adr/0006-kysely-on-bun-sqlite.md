# Kysely for database access, on bun:sqlite through a small adapter

Queries and migrations go through Kysely rather than raw `bun:sqlite` statements, because more database work is expected beyond sessions and typed, composable queries pay off as it grows. Kysely has no built-in `bun:sqlite` dialect, so `src/db/bunSqlite.ts` adapts a `bun:sqlite` `Database` to the interface Kysely's own `SqliteDialect` expects. That keeps Kysely's upstream SQLite driver, compiler and transaction handling, with no third-party dialect to depend on. Migrations are files in `src/db/migrations/`, loaded by Kysely's `FileMigrationProvider` and run at boot.

## Considered Options

- **Raw `bun:sqlite`**: enough for two tables, but every later query would be hand-typed SQL.
- **`kysely-bun-sqlite`**: unmaintained; its peer dependency is still Kysely 0.28.
- **`kysely-bun-worker`**: maintained, but runs SQLite in a worker and pulls in `kysely-generic-sqlite`; its main-thread dialect is the same few lines the adapter now holds.
- **Drizzle**: has an official `bun:sqlite` driver, but Kysely was the one worth trying.
