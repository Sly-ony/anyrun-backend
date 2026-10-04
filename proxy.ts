import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = [
  "https://anyrun.vercel.app",
  "http://localhost:3000",
];

function applyCors(res: NextResponse, origin: string) {
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.append("Vary", "Origin");
  return res;
}

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowed = !!origin && ALLOWED_ORIGINS.includes(origin);

  // Preflight
  if (request.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    return allowed ? applyCors(res, origin!) : res;
  }

  const res = NextResponse.next();
  return allowed ? applyCors(res, origin!) : res;
}

export const config = { matcher: "/api/:path*" };