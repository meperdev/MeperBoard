"use client";

import { useState } from "react";

import type { GithubItem } from "../../data/types";
import { cn } from "../../lib/utils";
import { useRepoLabels, useSetIssueLabels } from "../../state";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

export interface IssueLabelsProps {
  /** Mirrored item whose labels the section reads and edits. */
  item: GithubItem;
}

/**
 * Labels section of the issue detail: the item's current labels plus the
 * "Edit labels" affordance that opens an inline editor (spec github-write-path
 * S7/S8).
 *
 * The editor lists every label of the repo — read live through the per-user
 * proxy — as toggle chips whose pressed state mirrors the item's current
 * labels; Save PATCHes the full replacement list. Read failures and save
 * failures both render inline instead of unmounting the editor.
 */
export function IssueLabels({ item }: IssueLabelsProps) {
  const [editing, setEditing] = useState(false);

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Labels
        </h3>
        {!editing && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit labels
          </Button>
        )}
      </div>

      {editing ? (
        <LabelsEditor item={item} onClose={() => setEditing(false)} />
      ) : item.labels.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No labels.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {item.labels.map((label) => (
            <li key={label}>
              <Badge variant="outline">{label}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LabelsEditor({ item, onClose }: { item: GithubItem; onClose: () => void }) {
  const repoLabels = useRepoLabels(item.repo);
  const setLabels = useSetIssueLabels(item.repo, item.number);
  const [selected, setSelected] = useState<string[]>(item.labels);
  const pending = setLabels.isPending;

  // The catalog can lag behind the item (a label may still be on the issue
  // after being deleted from the repo), so the chips cover the union: catalog
  // order first, then any selected label the catalog no longer lists.
  const catalogNames = (repoLabels.data ?? []).map((label) => label.name);
  const chipNames = [
    ...catalogNames,
    ...selected.filter((name) => !catalogNames.includes(name)),
  ];

  function toggle(name: string) {
    setSelected((current) =>
      current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name],
    );
  }

  async function handleSave() {
    try {
      await setLabels.mutateAsync(selected);
      onClose();
    } catch {
      // The mapped message renders from `setLabels.error`; the editor stays
      // open with the selection so the user can retry or adjust.
    }
  }

  return (
    <div className="mt-2 rounded-lg border bg-card px-3 py-2.5">
      {repoLabels.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading labels…
        </p>
      )}
      {repoLabels.isError && (
        <p className="text-sm text-muted-foreground">Could not load the repo labels.</p>
      )}
      {repoLabels.data != null &&
        (chipNames.length === 0 ? (
          <p className="text-sm text-muted-foreground">This repo has no labels.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {chipNames.map((name) => {
              const checked = selected.includes(name);
              return (
                <li key={name}>
                  <button
                    type="button"
                    aria-pressed={checked}
                    disabled={pending}
                    onClick={() => toggle(name)}
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-[4px] border px-1.5 py-0.5 text-xs font-medium leading-none transition-colors duration-150",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      checked
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {name}
                  </button>
                </li>
              );
            })}
          </ul>
        ))}

      {setLabels.isError && (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
        >
          {setLabels.error.message}
        </p>
      )}

      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" size="sm" variant="primary" disabled={pending} onClick={handleSave}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
