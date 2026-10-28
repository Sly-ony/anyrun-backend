import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { releaseEscrow } from "@/lib/escrow";

const HOUR = 60 * 60 * 1000;
const REMIND_AFTER = 72 * HOUR;
const AUTO_COMPLETE_AFTER = 7 * 24 * HOUR;

// Called once a day by Vercel Cron (see vercel.json). Vercel sends
// "Authorization: Bearer <CRON_SECRET>" automatically when CRON_SECRET is set.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const delivered = await prisma.errandRequest.findMany({
    where: { status: "DELIVERED" },
    orderBy: { updatedAt: "asc" },
    take: 500,
  });

  let reminded = 0;
  let autoCompleted = 0;
  let skippedDisputes = 0;
  const now = Date.now();

  for (const errand of delivered) {
    try {
      const open = await prisma.dispute.findFirst({
        where: { relatedType: "ERRAND", relatedId: errand.id, status: { in: ["OPEN", "IN_REVIEW"] } },
        select: { id: true },
      });
      if (open) {
        skippedDisputes++;
        continue;
      }

      const age = now - (errand.deliveredAt ?? errand.updatedAt).getTime();

      if (age >= AUTO_COMPLETE_AFTER) {
        const done = await prisma.$transaction(async (tx) => {
          const changed = await tx.errandRequest.updateMany({
            where: { id: errand.id, status: "DELIVERED" },
            data: { status: "COMPLETED" },
          });
          if (changed.count === 0) return false;
          await tx.errandEvent.create({
            data: {
              errandId: errand.id,
              actorId: null,
              fromStatus: "DELIVERED",
              toStatus: "COMPLETED",
              note: "Completed automatically after 7 days with no reply from the customer",
            },
          });
          await releaseEscrow(tx, errand.id);
          await tx.notification.create({
            data: {
              recipientId: errand.customerId,
              type: "GENERAL",
              title: "Job completed automatically",
              message: "You didn't confirm or report a problem within 7 days, so the job was marked completed.",
              relatedErrandId: errand.id,
            },
          });
          return true;
        });
        if (done) autoCompleted++;
      } else if (age >= REMIND_AFTER && !errand.reminderSentAt) {
        await prisma.$transaction([
          prisma.notification.create({
            data: {
              recipientId: errand.customerId,
              type: "GENERAL",
              title: "Please confirm your job",
              message:
                "Your job was delivered. Confirm it is complete, or report a problem. If you do nothing, it completes automatically after 7 days.",
              relatedErrandId: errand.id,
            },
          }),
          prisma.errandRequest.update({ where: { id: errand.id }, data: { reminderSentAt: new Date() } }),
        ]);
        reminded++;
      }
    } catch (e) {
      console.error("stale-jobs: failed for errand", errand.id, e);
    }
  }

  return NextResponse.json({ checked: delivered.length, reminded, autoCompleted, skippedDisputes });
}