import type { DeliveryStatus } from "@prisma/client";

export type DeliveryActor = "requester" | "assignee" | "both";

interface Transition {
  to: DeliveryStatus;
  actor: DeliveryActor;
}

// REQUESTED -> ASSIGNED is handled exclusively by the dedicated /assign
// endpoint (mirroring how errands are accepted), not the generic /status one.
export const DELIVERY_TRANSITIONS: Record<DeliveryStatus, Transition[]> = {
  REQUESTED: [{ to: "CANCELLED", actor: "requester" }],
  ASSIGNED: [
    { to: "PICKED_UP", actor: "assignee" },
    { to: "CANCELLED", actor: "requester" },
  ],
  PICKED_UP: [{ to: "IN_TRANSIT", actor: "assignee" }],
  IN_TRANSIT: [{ to: "DELIVERED", actor: "assignee" }],
  DELIVERED: [],
  CANCELLED: [],
};

export function checkDeliveryTransition(
  from: DeliveryStatus,
  to: DeliveryStatus,
  actor: "requester" | "assignee"
): string | null {
  const allowed = DELIVERY_TRANSITIONS[from] ?? [];
  const match = allowed.find((t) => t.to === to);

  if (!match) return `Cannot move a delivery job from ${from} to ${to}.`;
  if (match.actor !== "both" && match.actor !== actor) {
    return `Only the ${match.actor} can move a delivery job from ${from} to ${to}.`;
  }
  return null;
}
