import type { Snapshot } from "./types";
import { errorLabels } from "./types";
import {
  average,
  cumulativeGrades,
  topicStats,
  weightedAverage,
} from "./analytics";

export function chartData(data: Snapshot) {
  const results = data.results
    .flatMap((result) => {
      const test = data.tests.find((test) => test.id === result.testId);
      const subject = data.subjects.find(
        (subject) => subject.id === test?.subjectId,
      );
      return test
        ? [
            {
              name: test.title,
              date: test.date,
              result: result.percentage,
              readiness: result.readinessBefore,
              minutes: result.actualStudyMinutes,
              recommended: result.recommendedMinutes,
              color: subject?.color ?? "#c5ef79",
            },
          ]
        : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const subjectRows = data.subjects.map((subject) => {
    const subjectTests = new Set(
      data.tests
        .filter((test) => test.subjectId === subject.id)
        .map((test) => test.id),
    );
    const grades = data.grades.filter(
      (grade) => grade.subjectId === subject.id,
    );
    const sessions = data.sessions.filter(
      (session) => session.subjectId === subject.id,
    );
    const errors = data.errors.filter(
      (error) => error.subjectId === subject.id,
    );
    return {
      name: subject.name,
      color: subject.color,
      average: weightedAverage(grades),
      result: average(
        data.results
          .filter((result) => subjectTests.has(result.testId))
          .map((result) => result.percentage),
      ),
      minutes: sessions.reduce((sum, s) => sum + s.minutes, 0),
      mistakes: errors.filter((error) => !error.isCorrect).length,
      gradeCount: grades.length,
      sessionCount: sessions.length,
      answerCount: errors.length,
    };
  });
  const studyDates = [
    ...new Set(data.sessions.map((session) => session.date)),
  ].sort();
  const studyTime = studyDates.map((date) => ({
    name: date,
    minutes: data.sessions
      .filter((session) => session.date === date)
      .reduce((sum, s) => sum + s.minutes, 0),
  }));
  const errorsByTopic = topicStats(data).map((topic) => ({
    name: `${topic.name} · ${data.subjects.find((s) => s.id === topic.subjectId)?.name ?? ""}`,
    mistakes: topic.mistakes,
    success: topic.success,
    color:
      data.subjects.find((s) => s.id === topic.subjectId)?.color ?? "#c5ef79",
  }));
  const errorTypes = Object.entries(errorLabels)
    .map(([key, name]) => ({
      name,
      mistakes: data.errors.filter(
        (error) => !error.isCorrect && error.errorType === key,
      ).length,
    }))
    .filter((item) => item.mistakes > 0);
  const successDates = [
    ...new Set(data.errors.map((error) => error.date)),
  ].sort();
  const successTime = successDates.map((date) => {
    const entries = data.errors.filter((error) => error.date === date);
    return {
      name: date,
      success:
        (entries.filter((error) => error.isCorrect).length / entries.length) *
        100,
    };
  });
  return {
    gradeTrend: cumulativeGrades(data),
    gradesBySubject: subjectRows.filter((row) => row.gradeCount),
    resultTrend: results.map((result) => ({
      ...result,
      name: `${result.date} · ${result.name}`,
    })),
    resultsBySubject: subjectRows.filter((row) => row.result !== null),
    studyTime,
    studyBySubject: subjectRows.filter((row) => row.sessionCount),
    scatter: results,
    errorsBySubject: subjectRows.filter((row) => row.answerCount),
    errorsByTopic,
    errorTypes,
    successTime,
    recommendationComparison: results,
  };
}
export function readinessChart(data: Snapshot, testId: string) {
  return data.readiness
    .filter((entry) => entry.testId === testId)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .map((entry) => ({
      name: new Date(entry.recordedAt).toLocaleString("sk-SK", {
        day: "numeric",
        month: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      readiness: entry.percent,
    }));
}
