# Hoard

Shows what's trending on SIMKL right now and which of those titles aren't in your Plex library.

## Development

```bash
bun install     # also copies HTMX from node_modules into public/vendor/
printf 'SESSION_SECRET=%s\nENCRYPTION_KEY=%s\n' "$(openssl rand -base64 32)" "$(openssl rand -base64 32)" > .env
bun run dev     # server + Tailwind watcher, with live reload
bun run check   # typecheck
```

Open http://localhost:3000.

## Production

```bash
bun run start   # compiles the stylesheet, then runs the server in production mode
```

## Configuration

`SESSION_SECRET` and `ENCRYPTION_KEY` are required; the rest are optional, see [`.env.example`](.env.example) for defaults. Bun loads `.env` automatically.

| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | **Required.** Signs session cookies; generate with `openssl rand -base64 32`. Changing it signs everyone out |
| `ENCRYPTION_KEY` | **Required.** Encrypts Plex tokens in the database; generate with `openssl rand -base64 32`. Changing it signs everyone out |
| `PORT` | Port to listen on (default `3000`) |
| `SIMKL_CLIENT_ID` | SIMKL app client ID, sent with requests when set |
| `PLEX_URL` | Plex server URL; skips server discovery when set |
| `APP_URL` | Public URL of this app for the Plex sign-in redirect, e.g. `https://hoard.example.com` (no path). Derived from the request when unset, which only works without a proxy: set it behind a TLS-terminating reverse proxy, or sign-in comes back over `http://` and the session cookie isn't marked Secure |
| `DB_PATH` | SQLite database file (default `./data/hoard.db`) |
