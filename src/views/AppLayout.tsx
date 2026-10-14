import type { Child } from "hono/jsx";
import type { PlexAccount } from "../plex/tv.ts";
import { Layout } from "./Layout.tsx";

/** The page frame for Signed in pages: the Hoard header, with the page's own nav and the account menu. */
export function AppLayout({ account, nav, children }: { account: PlexAccount; nav?: Child; children: Child }) {
  return (
    <Layout title="Hoard">
      <header class="flex items-center gap-6 px-6 py-6">
        <h1 class="text-3xl font-bold tracking-tight">Hoard</h1>
        <div class="ml-auto">{nav}</div>
        <AccountMenu account={account} />
      </header>
      <main class="px-6 pb-16">{children}</main>
    </Layout>
  );
}

/** The account's round avatar (or its initial, without one); clicking it opens a menu with the account's actions. */
function AccountMenu({ account: { username, thumb } }: { account: PlexAccount }) {
  // <details> opens and closes without any JavaScript.
  return (
    <details class="relative">
      <summary
        aria-label={`Account menu for ${username}`}
        title={username}
        class="flex size-9 cursor-pointer list-none items-center justify-center overflow-hidden rounded-full bg-neutral-700 text-sm font-semibold uppercase text-neutral-100 hover:ring-2 hover:ring-neutral-500 [&::-webkit-details-marker]:hidden"
      >
        {thumb ? <img src={thumb} alt="" width="36" height="36" class="size-full object-cover" /> : username.charAt(0)}
      </summary>
      <div class="absolute right-0 z-10 mt-2 w-48 rounded-lg border border-neutral-800 bg-neutral-900 py-1 shadow-lg">
        <p class="truncate border-b border-neutral-800 px-4 py-2 text-sm text-neutral-400">{username}</p>
        <form method="post" action="/sign-out">
          <button class="w-full px-4 py-2 text-left text-sm text-neutral-100 hover:bg-neutral-800">Sign out</button>
        </form>
      </div>
    </details>
  );
}
