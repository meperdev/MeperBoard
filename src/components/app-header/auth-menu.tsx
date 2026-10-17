"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Activity, FolderGit2, LogOut, ShieldCheck, Sparkles } from "lucide-react";

import type { Repo } from "../../data/types";
import { DEFAULT_REPO } from "../../state";
import type { AuthUser } from "./use-auth";

interface AuthMenuProps {
  user: AuthUser;
  /** The persisted active repo, or `undefined` while it resolves. */
  activeRepo?: Repo;
  /** All persisted active repos. */
  activeRepos?: Repo[];
  onLogout: () => void;
  onClose: () => void;
}

/**
 * Modern account dropdown for the authenticated header state.
 *
 * Displays user identity with tags, active repository info,
 * API health/rate limit, and disconnect action.
 */
export function AuthMenu({ user, activeRepo, activeRepos, onLogout, onClose }: AuthMenuProps) {
  const reduceMotion = useReducedMotion() ?? false;

  function handleLogout() {
    void onLogout();
    onClose();
  }

  const repos = activeRepos ?? (activeRepo ? [activeRepo] : []);
  const activeRepoLabel = repos.length === 0
    ? `${DEFAULT_REPO.owner}/${DEFAULT_REPO.name}`
    : repos.length === 1
      ? `${repos[0].owner}/${repos[0].name}`
      : `${repos.length} active repositories`;
  const rateLimitRemaining = user.rate_limit?.remaining ?? 5000;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: -4, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.96 }}
      transition={{ duration: 0.12 }}
      role="menu"
      aria-label="Account menu"
      className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-border/80 bg-popover/95 p-3 text-popover-foreground shadow-2xl backdrop-blur-xl ring-1 ring-border/50"
    >
      {/* Profile Header */}
      <div className="flex items-start gap-3 px-1 py-1">
        <div className="relative">
          <img
            src={user.avatar_url}
            alt={user.login}
            className="h-10 w-10 rounded-full ring-2 ring-border/80 shadow-xs"
          />
          <span
            className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-popover"
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{user.login}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500 ring-1 ring-emerald-500/20">
              <Sparkles className="h-2.5 w-2.5" />
              GitHub App
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-primary/20">
              <ShieldCheck className="h-2.5 w-2.5" />
              Read-only by default
            </span>
          </div>
        </div>
      </div>

      <div className="my-2.5 h-px bg-border/60" aria-hidden="true" />

      {/* Active Repository Info */}
      <div className="rounded-xl border border-border/70 bg-card/60 p-2.5 shadow-xs">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <FolderGit2 className="h-3 w-3 text-primary" />
            Active {repos.length > 1 ? "Repositories" : "Repository"}
          </span>
          <span className="rounded bg-primary/10 px-1.5 py-0.2 text-[9px] font-medium text-primary">
            {repos.length > 1 ? `${repos.length} Active` : "Tracked"}
          </span>
        </div>
        <div className="mt-1 truncate font-mono text-xs font-semibold text-foreground">
          {activeRepoLabel}
        </div>
      </div>

      <div className="my-2.5 h-px bg-border/60" aria-hidden="true" />

      {/* Rate limit status */}
      <div className="flex items-center justify-between rounded-xl bg-accent/40 px-2.5 py-2 text-xs">
        <span className="flex items-center gap-2 text-muted-foreground text-[11px]">
          <Activity className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          API Rate limit
        </span>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-semibold text-foreground">
            {rateLimitRemaining}
          </span>
          <span className="text-[10px] text-muted-foreground">/ 5k</span>
          <span className="ml-1 inline-flex items-center rounded-full bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-semibold text-emerald-500 ring-1 ring-emerald-500/20">
            Healthy
          </span>
        </div>
      </div>

      <div className="my-2.5 h-px bg-border/60" aria-hidden="true" />

      {/* Disconnect Button */}
      <button
        type="button"
        role="menuitem"
        onClick={handleLogout}
        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-destructive transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive"
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
        Disconnect account
      </button>
    </motion.div>
  );
}
