import type { ErrandStatus } from "@prisma/client";

export type ErrandActor = "customer" | "runner" | "both";

interface Transition {
  to: ErrandStatus;
  actor: ErrandActor;
}

// OPEN -> ACCEPTED is intentionally NOT listed here: that transition only
// happens through the dedicated /accept endpoint, which also assigns the
// runner. Everything below is reachable through the generic /status endpoint.
export const ERRAND_TRANSITIONS: Record<ErrandStatus, Transition[]> = {
  OPEN: [{ to: "CANCELLED", actor: "customer" }],
  ACCEPTED: [
    { to: "IN_PROGRESS", actor: "runner" },
    { to: "CANCELLED", actor: "both" },
  ],
  IN_PROGRESS: [
    { to: "DELIVERED", actor: "runner" },
    { to: "CANCELLED", actor: "customer" },
  ],
  DELIVERED: [{ to: "COMPLETED", actor: "customer" }],
  COMPLETED: [],
  CANCELLED: [],
};

/**
 * Returns null if the transition is allowed for the given actor, or a
 * human-readable reason string if it isn't.
 */
export function checkErrandTransition(
  from: ErrandStatus,
  to: ErrandStatus,
  actor: "customer" | "runner"
): string | null {
  const allowed = ERRAND_TRANSITIONS[from] ?? [];
  const match = allowed.find((t) => t.to === to);

  if (!match) {
    return `Cannot move an errand from ${from} to ${to}.`;
  }
  if (match.actor !== "both" && match.actor !== actor) {
    return `Only the ${match.actor} can move an errand from ${from} to ${to}.`;
  }
  return null;
}
