import { db } from "../db/index.ts";

const SETTING_KEY = "plex_client_id";

/**
 * The app's X-Plex-Client-Identifier. Plex treats each identifier as a separate device, so it's generated
 * once and stored; a new one on every restart would pile up "devices" in the user's Plex account.
 */
async function loadOrCreate(): Promise<string> {
  const inserted = await db
    .insertInto("settings")
    .values({ key: SETTING_KEY, value: crypto.randomUUID() })
    .onConflict((oc) => oc.column("key").doNothing())
    .executeTakeFirst();
  const { value } = await db.selectFrom("settings").select("value").where("key", "=", SETTING_KEY).executeTakeFirstOrThrow();
  if (inserted.numInsertedOrUpdatedRows) console.info(`Generated Plex client identifier ${value}`);
  else console.debug(`Loaded Plex client identifier ${value}`);
  return value;
}

export const plexClientId = await loadOrCreate();
