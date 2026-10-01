import type { CleaningBookingStatus } from "@prisma/client";

export type CleaningActor = "customer" | "provider" | "both";

interface Transition {
  to: CleaningBookingStatus;
  actor: CleaningActor;
}

export const CLEANING_TRANSITIONS: Record<CleaningBookingStatus, Transition[]> = {
  PENDING: [
    { to: "CONFIRMED", actor: "provider" },
    { to: "CANCELLED", actor: "customer" },
  ],
  CONFIRMED: [
    { to: "IN_PROGRESS", actor: "provider" },
    { to: "CANCELLED", actor: "both" },
  ],
  IN_PROGRESS: [{ to: "COMPLETED", actor: "provider" }],
  COMPLETED: [],
  CANCELLED: [],
};

export function checkCleaningTransition(
  from: CleaningBookingStatus,
  to: CleaningBookingStatus,
  actor: "customer" | "provider"
): string | null {
  const allowed = CLEANING_TRANSITIONS[from] ?? [];
  const match = allowed.find((t) => t.to === to);

  if (!match) return `Cannot move a cleaning booking from ${from} to ${to}.`;
  if (match.actor !== "both" && match.actor !== actor) {
    return `Only the ${match.actor} can move a cleaning booking from ${from} to ${to}.`;
  }
  return null;
}
