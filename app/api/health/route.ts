import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Point your host's health-check / uptime monitor at this URL. Returns 200
// only if the database is actually reachable — not just that the Node
// process is running — since a bad DATABASE_URL is the single most common
// thing to get wrong on a first deploy, and it fails silently otherwise
// (every route that touches Prisma would 500 with no obvious cause).
export async function GET() {
  const startedAt = Date.now();

  try {
    // Cheapest possible real round-trip to MongoDB via the Prisma connection
    // — doesn't require any collection to have data, or even exist yet.
    await prisma.$runCommandRaw({ ping: 1 });

    return NextResponse.json({
      status: "ok",
      time: new Date().toISOString(),
      database: { status: "connected", latencyMs: Date.now() - startedAt },
    });
  } catch (err) {
    console.error("Health check: database ping failed:", err);
    return NextResponse.json(
      {
        status: "error",
        time: new Date().toISOString(),
        database: { status: "disconnected" },
        hint: "Check DATABASE_URL and that the MongoDB cluster/replica set is reachable from this environment.",
      },
      { status: 503 }
    );
  }
}
