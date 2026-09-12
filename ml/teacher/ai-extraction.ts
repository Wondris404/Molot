import { miniAiStatus } from "@/ml/mini-ai/model";
import {
  chunkText,
  runMiniAiTask,
  type MiniAiRunOptions,
} from "@/ml/mini-ai/router";
import { normalize, textSimilarity } from "../common/text";
import { suggestQuestions, suggestTopics } from "./extraction";
import { questionTypes, type MaterialTopic } from "./types";
import type { TeacherQuestion } from "./types";

function topicCandidates(question: string, topics: MaterialTopic[]) {
  return topics
    .map((topic) => {
      const text = `${topic.name} ${topic.keywords}`;
      const direct = normalize(text)
        .split(" ")
        .some((token) => token.length > 3 && normalize(question).includes(token));
      return {
        name: topic.name,
        score: textSimilarity(question, text) + (direct ? 0.5 : 0),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((candidate) => candidate.name);
}

export async function suggestQuestionsWithMiniAi(
  text: string,
  topics: MaterialTopic[],
  historicalQuestions: TeacherQuestion[] = [],
) {
  const questions = suggestQuestions(text, topics);
  if (!miniAiStatus().ready) return questions;
  // Obvious regex matches stay deterministic. Mini AI reviews only ambiguous
  // questions, so a long document never sends the whole database or every row.
  const reviewIndexes = questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => question.questionType === "short_answer" || !question.topic)
    .slice(0, 16);
  for (const { question, index } of reviewIndexes) {
    const candidates = topicCandidates(question.text, topics);
    const result = await runMiniAiTask(
      "classify_question",
      { question: question.text },
      { topics: candidates },
    );
    if (!result) continue;
    const matchedTopic = candidates.find(
      (candidate) => normalize(candidate) === normalize(result.topic ?? ""),
    );
    let semanticTopic = "";
    if (!matchedTopic && !question.topic) {
      const historical = historicalQuestions
        .filter((candidate) => candidate.topic)
        .map((candidate) => ({
          candidate,
          lexical: textSimilarity(question.text, candidate.text),
        }))
        .sort((left, right) => right.lexical - left.lexical)
        .slice(0, 6);
      for (const { candidate } of historical) {
        const comparison = await semanticQuestionMatch(question.text, candidate.text);
        if (comparison.sameMeaning && comparison.confidence !== "low") {
          semanticTopic = candidate.topic;
          break;
        }
      }
    }
    questions[index] = {
      ...question,
      questionType:
        result.questionType in questionTypes
          ? (result.questionType as keyof typeof questionTypes)
          : question.questionType,
      topic: matchedTopic || semanticTopic || question.topic,
    };
  }
  return questions;
}

export async function suggestTopicsWithMiniAi(text: string) {
  const deterministic = suggestTopics(text);
  if (!miniAiStatus().ready) return deterministic;
  const inferred: string[] = [];
  for (const chunk of chunkText(text).slice(0, 10)) {
    const result = await runMiniAiTask("extract_topics", { text: chunk });
    if (!result) continue;
    for (const topic of result.topics) {
      const tokenEvidence = normalize(topic)
        .split(" ")
        .filter((token) => token.length > 3)
        .some((token) => normalize(chunk).includes(token));
      if (tokenEvidence) inferred.push(topic.trim());
    }
  }
  return [...new Map([...deterministic, ...inferred].map((topic) => [normalize(topic), topic])).values()].slice(0, 60);
}

export async function semanticQuestionMatch(
  first: string,
  second: string,
  options: MiniAiRunOptions = {},
) {
  const lexical = textSimilarity(first, second);
  if (lexical >= 0.82)
    return { sameMeaning: true, confidence: "high" as const, lexical };
  if (!options.infer && !miniAiStatus().ready)
    return { sameMeaning: false, confidence: "low" as const, lexical };
  const result = await runMiniAiTask(
    "compare_questions",
    { first, second },
    {},
    options,
  );
  return {
    sameMeaning: result?.sameMeaning ?? false,
    confidence: result?.confidence ?? ("low" as const),
    lexical,
  };
}
