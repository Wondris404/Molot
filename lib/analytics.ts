import type { Grade, Snapshot, Test } from "./types";
import { daysUntil, localDate, weekStart } from "./format";

export function weightedAverage(grades: Grade[]): number | null {
  const weights = grades.reduce((sum, grade) => sum + grade.weight, 0);
  return weights
    ? grades.reduce((sum, grade) => sum + grade.value * grade.weight, 0) /
        weights
    : null;
}
export function average(values: number[]): number | null {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}
export function currentReadiness(
  data: Snapshot,
  testId: string,
): number | null {
  return (
    [...data.readiness]
      .filter((entry) => entry.testId === testId)
      .sort(
        (a, b) =>
          b.recordedAt.localeCompare(a.recordedAt) ||
          b.createdAt.localeCompare(a.createdAt),
      )[0]?.percent ?? null
  );
}
export function studiedMinutes(data: Snapshot, testId: string): number {
  return data.sessions
    .filter((session) => session.testId === testId)
    .reduce((sum, session) => sum + session.minutes, 0);
}
export function upcomingTests(data: Snapshot): Test[] {
  return data.tests
    .filter((test) => test.status === "planned" || test.status === "preparing")
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
}
export function studyTotals(data: Snapshot, today = localDate()) {
  const start = weekStart(today);
  return {
    today: data.sessions
      .filter((s) => s.date === today)
      .reduce((sum, s) => sum + s.minutes, 0),
    week: data.sessions
      .filter((s) => s.date >= start && s.date <= today)
      .reduce((sum, s) => sum + s.minutes, 0),
    all: data.sessions.reduce((sum, s) => sum + s.minutes, 0),
  };
}
export function topicStats(data: Snapshot) {
  const groups = new Map<
    string,
    {
      name: string;
      subjectId: string;
      total: number;
      mistakes: number;
      success: number;
    }
  >();
  for (const entry of data.errors) {
    const key = `${entry.subjectId}:${entry.topic.trim().toLocaleLowerCase("sk")}`;
    const group = groups.get(key) ?? {
      name: entry.topic,
      subjectId: entry.subjectId,
      total: 0,
      mistakes: 0,
      success: 0,
    };
    group.total++;
    if (!entry.isCorrect) group.mistakes++;
    group.success = (100 * (group.total - group.mistakes)) / group.total;
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) => a.success - b.success || b.total - a.total,
  );
}
export function focusItems(data: Snapshot) {
  const topics = topicStats(data);
  const tests = upcomingTests(data).map((test) => {
    const readiness = currentReadiness(data, test.id);
    const days = daysUntil(test.date);
    const weak = topics.find(
      (topic) => topic.subjectId === test.subjectId && topic.mistakes > 0,
    );
    const results = data.results.filter(
      (result) =>
        data.tests.find((item) => item.id === result.testId)?.subjectId ===
        test.subjectId,
    );
    const performance = average(results.map((result) => result.percentage));
    const score =
      100 -
      (readiness ?? 0) +
      80 / Math.max(1, days + 1) +
      (weak ? (100 - weak.success) / 3 : 0) +
      (performance === null
        ? 0
        : Math.max(0, test.targetPercent - performance));
    return { test, score, weak, performance, readiness };
  });
  return tests.sort((a, b) => b.score - a.score);
}
export function cumulativeGrades(data: Snapshot) {
  const dates = [...new Set(data.grades.map((grade) => grade.date))].sort();
  return dates.map((date) => ({
    name: date,
    average:
      weightedAverage(data.grades.filter((grade) => grade.date <= date)) ?? 0,
  }));
}
