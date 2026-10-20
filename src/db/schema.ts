// Table types for Kysely. Keep in sync with the migrations in ./migrations.

import type { Selectable } from "kysely";

export interface DB {
  settings: SettingsTable;
  sessions: SessionsTable;
  library_indexes: LibraryIndexesTable;
  library_external_ids: LibraryExternalIdsTable;
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
  /** The Owned server this session reads libraries from: its machine identifier, name and the URI of the Connection in use. */
  plex_server_id: string | null;
  plex_server_name: string | null;
  plex_connection_uri: string | null;
}

export type Session = Selectable<SessionsTable>;

/** The latest Library index built for each Owned server, keyed by machine identifier; its External IDs are in library_external_ids. */
export interface LibraryIndexesTable {
  server_id: string;
  /** Unix milliseconds. */
  built_at: number;
  movie_count: number;
  show_count: number;
}

/** One row per External ID in an Owned server's Library index, e.g. "imdb://tt0111161". */
export interface LibraryExternalIdsTable {
  server_id: string;
  media_type: "movie" | "show";
  external_id: string;
  /** A Show's episode count; null for Movies. */
  episode_count: number | null;
}
