import test from "node:test";
import assert from "node:assert/strict";
import {
  chunkText,
  refineMiniAiOutput,
  runMiniAiTask,
} from "../ml/mini-ai/router";
import { interpretText } from "../lib/smart-input";
import type { Subject } from "../lib/types";
import { semanticQuestionMatch } from "../ml/teacher/ai-extraction";

const subjects: Subject[] = [
  { id: "biology", name: "Biológia", color: "#00aa00", createdAt: "2026-01-01" },
  { id: "chemistry", name: "Chémia", color: "#aa0000", createdAt: "2026-01-01" },
];

test("informal Slovak Smart Add keeps exact school facts", () => {
  const result = interpretText("z bio mam 18/20 dvojku", subjects);
  assert.equal(result.kind, "test_result");
  assert.equal(result.fields.subjectId, "biology");
  assert.equal(result.fields.earnedPoints, 18);
  assert.equal(result.fields.maxPoints, 20);
  assert.equal(result.fields.percentage, 90);
  assert.equal(result.fields.grade, 2);
});

test("informal Slovak test extracts weekday topic and planned minutes", () => {
  const result = interpretText("vo stvrtok piseme chemiu redox asi 3h", subjects);
  assert.equal(result.kind, "test");
  assert.equal(result.fields.subjectId, "chemistry");
  assert.equal(result.fields.topics, "redox");
  assert.equal(result.fields.plannedMinutes, 180);
  assert.match(String(result.fields.date), /^20\d{2}-\d{2}-\d{2}$/);
});

test("activity parsing preserves distance and clock time", () => {
  const result = interpretText("behal som 5km za 24:30", subjects);
  assert.equal(result.kind, "progress");
  assert.equal(result.fields.value, 5);
  assert.equal(result.fields.unit, "km");
  assert.equal(result.fields.duration, "24:30");
});

test("Smart Add keeps calendar dates in the local time zone", (context) => {
  const originalZone = process.env.TZ;
  process.env.TZ = "Europe/Bratislava";
  context.after(() => {
    if (originalZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalZone;
  });
  context.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-11-19T23:30:00Z"),
  });

  assert.equal(interpretText("z biológie známka 2", subjects).fields.date, "2026-11-20");
  assert.equal(interpretText("behal som 5km", subjects).fields.date, "2026-11-20");
  assert.equal(interpretText("v pondelok píšeme chémiu", subjects).fields.date, "2026-11-23");
});

test("semantic teacher comparison can relate questions without shared words", async () => {
  let called = false;
  const result = await semanticQuestionMatch(
    "Vysvetli Calvinov cyklus.",
    "Popíš fixáciu CO2 v stróme chloroplastu.",
    {
      useCache: false,
      infer: async () => {
        called = true;
        return {
          sameMeaning: true,
          confidence: "medium",
          sharedConcept: "Calvinov cyklus",
        };
      },
    },
  );
  assert.equal(called, true);
  assert.equal(result.sameMeaning, true);
  assert.equal(result.confidence, "medium");
});

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
