import type { Kysely } from "kysely";

// Migrations take Kysely<any>: they describe the schema at a point in time, not the current DB types.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("settings")
    .addColumn("key", "text", (col) => col.primaryKey())
    .addColumn("value", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("sessions")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("created_at", "integer", (col) => col.notNull())
    .addColumn("last_seen_at", "integer", (col) => col.notNull())
    .execute();
}
