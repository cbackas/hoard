import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("library_indexes")
    .addColumn("server_id", "text", (col) => col.primaryKey())
    .addColumn("built_at", "integer", (col) => col.notNull())
    .addColumn("movie_count", "integer", (col) => col.notNull())
    .addColumn("show_count", "integer", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("library_external_ids")
    .addColumn("server_id", "text", (col) => col.notNull())
    .addColumn("media_type", "text", (col) => col.notNull())
    .addColumn("external_id", "text", (col) => col.notNull())
    .addColumn("episode_count", "integer")
    .addPrimaryKeyConstraint("library_external_ids_pk", ["server_id", "media_type", "external_id"])
    .execute();
}
