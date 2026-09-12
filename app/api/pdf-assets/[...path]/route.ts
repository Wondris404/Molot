import { readFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "@/lib/db";
import { errorResponse, guardRequest } from "@/lib/http";

export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    guardRequest(request);
    const parts = (await context.params).path;
    const [folder, name] = parts;
    const valid =
      parts.length === 2 &&
      /^[a-zA-Z0-9_.-]+$/.test(name) &&
      ((folder === "build" && name === "pdf.worker.min.mjs") ||
        (folder === "cmaps" && name.endsWith(".bcmap")) ||
        (folder === "standard_fonts" && /\.(pfb|ttf)$/.test(name)) ||
        (folder === "wasm" && name.endsWith(".wasm")));
    if (!valid) throw new AppError("Zdroj PDF prehliadača sa nenašiel.", 404);
    const bytes = await readFile(
      path.join(process.cwd(), "node_modules", "pdfjs-dist", folder, name),
    );
    return new Response(bytes, {
      headers: {
        "Content-Type": name.endsWith(".mjs")
          ? "text/javascript"
          : name.endsWith(".wasm")
            ? "application/wasm"
            : "application/octet-stream",
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
