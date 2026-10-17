"use client";

import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { useCreateIssue } from "../../state";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Portal } from "../ui/portal";
import { Textarea } from "../ui/textarea";

export interface CreateIssueModalProps {
  /** Closes the dialog; called on success, Escape, backdrop click, and Cancel. */
  onClose: () => void;
}

/**
 * Create-issue dialog for the active repo.
 *
 * Writes are opt-in on the server, so failures come back mapped: 405 (writes
 * disabled) and 401 (no session) show an actionable message, a 403 shows
 * GitHub's own permission answer. The dialog stays open on failure so the
 * draft survives; on success it closes and the create hook refreshes the
 * derived reads.
 *
 * Rendered via Portal into document.body to break out of any parent
 * backdrop-filter / transform / header containing block.
 */
export function CreateIssueModal({ onClose }: CreateIssueModalProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const createIssue = useCreateIssue();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const canSubmit = title.trim().length > 0 && !createIssue.isPending;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    try {
      await createIssue.mutateAsync({ title, body });
      onClose();
    } catch {
      // The mapped message renders from `createIssue.error` while the dialog
      // stays open with the user's draft intact.
    }
  }

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-issue-heading"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      >
        <motion.div
          data-testid="create-issue-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-background/80 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-border/80 bg-card/95 p-6 text-card-foreground shadow-2xl backdrop-blur-xl ring-1 ring-border/50 sm:p-7"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>

          <h2 id="create-issue-heading" className="text-lg font-bold tracking-tight text-foreground">
            New issue
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Creates the issue in the active repository on GitHub.
          </p>

          <form className="mt-5 flex flex-col gap-3.5" onSubmit={handleSubmit}>
            <label
              htmlFor="create-issue-title"
              className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <span>Title</span>
              <Input
                id="create-issue-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Issue title"
                autoFocus
              />
            </label>

            <label
              htmlFor="create-issue-body"
              className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <span>
                Description <span className="text-muted-foreground/70">(optional)</span>
              </span>
              <Textarea
                id="create-issue-body"
                rows={5}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Add more context…"
              />
            </label>

            {createIssue.isError && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
              >
                {createIssue.error.message}
              </p>
            )}

            <div className="mt-1 flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!canSubmit} loading={createIssue.isPending}>
                Create issue
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </Portal>
  );
}
