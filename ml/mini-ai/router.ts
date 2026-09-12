import { logEvent } from "@/lib/logger";
import type { SmartInput } from "@/lib/smart-input";
import type { Subject } from "@/lib/types";
import { normalize } from "@/ml/common/text";
import { miniAiCacheKey, readMiniAiCache, writeMiniAiCache } from "./cache";
import { miniAiCandidate, miniAiStatus } from "./model";
import { miniAiPrompts } from "./prompts";
import {
  miniAiJsonSchemas,
  miniAiSchemas,
  type MiniAiOutput,
  type MiniAiTaskName,
} from "./schemas";
import { inferStructured, type StructuredInferenceRequest } from "./runtime";

export interface MiniAiTaskInputs {
  classify_input: { text: string };
  extract_school: { text: string; kind: string };
  extract_goal: { text: string; kind: "goal" | "progress_entry" | "activity" };
  extract_topics: { text: string };
  classify_question: { question: string };
  compare_questions: { first: string; second: string };
  map_question_topics: { question: string };
  explain: { facts: Record<string, string | number | boolean | null> };
}

export interface MiniAiContext {
  subjects?: string[];
  topics?: string[];
  language?: "sk" | "en";
}

export interface MiniAiRunOptions {
  useCache?: boolean;
  infer?: (request: StructuredInferenceRequest) => Promise<unknown>;
}

function compactList(values: string[] | undefined, limit: number) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
    .slice(0, limit)
    .map((value) => value.slice(0, 100));
}

function compactContext(context: MiniAiContext) {
  return {
    subjects: compactList(context.subjects, 40),
    topics: compactList(context.topics, 30),
    language: context.language ?? "sk",
  };
}

function repaired(value: string) {
  return normalize(value)
    .replace(/(?<=\p{L})0(?=\p{L})/gu, "o")
    .replace(/(?<=\p{L})5(?=\p{L})/gu, "s");
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function canonicalCandidate(value: string | null, candidates: string[]) {
  if (!value) return null;
  const target = repaired(value);
  const exact = candidates.find((candidate) => repaired(candidate) === target);
  if (exact) return exact;
  const tokens = target.split(" ");
  return candidates.find((candidate) => {
    const normalized = repaired(candidate);
    if (target.includes(normalized) || normalized.includes(target)) return true;
    return tokens.some((token) =>
      token.length >= 5 && editDistance(token, normalized) <= Math.max(1, Math.floor(normalized.length / 6)),
    );
  }) ?? null;
}

function classifyText(text: string): MiniAiOutput<"classify_input"> | null {
  const value = repaired(text);
  if (/\b(stary|historicky|old|past)\b.*\b(test|pisomk)|\btest\b.*\b(ucitel|teacher)\b/.test(value))
    return { kind: "teacher_test", confidence: "high" };
  if (/\b(iba|only)\b.*\b(poznamk|note)|\b(poznamka|note|reminder)\b/.test(value))
    return { kind: "note", confidence: "high" };
  if (/\b(pracovn[ya]|worksheet|exercise sheet)\b/.test(value))
    return { kind: "worksheet", confidence: "high" };
  if (/\b(material|prezentaci|slides|ucebnica|textbook)\b/.test(value))
    return { kind: "study_material", confidence: "high" };
  if (/\d+(?:[,.]\d+)?\s*(?:\/|z|out of)\s*\d+/.test(value) || /\b(vysledok|score|points|body)\b.*\b(znamk|grade|percent|%)/.test(value))
    return { kind: "test_result", confidence: "high" };
  if (/\b(znamk|grade)\b\s*(?:je|:)?\s*[1-5]\b/.test(value))
    return { kind: "grade", confidence: "high" };
  if (/\b(ucil|ucila|studied|learning)\b/.test(value) && /\b(min|hod|hour|dnes|today)\b/.test(value))
    return { kind: "study_session", confidence: "high" };
  if (/\b(chcem|ciel|goal|plan to|want to)\b|\bdokonc\w*\b.*\bdo\b/.test(value))
    return { kind: "goal", confidence: "high" };
  if (/\b(dokoncil|dokoncila|completed|hotov)\w*\b/.test(value) && /\b(projekt|project|uloha|task)\w*\b/.test(value))
    return { kind: "progress_entry", confidence: "high" };
  if (/\b(behal|bezal|ran|cycled|plaval|swam)\b/.test(value))
    return { kind: "activity", confidence: "high" };
  if (/\b(test|pisomk|skusk|exam)\b/.test(value))
    return { kind: "test", confidence: "medium" };
  return null;
}

function questionIntent(value: string) {
  const text = repaired(value);
  if (/\b(defin\w*|co je|what is)\b/.test(text)) return "definition";
  if (/\b(porov\w*|compare\w*|rozdiel\w*|difference\w*)\b/.test(text)) return "comparison";
  if (/\b(kde|where)\b/.test(text)) return "location";
  if (/\b(preco|why|dolezit)\b/.test(text)) return "reason";
  if (/\b(funkci|uloha|na co|what does|what is .* for)\b/.test(text)) return "function";
  if (/\b(vysvet|explain|describe how|ako)\b/.test(text)) return "explanation";
  return "unknown";
}

function deterministicQuestionType(question: string) {
  const value = repaired(question);
  if (/\b(nakres\w*|diagram\w*|oznac\w*.*(?:obraz|cast))\b/.test(value)) return "diagram";
  if (/\b(vypoc\w*|calculate\w*|solve\w*)\b/.test(value)) return "calculation";
  if (/\b(defin\w*|define\w*)\b/.test(value)) return "definition";
  if (/\b(porov\w*|compare\w*)\b/.test(value)) return "comparison";
  if (/\b(vysvet\w*|explain\w*|describe\w*)\b/.test(value)) return "explanation";
  if (/\b(pravda|true.*false)\b/.test(value)) return "true_false";
  return null;
}

function literalSchoolFields(text: string, subjects: string[]) {
  const numericText = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const subject = subjects.find((candidate) => repaired(text).includes(repaired(candidate))) ??
    subjects.find((candidate) => repaired(text).split(" ").some((token) => editDistance(token, repaired(candidate)) <= 2)) ?? null;
  const points = numericText.match(/(\d+(?:[,.]\d+)?)\s*(?:\/|\bz\b|out of)\s*(\d+(?:[,.]\d+)?)/);
  const grade = repaired(text).match(/\b(?:znamk\w*|grade)\b\s*(?:je|:)?\s*([1-5])\b/);
  const date = text.match(/\b(?:(?:budúci|buduci|next)\s+)?(?:pondelok|utorok|streda|štvrtok|stvrtok|piatok|sobota|nedeľa|nedela|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  const duration = text.match(/\b\d+(?:[,.]\d+)?\s*(?:h|hod(?:iny|ín|in)?|hours?|min(?:úty|út|uty|ut)?|minutes?)\b/i);
  const topics = text
    .split(",")
    .slice(1)
    .map((part) => part.replace(/^\s*(?:topic|téma|tema)\s*:?[ ]*/i, "").replace(/[.!?]+$/, "").trim())
    .filter((part) => part.length > 1 && !/\b(?:príprav\w*|priprav\w*|preparation|hod\w*|hour\w*|min\w*|budúci|buduci|next|monday|pondelok|piatok|friday)\b/i.test(part));
  return {
    subject,
    points: points ? Number(points[1].replace(",", ".")) : null,
    maxPoints: points ? Number(points[2].replace(",", ".")) : null,
    grade: grade ? Number(grade[1]) : null,
    dateExpression: date?.[0] ?? null,
    durationExpression: duration?.[0] ?? null,
    topics,
  };
}

function literalGoalFields(text: string) {
  const value = repaired(text);
  const measurements = [...value.matchAll(/(\d+(?:[,.]\d+)?)\s*(km|kilomet(?:er|re|rov|re)|min(?:uty|ut)?|minutes?|hod(?:iny|in)?|hours?|knih(?:y|a)?|stran|%)/gi)];
  const targetIndex = /\b(pod|under)\b/.test(value) && measurements.length > 1 ? measurements.length - 1 : 0;
  const measurement = measurements[targetIndex];
  const rawUnit = repaired(measurement?.[2] ?? "");
  const unit = /^(min|minute)/.test(rawUnit) ? "minút" : /^(hod|hour)/.test(rawUnit) ? "hodín" : /^knih/.test(rawUnit) ? "knihy" : /^stran/.test(rawUnit) ? "strán" : measurement?.[2] ?? null;
  const deadline = text.match(/\b(?:do|by)\s+((?:\d{1,2}\.\s*)?[\p{L}]+(?:\s+\d{4})?)/iu)?.[1] ?? null;
  return {
    category: /\b(klient|client|praca|work|projekt|project)\b/.test(value) ? "work" as const : /\b(skola|school|znamk|test)\b/.test(value) ? "school" as const : "personal" as const,
    value: measurement ? Number(measurement[1].replace(",", ".")) : null,
    unit,
    deadlineExpression: deadline,
  };
}

export function refineMiniAiOutput<T extends MiniAiTaskName>(
  task: T,
  input: MiniAiTaskInputs[T],
  context: MiniAiContext,
  raw: unknown,
): unknown {
  if (task === "classify_input") {
    const text = (input as MiniAiTaskInputs["classify_input"]).text;
    return classifyText(text) ?? raw;
  }
  if (task === "extract_school" && raw && typeof raw === "object") {
    const text = (input as MiniAiTaskInputs["extract_school"]).text;
    const exact = literalSchoolFields(text, context.subjects ?? []);
    const inferred = raw as { topics?: string[] };
    const safeTopics = exact.topics.length
      ? exact.topics
      : (inferred.topics ?? []).filter((topic) => !(context.subjects ?? []).some((subject) => normalize(subject) === normalize(topic)));
    const cleanRaw = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, value === "[]" ? null : value]));
    return { ...cleanRaw, ...Object.fromEntries(Object.entries(exact).filter(([key, value]) => key !== "topics" && value !== null)), topics: safeTopics };
  }
  if (task === "extract_goal" && raw && typeof raw === "object") {
    const text = (input as MiniAiTaskInputs["extract_goal"]).text;
    const exact = literalGoalFields(text);
    return { ...raw, ...Object.fromEntries(Object.entries(exact).filter(([, value]) => value !== null)) };
  }
  if (task === "extract_topics" && raw && typeof raw === "object") {
    const text = (input as MiniAiTaskInputs["extract_topics"]).text;
    const current = Array.isArray((raw as { topics?: unknown }).topics)
      ? (raw as { topics: string[] }).topics
      : [];
    const listed = text.match(/\b(?:zahŕňa|zahrna|obsahuje|includes?)\s+([^.!?]+)/iu)?.[1]
      ?.split(/\s+(?:a|and)\s+/i).map((topic) => topic.trim()) ?? [];
    const named = text.match(/\b\p{Lu}[\p{L}\p{N}]*\p{Lu}[\p{L}\p{N}]*\b/gu) ?? [];
    return { topics: [...new Map([...current, ...listed, ...named].map((topic) => [normalize(topic), topic])).values()].slice(0, 20) };
  }
  if (task === "classify_question" && raw && typeof raw === "object") {
    const question = (input as MiniAiTaskInputs["classify_question"]).question;
    const current = raw as { questionType?: string; topic?: string | null };
    const topic = canonicalCandidate(current.topic ?? null, context.topics ?? []) ??
      canonicalCandidate(question, context.topics ?? []);
    return { ...current, questionType: deterministicQuestionType(question) ?? current.questionType, topic };
  }
  if (task === "map_question_topics" && raw && typeof raw === "object") {
    const question = (input as MiniAiTaskInputs["map_question_topics"]).question;
    const supplied = context.topics ?? [];
    const direct = supplied.filter((topic) => repaired(question).includes(repaired(topic))).map((topic) => ({ topic, confidence: "high" }));
    const inferred = Array.isArray((raw as { matches?: unknown }).matches)
      ? ((raw as { matches: Array<{ topic?: string; confidence?: string }> }).matches)
          .filter((match) => match.confidence !== "low")
          .map((match) => ({ topic: canonicalCandidate(match.topic ?? null, supplied), confidence: match.confidence }))
          .filter((match): match is { topic: string; confidence: string } => Boolean(match.topic))
      : [];
    return { matches: [...new Map([...direct, ...inferred].map((match) => [normalize(match.topic), match])).values()].slice(0, 5) };
  }
  if (task === "compare_questions") {
    const pair = input as MiniAiTaskInputs["compare_questions"];
    const firstIntent = questionIntent(pair.first), secondIntent = questionIntent(pair.second);
    if (firstIntent !== "unknown" && secondIntent !== "unknown" && firstIntent !== secondIntent)
      return { sameMeaning: false, confidence: "high", sharedConcept: null };
    return raw;
  }
  return raw;
}

export async function runMiniAiTask<T extends MiniAiTaskName>(
  task: T,
  input: MiniAiTaskInputs[T],
  context: MiniAiContext = {},
  options: MiniAiRunOptions = {},
): Promise<MiniAiOutput<T> | null> {
  if (!options.infer && !miniAiStatus().ready) return null;
  const prompt = miniAiPrompts[task];
  const safeContext = compactContext(context);
  const payload = { input, context: safeContext };
  const cacheKey = miniAiCacheKey({
    task,
    input,
    context: safeContext,
    model: miniAiCandidate.id,
    prompt: prompt.version,
    schema: "3.5.0-v2",
  });
  try {
    if (options.useCache !== false) {
      const cached = readMiniAiCache(cacheKey);
      const parsed = miniAiSchemas[task].safeParse(cached);
      if (parsed.success) return parsed.data as MiniAiOutput<T>;
    }
    const raw = await (options.infer ?? inferStructured)({
      instruction: prompt.instruction,
      input: payload,
      schema: miniAiJsonSchemas[task],
      maxTokens: prompt.maxTokens,
    });
    const refined = refineMiniAiOutput(task, input, safeContext, raw);
    const parsed = miniAiSchemas[task].safeParse(refined);
    if (!parsed.success) throw new Error("Výstup nezodpovedá schéme úlohy.");
    if (options.useCache !== false) writeMiniAiCache(cacheKey, parsed.data);
    return parsed.data as MiniAiOutput<T>;
  } catch (error) {
    logEvent("mini_ai_task_failed", {
      task,
      prompt: prompt.version,
      message: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

const schoolKinds = new Set([
  "grade",
  "test",
  "study_session",
  "test_result",
  "teacher_test",
  "worksheet",
  "study_material",
  "note",
]);

function findSubject(name: string | null, subjects: Subject[]) {
  if (!name) return null;
  const key = normalize(name);
  return subjects.find((subject) => normalize(subject.name) === key) ??
    subjects.find((subject) => normalize(subject.name).includes(key) || key.includes(normalize(subject.name))) ?? null;
}

function supportedKind(kind: string): SmartInput["kind"] {
  if (kind === "progress_entry" || kind === "activity") return "progress";
  if (["test", "test_result", "grade", "goal", "progress"].includes(kind))
    return kind as SmartInput["kind"];
  return "unknown";
}

export async function interpretSmartInputWithMiniAi(
  text: string,
  subjects: Subject[],
  baselineKind: SmartInput["kind"] = "unknown",
): Promise<SmartInput | null> {
  let kind = baselineKind === "progress" ? "progress_entry" : baselineKind;
  if (kind === "unknown") {
    const classification = await runMiniAiTask("classify_input", { text }, {
      subjects: subjects.map((subject) => subject.name),
    });
    if (!classification) return null;
    kind = classification.kind;
  }
  if (schoolKinds.has(kind)) {
    const extraction = await runMiniAiTask("extract_school", { text, kind }, {
      subjects: subjects.map((subject) => subject.name),
    });
    if (!extraction) return null;
    const subject = findSubject(extraction.subject, subjects);
    const resultKind = supportedKind(kind);
    return {
      kind: resultKind,
      confidence: subject || !extraction.subject ? "medium" : "low",
      fields: {
        subjectId: subject?.id ?? "",
        subjectName: subject?.name ?? extraction.subject ?? "",
        title: extraction.title ?? (subject && resultKind === "test" ? `Test: ${subject.name}` : undefined),
        topics: extraction.topics.join(", "),
        date: extraction.dateExpression && /^20\d{2}-\d{2}-\d{2}$/.test(extraction.dateExpression) ? extraction.dateExpression : null,
        earnedPoints: extraction.points,
        maxPoints: extraction.maxPoints,
        grade: extraction.grade,
        value: resultKind === "grade" ? extraction.grade : undefined,
      },
      note: resultKind === "unknown"
        ? "Molot rozpoznal obsah, ale tento typ zatiaľ pridaj manuálne."
        : "Molot údaje navrhol. Pred uložením ich skontroluj.",
    };
  }
  if (["goal", "progress_entry", "activity"].includes(kind)) {
    const extraction = await runMiniAiTask("extract_goal", {
      text,
      kind: kind as "goal" | "progress_entry" | "activity",
    });
    if (!extraction) return null;
    return {
      kind: supportedKind(kind),
      confidence: "medium",
      fields: {
        name: extraction.name,
        category: extraction.category,
        value: extraction.value,
        unit: extraction.unit ?? "",
        activity: extraction.metric ?? extraction.name,
        note: text,
      },
      note: "Molot údaje navrhol. Pred uložením ich skontroluj.",
    };
  }
  return { kind: "unknown", confidence: "low", fields: {}, note: "Tento typ informácie zatiaľ pridaj manuálne." };
}

export function chunkText(text: string, maximumCharacters = 2_800) {
  const paragraphs = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maximumCharacters) {
      chunks.push(current);
      current = "";
    }
    if (paragraph.length > maximumCharacters) {
      for (let index = 0; index < paragraph.length; index += maximumCharacters)
        chunks.push(paragraph.slice(index, index + maximumCharacters));
    } else current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) chunks.push(current);
  return chunks;
}
