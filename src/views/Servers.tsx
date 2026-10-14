import { SERVERS_PATH } from "../paths.ts";
import type { ChosenServer } from "../plex/server.ts";
import type { OwnedServer, PlexAccount } from "../plex/tv.ts";
import { AppLayout } from "./AppLayout.tsx";
import { ServerButton } from "./ServerButton.tsx";

/** The server picker, saying that the Owned server with this machine identifier couldn't be reached, if given. */
export function serversUrl(unreachableId?: string): string {
  return unreachableId ? `${SERVERS_PATH}?${new URLSearchParams({ unreachableId })}` : SERVERS_PATH;
}

/**
 * Lists the Owned servers to choose from, for when there's no grid to show: several and none chosen yet, none at
 * all, or none reachable. servers is undefined when plex.tv couldn't be asked for them.
 */
export function ServersPage({
  account,
  servers,
  current,
  unreachableName,
}: {
  account: PlexAccount;
  servers: OwnedServer[] | undefined;
  current: ChosenServer | undefined;
  /** The name of an Owned server none of whose Connections answered. */
  unreachableName: string | undefined;
}) {
  return (
    <AppLayout account={account} server={current}>
      <section class="mx-auto flex max-w-md flex-col gap-4 pt-8">
        <h2 class="text-xl font-semibold">Choose a Plex server</h2>
        {unreachableName && <Alert>{`Couldn't connect to ${unreachableName}. Check that it's running, then try again.`}</Alert>}
        {servers === undefined ? (
          <Alert>Couldn't reach Plex to list your servers. Try again in a moment.</Alert>
        ) : servers.length === 0 ? (
          <p class="text-neutral-400">
            Your Plex account doesn't own a Plex Media Server. Hoard only reads servers you own, not ones shared with you.
          </p>
        ) : (
          <ul class="flex flex-col gap-2">
            {servers.map((server) => {
              const isCurrent = server.id === current?.id;
              return (
                <li>
                  <ServerButton
                    server={server}
                    current={isCurrent}
                    class="flex w-full items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-left font-medium hover:border-neutral-600"
                  >
                    <span class="truncate">{server.name}</span>
                    {isCurrent && <span class="text-sm text-neutral-400">Current</span>}
                  </ServerButton>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppLayout>
  );
}

function Alert({ children }: { children: string }) {
  return (
    <p role="alert" class="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
      {children}
    </p>
  );
}
