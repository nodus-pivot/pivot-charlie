import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Atelier buttons are outlines, never fills.
 *   primary   gold outline, gold-light text — the one action on a page
 *   secondary 1px border-strong, ink-2 text — everything else
 *   ghost     no border, ink-2 text, gold on hover — inline links that act
 */
export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xs font-sans font-medium transition-colors " +
  "disabled:pointer-events-none";

const variants: Record<ButtonVariant, string> = {
  primary: "border border-gold text-gold-light hover:bg-gold/10 active:bg-gold/15",
  secondary: "border border-border-strong text-ink-2 hover:border-gold hover:text-ink active:bg-panel",
  ghost: "border border-transparent text-ink-2 hover:text-gold-light",
};

const sizes: Record<ButtonSize, string> = {
  md: "h-[42px] px-[18px] text-sm",
  sm: "h-[34px] px-3 text-[13px]",
};

export function buttonClasses(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize };

export function Button({ variant = "secondary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize };

export function ButtonLink({ variant = "secondary", size = "md", className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
