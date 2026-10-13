# SQLite holds sessions only; trending data and the Library index stay in memory

`bun:sqlite` stores sessions (with the Plex token and chosen server) and the stable Plex client identifier, so restarts don't force a re-login or register a new Plex "device". The Trending list and Library index are deliberately kept in memory with a TTL and a manual refresh: they're cheap to rebuild, and persisting them would add staleness and invalidation problems for no real gain.
