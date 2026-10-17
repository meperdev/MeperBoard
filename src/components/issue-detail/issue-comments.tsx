"use client";

import { useState, type FormEvent } from "react";

import type { RepoId } from "../../data/types";
import { formatRelativeShort } from "../../lib/relative-date";
import { useCreateComment, useIssueComments } from "../../state";
import { Button } from "../ui/button";
import { MarkdownContent } from "../ui/MarkdownContent";
import { Textarea } from "../ui/textarea";

export interface IssueCommentsProps {
  /** Mirrored repo id (e.g. "owner/name") of the open issue/PR. */
  repo: RepoId;
  /** GitHub issue/PR number the comments belong to. */
  number: number;
}

/**
 * Comments section of the issue detail: the live conversation plus the
 * composer that posts a new comment to GitHub.
 *
 * Comments are volatile, so they are fetched live per open issue (never
 * mirrored) and rendered in GitHub's own order. The composer is the detail
 * view's only write surface; the list itself stays read-only.
 */
export function IssueComments({ repo, number }: IssueCommentsProps) {
  return (
    <section className="mt-6" aria-labelledby="issue-comments-heading">
      <h3
        id="issue-comments-heading"
        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        Comments
      </h3>

      <CommentList repo={repo} number={number} />
      <CommentComposer repo={repo} number={number} />
    </section>
  );
}

function CommentList({ repo, number }: IssueCommentsProps) {
  const comments = useIssueComments(repo, number);

  if (comments.isPending) {
    return (
      <p role="status" className="mt-2 text-sm text-muted-foreground">
        Loading comments…
      </p>
    );
  }
  if (comments.isError) {
    return <p className="mt-2 text-sm text-muted-foreground">Could not load comments.</p>;
  }
  if (comments.data.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">No comments yet.</p>;
  }

  return (
    <ul className="mt-3 flex flex-col gap-3">
      {comments.data.map((comment) => (
        <li key={comment.id} className="rounded-lg border bg-card px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-foreground">{comment.user?.login ?? "ghost"}</span>
            <span className="text-muted-foreground">
              {formatRelativeShort(comment.created_at)} ago
            </span>
          </div>
          <div className="mt-1.5">
            <MarkdownContent content={comment.body} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function CommentComposer({ repo, number }: IssueCommentsProps) {
  const createComment = useCreateComment(repo, number);
  const [text, setText] = useState("");
  const canSubmit = text.trim().length > 0 && !createComment.isPending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    try {
      await createComment.mutateAsync({ body: text });
      setText("");
    } catch {
      // The mapped message renders from `createComment.error` while the draft
      // stays in the textarea.
    }
  }

  return (
    <form className="mt-4 flex flex-col gap-2" onSubmit={handleSubmit}>
      <label htmlFor="issue-comment-body" className="text-xs font-medium text-muted-foreground">
        New comment
      </label>
      <Textarea
        id="issue-comment-body"
        rows={3}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Write a comment…"
      />

      {createComment.isError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
        >
          {createComment.error.message}
        </p>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          disabled={!canSubmit}
          loading={createComment.isPending}
        >
          Comment
        </Button>
      </div>
    </form>
  );
}
