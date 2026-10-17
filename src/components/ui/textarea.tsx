import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * Canonical Textarea primitive for MeperBoard. Shares the Input's surface,
 * border, and focus treatment so multi-line fields (issue bodies, notes) sit
 * visually next to the single-line inputs.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...rest }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground",
          "shadow-xs transition-colors duration-150",
          "placeholder:text-muted-foreground/70",
          "hover:border-foreground/20",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "resize-y",
          className,
        )}
        {...rest}
      />
    );
  },
);

Textarea.displayName = "Textarea";
