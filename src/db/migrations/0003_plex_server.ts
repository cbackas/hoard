import type { Kysely } from "kysely";

// SQLite's ALTER TABLE adds one column per statement, so each gets its own query.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("sessions").addColumn("plex_server_id", "text").execute();
  await db.schema.alterTable("sessions").addColumn("plex_server_name", "text").execute();
  await db.schema.alterTable("sessions").addColumn("plex_connection_uri", "text").execute();
}
