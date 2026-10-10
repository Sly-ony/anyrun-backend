import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAuth } from "@/lib/guard";
import { ApiError, handleApiError } from "@/lib/apiError";

// Generic upload used wherever the rest of the API expects a client-
// supplied URL — verification documents, catalog/advert/blog images,
// avatars, cleaning booking photos, etc. Upload here first, then pass the
// returned `url` into whichever endpoint needs it (e.g.
// POST /api/account/business-verification's `documents` array).
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new ApiError(500, "File uploads are not configured on the server (BLOB_READ_WRITE_TOKEN missing).");
    }

    const formData = await request.formData().catch(() => {
      throw new ApiError(400, "Request must be multipart/form-data with a 'file' field.");
    });
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      throw new ApiError(400, "No file provided — send it as a 'file' field in multipart/form-data.");
    }
    if (file.size === 0) {
      throw new ApiError(400, "Uploaded file is empty.");
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new ApiError(413, `File exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit.`);
    }

    // Namespaced by uploader so files are easy to trace back to an account,
    // and a random suffix (Vercel Blob's default `addRandomSuffix: true`)
    // prevents collisions between two people uploading a same-named file.
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pathname = `uploads/${auth.accountProfileId}/${Date.now()}-${safeName}`;

    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: true,
    });

    return NextResponse.json(
      {
        url: blob.url,
        pathname: blob.pathname,
        contentType: blob.contentType,
        size: file.size,
      },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
