import { after, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, guardRequest, readJson } from "@/lib/http";
import {
  teacherSnapshot,
  saveTeacherEntity,
  deleteTeacherEntity,
  saveTestLink,
  teacherSchemas,
} from "@/lib/teacher-db";
import {
  modelStatus,
  trainStudentModel,
  autoRetrain,
} from "@/ml/student/service";
import {
  evaluatePrediction,
  savePrediction,
  testPrediction,
} from "@/lib/intelligence";
import { getDatabase, AppError } from "@/lib/db";
import {
  suggestQuestionsWithMiniAi,
  suggestTopicsWithMiniAi,
} from "@/ml/teacher/ai-extraction";
import { dataDirectory, modelsDirectory } from "@/lib/paths";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    guardRequest(request);
    const testId = new URL(request.url).searchParams.get("testId");
    if (testId)
      return NextResponse.json(testPrediction(z.string().uuid().parse(testId)));
    return NextResponse.json({
      ...teacherSnapshot(),
      modelStatus: modelStatus(),
      paths: { data: dataDirectory, models: modelsDirectory },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    guardRequest(request);
    const input = z
      .object({
        operation: z.string(),
        entity: z
          .enum(["teachers", "documents", "questions", "topics"])
          .optional(),
        id: z.string().uuid().optional(),
        values: z.unknown().optional(),
      })
      .parse(await readJson(request));
    switch (input.operation) {
      case "save": {
        if (!input.entity) throw new AppError("Chýba typ záznamu.");
        return NextResponse.json({
          id: saveTeacherEntity(
            input.entity,
            teacherSchemas[input.entity].parse(input.values),
            input.id,
          ),
        });
      }
      case "delete": {
        if (!input.entity || !input.id) throw new AppError("Chýba záznam.");
        deleteTeacherEntity(input.entity, input.id);
        return NextResponse.json({ ok: true });
      }
      case "link":
        saveTestLink(input.values);
        return NextResponse.json({ ok: true });
      case "train":
        return NextResponse.json(await trainStudentModel());
      case "auto-train":
        after(autoRetrain);
        return NextResponse.json({ ok: true });
      case "predict":
        return NextResponse.json({
          id: savePrediction(z.string().uuid().parse(input.id)),
        });
      case "evaluate":
        return NextResponse.json(evaluatePrediction(input.values));
      case "weights": {
        const weights = z
          .object({
            frequency: z.number().min(0).max(1),
            recency: z.number().min(0).max(1),
            points: z.number().min(0).max(1),
            repetition: z.number().min(0).max(1),
            material: z.number().min(0).max(1),
          })
          .refine(
            (v) => Object.values(v).some((n) => n > 0),
            "Aspoň jedna váha musí byť kladná.",
          )
          .parse(input.values);
        getDatabase()
          .prepare("UPDATE IntelligenceSettings SET weights=? WHERE id='local'")
          .run(JSON.stringify(weights));
        return NextResponse.json({ ok: true });
      }
      case "extract": {
        const data = teacherSnapshot(),
          document = data.documents.find((d) => d.id === input.id);
        if (!document) throw new AppError("Dokument neexistuje.");
        if (document.kind === "test")
          return NextResponse.json({
            questions: await suggestQuestionsWithMiniAi(
              document.text,
              data.topics.filter((topic) =>
                data.documents.some(
                  (material) =>
                    material.id === topic.documentId &&
                    material.subjectId === document.subjectId,
                ),
              ),
              data.questions.filter((question) =>
                data.documents.some(
                  (historical) =>
                    historical.id === question.documentId &&
                    historical.id !== document.id &&
                    historical.kind === "test" &&
                    historical.subjectId === document.subjectId &&
                    (!document.teacherId || historical.teacherId === document.teacherId),
                ),
              ),
            ),
          });
        return NextResponse.json({
          topics: await suggestTopicsWithMiniAi(document.text),
        });
      }
      default:
        throw new AppError("Neznáma operácia.");
    }
  } catch (error) {
    return errorResponse(error);
  }
}
