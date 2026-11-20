import { after } from "next/server";
import { z } from "zod";
import { deleteEntity, saveEntity } from "@/lib/db";
import { errorResponse, guardRequest, readJson } from "@/lib/http";
import type { Entity } from "@/lib/types";
import { schemas } from "@/lib/validation";
import { autoRetrain } from "@/ml/student/service";

const entitySchema = z.enum(Object.keys(schemas) as Entity[]);
const recordSchema = z.object({ id: z.uuid() });
type Context = { params: Promise<{ entity: string }> };

export const runtime = "nodejs";

export async function POST(request: Request, context: Context) {
  try {
    guardRequest(request);
    const entity = entitySchema.parse((await context.params).entity);
    const id = saveEntity(entity, await readJson(request));
    if (entity === "results") after(autoRetrain);
    return Response.json({ id }, { status: entity === "settings" ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    guardRequest(request);
    const entity = entitySchema.parse((await context.params).entity);
    const input = await readJson(request);
    const recordId = entity === "settings" ? undefined : recordSchema.parse(input).id;
    return Response.json({ id: saveEntity(entity, input, recordId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    guardRequest(request);
    const entity = entitySchema.parse((await context.params).entity);
    const { id } = recordSchema.parse(await readJson(request));
    deleteEntity(entity, id);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
