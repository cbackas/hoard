import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("library_external_ids").addColumn("plex_rating_key", "text").execute();
  await db.schema.alterTable("library_external_ids").addColumn("plex_guid", "text").execute();
  // Indexes saved before this have no keys for their Shows, so they're dropped and each server's is built again.
  await db.deleteFrom("library_external_ids").execute();
  await db.deleteFrom("library_indexes").execute();
}
