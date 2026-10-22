/**
 * Repository color schemes and utilities for distinctive multi-repo cards and badges.
 */

export interface RepoColorScheme {
  id: string;
  name: string;
  dot: string;
  bg: string;
  border: string;
  text: string;
  badge: string;
  bar: string;
}

export const REPO_COLOR_PALETTES: readonly RepoColorScheme[] = [
  {
    id: "emerald",
    name: "Emerald",
    dot: "#10b981",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-600 dark:text-emerald-400",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
  },
  {
    id: "cyan",
    name: "Cyan",
    dot: "#06b6d4",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
    text: "text-cyan-600 dark:text-cyan-400",
    badge: "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    bar: "bg-cyan-500",
  },
  {
    id: "indigo",
    name: "Indigo",
    dot: "#6366f1",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/30",
    text: "text-indigo-600 dark:text-indigo-400",
    badge: "border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    bar: "bg-indigo-500",
  },
  {
    id: "purple",
    name: "Purple",
    dot: "#a855f7",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    text: "text-purple-600 dark:text-purple-400",
    badge: "border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400",
    bar: "bg-purple-500",
  },
  {
    id: "amber",
    name: "Amber",
    dot: "#f59e0b",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-600 dark:text-amber-400",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
  },
  {
    id: "rose",
    name: "Rose",
    dot: "#f43f5e",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    text: "text-rose-600 dark:text-rose-400",
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
    bar: "bg-rose-500",
  },
  {
    id: "blue",
    name: "Blue",
    dot: "#3b82f6",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    text: "text-blue-600 dark:text-blue-400",
    badge: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
    bar: "bg-blue-500",
  },
  {
    id: "orange",
    name: "Orange",
    dot: "#f97316",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    text: "text-orange-600 dark:text-orange-400",
    badge: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
    bar: "bg-orange-500",
  },
] as const;

export const DEFAULT_REPO_COLOR: RepoColorScheme = {
  id: "slate",
  name: "Slate",
  dot: "#94a3b8",
  bg: "bg-slate-500/10",
  border: "border-slate-500/30",
  text: "text-slate-600 dark:text-slate-400",
  badge: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400",
  bar: "bg-slate-500",
};

/**
 * Hash a repository identifier to deterministically pick a distinctive color scheme.
 */
export function getRepoColorScheme(repoId?: string | null): RepoColorScheme {
  if (!repoId) return DEFAULT_REPO_COLOR;
  let hash = 0;
  for (let i = 0; i < repoId.length; i++) {
    hash = (hash << 5) - hash + repoId.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % REPO_COLOR_PALETTES.length;
  return REPO_COLOR_PALETTES[index] ?? DEFAULT_REPO_COLOR;
}

/**
 * Extract short display name for a repository (e.g. "MeperBoard" from "meperdev/MeperBoard").
 */
export function getRepoShortName(repoId?: string | null): string | null {
  if (!repoId) return null;
  const parts = repoId.split("/");
  return parts.length > 1 ? parts[1] : repoId;
}
