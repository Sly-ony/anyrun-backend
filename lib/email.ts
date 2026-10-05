/**
 * Mock email sender. No real email provider is wired in yet — this logs to
 * the server console instead of actually sending anything. Swap the
 * implementation here for a real provider (Resend, SendGrid, Postmark, AWS
 * SES) when ready; every call site only depends on this function's
 * signature, so that's the only file that needs to change.
 *
 * Because nothing is actually sent, password reset in its current state is
 * only usable by reading the token out of the server logs (or the API
 * response in non-production — see app/api/auth/password-reset/request).
 * Wire in a real provider before relying on this for actual users.
 */
export async function sendEmail(params: { to: string; subject: string; text: string }): Promise<void> {
  console.log(`[mock email] To: ${params.to} | Subject: ${params.subject}\n${params.text}`);
}
