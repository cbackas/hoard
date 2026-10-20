# Count aired episodes from Plex's online metadata

Whether a Show is Partially collected is decided by comparing its regular episodes on the Owned server with how many have aired, as Plex's online metadata service (`metadata.provider.plex.tv`) reports them. The service is undocumented, but it's what Plex's own apps read, it takes the token Hoard already has, and it can look a Show up by External ID, so it needs nothing beyond a Plex connection and works for Shows that aren't in Plex too. It gives each episode's air date, so episodes announced but not yet aired aren't counted.

If the service changes or fails, Shows count as Collected until it's fixed: no false Partials, just none.

## Considered Options

- **SIMKL's `total_episodes`**: already in the trending feed, but it includes announced episodes, so nearly every Show still airing looked Partially collected. Still used to skip Shows that are plainly complete.
- **SIMKL's API**: SIMKL asks that it not be used as a metadata source ("use TVDB and TMDB APIs from their original sources").
- **TMDB or TVDB's API**: documented, but needs an API key, a new setting, and per-Show lookups by External ID.
- **Sonarr**: only knows the Shows it manages, counts only monitored episodes, and tracks files rather than what's in Plex. Sonarr support is meant to stay an optional connection, and Partials shouldn't depend on it.
