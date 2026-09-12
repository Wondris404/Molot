import { createBackup, importBackup } from "@/lib/backups";
import { readLimitedBody } from "@/lib/teacher-files";
import { errorResponse, guardRequest } from "@/lib/http";
import { AppError } from "@/lib/db";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    guardRequest(request);
    const result = createBackup();
    return new Response(result.bytes, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${result.name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    guardRequest(request);
    if (request.headers.get("x-molot-confirm-restore") !== "yes")
      throw new AppError("Obnovu treba potvrdiť.");
    return Response.json(
      importBackup(await readLimitedBody(request, 100 * 1024 * 1024)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
