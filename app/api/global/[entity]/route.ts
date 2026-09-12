import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteGlobal, saveGoal, saveMilestone, saveProfile, saveProgress } from "@/lib/global";
import { errorResponse, guardRequest, readJson } from "@/lib/http";

const entitySchema = z.enum(["profile", "goals", "progress", "milestones"]);
type Context = { params: Promise<{ entity: string }> };
export const runtime = "nodejs";
function save(entity: z.infer<typeof entitySchema>, input: unknown, id?: string) {
  if (entity === "profile") return "local";
  return entity === "goals" ? saveGoal(input, id) : entity === "progress" ? saveProgress(input, id) : saveMilestone(input, id);
}
export async function POST(request: Request, context: Context) {
  try {
    guardRequest(request);
    const entity = entitySchema.parse((await context.params).entity);
    const input = await readJson(request);
    if (entity === "profile") saveProfile(input);
    return NextResponse.json({ id: save(entity, input) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    guardRequest(request);
    const entity = entitySchema.parse((await context.params).entity);
    const input = await readJson(request);
    const id = entity === "profile" ? undefined : z.object({ id: z.string().uuid() }).parse(input).id;
    if (entity === "profile") saveProfile(input);
    return NextResponse.json({ id: save(entity, input, id) });
  } catch (error) { return errorResponse(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    guardRequest(request);
    const entity = entitySchema.parse((await context.params).entity);
    if (entity === "profile") throw new Error("Profil nemožno odstrániť.");
    const { id } = z.object({ id: z.string().uuid() }).parse(await readJson(request));
    deleteGlobal(entity, id);
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
