# Save the Library index in SQLite

The Library index is saved to SQLite (`library_indexes` and `library_external_ids`), reversing that part of [ADR 0003](0003-sqlite-for-sessions-only.md). Rebuilding it turned out not to be cheap: a server with ~6,000 Movies and Shows takes 20–30 seconds and a few dozen requests, and in development `bun --watch` restarts on every save. A saved index is read back on the first request for that server after a start, and isn't rebuilt until it's an hour old, as before.

Matching still reads the index from memory; the database is only where it's kept between restarts. Each build replaces the server's rows in one transaction. Indexes of servers no longer in use are left in place, so switching back to one doesn't start from nothing.

## Considered Options

- **Memory only (ADR 0003)**: simplest, but every restart means indexing again and showing no counts meanwhile.
- **Query SQLite directly when matching**: no in-memory copy, but a lookup per Title on every page instead of a set lookup.
