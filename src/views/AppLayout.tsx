import type { Child } from "hono/jsx";
import type { LibraryIndexState } from "../libraryIndex.ts";
import type { ChosenServer } from "../plex/server.ts";
import type { PlexAccount } from "../plex/tv.ts";
import { AccountMenu } from "./AccountMenu.tsx";
import { Layout } from "./Layout.tsx";
import { LibraryStatus } from "./LibraryStatus.tsx";

/**
 * The page frame for Signed in pages: the Hoard header with the connected server's name (once there is one) and
 * its Library index counts (on pages connected to it), the page's own nav and the account menu.
 */
export function AppLayout({
  account,
  server,
  library,
  nav,
  children,
}: {
  account: PlexAccount;
  server: ChosenServer | undefined;
  library?: LibraryIndexState;
  nav?: Child;
  children: Child;
}) {
  return (
    <Layout title="Hoard">
      <header class="flex items-center gap-6 px-6 py-6">
        <div class="flex min-w-0 items-baseline gap-3">
          <h1 class="text-3xl font-bold tracking-tight">Hoard</h1>
          {server && <p class="truncate text-sm text-neutral-400">{server.name}</p>}
          {library && <LibraryStatus state={library} />}
        </div>
        <div class="ml-auto">{nav}</div>
        <AccountMenu account={account} server={server} canRefreshLibrary={library !== undefined} />
      </header>
      <main class="px-6 pb-16">{children}</main>
    </Layout>
  );
}
