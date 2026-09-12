import { readFile } from "node:fs/promises";
import { z } from "zod";
import { errorResponse, guardRequest } from "@/lib/http";
import { teacherSnapshot } from "@/lib/teacher-db";
import {
  teacherFilePath,
  uploadTeacherFile,
  parseTeacherFile,
} from "@/lib/teacher-files";
import { AppError } from "@/lib/db";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  try {
    guardRequest(request);
    const id = z
        .string()
        .uuid()
        .parse((await context.params).id),
      document = teacherSnapshot().documents.find((d) => d.id === id);
    if (!document?.storageName) throw new AppError("Súbor neexistuje.", 404);
    const bytes = await readFile(teacherFilePath(document.storageName));
    return new Response(bytes, {
      headers: {
        "Content-Type": document.mimeType || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
        "Content-Disposition": `${new URL(request.url).searchParams.has("download") || document.storageName.endsWith(".docx") ? "attachment" : "inline"}; filename="${document.storageName}"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    guardRequest(request);
    return Response.json(
      await uploadTeacherFile(
        request,
        z
          .string()
          .uuid()
          .parse((await context.params).id),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    guardRequest(request);
    return Response.json(
      await parseTeacherFile(
        z
          .string()
          .uuid()
          .parse((await context.params).id),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
