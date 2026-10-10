import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";
import { updateCatalogItemSchema } from "@/lib/validation/catalog";
import { isReservedCategory } from "@/lib/catalogRules";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const item = await prisma.catalogItem.findUnique({ where: { id } });
    if (!item) throw new ApiError(404, "Catalog item not found.");
    return NextResponse.json({ item });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const item = await prisma.catalogItem.findUnique({ where: { id } });
    if (!item) throw new ApiError(404, "Catalog item not found.");
    if (item.supplierId !== auth.accountProfileId) {
      throw new ApiError(403, "Only the supplier who listed this item can edit it.");
    }

    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const data = updateCatalogItemSchema.parse(body);

    if (data.category && (await isReservedCategory(data.category))) {
      throw new ApiError(
        400,
        "Cleaning services are exclusively provided through the platform's cleaning booking flow and cannot be listed as a catalog category."
      );
    }

    const updated = await prisma.catalogItem.update({ where: { id }, data });
    return NextResponse.json({ item: updated });
  } catch (err) {
    return handleApiError(err);
  }
}

// Soft-remove: past orders keep referencing this item via sourceCatalogItemId,
// so a hard delete would leave those records pointing at nothing.
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const auth = await requireAuth(request);

    const item = await prisma.catalogItem.findUnique({ where: { id } });
    if (!item) throw new ApiError(404, "Catalog item not found.");
    if (item.supplierId !== auth.accountProfileId) {
      throw new ApiError(403, "Only the supplier who listed this item can remove it.");
    }

    const updated = await prisma.catalogItem.update({
      where: { id },
      data: { isAvailable: false },
    });

    return NextResponse.json({ item: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
