import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, guardRequest, readJson } from "@/lib/http";
import { smartInputSchema } from "@/lib/smart-input";
import { recordMiniAiFeedback } from "@/ml/mini-ai/feedback";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    guardRequest(request);
    const input = z.object({
      task: z.literal("smart_input"),
      suggested: smartInputSchema,
      confirmed: smartInputSchema,
      accepted: z.boolean(),
    }).parse(await readJson(request));
    return NextResponse.json(recordMiniAiFeedback(input));
  } catch (error) {
    return errorResponse(error);
  }
}
