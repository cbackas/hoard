# Single-user LAN app with server-side Plex access

Hoard runs as a personal tool on the user's own network (Unraid), and the server — not the browser — talks to Plex and SIMKL. A hosted multi-user site was rejected because the backend often can't reach other people's Plex servers, and browser-direct Plex calls were rejected because they'd push the matching logic into client JS and fight the HTMX approach. Code should still avoid assuming a single user (sessions are keyed by cookie) so a hosted version stays possible.

## Considered Options

- **Hosted, multi-user, server-side**: many users' servers aren't reachable remotely.
- **Hosted, browser calls Plex directly**: works on LAN-only servers, but needs client-side matching.
