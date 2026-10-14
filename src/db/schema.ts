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
  /** The plex.tv PIN of a sign-in in progress; cleared once it completes. */
  plex_pin_id: number | null;
  /** Set once signed in, encrypted with ENCRYPTION_KEY (sessions.ts decrypts it on read). A credential: never log it. */
  plex_token: string | null;
  plex_username: string | null;
  /** The Plex account's avatar URL, if Plex gave one. */
  plex_thumb: string | null;
}

export type Session = Selectable<SessionsTable>;
