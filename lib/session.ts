import jwt , { SignOptions } from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import type { AccountType } from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "30d";
export const SESSION_COOKIE_NAME = "anyrun_session";

if (!JWT_SECRET) {
  // Fail loudly at import time in any environment that forgot to set this —
  // better than silently signing tokens with `undefined`.
  throw new Error("JWT_SECRET environment variable is not set.");
}

export interface SessionPayload {
  sub: string; // User.id
  accountProfileId: string;
  roles: AccountType[];
}

export function signSession(payload: SessionPayload): string {
  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, JWT_SECRET as string, options);
}

/** Returns the decoded payload, or null if the token is missing/invalid/expired. */
export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string) as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Reads the session token from either the httpOnly cookie (web clients) or an
 * `Authorization: Bearer <token>` header (mobile/native or API clients).
 */
export function getTokenFromRequest(request: NextRequest): string | null {
  const cookieToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookieToken) return cookieToken;

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  return null;
}

export function getAuthFromRequest(request: NextRequest): SessionPayload | null {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  return verifySession(token);
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days — keep in sync with JWT_EXPIRES_IN
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
