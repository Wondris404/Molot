"use client";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  GraduationCap,
  Target,
  Timer,
} from "lucide-react";
import { useApp } from "../app-provider";
import {
  AddButton,
  Card,
  EmptyState,
  PageHeading,
  RowActions,
  StatCard,
} from "../ui";
import {
  average,
  studyTotals,
  topicStats,
  weightedAverage,
} from "@/lib/analytics";
import { formatMinutes, formatNumber } from "@/lib/format";
import { chartData } from "@/lib/chart-data";
import { ChartPanel } from "../charts/chart-panel";
import {
  GradeTable,
  TestTable,
  SessionTable,
  ErrorTable,
} from "../data-tables";
import { MaterialsPanel } from "../materials-panel";

export function SubjectDetailPage({ id }: { id: string }) {
  const { data } = useApp();
  if (!data) return null;
  const subject = data.subjects.find((s) => s.id === id);
  if (!subject)
    return (
      <EmptyState
        title="Predmet sa nenašiel."
        action={
          <Link className="button" href="/grades">
            Späť na známky
          </Link>
        }
      />
    );
  const tests = data.tests.filter((t) => t.subjectId === id);
  const testIds = new Set(tests.map((t) => t.id));
  const filtered = {
    ...data,
    subjects: [subject],
    tests,
    grades: data.grades.filter((g) => g.subjectId === id),
    sessions: data.sessions.filter((s) => s.subjectId === id),
    errors: data.errors.filter((e) => e.subjectId === id),
    results: data.results.filter((r) => testIds.has(r.testId)),
  };
  const charts = chartData(filtered);
  const topics = topicStats(filtered).filter((t) => t.mistakes > 0);
  return (
    <>
      <Link href="/grades" className="back-link">
        <ArrowLeft size={14} />
        Všetky predmety
      </Link>
      <PageHeading
        eyebrow="DETAIL PREDMETU"
        title={subject.name}
        description="Známky, výsledky a príprava v súvislostiach."
        action={
          <div className="inline">
            <AddButton request={{ entity: "grades", subjectId: id }}>
              Pridať známku
            </AddButton>
            <RowActions entity="subjects" id={id} label={subject.name} />
          </div>
        }
      />
      <div className="stats-grid">
        <StatCard
          label="Vážený priemer"
          value={formatNumber(weightedAverage(filtered.grades), 2)}
          detail={`${filtered.grades.length} známok`}
          icon={GraduationCap}
          accent
        />
        <StatCard
          label="Úspešnosť testov"
          value={
            filtered.results.length
              ? `${formatNumber(average(filtered.results.map((r) => r.percentage)))} %`
              : "—"
          }
          detail={`${filtered.results.length} vyhodnotených testov`}
          icon={Target}
        />
        <StatCard
          label="Čas učenia"
          value={formatMinutes(studyTotals(filtered).all)}
          detail={`${filtered.sessions.length} záznamov prípravy`}
          icon={Timer}
        />
        <StatCard
          label="Označené chyby"
          value={filtered.errors.filter((e) => !e.isCorrect).length}
          detail={`${filtered.errors.length} označených odpovedí`}
          icon={BookOpen}
        />
      </div>
      <div className="two-column mb-5">
        <ChartPanel
          title="Vývoj známok"
          subtitle="Priebežný vážený priemer"
          data={charts.gradeTrend}
          series={[{ key: "average", label: "Priemer", color: subject.color }]}
          domain={[1, 5]}
          reversed
        />
        <ChartPanel
          title="Výsledky testov"
          data={charts.resultTrend}
          series={[{ key: "result", label: "Výsledok", color: subject.color }]}
          domain={[0, 100]}
          unit=" %"
        />
      </div>
      <div className="stack">
        <Card title="Známky">
          <GradeTable data={data} grades={filtered.grades} subjectId={id} />
        </Card>
        <Card
          title="Testy predmetu"
          action={
            <AddButton request={{ entity: "tests", subjectId: id }} secondary>
              Pridať test
            </AddButton>
          }
        >
          <TestTable tests={tests} data={data} subjectId={id} />
        </Card>
        <div className="two-column">
          <ChartPanel
            title="Čas učenia"
            data={charts.studyTime}
            series={[
              { key: "minutes", label: "Učenie (min)", color: subject.color },
            ]}
            kind="bar"
          />
          <Card title="Problematické témy">
            {topics.length ? (
              topics.map((topic) => (
                <div className="material-item" key={topic.name}>
                  <div>
                    <h3>{topic.name}</h3>
                    <span className="small muted">
                      {topic.mistakes} chýb z {topic.total} odpovedí
                    </span>
                  </div>
                  <span>{formatNumber(topic.success)} %</span>
                </div>
              ))
            ) : (
              <EmptyState
                compact
                title="Zatiaľ bez označených chýb."
                description="Témy sa zobrazia po zapísaní nesprávnych odpovedí."
              />
            )}
          </Card>
        </div>
        <Card
          title="Záznamy učenia"
          action={
            <AddButton
              request={{ entity: "sessions", subjectId: id }}
              secondary
            >
              Zapísať učenie
            </AddButton>
          }
        >
          <SessionTable
            sessions={filtered.sessions}
            data={data}
            subjectId={id}
          />
        </Card>
        <MaterialsPanel subjectId={id} />
        <Card
          title="Odpovede a chyby"
          action={
            <AddButton request={{ entity: "errors", subjectId: id }} secondary>
              Pridať odpoveď / chybu
            </AddButton>
          }
        >
          <ErrorTable entries={filtered.errors} data={data} subjectId={id} />
        </Card>
      </div>
    </>
  );
}
