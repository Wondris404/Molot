import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { NextResponse } from "next/server";
import {
  AppError,
  getDatabase,
  insertGoalAttachment,
  insertMaterial,
  materialPath,
  validateRelations,
} from "@/lib/db";
import { errorResponse, guardRequest } from "@/lib/http";
import { materialSchema } from "@/lib/validation";
export const runtime = "nodejs";
const maximumSize = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    guardRequest(request);
    if (Number(request.headers.get("content-length")) > maximumSize + 65536)
      throw new AppError("Súbor môže mať najviac 20 MB.", 413);
    // Stream with a hard bound before parsing multipart data.
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("Chýba súbor.");
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maximumSize + 65536) {
        await reader.cancel();
        throw new AppError("Súbor môže mať najviac 20 MB.", 413);
      }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size)
      throw new AppError("Vyber neprázdny súbor.");
    if (file.size > maximumSize)
      throw new AppError("Súbor môže mať najviac 20 MB.", 413);
    const rawGoalId = form.get("goalId");
    const goalId = rawGoalId ? z.string().uuid().parse(rawGoalId) : null;
    const values = goalId
      ? null
      : materialSchema.parse({
          subjectId: form.get("subjectId"),
          testId: form.get("testId") || null,
          name: file.name,
        });
    if (goalId && (form.get("subjectId") || form.get("testId")))
      throw new AppError("Súbor priraď buď k cieľu, alebo ku školskému testu.");
    const extension = path.extname(file.name).toLowerCase();
    const bytes = Buffer.from(await file.arrayBuffer());
    let mimeType: string;
    let suffix: string;
    if (extension === ".pdf" && bytes.subarray(0, 5).toString() === "%PDF-") {
      mimeType = "application/pdf";
      suffix = "pdf";
    } else if (
      extension === ".png" &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      mimeType = "image/png";
      suffix = "png";
    } else if (
      [".jpg", ".jpeg"].includes(extension) &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255
    ) {
      mimeType = "image/jpeg";
      suffix = "jpg";
    } else if (extension === ".txt" && !bytes.includes(0)) {
      mimeType = "text/plain; charset=utf-8";
      suffix = "txt";
    } else
      throw new AppError(
        "Podporované sú platné súbory PDF, PNG, JPG/JPEG a text TXT.",
      );
    getDatabase();
    if (values) validateRelations(values);
    const id = randomUUID();
    const storageName = `${id}.${suffix}`;
    const filePath = materialPath(storageName);
    await writeFile(filePath, bytes, { flag: "wx" });
    try {
      const common = { id, name: file.name, storageName, mimeType, size: file.size, createdAt: new Date().toISOString() };
      if (goalId) insertGoalAttachment({ ...common, goalId });
      else insertMaterial({ ...common, ...values! });
    } catch (error) {
      await unlink(filePath);
      throw error;
    }
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
