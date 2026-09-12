import path from "node:path";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { AppError, getDatabase } from "./db";
import { teacherSnapshot } from "./teacher-db";
import { teacherDirectory } from "./paths";
import { recognizePages } from "../ml/common/ocr";
import { callPython } from "../ml/common/python-bridge";
import { logEvent } from "./logger";
export function teacherFilePath(storageName: string) {
  if (!/^[a-f0-9-]+\.(pdf|png|jpg|txt|docx)$/.test(storageName))
    throw new AppError("Neplatný súbor.");
  return path.join(teacherDirectory, storageName);
}
export async function readLimitedBody(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new AppError("Príliš veľký súbor.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Chýba obsah.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new AppError("Príliš veľký súbor.", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function uploadTeacherFile(request: Request, id: string) {
  if (!teacherSnapshot().documents.some((d) => d.id === id))
    throw new AppError("Dokument neexistuje.");
  const body = await readLimitedBody(request, 20 * 1024 * 1024 + 65536);
  const form = await new Response(body, {
    headers: { "content-type": request.headers.get("content-type") || "" },
  }).formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size || file.size > 20 * 1024 * 1024)
    throw new AppError("Vyber súbor do 20 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name).toLowerCase();
  const valid =
    (ext === ".pdf" && bytes.subarray(0, 5).toString() === "%PDF-") ||
    (ext === ".png" &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    ([".jpg", ".jpeg"].includes(ext) &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255) ||
    (ext === ".txt" && !bytes.includes(0)) ||
    (ext === ".docx" && bytes.subarray(0, 2).toString() === "PK");
  if (!valid)
    throw new AppError(
      "Podporované sú PDF, PNG, JPG, TXT a DOCX s platným obsahom.",
    );
  const suffix = ext === ".jpeg" ? ".jpg" : ext;
  const mime: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".txt": "text/plain; charset=utf-8",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  const storageName = randomUUID() + suffix;
  await mkdir(teacherDirectory, { recursive: true });
  await writeFile(teacherFilePath(storageName), bytes, { flag: "wx" });
  getDatabase()
    .prepare(
      "UPDATE TeacherDocument SET storageName=?,mimeType=?,parseStatus='pending' WHERE id=?",
    )
    .run(storageName, mime[suffix], id);
  return { ok: true };
}
export async function parseTeacherFile(id: string) {
  const document = teacherSnapshot().documents.find((d) => d.id === id);
  if (!document?.storageName) throw new AppError("Najprv nahraj súbor.");
  const filename = teacherFilePath(document.storageName);
  try {
    let result: { text: string; status: string };
    if (document.mimeType?.startsWith("image/")) {
      result = await recognizePages([await readFile(filename)], id);
    } else result = await callPython({ operation: "parse", path: filename });
    if (result.status === "needs_ocr") {
      const rendered = await callPython<{ pages: string[]; partial: boolean }>({ operation: "render", path: filename });
      if (rendered.pages.length) {
        result = await recognizePages(rendered.pages.map((page) => Buffer.from(page, "base64")), id);
        if (rendered.partial) result.status = "ocr_partial";
      }
    }
    getDatabase()
      .prepare("UPDATE TeacherDocument SET text=?,parseStatus=? WHERE id=?")
      .run(result.text, result.status, id);
    return result;
  } catch (error) {
    logEvent("document_parse_failed", { documentId: id });
    getDatabase()
      .prepare("UPDATE TeacherDocument SET parseStatus='failed' WHERE id=?")
      .run(id);
    throw error;
  }
}
