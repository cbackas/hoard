import { Layout } from "./Layout.tsx";

export function Home() {
  return (
    <Layout title="Plex Gaps">
      <main class="mx-auto flex max-w-2xl flex-col items-start gap-6 px-6 py-16">
        <h1 class="text-4xl font-bold tracking-tight">Plex Gaps</h1>
        <p class="text-neutral-400">What's trending right now that isn't in your Plex library.</p>
        <button
          class="rounded-md bg-amber-500 px-4 py-2 font-semibold text-neutral-950 hover:bg-amber-400"
          hx-get="/hello"
          hx-swap="outerHTML"
        >
          Say hello
        </button>
      </main>
    </Layout>
  );
}

export function Hello({ at }: { at: Date }) {
  return (
    <p class="rounded-md border border-neutral-800 px-4 py-2 text-neutral-300">
      {`Hello from the server at ${at.toLocaleTimeString()}`}
    </p>
  );
}
