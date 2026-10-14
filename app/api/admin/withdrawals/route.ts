import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { requireAdminCapability } from "@/lib/adminPermissions";
import { handleApiError } from "@/lib/apiError";
import { parsePagination } from "@/lib/pagination";
import type { Prisma } from "@prisma/client";

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Doubles as the "payout list" support works from: filter ?status=PENDING,
// optionally &format=csv for a printable/spreadsheet-friendly sheet with
// everything needed to make each bank transfer by hand (no pagination on
// the CSV — it exports every match, capped at 1000 rows).
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    requireAdminCapability(auth, "VIEW_PLATFORM_DATA");

    const { searchParams } = new URL(request.url);
    const { skip, take, page, pageSize } = parsePagination(searchParams);
    const status = searchParams.get("status") ?? undefined;
    const accountProfileId = searchParams.get("accountProfileId") ?? undefined;
    const format = searchParams.get("format");

    const where: Prisma.WithdrawalWhereInput = {
      ...(status ? { status: status as Prisma.EnumWithdrawalStatusFilter["equals"] } : {}),
      ...(accountProfileId ? { accountProfileId } : {}),
    };

    if (format === "csv") {
      const rows = await prisma.withdrawal.findMany({
        where,
        orderBy: { createdAt: "asc" }, // oldest first — pay in the order requested
        take: 1000,
        include: { payoutMethod: true },
      });

      const header = [
        "withdrawalId", "requestedAt", "status", "amount", "currency",
        "accountName", "accountNumber", "sortCode", "bankName", "reference", "payoutReference",
      ];
      const lines = rows.map((w) =>
        [
          w.id, w.createdAt.toISOString(), w.status, w.amount, w.currency,
          w.payoutMethod.accountName, w.payoutMethod.accountNumber, w.payoutMethod.bankCode,
          w.payoutMethod.bankName, w.reference, w.payoutReference,
        ].map(csvEscape).join(",")
      );

      return new NextResponse([header.join(","), ...lines].join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="withdrawals-${status ?? "all"}.csv"`,
        },
      });
    }

    const [items, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where,
        orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" },
        skip,
        take,
        include: { payoutMethod: true },
      }),
      prisma.withdrawal.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (err) {
    return handleApiError(err);
  }
}
