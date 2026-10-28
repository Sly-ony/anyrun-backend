import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";

interface Params {
  params: Promise<{ id: string }>;
}

const reviewSchema = z.object({
  rating: z.number().int().min(1, "Rating is 1 to 5.").max(5, "Rating is 1 to 5."),
  comment: z.string().trim().max(1000).optional(),
});

async function loadParty(id: string, me: string) {
  const errand = await prisma.errandRequest.findUnique({ where: { id } });
  if (!errand) throw new ApiError(404, "Job not found.");
  const isCustomer = errand.customerId === me;
  const isProvider = errand.runnerId === me;
  if (!isCustomer && !isProvider) throw new ApiError(403, "You are not a party to this job.");
  const otherId = isCustomer ? errand.runnerId! : errand.customerId;
  return { errand, otherId };
}

// What the review screen needs. The other person's review is shown only after
// you have written yours, so nobody writes theirs in reply to the other's.
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    const me = auth.accountProfileId;
    const { errand, otherId } = await loadParty(id, me);

    const myReview = await prisma.review.findUnique({
      where: { errandId_authorId: { errandId: id, authorId: me } },
    });
    const theirReview = myReview
      ? await prisma.review.findUnique({
          where: { errandId_authorId: { errandId: id, authorId: otherId } },
        })
      : null;

    return NextResponse.json({
      canReview: errand.status === "COMPLETED" && !myReview,
      myReview,
      theirReview,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);
    const me = auth.accountProfileId;
    const { errand, otherId } = await loadParty(id, me);

    if (errand.status !== "COMPLETED") {
      throw new ApiError(409, "You can review a job once it is completed.");
    }
    const existing = await prisma.review.findUnique({
      where: { errandId_authorId: { errandId: id, authorId: me } },
    });
    if (existing) throw new ApiError(409, "You have already reviewed this job.");

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const d = reviewSchema.parse(body);

    const review = await prisma.review.create({
      data: { errandId: id, authorId: me, targetId: otherId, rating: d.rating, comment: d.comment },
    });

    try {
      await prisma.notification.create({
        data: {
          recipientId: otherId,
          type: "GENERAL",
          title: "You received a review",
          message: `You received a ${d.rating}-star review.`,
          relatedErrandId: id,
        },
      });
    } catch (e) {
      console.error("Failed to notify review target:", e);
    }

    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}