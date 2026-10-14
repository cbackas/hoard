// All env vars are read here. Document new ones in .env.example and the README.

function optional(name: string): string | undefined {
  const value = Bun.env[name]?.trim();
  return value ? value : undefined;
}

function required(name: string, hint: string): string {
  const value = optional(name);
  if (!value) throw new Error(`${name} must be set. ${hint}`);
  return value;
}

/** A required 256-bit key, given base64-encoded. */
function key(name: string): Uint8Array<ArrayBuffer> {
  const hint = "Generate one with: openssl rand -base64 32";
  const bytes = new Uint8Array(Buffer.from(required(name, hint), "base64"));
  if (bytes.length !== 32) throw new Error(`${name} must be 32 bytes, base64-encoded, got ${bytes.length} bytes. ${hint}`);
  return bytes;
}

/** APP_URL's origin. Hoard is served from the root of its host, so a path (e.g. "/hoard") isn't supported. */
function appUrl(): string | undefined {
  const raw = optional("APP_URL");
  if (!raw) return undefined;
  const url = URL.parse(raw);
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new Error(`APP_URL must be an http(s) URL like https://hoard.example.com, got "${raw}"`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`APP_URL must not have a path, query or fragment (Hoard has to be served from the root), got "${raw}"`);
  }
  return url.origin;
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
  /** Public origin for Plex sign-in redirects; derived from the request Host when unset. */
  appUrl: appUrl(),
  dbPath: optional("DB_PATH") ?? "./data/hoard.db",
  /** Signs session cookies. Changing it signs everyone out. */
  sessionSecret: key("SESSION_SECRET"),
  /** Encrypts secrets stored in the database, such as Plex tokens. Changing it signs everyone out. */
  encryptionKey: key("ENCRYPTION_KEY"),
  isDev: Bun.env.NODE_ENV !== "production",
} as const;
