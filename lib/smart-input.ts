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
function subjectFrom(text: string, subjects: Subject[]) {
  const value = normalize(text);
  return subjects.find((subject) => value.includes(normalize(subject.name))) ?? null;
}
export function interpretText(input: string, subjects: Subject[]): SmartInput {
  const text = input.trim();
  const value = normalize(text);
  if (!text) return { kind: "unknown", confidence: "low", fields: {}, note: "Napíš krátku informáciu, ktorú chceš pridať." };
  const subject = subjectFrom(text, subjects);
  const points = value.match(/(\d+(?:[,.]\d+)?)\s*(?:z|out of|\/ )\s*(\d+(?:[,.]\d+)?)/);
  const grade = value.match(/(?:znamka|grade)\s*(?:je|:)?\s*([1-5])\b/)?.[1];
  if (points) return {
    kind: "test_result", confidence: subject ? "high" : "medium",
    fields: { subjectId: subject?.id ?? "", subjectName: subject?.name ?? "", grade: grade ? Number(grade) : null, earnedPoints: Number(points[1].replace(",", ".")), maxPoints: Number(points[2].replace(",", ".")), readinessBefore: null, actualStudyMinutes: 0 },
    note: "Vyber test a doplň pripravenosť pred uložením výsledku.",
  };
  if (grade && subject) return { kind: "grade", confidence: "high", fields: { subjectId: subject.id, subjectName: subject.name, value: Number(grade), date: new Date().toISOString().slice(0, 10) }, note: "Skontroluj predmet a známku pred uložením." };
  const hours = value.match(/(?:asi|okolo|priblizne|around)?\s*(\d+(?:[,.]\d+)?)\s*(?:h|hod(?:iny|in)?|hours?)/)?.[1];
  if (/\b(test|pisomka|skuska)\b/.test(value)) {
    const topic = text.split(",").slice(1).join(",").replace(/(?:asi|okolo|priblizne|around)?\s*\d+(?:[,.]\d+)?\s*(?:h|hod\w*|hours?).*/i, "").trim();
    return { kind: "test", confidence: subject && inferredDate(text) ? "high" : "medium", fields: { subjectId: subject?.id ?? "", subjectName: subject?.name ?? "", title: subject ? `Test: ${subject.name}` : "Nový test", date: inferredDate(text), topics: topic, plannedMinutes: hours ? Math.round(Number(hours.replace(",", ".")) * 60) : 0 }, note: "Molot údaje iba navrhol. Pred uložením ich môžeš upraviť." };
  }
  const run = value.match(/(?:behal|bezal|ran|run)\s*(\d+(?:[,.]\d+)?)\s*km/);
  if (run && /\b(under|pod|ciel|goal|chcem)\b/.test(value)) return { kind: "goal", confidence: "high", fields: { name: text, category: "personal", targetValue: Number(run[1].replace(",", ".")), unit: "km" }, note: "Skontroluj cieľovú hodnotu pred uložením." };
  if (run) return { kind: "progress", confidence: "high", fields: { activity: "Beh", value: Number(run[1].replace(",", ".")), unit: "km", date: new Date().toISOString().slice(0, 10), note: text }, note: "Vyber cieľ, ku ktorému patrí tento pokrok." };
  if (/\b(ciel|goal|chcem|under|pod)\b/.test(value)) return { kind: "goal", confidence: "medium", fields: { name: text, category: /\b(praca|work|projekt)\b/.test(value) ? "work" : /\b(test|skola|school|znamka)\b/.test(value) ? "school" : "personal" }, note: "Skontroluj názov a typ cieľa pred uložením." };
  return { kind: "unknown", confidence: "low", fields: {}, note: "Toto som zatiaľ nevedel spoľahlivo zaradiť. Vyber manuálny typ záznamu." };
}
