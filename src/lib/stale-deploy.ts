/**
 * After a new version is deployed, a page that was already open still points its forms at the old version's server
 * actions, so submitting it fails with "Failed to find Server Action". It isn't a bug: reloading the page fixes it.
 * No imports, so the browser (error pages) and the server (error reporting) share it.
 */
export function isStaleDeployError(err: unknown): boolean {
  const message = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? "");
  return /failed to find server action|server action .* was not found|failed-to-find-server-action/i.test(message);
}

const RELOAD_KEY = "pmai-stale-reload";
const RELOAD_GAP_MS = 30_000;

/** Reloads the page once for an out-of-date page; returns false if it already reloaded recently (avoids a loop). */
export function reloadOnceForNewVersion(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (now - last < RELOAD_GAP_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    // Storage blocked (private mode): reloading once is still better than an error page.
  }
  window.location.reload();
  return true;
}
