"use client";
import { useState } from "react";
import { useApp } from "../app-provider";
import { PageHeading } from "../ui";
import { ChartPanel } from "../charts/chart-panel";
import { chartData, readinessChart } from "@/lib/chart-data";
import { localDate } from "@/lib/format";

export function ChartsPage() {
  const { data } = useApp();
  const [subjectId, setSubjectId] = useState("");
  const [period, setPeriod] = useState("all");
  const [testId, setTestId] = useState("");
  if (!data) return null;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Number(period));
  const start = period === "all" ? "0000-01-01" : localDate(startDate);
  const tests = data.tests.filter(
    (test) =>
      (!subjectId || test.subjectId === subjectId) && test.date >= start,
  );
  const ids = new Set(tests.map((t) => t.id));
  const filtered = {
    ...data,
    subjects: data.subjects.filter((s) => !subjectId || s.id === subjectId),
    tests,
    grades: data.grades.filter(
      (g) => (!subjectId || g.subjectId === subjectId) && g.date >= start,
    ),
    sessions: data.sessions.filter(
      (s) => (!subjectId || s.subjectId === subjectId) && s.date >= start,
    ),
    errors: data.errors.filter(
      (e) => (!subjectId || e.subjectId === subjectId) && e.date >= start,
    ),
    results: data.results.filter((r) => ids.has(r.testId)),
  };
  const charts = chartData(filtered);
  const selectedTest =
    tests.find((t) => t.id === testId)?.id || tests[0]?.id || "";
  const goalProgress = data.progressEntries.filter((entry) => entry.value !== null).sort((a,b) => a.date.localeCompare(b.date)).map((entry) => ({ name: `${entry.date} · ${data.goals.find((goal) => goal.id === entry.goalId)?.name ?? "Cieľ"}`, value: entry.value }));
  const activityFrequency = data.goals.map((goal) => ({ name: goal.name, count: data.progressEntries.filter((entry) => entry.goalId === goal.id).length })).filter((item) => item.count > 0);
  return (
    <>
      <PageHeading
        eyebrow="DÁTA V SÚVISLOSTIACH"
        title="Grafy"
        description="Všetky grafy vychádzajú z tvojich uložených záznamov. Bez dopĺňania chýbajúcich výsledkov."
      />
      <div className="filter-bar">
        <label>
          Predmet
          <select
            aria-label="Predmet v grafoch"
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
        <label>
          Obdobie
          <select
            aria-label="Obdobie grafov"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="all">Celá história</option>
            <option value="30">Posledných 30 dní</option>
            <option value="90">Posledných 90 dní</option>
            <option value="365">Posledný rok</option>
          </select>
        </label>
      </div>
      <div className="two-column">
        <ChartPanel title="Pokrok cieľov v čase" subtitle="Uložené číselné hodnoty" data={goalProgress} series={[{ key: "value", label: "Hodnota", color: "#c5ef79" }]} />
        <ChartPanel title="Aktivita podľa cieľa" subtitle="Počet záznamov pokroku" data={activityFrequency} series={[{ key: "count", label: "Záznamy", color: "#a1c4b4" }]} kind="bar" />
        <ChartPanel
          title="01 / Vývoj priemeru známok"
          subtitle="Priebežný vážený priemer v zvolenom období · 1 je najlepšia"
          data={charts.gradeTrend}
          series={[
            { key: "average", label: "Vážený priemer", color: "#c5ef79" },
          ]}
          domain={[1, 5]}
          reversed
        />
        <ChartPanel
          title="02 / Známky podľa predmetu"
          data={charts.gradesBySubject}
          series={[{ key: "average", label: "Priemer", color: "#c5ef79" }]}
          kind="bar"
          domain={[0, 5]}
        />
        <ChartPanel
          title="03 / Výsledky testov v čase"
          data={charts.resultTrend}
          series={[{ key: "result", label: "Výsledok", color: "#a1c4b4" }]}
          domain={[0, 100]}
          unit=" %"
        />
        <ChartPanel
          title="04 / Výsledky podľa predmetu"
          data={charts.resultsBySubject}
          series={[
            { key: "result", label: "Priemerný výsledok", color: "#a1c4b4" },
          ]}
          kind="bar"
          domain={[0, 100]}
          unit=" %"
        />
        <ChartPanel
          title="05 / Čas učenia v čase"
          data={charts.studyTime}
          series={[{ key: "minutes", label: "Učenie (min)", color: "#c5ef79" }]}
          kind="area"
        />
        <ChartPanel
          title="06 / Čas učenia podľa predmetu"
          data={charts.studyBySubject}
          series={[{ key: "minutes", label: "Učenie (min)", color: "#a1c4b4" }]}
          kind="bar"
        />
        <ChartPanel
          title="07 / Pripravenosť vs. výsledok"
          subtitle="X = pripravenosť pred testom (%) · Y = výsledok (%)"
          data={charts.scatter}
          series={[{ key: "result", label: "Výsledok", color: "#c5ef79" }]}
          kind="scatter"
          xKey="readiness"
          xLabel="Pripravenosť"
          domain={[0, 100]}
          unit=" %"
        />
        <ChartPanel
          title="08 / Čas učenia vs. výsledok"
          subtitle="X = reálny čas prípravy (min) · Y = výsledok (%)"
          data={charts.scatter}
          series={[{ key: "result", label: "Výsledok", color: "#b1b7d9" }]}
          kind="scatter"
          xKey="minutes"
          xLabel="Čas učenia"
          domain={[0, 100]}
          unit=" %"
        />
        <div>
          <div className="filter-bar">
            <label>
              Test
              <select
                aria-label="Test pre graf pripravenosti"
                value={selectedTest}
                onChange={(e) => setTestId(e.target.value)}
              >
                {!tests.length && <option value="">Zatiaľ bez testov</option>}
                {tests.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ChartPanel
            title="09 / Vývoj pripravenosti na test"
            data={readinessChart(data, selectedTest)}
            series={[
              { key: "readiness", label: "Pripravenosť", color: "#c5ef79" },
            ]}
            kind="area"
            domain={[0, 100]}
            unit=" %"
          />
        </div>
        <ChartPanel
          title="10 / Chyby podľa predmetu"
          data={charts.errorsBySubject}
          series={[{ key: "mistakes", label: "Počet chýb", color: "#d6b88a" }]}
          kind="bar"
        />
        <ChartPanel
          title="11 / Chyby podľa témy"
          data={charts.errorsByTopic}
          series={[{ key: "mistakes", label: "Počet chýb", color: "#d6b88a" }]}
          kind="bar"
        />
        <ChartPanel
          title="12 / Typy chýb"
          data={charts.errorTypes}
          series={[{ key: "mistakes", label: "Počet chýb", color: "#c7a1a1" }]}
          kind="bar"
        />
        <ChartPanel
          title="13 / Odporúčaný a skutočný čas"
          subtitle="Odhad uložený pri vyhodnotení sa spätne neprepočítava."
          data={charts.recommendationComparison}
          series={[
            {
              key: "recommended",
              label: "Odporúčaný čas (min)",
              color: "#c5ef79",
            },
            { key: "minutes", label: "Skutočný čas (min)", color: "#91afb1" },
          ]}
          kind="bar"
        />
        <ChartPanel
          title="14 / Úspešnosť odpovedí v čase"
          subtitle="Úspešnosť ručne označených odpovedí za jednotlivé dni"
          data={charts.successTime}
          series={[{ key: "success", label: "Úspešnosť", color: "#a1c4b4" }]}
          domain={[0, 100]}
          unit=" %"
        />
      </div>
    </>
  );
}
