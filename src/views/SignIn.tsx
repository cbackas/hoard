import { SIGN_IN_PATH } from "../paths.ts";
import { Layout } from "./Layout.tsx";

export const SIGN_IN_ERRORS = ["incomplete", "failed"] as const;
export type SignInError = (typeof SIGN_IN_ERRORS)[number];

/** The sign-in page, showing the given error's message. */
export function signInUrl(error?: SignInError): string {
  return error ? `${SIGN_IN_PATH}?${new URLSearchParams({ error })}` : SIGN_IN_PATH;
}

const ERROR_MESSAGES: Record<SignInError, string> = {
  incomplete: "Sign-in wasn't completed on Plex. Try again.",
  failed: "Couldn't reach Plex to sign you in. Try again in a moment.",
};

export function SignInPage({ error }: { error: SignInError | undefined }) {
  return (
    <Layout title="Sign in · Hoard">
      <main class="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
        <h1 class="text-4xl font-bold tracking-tight">Hoard</h1>
        <p class="max-w-sm text-center text-neutral-400">
          See what's trending and what's missing from your Plex library.
        </p>
        {error && (
          <p role="alert" class="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
            {ERROR_MESSAGES[error]}
          </p>
        )}
        <form method="post" action={SIGN_IN_PATH}>
          <button class="flex items-center gap-2.5 rounded-md bg-plex px-5 py-2.5 font-semibold text-neutral-950 hover:bg-plex-hover">
            <PlexMark />
            Sign in with Plex
          </button>
        </form>
      </main>
    </Layout>
  );
}

/** Plex's chevron logo (from Simple Icons). Decorative: the button's text already says Plex. */
function PlexMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="size-5">
      <path d="M11.643 0H4.68l7.679 12L4.68 24h6.963l7.677-12-7.677-12" />
    </svg>
  );
}
