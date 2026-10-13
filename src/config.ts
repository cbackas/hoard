// All env vars are read here. Document new ones in .env.example and the README.

function optional(name: string): string | undefined {
  const value = Bun.env[name]?.trim();
  return value ? value : undefined;
}

function port(): number {
  const raw = optional("PORT") ?? "3000";
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${raw}"`);
  }
  return value;
}

export const config = {
  port: port(),
  /** Optional until SIMKL enforces it; omitted from requests when unset. */
  simklClientId: optional("SIMKL_CLIENT_ID"),
  /** Overrides Plex server discovery when set. */
  plexUrl: optional("PLEX_URL"),
  /** Public base URL for Plex sign-in redirects; derived from the request Host when unset. */
  appUrl: optional("APP_URL"),
  dbPath: optional("DB_PATH") ?? "./data/hoard.db",
  isDev: Bun.env.NODE_ENV !== "production",
} as const;
