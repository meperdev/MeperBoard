"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ExternalLink, Shield, X } from "lucide-react";
import { useEffect } from "react";

import { Portal } from "../ui/portal";
import { GithubMark } from "./github-mark";
import { useAuth } from "./use-auth";

interface ConnectModalProps {
  onClose: () => void;
}

/**
 * Pre-authorization overlay that explains the permissions the GitHub App will
 * receive before the user is redirected to GitHub.
 *
 * Rendered via Portal directly into document.body to break out of any parent
 * backdrop-filter / transform / header containing block.
 */
export function ConnectModal({ onClose }: ConnectModalProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const { login } = useAuth();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connect GitHub"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      >
        <motion.div
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

          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/30 ring-1 ring-primary/40">
            <GithubMark className="h-6 w-6" />
          </div>

          <h2 className="text-lg font-bold tracking-tight text-foreground">Connect GitHub</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            MeperBoard connects to GitHub to mirror the issues and pull requests for your repositories in real time.
          </p>

          <div className="mt-4 flex items-start gap-3 rounded-xl border border-border/70 bg-elevated/70 p-3.5 shadow-xs">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              <strong className="font-semibold text-foreground">Read-only by default.</strong> MeperBoard reads
              issues and pull requests in the repositories you grant. When the deployment enables writes, the
              explicit actions you take — create, comment, close/reopen, labels — run as you.
            </p>
          </div>

          <button
            type="button"
            onClick={login}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-all duration-150 hover:opacity-95 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.99]"
          >
            <GithubMark className="h-4 w-4" />
            Authorize with GitHub
          </button>

          <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
            Self-hosting?{" "}
            <a
              href="/self-host"
              className="inline-flex items-center gap-1 font-medium text-foreground underline decoration-border/80 underline-offset-2 transition-colors hover:text-primary"
            >
              Read the self-host setup
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </p>
        </motion.div>
      </div>
    </Portal>
  );
}
