"use client";
import { ChartPanel } from "../charts/chart-panel";
import { Card, EmptyState } from "../ui";
import { analyzeTeacher } from "@/ml/teacher/pattern-engine";
import { normalize } from "@/ml/common/text";
import type { TeacherSnapshot } from "@/ml/teacher/types";
import type { testPrediction } from "@/lib/intelligence";
export function TeacherCharts({
  data,
  teacherId,
}: {
  data: TeacherSnapshot;
  teacherId: string;
}) {
  const analysis = analyzeTeacher(data, teacherId);
  const actual = data.predictions
    .filter((p) => p.teacherId === teacherId && p.actualTopics !== null)
    .flatMap((p) => {
      const payload = JSON.parse(p.payload) as ReturnType<
        typeof testPrediction
      >;
      const topics = JSON.parse(p.actualTopics!) as string[];
      return (payload.teacher?.topics ?? []).map((t) => ({
        name: t.name,
        predicted: t.score,
        actual: topics.some((a) => normalize(a) === normalize(t.name))
          ? 100
          : 0,
      }));
    });
  return (
    <>
      <Card
        title="Historické priority tém"
        subtitle={`${analysis.testCount} testov · istota ${analysis.confidence.toLowerCase()}`}
      >
        <p className="small muted mb-5">
          Ide o odhad založený na historických testoch, nie istotu. Skóre je
          vážená relevancia; nie kalibrovaná pravdepodobnosť výskytu.
        </p>
        {!analysis.testCount && (
          <EmptyState
            title="Nedostatok dát."
            description="Pridaj historický test a jeho otázky alebo označené témy."
          />
        )}
        {analysis.topics.map((topic) => (
          <div className="material-item" key={topic.name}>
            <div>
              <strong>{topic.name}</strong>
              <p className="small muted">{topic.evidence}</p>
            </div>
            <span className="topic-tag">
              {topic.priority} · {topic.score}/100
            </span>
          </div>
        ))}
        {analysis.styles[0] && (
          <p className="hint-box mt-5">
            Najčastejší štýl:{" "}
            {analysis.styles
              .slice(0, 2)
              .map((s) => s.name)
              .join(" + ")}
          </p>
        )}
      </Card>
      <div className="two-column mt-5">
        <ChartPanel
          title="Výskyt tém v testoch"
          kind="bar"
          data={analysis.topics.map((t) => ({ name: t.name, count: t.count }))}
          series={[{ key: "count", label: "Počet testov", color: "#c5ef79" }]}
        />
        <ChartPanel
          title="Pokrytie tém v čase"
          data={analysis.timeline}
          series={[
            { key: "count", label: "Počet označených tém", color: "#c5ef79" },
          ]}
        />
        <ChartPanel
          title="Štýly otázok"
          kind="bar"
          data={analysis.styles.map((s) => ({
            name: s.name,
            percent: s.percent,
          }))}
          unit=" %"
          domain={[0, 100]}
          series={[
            { key: "percent", label: "Podiel otázok", color: "#94c6dd" },
          ]}
        />
        <ChartPanel
          title="Body podľa tém"
          kind="bar"
          data={analysis.topics.map((t) => ({
            name: t.name,
            points: t.points,
          }))}
          series={[{ key: "points", label: "Označené body", color: "#d9b479" }]}
        />
        <ChartPanel
          title="Opakované otázky podľa tém"
          kind="bar"
          data={analysis.topics.map((t) => ({
            name: t.name,
            repeated: t.repeated,
          }))}
          series={[
            { key: "repeated", label: "Podobné dvojice", color: "#c5ef79" },
          ]}
        />
        <ChartPanel
          title="Predikované a skutočné témy"
          kind="bar"
          data={actual}
          unit=" %"
          domain={[0, 100]}
          series={[
            { key: "predicted", label: "Pôvodná relevancia", color: "#94c6dd" },
            {
              key: "actual",
              label: "Skutočný výskyt (0/100)",
              color: "#c5ef79",
            },
          ]}
        />
      </div>
    </>
  );
}
