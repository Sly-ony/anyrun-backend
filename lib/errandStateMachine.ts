import type { ErrandStatus } from "@prisma/client";

export type ErrandActor = "customer" | "provider" | "both";

interface Transition {
  to: ErrandStatus;
  actor: ErrandActor;
}

// OPEN -> ACCEPTED is intentionally NOT listed here: that transition only
// happens through the chat price acceptance or the dedicated /accept endpoint,
// which also assign the provider. Everything below is reachable through the
// generic /status endpoint.
export const ERRAND_TRANSITIONS: Record<ErrandStatus, Transition[]> = {
  OPEN: [{ to: "CANCELLED", actor: "customer" }],
  ACCEPTED: [
    { to: "IN_PROGRESS", actor: "provider" },
    { to: "CANCELLED", actor: "both" },
  ],
  IN_PROGRESS: [
    { to: "DELIVERED", actor: "provider" },
    { to: "CANCELLED", actor: "provider" },
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
  actor: "customer" | "provider"
): string | null {
  if (from === "IN_PROGRESS" && to === "CANCELLED" && actor === "customer") {
    return "Work has already started, so you can't cancel it. If there is a problem, report it and our team will review it.";
  }

  const allowed = ERRAND_TRANSITIONS[from] ?? [];
  const match = allowed.find((t) => t.to === to);

  if (!match) {
    return `Cannot move a job from ${from} to ${to}.`;
  }
  if (match.actor !== "both" && match.actor !== actor) {
    return `Only the ${match.actor} can move a job from ${from} to ${to}.`;
  }
  return null;
}