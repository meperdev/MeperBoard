"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlignLeft,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock,
  GitPullRequest,
  LayoutGrid,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { computeProjectMetrics, isCriticalCard, type ProjectMetrics } from "../../domain/metrics";
import { cn } from "../../lib/utils";
import { countByType } from "../../lib/card-filters";
import type { Card } from "../../state/cards";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { GithubMark } from "../app-header/github-mark";
import { CreateIssueModal } from "../issue-create";
import { OPEN_CREATE_LOCAL_CARD_EVENT } from "../local-cards";
import { SyncControl } from "../workspace/sync-control";

export interface ProjectDashboardProps {
  cards: Card[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filterType: "all" | "issue" | "pull" | "local" | "critical";
  onFilterTypeChange: (filter: "all" | "issue" | "pull" | "local" | "critical") => void;
  onOpenCreate?: () => void;
  onToggleLocalCards?: () => void;
  localCardsCollapsed?: boolean;
  className?: string;
}

/**
 * Sprint & Project Health Dashboard with 3 large KPI metrics, flat progress track,
 * real-time search with inline GitHub Sync, stat count pills, filter controls,
 * view switcher, and quick creation CTA.
 */
export function ProjectDashboard({
  cards,
  searchQuery,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  onOpenCreate,
  onToggleLocalCards,
  localCardsCollapsed = true,
  className,
}: ProjectDashboardProps) {
  const pathname = usePathname();
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);

  const metrics: ProjectMetrics = computeProjectMetrics(cards);
  const counts = useMemo(() => countByType(cards), [cards]);

  const filterCounts = useMemo(() => {
    return {
      all: cards.length,
      issue: cards.filter((c) => c.type === "issue").length,
      pull: cards.filter((c) => c.type === "pull").length,
      local: cards.filter((c) => c.type === "local").length,
      critical: cards.filter((c) => isCriticalCard(c)).length,
    };
  }, [cards]);

  function handleCreateLocal() {
    setShowCreateMenu(false);
    if (onOpenCreate) {
      onOpenCreate();
    } else {
      window.dispatchEvent(new CustomEvent(OPEN_CREATE_LOCAL_CARD_EVENT));
    }
  }

  /** Opens the in-app create-issue dialog (writes are opt-in server-side). */
  function handleOpenGitHubIssue() {
    setShowCreateMenu(false);
    setShowIssueModal(true);
  }

  return (
    <header
      className={cn(
        "relative z-30 flex flex-col gap-3.5 border-b border-border/70 bg-card/25 px-3 sm:px-4 py-3 sm:py-3.5 backdrop-blur-md md:px-6",
        className,
      )}
      role="region"
      aria-label="Project health dashboard"
    >
      {/* Row 1: 3 KPI Summary Cards with large typography */}
      <div className="grid grid-cols-3 gap-1.5 xs:gap-2 sm:gap-3">
        {/* Card 1: Completed */}
        <div
          className="flex items-center gap-2 sm:gap-3 rounded-xl border border-border/60 bg-card/60 p-2 sm:p-3.5 shadow-xs transition-colors hover:border-emerald-500/40"
          data-testid="kpi-completed"
        >
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20">
            <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-0.5 sm:gap-1 font-mono text-base sm:text-2xl font-bold tracking-tight text-foreground">
              <span>{metrics.completed}</span>
              <span className="text-xs sm:text-sm font-medium text-muted-foreground">/{metrics.total}</span>
            </div>
            <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
              Completed
            </p>
          </div>
        </div>

        {/* Card 2: In Progress */}
        <div
          className="flex items-center gap-2 sm:gap-3 rounded-xl border border-border/60 bg-card/60 p-2 sm:p-3.5 shadow-xs transition-colors hover:border-amber-500/40"
          data-testid="kpi-in-progress"
        >
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20">
            <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <div className="font-mono text-base sm:text-2xl font-bold tracking-tight text-foreground">
              {metrics.inProgress}
            </div>
            <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
              In Progress
            </p>
          </div>
        </div>

        {/* Card 3: Velocity / Scope */}
        <div
          className="flex items-center gap-2 sm:gap-3 rounded-xl border border-border/60 bg-card/60 p-2 sm:p-3.5 shadow-xs transition-colors hover:border-primary/40"
          data-testid="kpi-velocity"
        >
          <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-0.5 sm:gap-1 font-mono text-base sm:text-2xl font-bold tracking-tight text-foreground">
              <span>{metrics.velocityScore}</span>
              <span className="text-xs sm:text-sm font-medium text-muted-foreground">/{metrics.totalScore} pts</span>
            </div>
            <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
              Velocity
            </p>
          </div>
        </div>
      </div>

      {/* Row 2: Completion Progress Track (Flat Solid, No Radiant/Gradient) */}
      <div className="flex items-center gap-3">
        <div
          className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted/40"
          role="progressbar"
          aria-valuenow={metrics.completionPercentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Sprint completion progress"
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, metrics.completionPercentage))}%` }}
          />
        </div>
        <span className="shrink-0 font-mono text-xs font-bold text-primary">
          {metrics.completionPercentage}%
        </span>
      </div>

      {/* Row 3: Unified Control & Action Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        {/* Left: Search input + Sync GitHub Mirror */}
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <div className="relative min-w-0 max-w-sm flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search issues and cards..."
              aria-label="Search issues and cards"
              className="w-full rounded-xl border border-border/80 bg-background/80 py-1.5 pl-8 pr-7 text-xs font-medium text-foreground placeholder:text-muted-foreground/60 shadow-2xs outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <SyncControl className="shrink-0" />
        </div>

        {/* Right: Stat pills + Filters + View switch + New Card */}
        <div className="flex items-center justify-between sm:justify-end gap-2 overflow-x-auto no-scrollbar sm:overflow-visible py-0.5">
          {/* Stat Pills (Squared with icons, no bullet dots) */}
          <div className="flex items-center gap-1.5 shrink-0" data-testid="total-count">
            <span className="inline-flex items-center gap-1 rounded-[4px] border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary shadow-2xs">
              <CircleDot className="h-3 w-3 text-primary" aria-hidden="true" />
              <span>{counts.issue} issues</span>
            </span>

            <span className="inline-flex items-center gap-1 rounded-[4px] border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary shadow-2xs">
              <GitPullRequest className="h-3 w-3 text-primary" aria-hidden="true" />
              <span>{counts.pull} PRs</span>
            </span>

            <button
              type="button"
              data-testid="rail-toggle"
              aria-expanded={!localCardsCollapsed}
              aria-controls="local-cards-panel"
              onClick={onToggleLocalCards}
              className="inline-flex items-center gap-1 rounded-[4px] border border-primary/40 bg-primary px-2 py-0.5 font-mono text-[11px] font-bold text-primary-foreground shadow-2xs transition-colors hover:bg-primary-hover cursor-pointer shrink-0"
              title="Toggle local cards panel"
              aria-label="Toggle local cards panel"
            >
              <span>{counts.local} local</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">

          {/* Filters dropdown button */}
          <div className="relative">
            <Button
              type="button"
              variant={filterType !== "all" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setShowFilterMenu((prev) => !prev)}
              aria-label="Filter cards"
              className="h-8 gap-1.5 rounded-xl px-2.5 text-xs shadow-2xs"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filters</span>
              {filterType !== "all" && (
                <span className="rounded bg-primary-foreground/20 px-1 font-mono text-[10px] text-primary-foreground">
                  {filterType}
                </span>
              )}
            </Button>

            {/* Filter Menu Popup with backdrop */}
            {showFilterMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowFilterMenu(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-xl border border-border/80 bg-popover/98 p-1.5 shadow-2xl backdrop-blur-2xl ring-1 ring-primary/20">
                  {(
                    [
                      { id: "all", label: "All Items", count: filterCounts.all },
                      { id: "issue", label: "Issues Only", count: filterCounts.issue },
                      { id: "pull", label: "PRs Only", count: filterCounts.pull },
                      { id: "local", label: "Local Cards", count: filterCounts.local },
                      { id: "critical", label: "Critical / Bugs", count: filterCounts.critical },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        onFilterTypeChange(f.id);
                        setShowFilterMenu(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                        filterType === f.id
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-foreground hover:bg-accent",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span>{f.label}</span>
                        <span
                          className={cn(
                            "rounded px-1 text-[10px] font-mono",
                            filterType === f.id
                              ? "bg-primary-foreground/20 text-primary-foreground"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {f.count}
                        </span>
                      </div>
                      {filterType === f.id && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* View Switcher: Board vs Backlog */}
          <div
            className="flex items-center rounded-xl border border-border/70 bg-card/60 p-0.5 shadow-2xs"
            role="group"
            aria-label="View switcher"
          >
            <Link
              href="/"
              title="Board view"
              aria-label="Board view"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                pathname === "/"
                  ? "bg-primary text-primary-foreground shadow-2xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Link>

            <Link
              href="/backlog"
              title="Backlog list view"
              aria-label="Backlog list view"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                pathname === "/backlog"
                  ? "bg-primary text-primary-foreground shadow-2xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* CTA: Dual Action + New Card / GitHub Issue */}
          <div className="relative">
            <div className="inline-flex rounded-xl shadow-xs shadow-primary/20">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleCreateLocal}
                aria-label="New card or issue"
                className="h-8 gap-1.5 rounded-r-none px-3 text-xs font-semibold"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Card</span>
              </Button>
              <button
                type="button"
                onClick={() => setShowCreateMenu((prev) => !prev)}
                aria-label="More creation options"
                aria-haspopup="menu"
                aria-expanded={showCreateMenu}
                title="More creation options"
                className="inline-flex h-8 items-center justify-center rounded-r-xl border-l border-primary-foreground/20 bg-primary px-1.5 text-primary-foreground hover:bg-primary-hover focus-visible:outline-none"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Creation Menu Popup */}
            {showCreateMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowCreateMenu(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-xl border border-border/80 bg-popover/98 p-1.5 shadow-2xl backdrop-blur-2xl ring-1 ring-primary/20">
                  <button
                    type="button"
                    onClick={handleCreateLocal}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-foreground transition-colors hover:bg-accent"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                    <div className="text-left">
                      <p className="font-semibold text-foreground">Local card</p>
                      <p className="text-[10px] text-muted-foreground">IndexedDB • Offline</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenGitHubIssue}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-foreground transition-colors hover:bg-accent"
                  >
                    <GithubMark className="h-3.5 w-3.5 text-primary shrink-0" />
                    <div className="text-left">
                      <p className="font-semibold text-foreground">GitHub Issue</p>
                      <p className="text-[10px] text-muted-foreground">Creates on GitHub</p>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
          </div>
        </div>
      </div>

      {showIssueModal && <CreateIssueModal onClose={() => setShowIssueModal(false)} />}
    </header>
  );
}
