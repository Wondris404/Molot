import { z } from "zod";

export const confidenceSchema = z.enum(["low", "medium", "high"]);
export const inputKindSchema = z.enum([
  "grade",
  "test",
  "study_session",
  "test_result",
  "teacher_test",
  "worksheet",
  "study_material",
  "goal",
  "activity",
  "progress_entry",
  "note",
  "unknown",
]);
export const questionTypeSchema = z.enum([
  "multiple_choice",
  "short_answer",
  "definition",
  "explanation",
  "calculation",
  "comparison",
  "diagram",
  "fill_in",
  "essay",
  "true_false",
  "other",
]);

export const miniAiSchemas = {
  classify_input: z.object({
    kind: inputKindSchema,
    confidence: confidenceSchema,
  }),
  extract_school: z.object({
    subject: z.string().nullable(),
    title: z.string().nullable(),
    topics: z.array(z.string()).max(8),
    dateExpression: z.string().nullable(),
    durationExpression: z.string().nullable(),
    points: z.number().nonnegative().nullable(),
    maxPoints: z.number().positive().nullable(),
    grade: z.number().int().min(1).max(5).nullable(),
  }),
  extract_goal: z.object({
    category: z.enum(["school", "work", "personal"]),
    name: z.string(),
    metric: z.string().nullable(),
    value: z.number().nullable(),
    unit: z.string().nullable(),
    deadlineExpression: z.string().nullable(),
  }),
  extract_topics: z.object({
    topics: z.array(z.string()).max(20),
  }),
  classify_question: z.object({
    questionType: questionTypeSchema,
    topic: z.string().nullable(),
    confidence: confidenceSchema,
  }),
  compare_questions: z.object({
    sameMeaning: z.boolean(),
    confidence: confidenceSchema,
    sharedConcept: z.string().nullable(),
  }),
  map_question_topics: z.object({
    matches: z
      .array(
        z.object({
          topic: z.string(),
          confidence: confidenceSchema,
        }),
      )
      .max(5),
  }),
  explain: z.object({
    summary: z.string(),
    reasons: z.array(z.string()).max(5),
  }),
} as const;

export type MiniAiTaskName = keyof typeof miniAiSchemas;
export type MiniAiOutput<T extends MiniAiTaskName> = z.infer<
  (typeof miniAiSchemas)[T]
>;

type JsonSchema = Record<string, unknown>;
const nullableString = { type: ["string", "null"] };
const confidence = { type: "string", enum: ["low", "medium", "high"] };
const requiredObject = (properties: Record<string, unknown>): JsonSchema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const miniAiJsonSchemas: Record<MiniAiTaskName, JsonSchema> = {
  classify_input: requiredObject({
    kind: { type: "string", enum: inputKindSchema.options },
    confidence,
  }),
  extract_school: requiredObject({
    subject: nullableString,
    title: nullableString,
    topics: { type: "array", items: { type: "string" }, maxItems: 8 },
    dateExpression: nullableString,
    durationExpression: nullableString,
    points: { type: ["number", "null"], minimum: 0 },
    maxPoints: { type: ["number", "null"], exclusiveMinimum: 0 },
    grade: { type: ["integer", "null"], minimum: 1, maximum: 5 },
  }),
  extract_goal: requiredObject({
    category: { type: "string", enum: ["school", "work", "personal"] },
    name: { type: "string" },
    metric: nullableString,
    value: { type: ["number", "null"] },
    unit: nullableString,
    deadlineExpression: nullableString,
  }),
  extract_topics: requiredObject({
    topics: { type: "array", items: { type: "string" }, maxItems: 20 },
  }),
  classify_question: requiredObject({
    questionType: { type: "string", enum: questionTypeSchema.options },
    topic: nullableString,
    confidence,
  }),
  compare_questions: requiredObject({
    sameMeaning: { type: "boolean" },
    confidence,
    sharedConcept: nullableString,
  }),
  map_question_topics: requiredObject({
    matches: {
      type: "array",
      maxItems: 5,
      items: requiredObject({ topic: { type: "string" }, confidence }),
    },
  }),
  explain: requiredObject({
    summary: { type: "string" },
    reasons: { type: "array", items: { type: "string" }, maxItems: 5 },
  }),
};
