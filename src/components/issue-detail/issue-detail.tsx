"use client";

import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "../ui/button";
import { formatState } from "../ui/card-meta";
import { MarkdownContent } from "../ui/MarkdownContent";

import { cn } from "../../lib/utils";
import type { GithubItem, RepoId } from "../../data/types";
import { useIssueDetail, useSetIssueState } from "../../state";
import { IssueComments } from "./issue-comments";
import { IssueLabels } from "./issue-labels";

export interface IssueDetailProps {
  /** Mirrored repo id (e.g. "owner/name"); `undefined` means nothing selected. */
  repo?: RepoId;
  /** GitHub issue/PR number; `undefined` means nothing selected. */
  number?: number;
}

const KIND_LABEL: Record<string, string> = {
  issue: "Issue",
  pull: "Pull request",
};

/**
 * Detail for a selected GitHub issue or pull request.
 *
 * Shows title, type, state, labels, body, linked PRs, and the live comment
 * thread with the composer that posts a new comment. The close/reopen action
 * sits next to the state badge, and the labels section carries its inline
 * editor. Those three are the write surfaces here: editing the issue itself is
 * still a separate task (spec github-write-path S7).
 */
export function IssueDetail({ repo, number }: IssueDetailProps) {
  const { data, isPending, isError } = useIssueDetail(repo, number);

  if (repo == null || number == null) {
    return <DetailStatus>Select an issue to view its details.</DetailStatus>;
  }
  if (isPending) {
    return <IssueDetailSkeleton />;
  }
  if (isError) {
    return <DetailStatus>Failed to load the issue.</DetailStatus>;
  }
  if (!data) {
    return <DetailStatus>Issue not found.</DetailStatus>;
  }

  return <IssueDetailView item={data} />;
}

function IssueDetailView({ item }: { item: GithubItem }) {
  const kind = KIND_LABEL[item.kind] ?? item.kind;
  const isOpen = item.state === "open";

  return (
    <article
      className="mx-auto w-full max-w-3xl p-4 md:p-8"
      role="region"
      aria-label="Issue details"
    >
      <header className="border-b pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {kind}
          </span>
          <span
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs font-medium",
              isOpen
                ? "border-success/30 bg-success/10 text-success"
                : "text-muted-foreground",
            )}
          >
            {formatState(item.state)}
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">#{item.number}</span>
          <IssueStateControl item={item} />
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">{item.title}</h2>
        {item.html_url && (
          <a
            href={item.html_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 rounded-md text-sm font-medium text-link transition-colors duration-150 hover:underline hover:underline-offset-4"
          >
            Open on GitHub
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </header>

      <IssueLabels item={item} />

      <section className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Description
        </h3>
        <div className="mt-2">
          <MarkdownContent content={item.body} />
        </div>
      </section>

      <section className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Linked pull requests
        </h3>
        {item.linked_prs.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No linked pull requests.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {item.linked_prs.map((pr) => {
              const prUrl = item.html_url
                ? item.html_url.replace(/\/issues\/\d+$/, "").replace(/\/pull\/\d+$/, "") + `/pull/${pr}`
                : null;
              return (
                <li key={pr}>
                  {prUrl ? (
                    <a
                      href={prUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs tabular-nums text-link transition-colors duration-150 hover:underline hover:underline-offset-4"
                    >
                      #{pr}
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                      #{pr}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <IssueComments repo={item.repo} number={item.number} />
    </article>
  );
}

/**
 * Close/reopen write control (spec github-write-path S7): flips the issue or
 * PR between open and closed through the proxy and reflects the new state
 * immediately, because the hook writes the PATCH response into the mirror.
 *
 * The label names the item's kind ("Close issue" / "Close pull request"); the
 * write has no confirm step because reopening is immediate and reversible.
 */
function IssueStateControl({ item }: { item: GithubItem }) {
  const isOpen = item.state === "open";
  const target = isOpen ? "closed" : "open";
  const setState = useSetIssueState(item.repo, item.number, target);
  const noun = (KIND_LABEL[item.kind] ?? item.kind).toLowerCase();
  const label = isOpen ? `Close ${noun}` : `Reopen ${noun}`;
  const pendingLabel = isOpen ? "Closing…" : "Reopening…";

  return (
    <div className="ml-auto flex flex-col items-start gap-1">
      <Button
        type="button"
        size="sm"
        disabled={setState.isPending}
        onClick={() => setState.mutate()}
      >
        {setState.isPending ? pendingLabel : label}
      </Button>
      {setState.isError && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {setState.error.message}
        </p>
      )}
    </div>
  );
}

function DetailStatus({ children }: { children: ReactNode }) {
  return (
    <p className="mx-auto w-full max-w-3xl p-4 text-sm text-muted-foreground md:p-8">{children}</p>
  );
}

/** Header- and body-shaped placeholders while the issue query resolves. */
function IssueDetailSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-3xl p-4 md:p-8"
      role="status"
      aria-label="Loading issue"
    >
      <div className="border-b pb-5">
        <div className="flex gap-2">
          <div className="h-5 w-16 animate-pulse rounded-full bg-muted/70" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-muted/70" />
        </div>
        <div className="mt-3 h-7 w-2/3 animate-pulse rounded bg-muted/70" />
        <div className="mt-2 h-4 w-28 animate-pulse rounded bg-muted/70" />
      </div>
      <div className="mt-6 flex flex-col gap-2">
        <div className="h-3 w-20 animate-pulse rounded bg-muted/70" />
        <div className="h-4 w-full animate-pulse rounded bg-muted/70" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-muted/70" />
        <div className="h-4 w-4/6 animate-pulse rounded bg-muted/70" />
      </div>
    </div>
  );
}


