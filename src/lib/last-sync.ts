/**
 * Persistence for the last successful sync timestamp (S9 auto-sync on load).
 *
 * The value is epoch milliseconds as a string under a stable key. SSR and
 * private-mode storage failures fall back to "never synced" without throwing;
 * a corrupt value is treated the same way.
 */

export const LAST_SYNC_STORAGE_KEY = "meperboard-last-sync";

/** Read the last successful sync (epoch ms), or `null` when never synced. */
export function loadLastSync(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(LAST_SYNC_STORAGE_KEY);
    if (!stored) return null;
    const parsed = Number(stored);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Persist a successful sync's timestamp; storage errors are swallowed. */
export function saveLastSync(timestampMs: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_SYNC_STORAGE_KEY, String(timestampMs));
  } catch {
    // Private browsing / quota errors must never break the sync.
  }
}
