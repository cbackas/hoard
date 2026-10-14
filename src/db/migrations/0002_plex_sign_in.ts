import type { Kysely } from "kysely";

// SQLite's ALTER TABLE adds one column per statement, so each gets its own query.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("sessions").addColumn("plex_pin_id", "integer").execute();
  await db.schema.alterTable("sessions").addColumn("plex_token", "text").execute();
  await db.schema.alterTable("sessions").addColumn("plex_username", "text").execute();
  await db.schema.alterTable("sessions").addColumn("plex_thumb", "text").execute();
}
