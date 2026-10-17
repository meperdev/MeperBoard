import { afterEach, describe, expect, it, vi } from "vitest";

import { LAST_SYNC_STORAGE_KEY, loadLastSync, saveLastSync } from "./last-sync";

describe("last successful sync persistence", () => {
  afterEach(() => {
    // Unstub first: the private-mode test replaces the storage implementation.
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("returns null when nothing was ever synced", () => {
    expect(loadLastSync()).toBeNull();
  });

  it("round-trips a millisecond timestamp", () => {
    saveLastSync(1_760_000_000_000);

    expect(loadLastSync()).toBe(1_760_000_000_000);
    expect(window.localStorage.getItem(LAST_SYNC_STORAGE_KEY)).toBe("1760000000000");
  });

  it("treats a corrupt stored value as never synced", () => {
    window.localStorage.setItem(LAST_SYNC_STORAGE_KEY, "yesterday");

    expect(loadLastSync()).toBeNull();
  });

  it("survives a throwing localStorage (private mode)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });

    expect(() => saveLastSync(Date.now())).not.toThrow();
    expect(loadLastSync()).toBeNull();
  });
});
