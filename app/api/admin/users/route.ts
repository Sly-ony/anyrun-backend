import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { handleApiError } from "@/lib/apiError";
import { parsePagination } from "@/lib/pagination";
import { sanitizeUser } from "@/lib/user";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "MANAGE_USERS");

    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);
    const suspendedOnly = searchParams.get("suspended") === "true";
    const email = searchParams.get("email") ?? undefined;

    const profileWhere: Prisma.AccountProfileWhereInput = suspendedOnly ? { isActive: false } : {};

    const userWhere: Prisma.UserWhereInput = {
      ...(email ? { email: { contains: email, mode: "insensitive" } } : {}),
      accountProfile: { is: profileWhere },
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: userWhere,
        include: { accountProfile: true },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.user.count({ where: userWhere }),
    ]);

    const items = users.map((u) => ({ user: sanitizeUser(u), profile: u.accountProfile }));

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}
