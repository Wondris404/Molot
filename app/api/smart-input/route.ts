import { NextResponse } from "next/server";
import { z } from "zod";
import { getSnapshot } from "@/lib/db";
import { errorResponse, guardRequest, readJson } from "@/lib/http";
import { interpretText } from "@/lib/smart-input";
import { interpretWithMiniAi } from "@/lib/mini-ai";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    guardRequest(request);
    const { text } = z.object({ text: z.string().trim().min(1).max(2_000) }).parse(await readJson(request));
    const subjects = getSnapshot().subjects;
    const baseline = interpretText(text, subjects);
    const local = await interpretWithMiniAi(text, subjects, baseline.kind);
    if (!local || baseline.kind !== "unknown")
      return NextResponse.json(
        local?.kind === baseline.kind
          ? {
              ...baseline,
              fields: { ...local.fields, ...baseline.fields },
              source: "mini_ai",
            }
          : { ...baseline, source: "deterministic" },
      );
    return NextResponse.json({ ...local, source: "mini_ai" });
  } catch (error) { return errorResponse(error); }
}
