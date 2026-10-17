"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "../ui/button";
import { CreateIssueModal } from "./create-issue-modal";

/**
 * Write trigger shared by the board page and the backlog toolbar: opens the
 * create-issue dialog for the active repo and closes it again on success,
 * Escape, backdrop click, or Cancel.
 */
export function CreateIssueTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5 shadow-xs"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        <span>New issue</span>
      </Button>
      {open && <CreateIssueModal onClose={() => setOpen(false)} />}
    </>
  );
}
