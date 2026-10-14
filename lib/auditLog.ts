import type { Prisma } from "@prisma/client";
import prisma from "./prisma";

export async function logAdminAction(
  adminId: string,
  action: string,
  targetType: string,
  targetId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: { adminId, action, targetType, targetId, metadata: metadata as Prisma.InputJsonValue | undefined },
    });
  } catch (e) {
    // Never let audit logging itself break the action it's recording.
    console.error("Failed to write admin audit log entry:", e);
  }
}
