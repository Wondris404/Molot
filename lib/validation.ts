import { z } from "zod";

const required = z
  .string()
  .trim()
  .min(1, "Vyplň povinné pole.")
  .max(200, "Najviac 200 znakov.");
const text = z.string().trim().max(10000, "Najviac 10 000 znakov.").default("");
const id = z.string().uuid("Neplatný identifikátor.");
const optionalId = id.nullable().default(null);
const percent = z
  .number()
  .min(0, "Minimum je 0 %.")
  .max(100, "Maximum je 100 %.");
const minutes = z
  .number()
  .int("Zadaj celé minúty.")
  .min(0, "Čas nemôže byť záporný.")
  .max(100000);
const grade = z.number().int().min(1).max(5);
const difficulty = z.number().int().min(1).max(5);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Zadaj platný dátum.")
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Zadaj existujúci dátum.");
const time = z
  .string()
  .regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "Zadaj platný čas.")
  .default("");

export const schemas = {
  subjects: z.object({
    name: required,
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Neplatná farba."),
  }),
  grades: z.object({
    subjectId: id,
    value: grade,
    weight: z.number().positive("Váha musí byť kladná.").max(100),
    date,
    description: text,
    assessmentType: required,
  }),
  tests: z.object({
    subjectId: id,
    title: required,
    date,
    time,
    topics: text,
    notes: text,
    difficulty,
    targetPercent: percent,
    plannedMinutes: minutes,
    status: z.enum(["planned", "preparing", "written", "evaluated"]),
  }),
  results: z
    .object({
      testId: id,
      earnedPoints: z
        .number()
        .min(0, "Body nemôžu byť záporné.")
        .max(1000000)
        .nullable(),
      maxPoints: z
        .number()
        .positive("Maximum bodov musí byť kladné.")
        .max(1000000)
        .nullable(),
      percentage: percent,
      grade: grade.nullable(),
      actualStudyMinutes: minutes,
      readinessBefore: percent,
      perceivedDifficulty: difficulty,
      note: text,
    })
    .superRefine((value, context) => {
      if ((value.earnedPoints === null) !== (value.maxPoints === null))
        context.addIssue({
          code: "custom",
          message:
            "Vyplň získané aj maximálne body alebo obe polia nechaj prázdne.",
        });
      if (
        value.earnedPoints !== null &&
        value.maxPoints !== null &&
        value.earnedPoints > value.maxPoints
      )
        context.addIssue({
          code: "custom",
          message: "Získané body nemôžu presiahnuť maximum.",
        });
    }),
  sessions: z.object({
    subjectId: id,
    testId: optionalId,
    date,
    startTime: time,
    minutes: minutes.min(1, "Učenie musí trvať aspoň minútu."),
    topic: text,
    note: text,
  }),
  readiness: z.object({
    testId: id,
    percent,
    recordedAt: z.iso.datetime({ offset: true }),
    note: text,
  }),
  errors: z.object({
    subjectId: id,
    testId: optionalId,
    materialId: optionalId,
    question: required,
    topic: required,
    subtopic: text,
    answer: text,
    isCorrect: z.boolean(),
    errorType: z.enum([
      "knowledge",
      "forgotten",
      "careless",
      "misunderstood",
      "calculation",
      "terminology",
      "other",
    ]),
    note: text,
    date,
  }),
  settings: z.object({
    dailyGoalMinutes: minutes.min(1).max(1440),
    baselineMinutes: minutes.min(15).max(10080),
    defaultTarget: percent,
  }),
};
export const materialSchema = z.object({
  subjectId: id,
  testId: optionalId,
  name: required,
});
