import type { ComponentProps } from "react";
import {
  Circle,
  CircleDashed,
  CircleHalf,
  Clock,
  ClockClockwise,
  Crown,
  Drop,
  GearSix,
  Hexagon,
  LinkSimple,
  LockSimple,
  Sparkle,
} from "@phosphor-icons/react";
import type { Component } from "@/features/pipeline";

/** The handoff's icon per component (Phosphor regular). Client-safe; server components import the ssr variant themselves. */
const ICONS: Record<Component, typeof Circle> = {
  bezel: CircleDashed,
  crystal: CircleHalf,
  crown: Crown,
  case: Hexagon,
  caseback: Circle,
  dial: Clock,
  hands: ClockClockwise,
  movement: GearSix,
  gaskets: Drop,
  strap: LinkSimple,
  clasp: LockSimple,
  lume: Sparkle,
};

export function ComponentIcon({ component, ...props }: { component: Component } & ComponentProps<typeof Circle>) {
  const Icon = ICONS[component];
  return <Icon {...props} />;
}
