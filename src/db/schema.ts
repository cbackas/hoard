// Table types for Kysely. Keep in sync with the migrations in ./migrations.

import type { Selectable } from "kysely";

export interface DB {
  settings: SettingsTable;
  sessions: SessionsTable;
}

/** App-wide key/value pairs, e.g. the Plex client identifier. */
export interface SettingsTable {
  key: string;
  value: string;
}

/** One row per browser, keyed by the session cookie. Timestamps are Unix milliseconds. */
export interface SessionsTable {
  id: string;
  created_at: number;
  last_seen_at: number;
}

export type Session = Selectable<SessionsTable>;
