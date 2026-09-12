import { z } from "zod";
import type { Subject } from "./types";

const kindSchema = z.enum(["test", "test_result", "grade", "goal", "progress", "unknown"]);
export type SmartInput = z.infer<typeof smartInputSchema>;
export const smartInputSchema = z.object({
  kind: kindSchema,
  confidence: z.enum(["low", "medium", "high"]),
  fields: z.record(z.string(), z.unknown()),
  note: z.string(),
  source: z.enum(["deterministic", "mini_ai"]).optional(),
});
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function nextWeekday(weekday: number) {
  const date = new Date();
  const delta = ((weekday - date.getDay() + 7) % 7) || 7;
  date.setDate(date.getDate() + delta);
  return date.toISOString().slice(0, 10);
}
function inferredDate(text: string) {
  const value = normalize(text);
  const matched = value.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (matched) return matched[1];
  const weekdays: Record<string, number> = { monday: 1, pondelok: 1, tuesday: 2, utorok: 2, wednesday: 3, streda: 3, thursday: 4, stvrtok: 4, friday: 5, piatok: 5, saturday: 6, sobota: 6, sunday: 0, nedela: 0 };
  for (const [name, day] of Object.entries(weekdays)) if (new RegExp(`\\b${name}\\b`).test(value)) return nextWeekday(day);
  return null;
}
const commonSubjectAliases: Array<[string[], string[]]> = [
  [["biologia", "biology"], ["bio", "biolog"]],
  [["chemia", "chemistry"], ["chem", "chemi"]],
  [["matematika", "mathematics", "math"], ["mat", "matem", "math"]],
  [["slovencina", "slovak"], ["sj", "slovenc"]],
  [["anglictina", "english"], ["aj", "angl", "english"]],
  [["fyzika", "physics"], ["fyz", "phys"]],
  [["dejepis", "history"], ["dejepis", "hist"]],
  [["geografia", "geography"], ["geo", "geograf"]],
  [["obcianska nauka", "obn"], ["obn", "obciansk"]],
];
function subjectTerms(name: string) {
  const key = normalize(name);
  if (!key) return [];
  const aliases = commonSubjectAliases.find(([names]) =>
    names.some((candidate) => key.includes(candidate)),
  )?.[1] ?? [];
  return [...new Set([key, key.length >= 6 ? key.slice(0, -1) : key, ...aliases])];
}
function subjectFrom(text: string, subjects: Subject[]) {
  const value = normalize(text);
  const tokens = value.replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter(Boolean);
  return subjects.find((subject) =>
    subjectTerms(subject.name).some((term) =>
      value.includes(term) || tokens.some((token) => token === term || (term.length >= 5 && token.startsWith(term))),
    ),
  ) ?? null;
}
function inferredGrade(value: string) {
  const digit = value.match(/(?:znamk\w*|grade)\s*(?:je|:)?\s*([1-5])\b/)?.[1];
  if (digit) return Number(digit);
  const words: Array<[RegExp, number]> = [
    [/\bjednotk\w*\b/, 1],
    [/\bdvojk\w*\b/, 2],
    [/\btrojk\w*\b/, 3],
    [/\bstvork\w*\b/, 4],
    [/\bpatk\w*\b/, 5],
  ];
  return words.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}
export function interpretText(input: string, subjects: Subject[]): SmartInput {
  const text = input.trim();
  const value = normalize(text);
  if (!text) return { kind: "unknown", confidence: "low", fields: {}, note: "Napíš krátku informáciu, ktorú chceš pridať." };
  const subject = subjectFrom(text, subjects);
  const points = value.match(/(\d+(?:[,.]\d+)?)\s*(?:\/|\bz\b|out of)\s*(\d+(?:[,.]\d+)?)/);
  const grade = inferredGrade(value);
  if (points) return {
    kind: "test_result", confidence: subject ? "high" : "medium",
    fields: {
      subjectId: subject?.id ?? "",
      subjectName: subject?.name ?? "",
      grade,
      earnedPoints: Number(points[1].replace(",", ".")),
      maxPoints: Number(points[2].replace(",", ".")),
      percentage: Math.round((Number(points[1].replace(",", ".")) / Number(points[2].replace(",", "."))) * 10000) / 100,
      readinessBefore: null,
      actualStudyMinutes: 0,
    },
    note: "Vyber test a doplň pripravenosť pred uložením výsledku.",
  };
  if (grade && subject) return { kind: "grade", confidence: "high", fields: { subjectId: subject.id, subjectName: subject.name, value: grade, date: new Date().toISOString().slice(0, 10) }, note: "Skontroluj predmet a známku pred uložením." };
  const hours = value.match(/(?:asi|okolo|priblizne|around)?\s*(\d+(?:[,.]\d+)?)\s*(?:h|hod(?:iny|in)?|hours?)/)?.[1];
  if (/\b(test|pisomk\w*|skusk\w*|piseme|pisem|exam)\b/.test(value)) {
    const commaTopic = text.split(",").slice(1).join(",").replace(/(?:asi|okolo|priblizne|around)?\s*\d+(?:[,.]\d+)?\s*(?:h|hod\w*|hours?).*/i, "").trim();
    const topic = commaTopic || value
      .replace(/\b(?:vo|v|buduci|buduci|next|monday|pondelok|tuesday|utorok|wednesday|streda|thursday|stvrtok|friday|piatok|saturday|sobota|sunday|nedela)\b/g, " ")
      .replace(/\b(?:test|pisomk\w*|skusk\w*|piseme|pisem|exam|asi|okolo|priblizne|around)\b/g, " ")
      .replace(/\b\d+(?:[,.]\d+)?\s*(?:h|hod\w*|hours?)\b/g, " ")
      .split(/\s+/)
      .filter((token) => token && !subjectTerms(subject?.name ?? "").some((term) => token === term || token.startsWith(term)))
      .join(" ")
      .trim();
    return { kind: "test", confidence: subject && inferredDate(text) ? "high" : "medium", fields: { subjectId: subject?.id ?? "", subjectName: subject?.name ?? "", title: subject ? `Test: ${subject.name}` : "Nový test", date: inferredDate(text), topics: topic, plannedMinutes: hours ? Math.round(Number(hours.replace(",", ".")) * 60) : 0 }, note: "Molot údaje iba navrhol. Pred uložením ich môžeš upraviť." };
  }
  const run = value.match(/(?:behal|bezal|ran|run)(?:\s+(?:som|sme|i))?\s*(\d+(?:[,.]\d+)?)\s*km/);
  if (run && /\b(under|pod|ciel|goal|chcem)\b/.test(value)) return { kind: "goal", confidence: "high", fields: { name: text, category: "personal", targetValue: Number(run[1].replace(",", ".")), unit: "km" }, note: "Skontroluj cieľovú hodnotu pred uložením." };
  if (run) return { kind: "progress", confidence: "high", fields: { activity: "Beh", value: Number(run[1].replace(",", ".")), unit: "km", duration: value.match(/(?:za|in)\s*(\d{1,2}:\d{2}(?::\d{2})?)/)?.[1] ?? null, date: new Date().toISOString().slice(0, 10), note: text }, note: "Vyber cieľ, ku ktorému patrí tento pokrok." };
  if (/\b(ciel|goal|chcem|under|pod)\b/.test(value)) return { kind: "goal", confidence: "medium", fields: { name: text, category: /\b(praca|work|projekt)\b/.test(value) ? "work" : /\b(test|skola|school|znamka)\b/.test(value) ? "school" : "personal" }, note: "Skontroluj názov a typ cieľa pred uložením." };
  return { kind: "unknown", confidence: "low", fields: {}, note: "Toto som zatiaľ nevedel spoľahlivo zaradiť. Vyber manuálny typ záznamu." };
}
