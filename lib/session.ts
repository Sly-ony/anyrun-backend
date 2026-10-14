import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import type { AccountType } from "@prisma/client";

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "30d";
export const SESSION_COOKIE_NAME = "anyrun_session";

// Checked at the moment of use, not at import time. An import-time throw
// fails `next build` on any machine that doesn't have the secret in its
// environment (a Docker build stage, CI, a preview deploy) because Next
// evaluates route modules while collecting page data. This still refuses to
// ever sign or verify with an undefined secret — it just fails on the first
// real request instead of breaking the build.
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set.");
  return secret;
}

export interface SessionPayload {
  sub: string; // User.id
  accountProfileId: string;
  roles: AccountType[];
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    // JWT_EXPIRES_IN is a plain env string like "30d"; newer @types/jsonwebtoken
    // type this as a branded duration string, hence the cast.
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/** Returns the decoded payload, or null if the token is missing/invalid/expired. */
export function verifySession(token: string): SessionPayload | null {
  // Resolved outside the try/catch on purpose: a missing secret is a server
  // misconfiguration and must surface as an error, not be swallowed into
  // "invalid token" (which would silently log everyone out with a 401).
  const secret = getJwtSecret();
  try {
    return jwt.verify(token, secret) as SessionPayload;
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
