# Plex Gaps

Shows what's trending on SIMKL right now and which of those titles aren't in your Plex library.

## Development

```bash
bun install     # also copies HTMX from node_modules into public/vendor/
bun run dev     # server + Tailwind watcher, with live reload
bun run check   # typecheck
```

Open http://localhost:3000.

## Production

```bash
bun run start   # compiles the stylesheet, then runs the server in production mode
```

## Configuration

All environment variables are optional; see [`.env.example`](.env.example) for defaults. Bun loads `.env` automatically.

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (default `3000`) |
| `SIMKL_CLIENT_ID` | SIMKL app client ID, sent with requests when set |
| `PLEX_URL` | Plex server URL; skips server discovery when set |
| `APP_URL` | Public URL of this app for the Plex sign-in redirect; derived from the request when unset |
| `DB_PATH` | SQLite database file (default `./data/plex-gaps.db`) |
