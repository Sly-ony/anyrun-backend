import { NextRequest } from "next/server";
import { registerAccount } from "@/lib/registration";
import { handleApiError } from "@/lib/apiError";

export async function POST(request: NextRequest) {
  try {
    return await registerAccount(request, "INDIVIDUAL");
  } catch (err) {
    return handleApiError(err);
  }
}