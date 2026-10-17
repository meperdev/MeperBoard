import { ArrowDown, ArrowUp, Search } from "lucide-react";
import type { BacklogGroupKey } from "../../domain/grouping";
import type { CardType, SortDirection, SortField } from "../../state";
import { CreateIssueTrigger } from "../issue-create";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { SyncControl } from "../workspace/sync-control";

export type TypeFilter = CardType | "all";

export const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "issue", label: "Issues" },
  { value: "pull", label: "Pull requests" },
  { value: "local", label: "Local" },
];

export const SORT_FIELD_OPTIONS: { value: SortField; label: string }[] = [
  { value: "updated", label: "Recently updated" },
  { value: "created", label: "Date created" },
  { value: "number", label: "Issue / PR #" },
  { value: "title", label: "Title" },
  { value: "state", label: "State" },
  { value: "column", label: "Column" },
];

export const GROUP_OPTIONS: { value: BacklogGroupKey; label: string }[] = [
  { value: "none", label: "No grouping" },
  { value: "column", label: "Board column" },
  { value: "state", label: "State" },
  { value: "type", label: "Type" },
  { value: "source", label: "Source" },
];

export const ALL_LABELS = "all";

export interface BacklogToolbarProps {
  searchInput: string;
  onSearchChange: (value: string) => void;
  typeFilter: TypeFilter;
  onTypeFilterChange: (type: TypeFilter) => void;
  labelFilter: string;
  onLabelFilterChange: (label: string) => void;
  labelOptions: { value: string; label: string }[];
  repoFilter?: string;
  onRepoFilterChange?: (repo: string) => void;
  repoOptions?: { value: string; label: string }[];
  groupBy: BacklogGroupKey;
  onGroupByChange: (group: BacklogGroupKey) => void;
  sortField: SortField;
  onSortFieldChange: (field: SortField) => void;
  sortDir: SortDirection;
  onToggleSortDir: () => void;
}

export function BacklogToolbar({
  searchInput,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  labelFilter,
  onLabelFilterChange,
  labelOptions,
  repoFilter,
  onRepoFilterChange,
  repoOptions,
  groupBy,
  onGroupByChange,
  sortField,
  onSortFieldChange,
  sortDir,
  onToggleSortDir,
}: BacklogToolbarProps) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-2.5 sm:gap-3">
      <label className="flex min-w-[200px] flex-1 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
        <span>Search</span>
        <span className="relative inline-flex w-full items-center">
          <Search
            className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            variant="search"
            value={searchInput}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Filter by title…"
          />
        </span>
      </label>

      <div className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
        <span>Type</span>
        <Select
          aria-label="Type"
          options={TYPE_OPTIONS}
          value={typeFilter}
          onValueChange={(next) => onTypeFilterChange(next as TypeFilter)}
          className="w-28 sm:w-32"
        />
      </div>

      {repoOptions && repoOptions.length > 2 && onRepoFilterChange && (
        <div className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
          <span>Repository</span>
          <Select
            aria-label="Repository"
            options={repoOptions}
            value={repoFilter ?? "all"}
            onValueChange={onRepoFilterChange}
            className="w-32 sm:w-36"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
        <span>Label</span>
        <Select
          aria-label="Label"
          options={labelOptions}
          value={labelFilter}
          onValueChange={onLabelFilterChange}
          className="w-32 sm:w-40"
        />
      </div>

      <div className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
        <span>Group by</span>
        <Select
          aria-label="Group by"
          options={GROUP_OPTIONS}
          value={groupBy}
          onValueChange={(next) => onGroupByChange(next as BacklogGroupKey)}
          className="w-32 sm:w-36"
        />
      </div>

      <div className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
        <span>Sort by</span>
        <div className="flex items-center gap-1">
          <Select
            aria-label="Sort by"
            options={SORT_FIELD_OPTIONS}
            value={sortField}
            onValueChange={(next) => onSortFieldChange(next as SortField)}
            className="w-32 sm:w-36"
          />
          <button
            type="button"
            onClick={onToggleSortDir}
            aria-label="Toggle sort direction"
            aria-pressed={sortDir === "desc"}
            title={`Sort ${sortField} ${sortDir === "asc" ? "ascending" : "descending"}. Click to reverse.`}
            className="rounded-lg border bg-card p-2 text-foreground shadow-xs transition-colors duration-150 hover:border-primary/40 hover:text-primary hover:bg-muted"
          >
            {sortDir === "asc" ? (
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 pb-0.5 sm:ml-auto">
        <CreateIssueTrigger />
        <SyncControl />
      </div>
    </div>
  );
}
