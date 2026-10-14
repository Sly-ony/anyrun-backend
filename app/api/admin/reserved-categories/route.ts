import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { ApiError, handleApiError } from "@/lib/apiError";
import { getReservedCategoryKeywords } from "@/lib/catalogRules";
import { logAdminAction } from "@/lib/auditLog";

const addKeywordSchema = z.object({
  keyword: z.string().min(1, "keyword is required."),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_JOB_CATEGORIES");

    const rows = await prisma.reservedCategoryKeyword.findMany({ orderBy: { keyword: "asc" } });
    const effective = await getReservedCategoryKeywords();

    return NextResponse.json({
      keywords: rows,
      // Whenever `keywords` is empty, isReservedCategory() falls back to
      // these hardcoded defaults — shown here so the UI doesn't present an
      // empty list as "nothing is reserved" when that's not actually true.
      usingHardcodedDefaults: rows.length === 0,
      effectiveKeywords: effective,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_JOB_CATEGORIES");

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { keyword } = addKeywordSchema.parse(body);
    const normalized = keyword.trim().toLowerCase();

    const existing = await prisma.reservedCategoryKeyword.findUnique({ where: { keyword: normalized } });
    if (existing) throw new ApiError(409, "This keyword is already reserved.");

    const created = await prisma.reservedCategoryKeyword.create({
      data: { keyword: normalized, addedBy: auth.accountProfileId },
    });

    await logAdminAction(auth.accountProfileId, "RESERVED_CATEGORY_ADDED", "ReservedCategoryKeyword", created.id, {
      keyword: normalized,
    });

    return NextResponse.json({ keyword: created }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
