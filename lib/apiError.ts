import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = "ApiError";
  }
}

/**
 * Central error -> HTTP response mapping so every route handler can just
 * `catch (err) { return handleApiError(err); }` and get a consistent shape:
 * { error: string }.
 */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }

  if (err instanceof ZodError) {
    const message = err.issues.map((e) => e.message).join("; ");
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Prisma unique-constraint violation, etc. — don't leak internals to the client.
  console.error("Unhandled API error:", err);
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 }
  );
}
