"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle,
  CircleDot,
  Clock,
  GitPullRequest,
  PanelRight,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "../../lib/utils";
import { countByType } from "../../lib/card-filters";
import {
  loadLocalCardsCollapsed,
  saveLocalCardsCollapsed,
} from "../../lib/local-cards-collapsed";
import { SPRING_RAIL } from "../../lib/motion";
import { useMinWidth } from "../../lib/use-min-width";
import { useBacklog, useLocalCards, useMoveCard, useResetCardMove, useSync, type Card } from "../../state";
import { TOGGLE_LOCAL_CARDS_EVENT } from "../app-header/command-palette";
import { AppHeader } from "../app-header/app-header";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Portal } from "../ui/portal";
import { Board } from "../board";
import { LocalCards } from "../local-cards";

import { CardPreviewDrawer } from "../preview-drawer/card-preview-drawer";
import { ProjectDashboard } from "../dashboard";
import { CreateIssueTrigger } from "../issue-create";
import { SyncControl } from "./sync-control";

/** Desktop width of the Local Cards rail (matches the round-1 grid column). */
const RAIL_WIDTH = 340;

/**
 * The board page composition: app header, project health dashboard, a read-only sync
 * control, the kanban board (with move persistence wired), and the local-card slide-over.
 */
export function BoardWorkspace() {
  const [collapsed, setCollapsed] = useState<boolean>(() => loadLocalCardsCollapsed());
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "issue" | "pull" | "local" | "critical">("all");

  const { data: allCards = [] } = useBacklog();
  const moveCard = useMoveCard();
  const resetCard = useResetCardMove();
  const { remove: removeLocalCard } = useLocalCards();

  useEffect(() => {
    saveLocalCardsCollapsed(collapsed);
  }, [collapsed]);

  // The ⌘K palette's "Toggle local cards panel" command drives the same rail
  // state the toolbar toggle owns, so the palette stays a single entry point.
  useEffect(() => {
    function handleToggleLocalCards() {
      setCollapsed((prev) => !prev);
    }
    window.addEventListener(TOGGLE_LOCAL_CARDS_EVENT, handleToggleLocalCards);
    return () => window.removeEventListener(TOGGLE_LOCAL_CARDS_EVENT, handleToggleLocalCards);
  }, []);

  function toggle() {
    setCollapsed((prev) => !prev);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppHeader />

      {/* KPI Project Health Dashboard & Consolidated Control Toolbar */}
      <ProjectDashboard
        cards={allCards}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filterType={filterType}
        onFilterTypeChange={setFilterType}
        onToggleLocalCards={toggle}
        localCardsCollapsed={collapsed}
      />

      {/* Board action bar: the explicit GitHub write trigger (writes are opt-in server-side). */}
      <div className="flex items-center justify-end gap-2 px-2.5 pt-1 sm:px-4">
        <CreateIssueTrigger />
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <RailLayout
          collapsed={collapsed}
          onToggle={toggle}
          onSelectCard={setSelectedCard}
          searchQuery={searchQuery}
          filterType={filterType}
        />
      </div>

      <CardPreviewDrawer
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
        onMoveColumn={(cardId, toColumnId) => {
          moveCard.mutate({
            cardId,
            toColumnId,
          });
          if (selectedCard) {
            setSelectedCard({ ...selectedCard, columnId: toColumnId, isManualOverride: true });
          }
        }}
        onResetToGit={(cardId) => {
          resetCard.mutate(cardId);
          if (selectedCard && selectedCard.naturalColumnId) {
            setSelectedCard({
              ...selectedCard,
              columnId: selectedCard.naturalColumnId,
              isManualOverride: false,
            });
          }
        }}
        onDeleteLocal={(localId) => {
          removeLocalCard.mutate(localId);
          setSelectedCard(null);
        }}
      />
    </div>
  );
}

function RailLayout({
  collapsed,
  onToggle,
  onSelectCard,
  searchQuery = "",
  filterType = "all",
}: {
  collapsed: boolean;
  onToggle: () => void;
  onSelectCard: (card: Card) => void;
  searchQuery?: string;
  filterType?: "all" | "issue" | "pull" | "local" | "critical";
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const moveCard = useMoveCard();

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      <div className="h-full min-w-0 flex-1 overflow-hidden">
        <Board
          onMoveCard={(move) => moveCard.mutate(move)}
          onSelectCard={onSelectCard}
          searchQuery={searchQuery}
          filterType={filterType}
        />
      </div>

      {!collapsed && (
        <Portal>
          <div
            id="local-cards-panel"
            className="fixed inset-0 z-40 flex justify-end"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={onToggle}
              className="fixed inset-0 bg-background/50 backdrop-blur-xs transition-opacity"
              aria-hidden="true"
            />

            {/* Slide-in Sheet */}
            <motion.aside
              initial={reduceMotion ? false : { x: "100%", opacity: 0.7 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 32, stiffness: 380 }}
              className="relative z-50 flex h-full w-full max-w-full sm:max-w-md flex-col border-l border-border/80 bg-card/95 backdrop-blur-2xl shadow-2xl"
            >
              <LocalCards onClose={onToggle} />
            </motion.aside>
          </div>
        </Portal>
      )}
    </div>
  );
}
