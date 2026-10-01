import { NextResponse } from "next/server";

// Deliberately does NOT touch the database — this is the "is the server up
// and routing requests at all" check. For "is the database also reachable"
// use GET /api/health instead.
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Welcome to the Anyrun API. If you can see this, the server is up and routing requests correctly.",
    time: new Date().toISOString(),
    docs: {
      userApi: "docs/USER_API.md",
      adminApi: "docs/ADMIN_API.md",
    },
    health: "/api/health",
  });
}
