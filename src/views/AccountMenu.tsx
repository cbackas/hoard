import { LIBRARY_REFRESH_PATH, SERVER_MENU_PATH, SIGN_OUT_PATH } from "../paths.ts";
import type { ChosenServer } from "../plex/server.ts";
import type { OwnedServer, PlexAccount } from "../plex/tv.ts";
import { LIBRARY_STATUS_ID } from "./LibraryStatus.tsx";
import { MENU_ITEM, MENU_PANEL } from "./menu.ts";
import { ServerButton } from "./ServerButton.tsx";

/** The account's round avatar (or its initial, without one); clicking it opens a menu with the account's actions. */
export function AccountMenu({
  account: { username, thumb },
  server,
  canRefreshLibrary,
}: {
  account: PlexAccount;
  server: ChosenServer | undefined;
  /** Whether the page shows the Library index counts, which a refresh updates. */
  canRefreshLibrary: boolean;
}) {
  return (
    <>
      <button
        popovertarget="account-menu"
        aria-label={`Account menu for ${username}`}
        title={username}
        class="flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-neutral-700 text-sm font-semibold uppercase text-neutral-100 [anchor-name:--account-menu] hover:ring-2 hover:ring-neutral-500"
      >
        {thumb ? <img src={thumb} alt="" width="36" height="36" class="size-full object-cover" /> : username.charAt(0)}
      </button>
      {/* Below the avatar, right edges lined up. */}
      <div id="account-menu" popover="auto" class={`${MENU_PANEL} mt-2 [position-anchor:--account-menu] [position-area:bottom_span-left]`}>
        <p class="truncate border-b border-neutral-800 px-4 py-2 text-sm text-neutral-400">{username}</p>
        <ServerMenu server={server} />
        {canRefreshLibrary && (
          // Swaps the header's counts for their "Refreshing…" state, which polls until the rebuild is done, and closes the menu.
          <button
            type="button"
            popovertarget="account-menu"
            popovertargetaction="hide"
            class={`${MENU_ITEM} cursor-pointer`}
            hx-post={LIBRARY_REFRESH_PATH}
            hx-target={`#${LIBRARY_STATUS_ID}`}
            hx-swap="outerHTML"
          >
            Refresh library
          </button>
        )}
        <form method="post" action={SIGN_OUT_PATH}>
          <button class={MENU_ITEM}>Sign out</button>
        </form>
      </div>
    </>
  );
}

/**
 * A submenu of the account's Owned servers for switching between them. It opens to the left, since the account
 * menu is at the right edge. The list comes from plex.tv, so it's fetched when the submenu is opened, not with
 * every page; fetching on every open keeps it fresh and lets a failed fetch be retried.
 */
function ServerMenu({ server }: { server: ChosenServer | undefined }) {
  return (
    <>
      <button
        type="button"
        popovertarget="server-menu"
        class={`${MENU_ITEM} cursor-pointer [anchor-name:--server-menu]`}
        hx-get={SERVER_MENU_PATH}
        hx-target="#server-menu"
      >
        <span class="block text-xs font-medium uppercase tracking-wide text-neutral-500">Server</span>
        <span class="block truncate">{server?.name ?? "None chosen"}</span>
      </button>
      {/* Inside the account menu, so opening it leaves the account menu open. Left of the item, tops lined up. */}
      <div id="server-menu" popover="auto" class={`${MENU_PANEL} mr-1 [position-anchor:--server-menu] [position-area:left_span-bottom]`}>
        <p class="px-4 py-2 text-sm text-neutral-400">Loading…</p>
      </div>
    </>
  );
}

/** The server submenu's items: a button per Owned server, the current one ticked. servers is undefined if plex.tv couldn't be asked. */
export function ServerMenuItems({ servers, current }: { servers: OwnedServer[] | undefined; current: ChosenServer | undefined }) {
  if (servers === undefined) return <p class="px-4 py-2 text-sm text-red-200">Couldn't reach Plex</p>;
  if (servers.length === 0) return <p class="px-4 py-2 text-sm text-neutral-400">No servers you own</p>;
  return (
    <>
      {servers.map((server) => {
        const isCurrent = server.id === current?.id;
        return (
          <ServerButton server={server} current={isCurrent} class={`${MENU_ITEM} flex items-center gap-2`}>
            <span aria-hidden="true" class="w-3 text-plex">{isCurrent ? "✓" : ""}</span>
            <span class="truncate">{server.name}</span>
          </ServerButton>
        );
      })}
    </>
  );
}
