import { NextResponse } from "next/server";
import { downloadMiniAi, miniAiStatus, removeMiniAi } from "@/lib/mini-ai";
import { errorResponse, guardRequest } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { guardRequest(request); return NextResponse.json(miniAiStatus(), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request) { try { guardRequest(request); return NextResponse.json(await downloadMiniAi()); } catch (error) { return errorResponse(error); } }
export async function DELETE(request: Request) { try { guardRequest(request); return NextResponse.json(removeMiniAi()); } catch (error) { return errorResponse(error); } }
