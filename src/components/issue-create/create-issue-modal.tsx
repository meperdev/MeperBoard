"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Eye, Pencil, Plus, X } from "lucide-react";
import {
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { cn } from "../../lib/utils";
import { useCreateIssue } from "../../state";
import { useActiveRepo } from "../../state/use-repos";
import { DEFAULT_REPO } from "../../state/useSync";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { MarkdownContent } from "../ui/MarkdownContent";
import { Portal } from "../ui/portal";
import { Textarea } from "../ui/textarea";

export interface CreateIssueModalProps {
  /** Closes the dialog; called on success, Escape, backdrop click, and Cancel. */
  onClose: () => void;
}

/**
 * Premium create-issue composer for the active repo.
 *
 * Write/Preview tabs render the description with the same sanitized markdown
 * pipeline as the issue detail (`MarkdownContent`), and Cmd/Ctrl+Enter submits
 * from anywhere in the form. Writes are opt-in on the server, so failures come
 * back mapped: 405 (writes disabled) and 401 (no session) show an actionable
 * message, a 403 shows GitHub's own permission answer. The dialog stays open on
 * failure so the draft survives; on success it closes and the create hook
 * refreshes the derived reads.
 *
 * Rendered via Portal into document.body to break out of any parent
 * backdrop-filter / transform / header containing block.
 */
export function CreateIssueModal({ onClose }: CreateIssueModalProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const createIssue = useCreateIssue();
  const activeRepo = useActiveRepo();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"write" | "preview">("write");
  const canSubmit = title.trim().length > 0 && !createIssue.isPending;

  // Same repo resolution as the create hook: active repo, shared default fallback.
  const repo = activeRepo.data ?? DEFAULT_REPO;
  const repoId = `${repo.owner}/${repo.name}`;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function submit() {
    if (!canSubmit) return;
    try {
      await createIssue.mutateAsync({ title, body });
      onClose();
    } catch {
      // The mapped message renders from `createIssue.error` while the dialog
      // stays open with the user's draft intact.
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  function handleFormKeyDown(event: ReactKeyboardEvent<HTMLFormElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void submit();
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
          className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-border/80 bg-card/95 p-6 text-card-foreground shadow-2xl backdrop-blur-xl ring-1 ring-border/50 sm:p-7"
        >
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <Plus className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2
                id="create-issue-heading"
                className="text-lg font-bold tracking-tight text-foreground"
              >
                New issue
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Creates on GitHub in
                <span className="rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground/80 ring-1 ring-border/60">
                  {repoId}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>

          <form
            className="mt-5 flex flex-col gap-4"
            onSubmit={handleSubmit}
            onKeyDown={handleFormKeyDown}
          >
            <label htmlFor="create-issue-title" className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Title
              </span>
              <Input
                id="create-issue-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Issue title"
                autoFocus
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="create-issue-body"
                  className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Description{" "}
                  <span className="font-medium normal-case tracking-normal text-muted-foreground/70">
                    (optional)
                  </span>
                </label>

                <div
                  role="group"
                  aria-label="Editor mode"
                  className="inline-flex rounded-lg border border-border/70 bg-card/60 p-0.5"
                >
                  <button
                    type="button"
                    onClick={() => setMode("write")}
                    aria-pressed={mode === "write"}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors",
                      mode === "write"
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Pencil className="h-3 w-3" aria-hidden="true" />
                    Write
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("preview")}
                    aria-pressed={mode === "preview"}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors",
                      mode === "preview"
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Eye className="h-3 w-3" aria-hidden="true" />
                    Preview
                  </button>
                </div>
              </div>

              {mode === "write" ? (
                <Textarea
                  id="create-issue-body"
                  rows={6}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Add more context…"
                />
              ) : (
                <div
                  data-testid="issue-preview"
                  className="min-h-36 rounded-lg border border-border bg-card px-3.5 py-3 text-sm shadow-xs"
                >
                  {body.trim() ? (
                    <MarkdownContent content={body} />
                  ) : (
                    <p className="text-xs italic text-muted-foreground">
                      Nothing to preview yet — switch to Write and describe the issue.
                    </p>
                  )}
                </div>
              )}
            </div>

            {createIssue.isError && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{createIssue.error.message}</span>
              </p>
            )}

            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="hidden text-[10px] font-medium text-muted-foreground sm:block">
                Markdown supported · ⌘⏎ to create
              </span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!canSubmit}
                  loading={createIssue.isPending}
                >
                  Create issue
                </Button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </Portal>
  );
}
