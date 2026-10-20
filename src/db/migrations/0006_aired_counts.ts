import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("aired_counts")
    .addColumn("simkl_id", "integer", (col) => col.primaryKey())
    .addColumn("seasons", "integer")
    .addColumn("episodes", "integer")
    .addColumn("counted_on", "text", (col) => col.notNull())
    .execute();
  // Aired counts are looked up by External ID now, so Shows no longer need their Plex IDs kept.
  await db.schema.alterTable("library_external_ids").dropColumn("plex_guid").execute();
}
