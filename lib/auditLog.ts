import prisma from "./prisma";
import { Prisma } from "@prisma/client"; // 1. Import Prisma client types

export async function logAdminAction(
  adminId: string,
  action: string,
  targetType: string,
  targetId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: { 
        adminId, 
        action, 
        targetType, 
        targetId, 
        metadata: metadata as unknown as Prisma.InputJsonValue // 2. Cast metadata here
      },
    });
  } catch (e) {
    // Never let audit logging itself break the action it's recording.
    console.error("Failed to write admin audit log entry:", e);
  }
}