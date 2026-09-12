import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./db";

export function guardRequest(request: Request) {
  const host = request.headers.get("host") ?? "";
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host))
    throw new AppError("Molot je dostupný iba lokálne.", 403);
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== host)
    throw new AppError("Požiadavka musí pochádzať z Molotu.", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new AppError("Cudzia stránka nemá prístup k Molotu.", 403);
}
export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError("Očakávaný formát je JSON.", 415);
  if (Number(request.headers.get("content-length")) > 200000)
    throw new AppError("Príliš veľká požiadavka.", 413);
  const body = await request.text();
  if (body.length > 200000) throw new AppError("Príliš veľká požiadavka.", 413);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new AppError("Neplatný JSON.");
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof AppError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: error.issues.map((issue) => issue.message).join(" ") },
      { status: 400 },
    );
  if (
    error instanceof Error &&
    error.message.includes("UNIQUE constraint failed")
  )
    return NextResponse.json(
      { error: "Tento predmet alebo výsledok už existuje." },
      { status: 409 },
    );
  console.error(error);
  return NextResponse.json(
    {
      error:
        "Uloženie alebo načítanie zlyhalo. Skontroluj lokálny server a voľné miesto na disku.",
    },
    { status: 500 },
  );
}
