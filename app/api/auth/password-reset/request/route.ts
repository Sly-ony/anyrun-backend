import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import prisma from "@/lib/prisma";
import { ApiError, handleApiError } from "@/lib/apiError";
import { requestPasswordResetSchema } from "@/lib/validation/passwordReset";
import { sendEmail } from "@/lib/email";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });
    const { email } = requestPasswordResetSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { email } });

    // Always the same response whether or not the email is registered —
    // otherwise this endpoint becomes a way to enumerate real accounts.
    const genericResponse = NextResponse.json({
      message: "If an account with that email exists, a password reset link has been sent.",
    });

    if (!user) return genericResponse;

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });

    const resetUrl = `${process.env.PASSWORD_RESET_URL ?? "https://app.anyrun.co.uk/reset-password"}?token=${rawToken}`;
    try {
      await sendEmail({
        to: user.email,
        subject: "Reset your Anyrun password",
        text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
      });
    } catch (e) {
      console.error("Failed to send password reset email:", e);
      // Still return the generic success response — don't leak delivery
      // failures to the caller, and don't block on a mocked/best-effort send.
    }

    // DEV CONVENIENCE ONLY: with no real email provider wired in yet (see
    // lib/email.ts), the token would otherwise only be visible in server
    // logs. Returning it here outside production makes the flow testable
    // end-to-end without reading logs. Remove this block once a real
    // provider is connected — it must never ship to production as-is.
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({
        message: "If an account with that email exists, a password reset link has been sent.",
        devOnlyToken: rawToken,
      });
    }

    return genericResponse;
  } catch (err) {
    return handleApiError(err);
  }
}
