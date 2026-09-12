import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { guardRequest, errorResponse } from "@/lib/http";
import { logEvent } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { guardRequest(request); } catch (error) { return errorResponse(error); }
  try {
    const database = getDatabase();
    database.prepare("SELECT id FROM Settings WHERE id='local'").get();
    return NextResponse.json({ ready: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logEvent("database_initialization_failed", {
      errorType: error instanceof Error ? error.name : "Unknown",
      code: error instanceof Error && "code" in error ? String(error.code) : "unknown",
    });
    return NextResponse.json({ ready: false }, { status: 503 });
  }
}
