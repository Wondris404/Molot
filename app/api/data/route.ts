import { getSnapshot } from "@/lib/db";
import { errorResponse, guardRequest } from "@/lib/http";

export const runtime = "nodejs";

export function GET(request: Request) {
  try {
    guardRequest(request);
    return Response.json(getSnapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
