import test from "node:test";
import assert from "node:assert/strict";
import {
  chunkText,
  refineMiniAiOutput,
  runMiniAiTask,
} from "../ml/mini-ai/router";

test("Mini AI router constrains tasks and lets deterministic facts win", async () => {
  let requestedSchema = false;
  const result = await runMiniAiTask(
    "classify_input",
    { text: "Z biológie som dostal 42 z 50 bodov." },
    {},
    {
      useCache: false,
      infer: async (request) => {
        requestedSchema = request.schema.type === "object";
        return { kind: "note", confidence: "low" };
      },
    },
  );
  assert.equal(requestedSchema, true);
  assert.deepEqual(result, { kind: "test_result", confidence: "high" });
});

test("school extraction preserves literal numbers and candidate subjects", () => {
  const result = refineMiniAiOutput(
    "extract_school",
    { text: "Bi0l0gia vysledok 42 / 50, znamka 2", kind: "test_result" },
    { subjects: ["Biológia", "Matematika"] },
    {
      subject: "History",
      title: null,
      topics: [],
      dateExpression: null,
      durationExpression: null,
      points: 10,
      maxPoints: 10,
      grade: 5,
    },
  ) as Record<string, unknown>;
  assert.equal(result.subject, "Biológia");
  assert.equal(result.points, 42);
  assert.equal(result.maxPoints, 50);
  assert.equal(result.grade, 2);
});

test("question mapping rejects weak unrelated guesses", () => {
  const result = refineMiniAiOutput(
    "map_question_topics",
    { question: "Akú úlohu má RuBisCO?" },
    { topics: ["RuBisCO", "Mitóza"] },
    {
      matches: [
        { topic: "Mitóza", confidence: "low" },
        { topic: "RuBisCO", confidence: "medium" },
      ],
    },
  ) as { matches: Array<{ topic: string }> };
  assert.deepEqual(result.matches.map((match) => match.topic), ["RuBisCO"]);
});

test("large text is split into bounded local context chunks", () => {
  const chunks = chunkText(`${"a".repeat(800)}\n\n${"b".repeat(800)}`, 1_000);
  assert.equal(chunks.length, 2);
  assert.ok(chunks.every((chunk) => chunk.length <= 1_000));
});
