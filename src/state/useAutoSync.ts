import { useEffect, useRef } from "react";

import { AUTO_SYNC_STALE_MS } from "../lib/config";
import { loadLastSync } from "../lib/last-sync";
import { useSync, type SyncOptions } from "./useSync";

/**
 * True when the mirror was never synced or the last successful sync happened
 * more than `AUTO_SYNC_STALE_MS` ago. The clock is injectable so the boundary
 * is unit-testable without faking timers.
 */
export function isSyncStale(nowMs: number = Date.now()): boolean {
  const lastSyncMs = loadLastSync();
  if (lastSyncMs === null) return true;
  return nowMs - lastSyncMs > AUTO_SYNC_STALE_MS;
}

/**
 * Auto-sync on app load (S9): if the last successful sync is stale, fire one
 * sync as soon as the page mounts. The staleness check runs once per mount — a
 * ref guard keeps React's double-invoked effects (dev StrictMode) and any
 * re-render from firing a second sync. There is no polling and no
 * focus/visibility trigger: loading the app is the only trigger.
 */
export function useAutoSync(options: SyncOptions = {}): void {
  const { mutate } = useSync(options);
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    if (isSyncStale()) mutate();
  }, [mutate]);
}
