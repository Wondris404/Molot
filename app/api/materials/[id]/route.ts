import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import {
  deleteMaterial,
  getMaterial,
  materialPath,
  renameMaterial,
} from "@/lib/db";
import { errorResponse, guardRequest, readJson } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    guardRequest(request);
    const material = getMaterial((await context.params).id);
    const bytes = await readFile(materialPath(material.storageName));
    const download = new URL(request.url).searchParams.has("download");
    return new Response(bytes, {
      headers: {
        "Content-Type": material.mimeType,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(material.name).replace(/'/g, "%27")}`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          material.mimeType === "application/pdf"
            ? "default-src 'none'; style-src 'unsafe-inline'"
            : "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    guardRequest(request);
    renameMaterial((await context.params).id, await readJson(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    guardRequest(request);
    deleteMaterial((await context.params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
