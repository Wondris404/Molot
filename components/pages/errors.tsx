"use client";
import { useState } from "react";
import { BookOpen, CircleCheck, ScanLine, TriangleAlert } from "lucide-react";
import { useApp } from "../app-provider";
import {
  AddButton,
  Card,
  EmptyState,
  PageHeading,
  StatCard,
  SubjectBadge,
} from "../ui";
import { ErrorTable } from "../data-tables";
import { MaterialsPanel } from "../materials-panel";
import { topicStats } from "@/lib/analytics";
import { formatNumber } from "@/lib/format";
import { chartData } from "@/lib/chart-data";
import { ChartPanel } from "../charts/chart-panel";

export function ErrorsPage() {
  const { data } = useApp();
  const [subjectId, setSubjectId] = useState("");
  const [correctness, setCorrectness] = useState("");
  if (!data) return null;
  const answers = data.errors.filter(
    (e) => !subjectId || e.subjectId === subjectId,
  );
  const filtered = { ...data, errors: answers };
  const entries = answers.filter(
    (e) => !correctness || String(e.isCorrect) === correctness,
  );
  const mistakes = answers.filter((e) => !e.isCorrect);
  const topics = topicStats(filtered);
  const charts = chartData(filtered);
  const mostCommon = [...charts.errorTypes].sort(
    (a, b) => b.mistakes - a.mistakes,
  )[0];
  return (
    <>
      <PageHeading
        eyebrow="POROZUMIEŤ CHYBÁM"
        title="Analýza chýb"
        description="Nájdi problematické témy a zisti, čo potrebuješ precvičiť."
        action={
          <AddButton
            request={{ entity: "errors", subjectId: subjectId || undefined }}
          >
            Pridať odpoveď / chybu
          </AddButton>
        }
      />
      <div className="stats-grid">
        <StatCard
          label="Označené odpovede"
          value={answers.length}
          detail="Správne aj nesprávne záznamy"
          icon={ScanLine}
        />
        <StatCard
          label="Úspešnosť odpovedí"
          value={
            answers.length
              ? `${formatNumber((100 * (answers.length - mistakes.length)) / answers.length)} %`
              : "—"
          }
          detail="Iba z ručne označených odpovedí"
          icon={CircleCheck}
          accent
        />
        <StatCard
          label="Nesprávne odpovede"
          value={mistakes.length}
          detail={
            mostCommon
              ? `Najčastejšie: ${mostCommon.name}`
              : "Zatiaľ bez označených chýb"
          }
          icon={TriangleAlert}
        />
        <StatCard
          label="Problematické témy"
          value={topics.filter((t) => t.mistakes > 0).length}
          detail={
            topics.find((t) => t.mistakes > 0)?.name || "Zatiaľ bez údajov"
          }
          icon={BookOpen}
        />
      </div>
      <div className="filter-bar">
        <label>
          Predmet
          <select
            aria-label="Filtrovať analýzu podľa predmetu"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">Všetky predmety</option>
            {data.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="two-column mb-5">
        <Card
          title="Úspešnosť podľa tém"
          subtitle="Pri malej vzorke ber percentá s rezervou."
        >
          {topics.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Téma</th>
                    <th>Chyby / odpovede</th>
                    <th>Úspešnosť</th>
                  </tr>
                </thead>
                <tbody>
                  {topics.map((topic) => (
                    <tr key={`${topic.subjectId}:${topic.name}`}>
                      <td>
                        {topic.name}
                        <div className="mt-1">
                          <SubjectBadge
                            subject={data.subjects.find(
                              (s) => s.id === topic.subjectId,
                            )}
                            link
                          />
                        </div>
                      </td>
                      <td>
                        {topic.mistakes} / {topic.total}
                      </td>
                      <td
                        className={
                          topic.success >= 80 ? "correct" : "incorrect"
                        }
                      >
                        {formatNumber(topic.success)} %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState compact title="Témy sa zobrazia po prvom zázname." />
          )}
          {topics.some((t) => t.mistakes > 0) && (
            <p className="hint-box mt-5">
              Najviac pozornosti potrebuje téma{" "}
              <strong>{topics.find((t) => t.mistakes > 0)?.name}</strong>.
              Poradie vychádza z úspešnosti označených odpovedí.
            </p>
          )}
        </Card>
        <ChartPanel
          title="Najčastejšie typy chýb"
          data={charts.errorTypes}
          kind="bar"
          series={[{ key: "mistakes", label: "Počet chýb", color: "#d6b88a" }]}
        />
      </div>
      <div className="two-column mb-5">
        <ChartPanel
          title="Chyby podľa predmetu"
          data={charts.errorsBySubject}
          kind="bar"
          series={[{ key: "mistakes", label: "Počet chýb", color: "#c5ef79" }]}
        />
        <ChartPanel
          title="Vývoj úspešnosti odpovedí"
          subtitle="Denná úspešnosť ručne označených odpovedí"
          data={charts.successTime}
          series={[{ key: "success", label: "Úspešnosť", color: "#a1c4b4" }]}
          domain={[0, 100]}
          unit=" %"
        />
      </div>
      <Card
        title="Označené odpovede"
        className="mb-5"
        action={
          <select
            aria-label="Filtrovať správnosť odpovedí"
            className="max-w-44"
            value={correctness}
            onChange={(e) => setCorrectness(e.target.value)}
          >
            <option value="">Všetky odpovede</option>
            <option value="false">Nesprávne</option>
            <option value="true">Správne</option>
          </select>
        }
      >
        <ErrorTable
          entries={entries}
          data={data}
          subjectId={subjectId || undefined}
        />
      </Card>
      <MaterialsPanel key={subjectId} subjectId={subjectId || undefined} />
    </>
  );
}
