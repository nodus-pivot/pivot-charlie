import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 11px uppercase label the mocks put above every value. */
export function Label({ className, children, ...props }: ComponentProps<"label">) {
  return (
    <label className={cn("block font-sans text-[11px] uppercase tracking-label text-ink-3", className)} {...props}>
      {children}
    </label>
  );
}

/**
 * Atelier text input: no box, a 1px rule underneath that turns gold on focus.
 * 44px tall, 15px text. Pass `invalid` to show the coral rule.
 */
export function Input({ className, invalid, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        "h-11 w-full border-b border-border-strong bg-transparent text-[15px] text-ink outline-none transition-colors",
        "placeholder:text-ink-3 focus:border-gold focus-visible:outline-none aria-invalid:border-coral",
        className,
      )}
      {...props}
    />
  );
}

/** Label above input, with room for a hint or error below. */
export function Field({
  label,
  htmlFor,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-[13px] text-coral">
          {error}
        </p>
      ) : null}
    </div>
  );
}
