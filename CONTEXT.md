# Hoard

Shows what's popular right now (per SIMKL) and which of those titles are missing from the user's Plex library.

## Language

### Trending

**Trending list**:
SIMKL's daily ranking of the 500 most popular titles per media type, ordered by how many SIMKL users watched each one today.
_Avoid_: Popular list, top 500, discover feed

**Tab**:
Which Trending list is on screen: **All** (Shows and Movies merged, ordered by watches today), **Shows** or **Movies**.
_Avoid_: Category, section

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

### App

**Session**:
One browser's state on the server, tracked by a cookie and persisted in SQLite; started when a browser first needs one (Plex sign-in) and holds that sign-in. Expires about 400 days after the browser's last visit.
_Avoid_: Login, user

**Signed in**:
A Session that holds a Plex token, from signing in through plex.tv. Only Signed in browsers see Titles; everyone else gets the sign-in page. Signing out deletes the Session.
_Avoid_: Logged in, authenticated

### Plex

**Owned server**:
A Plex Media Server belonging to the signed-in user's own Plex account. Servers shared by friends are not Owned servers.
_Avoid_: Server (unqualified), shared server

**Connection**:
One way of reaching the Owned server, as plex.tv lists it: **local** (on the user's network), **remote** (directly over the internet) or **relay** (through Plex's relay, slow and bandwidth-limited). Hoard uses the first that answers, in that order, and only looks for another once it stops answering.
_Avoid_: Address, endpoint

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
A Title whose External ID appears in the Library index of the matching type. A Show with any episodes in Plex is Collected, unless **Complete only** is chosen. "In library" means the same thing and is fine to use.
_Avoid_: Owned, have

**Partially collected**:
A Collected Show where Plex has fewer episodes than have aired, going by Plex's online metadata. Specials aren't counted, and an episode counts as aired from the day after its air date. "Incomplete" means the same thing and is fine to use.

**Any episodes / Complete only**:
The setting, on Tabs with Shows, for whether a Partially collected Show counts as Collected (**Any episodes**, the default) or as a Gap shown with how many of its aired episodes Plex has, e.g. "94/293 eps" (**Complete only**).

**Gap**:
A Title on the Trending list that is not Collected — the thing this app exists to surface.
_Avoid_: Missing, wanted

**Filter**:
How Collected Titles are presented: **Off** (shown normally, like any other Title), **Fade** (shown dimmed with an "In Plex" badge) or **Hide** (removed, leaving only Gaps).
_Avoid_: View mode, toggle, "All" (that's a Tab)
