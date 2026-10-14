import type { Child } from "hono/jsx";
import { SERVERS_PATH } from "../paths.ts";
import type { OwnedServer } from "../plex/tv.ts";

/** A button that switches the session to this Owned server; how it looks is up to the caller. */
export function ServerButton({
  server,
  current,
  class: className,
  children,
}: {
  server: OwnedServer;
  current: boolean;
  class: string;
  children: Child;
}) {
  return (
    <form method="post" action={SERVERS_PATH}>
      <input type="hidden" name="server" value={server.id} />
      <button class={className} aria-current={current ? "true" : undefined}>
        {children}
      </button>
    </form>
  );
}
