import type { MiniAiTaskName } from "./schemas";

export interface MiniAiPromptDefinition {
  version: string;
  maxTokens: number;
  instruction: string;
}

const shared =
  "You are the local language parser inside MOLOT. Return only the requested JSON. Never calculate percentages, dates, totals, averages, predictions, or study time. Never invent a missing value. Slovak text may omit diacritics. /no_think";

export const miniAiPrompts: Record<MiniAiTaskName, MiniAiPromptDefinition> = {
  classify_input: {
    version: "classify-input-3.5.0-v2",
    maxTokens: 70,
    instruction: `${shared}\nClassify into exactly one kind. grade=received school mark only; test=future exam; study_session=past time spent learning; test_result=obtained school points/score/mark; teacher_test=old or historical teacher exam document; worksheet=exercise sheet; study_material=notes/book/slides; goal=intended future outcome; activity=completed hobby activity; progress_entry=completed progress on a goal or work project; note=reminder or free note; unknown=none. Respect negation: "nemám test, iba poznámka" is note. "Chcem...", "môj cieľ..." and an unfinished deadline are goal.`,
  },
  extract_school: {
    version: "extract-school-3.5.0-v2",
    maxTokens: 180,
    instruction: `${shared}\nExtract literal school facts. A number after "známka/grade" is grade. Copy the complete shortest relative date phrase (including budúci/next) into dateExpression. Copy the complete duration phrase without words such as príprava/preparation into durationExpression; do not convert it. Subjects should match a supplied subject even with OCR mistakes. Topics are explicit short noun phrases. Use null or [] when absent.`,
  },
  extract_goal: {
    version: "extract-goal-3.5.0-v2",
    maxTokens: 140,
    instruction: `${shared}\nExtract one goal or progress statement. category=work for a client, job, work or project deadline; school for school achievement; otherwise personal. Preserve the user's primary target value and unit. For "10 km under 50 minutes", the target is 50 minutes and 10 km is context. Copy deadlineExpression literally, without correcting spelling. The name is a short faithful restatement.`,
  },
  extract_topics: {
    version: "extract-topics-3.5.0-v2",
    maxTokens: 180,
    instruction: `${shared}\nExtract every explicit study concept from the provided text, including named phases, cycles, structures and enzymes. Keep source order, use short canonical topic names, remove duplicates, and do not add related concepts that are absent.`,
  },
  classify_question: {
    version: "classify-question-3.5.0-v2",
    maxTokens: 90,
    instruction: `${shared}\nClassify the teacher question style: definition asks to define; explanation asks why/how; calculation asks to compute; comparison asks similarities/differences; diagram asks to draw, label or work with a picture; multiple_choice offers choices; fill_in has blanks; true_false asks truth; essay requests a long response; otherwise short_answer. If candidate topics are supplied, topic must be an exact candidate or null. Tolerate missing diacritics and common OCR character swaps.`,
  },
  compare_questions: {
    version: "compare-questions-3.5.0-v2",
    maxTokens: 80,
    instruction: `${shared}\nReturn sameMeaning=true only when both questions expect essentially the same answer. Shared topic words are insufficient: defining a concept, comparing it, asking where it occurs and asking why it matters are different answers. Paraphrases such as "what is its function" and "what does it do" are the same.`,
  },
  map_question_topics: {
    version: "map-question-topics-3.5.0-v2",
    maxTokens: 120,
    instruction: `${shared}\nMap the question only to supplied candidate topics. Return exact candidate strings and only direct or strong semantic matches. Omit weak/low guesses. Return an empty list when no candidate is supported by the text.`,
  },
  explain: {
    version: "explain-3.5.0-v2",
    maxTokens: 180,
    instruction: `${shared}\nExplain the supplied already-calculated MOLOT result in simple Slovak. Repeat only numbers present in the input. Do not make a new prediction or claim certainty.`,
  },
};
