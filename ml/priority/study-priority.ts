import type { Snapshot, Test } from "../../lib/types";
import { topicStats, currentReadiness } from "../../lib/analytics";
import { daysUntil } from "../../lib/format";
import { normalize } from "../common/text";
import type { TopicEvidence } from "../teacher/types";
export function studyPriorities(
  test: Test,
  data: Snapshot,
  topics: TopicEvidence[],
  minutes: number,
) {
  const stats = topicStats(data).filter((t) => t.subjectId === test.subjectId);
  const readiness = currentReadiness(data, test.id) ?? 50;
  const urgency = 1 / Math.max(1, daysUntil(test.date) + 1);
  const rows = topics
    .map((topic) => {
      const student = stats.find(
        (s) => normalize(s.name) === normalize(topic.name),
      );
      const weakness = student ? 1 - student.success / 100 : 0.5;
      const score = Math.min(
        100,
        Math.round(
          0.4 * topic.score +
            35 * weakness +
            (10 * test.difficulty) / 5 +
            8 * urgency +
            4 * (1 - readiness / 100) +
            (3 * test.targetPercent) / 100,
        ),
      );
      return {
        name: topic.name,
        score,
        success: student?.success ?? null,
        evidence: topic.evidence,
        minutes: 0,
      };
    })
    .sort((a, b) => b.score - a.score);
  const units = Math.max(0, Math.round(minutes / 5));
  const reviewUnits = Math.round(units * 0.12);
  const total = rows.reduce((sum, r) => sum + Math.max(1, r.score), 0);
  let remaining = units - reviewUnits;
  rows.forEach((row, i) => {
    const share =
      i === rows.length - 1
        ? remaining
        : Math.min(
            remaining,
            Math.floor(
              ((units - reviewUnits) * Math.max(1, row.score)) /
                Math.max(1, total),
            ),
          );
    row.minutes = share * 5;
    remaining -= share;
  });
  return { rows, reviewMinutes: rows.length ? reviewUnits * 5 : units * 5 };
}
