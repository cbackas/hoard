# Plex Gaps

Shows what's popular right now (per SIMKL) and which of those titles are missing from the user's Plex library.

## Language

### Trending

**Trending list**:
SIMKL's daily ranking of the 500 most popular titles per media type, in rank order.
_Avoid_: Popular list, top 500, discover feed

**Title**:
A single Movie or Show as it appears in the Trending list.
_Avoid_: Item, entry, media

**Movie**:
A Title of film type; only ever compared against Movie libraries.

**Show**:
A Title of TV series type; only ever compared against Show libraries.
_Avoid_: Series, TV (as a noun)

**Anime**:
SIMKL's third media type. Out of scope — never displayed or matched.

### Plex

**Owned server**:
A Plex Media Server belonging to the signed-in user's own Plex account. Servers shared by friends are not Owned servers.
_Avoid_: Server (unqualified), shared server

**Library**:
A Plex library section of Movie or Show type on the Owned server. Other library types (music, photos) are ignored.
_Avoid_: Section, collection

**Library index**:
The set of External IDs for everything in the user's Libraries, kept separately for Movies and Shows.
_Avoid_: Cache, catalogue

**External ID**:
An IMDb, TMDB or TVDB identifier, used to recognise the same Title in both SIMKL and Plex.
_Avoid_: GUID, provider ID

### Collection

**Collected**:
A Title whose External ID appears in the Library index of the matching type. A Show with any episodes in Plex is Collected. "In library" means the same thing and is fine to use.
_Avoid_: Owned, have

**Partially collected**:
A Collected Show where Plex has fewer episodes than SIMKL reports for it. "Incomplete" means the same thing and is fine to use.

**Gap**:
A Title on the Trending list that is not Collected — the thing this app exists to surface.
_Avoid_: Missing, wanted

**Filter**:
How Collected Titles are presented: **All** (shown normally), **Fade** (shown dimmed with an "In Plex" badge) or **Hide** (removed, leaving only Gaps).
_Avoid_: View mode, toggle
