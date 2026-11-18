import type { NavigationError } from '@angular/router';

/** When this tab last reloaded itself for a missing page file. */
const RELOADED_AT_KEY = 'pb.staleChunkReloadAt';
/** A second failure this soon after is not a deploy; leave it to show. */
const RETRY_AFTER_MS = 10_000;

/**
 * Whether a page's code could not be fetched. Chrome, Firefox and Safari
 * each word it differently.
 */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|importing a module script failed/i.test(message);
}

/**
 * A tab from before a deploy asks for each page's code by the file names
 * that release had. After the deploy those files are gone, the server hands
 * back index.html in their place, and the browser refuses it as a script:
 * the click that asked for the page then does nothing at all.
 *
 * Loading that page from scratch fetches the release now serving instead.
 * Once only: if it fails again straight away, the server is really down and
 * the error is left to show.
 */
export function reloadOnStaleChunk(
  error: NavigationError,
  storage: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage,
  go: (url: string) => void = (url) => location.assign(url),
): void {
  if (!isStaleChunkError(error.error)) return;
  try {
    const last = Number(storage.getItem(RELOADED_AT_KEY) ?? 0);
    if (Date.now() - last < RETRY_AFTER_MS) return;
    storage.setItem(RELOADED_AT_KEY, String(Date.now()));
  } catch {
    // No storage, no way to tell a second failure from the first: no reload.
    return;
  }
  go(error.url);
}
