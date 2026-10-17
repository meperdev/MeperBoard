"use client";

import { useAutoSync, useLocalCards } from "../../state";
import { AppHeader } from "../app-header/app-header";
import { Backlog } from "../backlog";

/**
 * The backlog page composition: app header + the filterable/sortable backlog.
 * Local-card quick actions are wired here through the existing `useLocalCards`
 * mutations — the backlog itself never talks to the data layer. The page also
 * owns the S9 auto-sync on load so the mirror is fresh when it renders.
 */
export function BacklogPage() {
  const { update, remove } = useLocalCards();

  // S9: refresh the mirror on load when the last sync went stale (>30 min).
  useAutoSync();

  return (
    <div className="min-h-screen">
      <AppHeader />
      <Backlog
        localActions={{
          onEditLocal: (id, patch) =>
            update.mutate({
              id,
              patch: { title: patch.title, body: patch.body, column_id: patch.columnId },
            }),
          onDeleteLocal: (id) => remove.mutate(id),
        }}
      />
    </div>
  );
}
