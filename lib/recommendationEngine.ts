import type { Snapshot, Test } from "./types";
import { currentReadiness, studiedMinutes, topicStats } from "./analytics";

export interface Recommendation {
  minutes: number;
  lowerMinutes: number;
  upperMinutes: number;
  remainingMinutes: number;
  confidence: "Nízka" | "Stredná" | "Vysoká";
  sampleCount: number;
  reasons: string[];
  warning: string | null;
}
const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));
const roundQuarter = (minutes: number) =>
  Math.max(15, Math.round(minutes / 15) * 15);
const topics = (value: string) =>
  new Set(
    value
      .toLocaleLowerCase("sk")
      .split(/[,;\n]+/)
      .map((part) => part.trim())
      .filter(Boolean),
  );

/** Local, deterministic estimate. No network calls, AI claims or statistical probability. */
export function recommendStudyTime(test: Test, data: Snapshot): Recommendation {
  const targetTopics = topics(test.topics);
  const baseline =
    data.settings.baselineMinutes *
    (0.55 + test.difficulty * 0.15) *
    (0.5 + test.targetPercent / 100);
  const candidates = data.results.flatMap((result) => {
    const historical = data.tests.find((item) => item.id === result.testId);
    // No future information or the current test's own outcome enters its prediction.
    if (
      !historical ||
      historical.id === test.id ||
      historical.date > test.date ||
      result.actualStudyMinutes <= 0
    )
      return [];
    const sameSubject = historical.subjectId === test.subjectId;
    const historicalTopics = topics(historical.topics);
    const overlap =
      [...targetTopics].filter((topic) => historicalTopics.has(topic)).length /
      Math.max(1, targetTopics.size);
    const difficultyGap = Math.abs(test.difficulty - historical.difficulty);
    const weight =
      (sameSubject ? 4 : 0.5) *
      (1 / (1 + difficultyGap)) *
      (1 + overlap) *
      (1 / (1 + Math.abs(test.targetPercent - historical.targetPercent) / 25));
    const resultAdjustment = clamp(
      1 + (test.targetPercent - result.percentage) / 100,
      0.65,
      1.65,
    );
    const difficultyAdjustment = clamp(
      1 + (test.difficulty - result.perceivedDifficulty) * 0.15,
      0.55,
      1.6,
    );
    // Calibration reduces time only when low confidence previously accompanied a strong result.
    const calibration =
      result.readinessBefore < 50 && result.percentage >= 80
        ? 0.9
        : result.readinessBefore < 50 && result.percentage < 60
          ? 1.1
          : 1;
    return [
      {
        result,
        sameSubject,
        difficultyGap,
        weight,
        estimate:
          result.actualStudyMinutes *
          resultAdjustment *
          difficultyAdjustment *
          calibration,
      },
    ];
  });
  const sameSubject = candidates.filter((candidate) => candidate.sameSubject);
  const selected = (sameSubject.length ? sameSubject : candidates)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 12);
  const weight = selected.reduce((sum, item) => sum + item.weight, 0);
  const historicalEstimate = weight
    ? selected.reduce((sum, item) => sum + item.estimate * item.weight, 0) /
      weight
    : baseline;
  const historyShare = selected.length
    ? Math.min(0.9, selected.length / (selected.length + 2))
    : 0;
  const minutes = roundQuarter(
    clamp(
      baseline * (1 - historyShare) + historicalEstimate * historyShare,
      15,
      10080,
    ),
  );
  const variation =
    selected.length > 1
      ? Math.sqrt(
          selected.reduce(
            (sum, item) => sum + (item.estimate - historicalEstimate) ** 2,
            0,
          ) / selected.length,
        ) / Math.max(1, historicalEstimate)
      : 1;
  const closeSamples = selected.filter(
    (item) => item.sameSubject && item.difficultyGap <= 1,
  ).length;
  const confidence =
    closeSamples >= 8 && variation < 0.3
      ? "Vysoká"
      : closeSamples >= 3 && variation < 0.6
        ? "Stredná"
        : "Nízka";
  const spread =
    confidence === "Vysoká" ? 0.2 : confidence === "Stredná" ? 0.3 : 0.45;
  const reasons = [
    selected.length
      ? `Odhad používa ${selected.length} historických výsledkov ${sameSubject.length ? "z tohto predmetu" : "z iných predmetov"}. Podobná náročnosť, témy a cieľ majú vyššiu váhu.`
      : "Zatiaľ chýba história s časom prípravy. Odhad vychádza zo základného času v nastaveniach, náročnosti a cieľa.",
  ];
  if (selected.length)
    reasons.push(
      `História tvorí ${Math.round(historyShare * 100)} % odhadu; zvyšok je základný odhad. Vyšší cieľ alebo náročnosť čas zvyšujú.`,
    );
  let warning: string | null = null;
  const mismatch = selected.filter(
    (item) => item.result.readinessBefore >= 75 && item.result.percentage < 65,
  );
  if (mismatch.length)
    warning =
      "Pravdepodobne nejde iba o nedostatok času. V histórii máš vysokú pripravenosť a nízky výsledok. Skontroluj problematické témy a spôsob overovania vedomostí.";
  if (
    selected.some(
      (item) =>
        item.result.readinessBefore >= 75 && item.result.percentage >= 80,
    )
  )
    reasons.push(
      "Vysoká pripravenosť spolu s dobrým výsledkom naznačuje, že doterajší spôsob prípravy funguje.",
    );
  if (
    selected.some(
      (item) => item.result.readinessBefore < 50 && item.result.percentage < 60,
    )
  )
    reasons.push(
      "Nízka pripravenosť aj výsledok zvyšujú odhad času podobnej prípravy o 10 % pred spriemerovaním.",
    );
  if (
    selected.some(
      (item) =>
        item.result.readinessBefore < 50 && item.result.percentage >= 80,
    )
  )
    reasons.push(
      "Pri nízkej pripravenosti a dobrom výsledku sa odhad podobnej prípravy znižuje o 10 %; možno svoje vedomosti podceňuješ.",
    );
  const weak = topicStats(data).find(
    (topic) => topic.subjectId === test.subjectId && topic.mistakes > 0,
  );
  if (weak)
    reasons.push(
      `Z označených odpovedí venuj pozornosť téme „${weak.name}“: ${weak.mistakes} chýb z ${weak.total} odpovedí.`,
    );
  const readiness = currentReadiness(data, test.id);
  if (readiness !== null && readiness < 50)
    reasons.push(
      "Aktuálna pripravenosť je pod 50 %. Pridaj precvičovanie a znova si over vedomosti; samotný pocit pripravenosti nemení celkový časový odhad.",
    );
  return {
    minutes,
    lowerMinutes: roundQuarter(minutes * (1 - spread)),
    upperMinutes: roundQuarter(minutes * (1 + spread)),
    remainingMinutes: Math.max(0, minutes - studiedMinutes(data, test.id)),
    confidence,
    sampleCount: selected.length,
    reasons,
    warning,
  };
}
