"use client";
import Link from "next/link";
import {
  CalendarDays,
  Clock3,
  GraduationCap,
  Target,
  ArrowUpRight,
} from "lucide-react";
import { useApp } from "../app-provider";
import {
  AddButton,
  Card,
  EmptyState,
  PageHeading,
  Progress,
  StatCard,
  SubjectBadge,
  TextLink,
} from "../ui";
import {
  currentReadiness,
  focusItems,
  studyTotals,
  topicStats,
  upcomingTests,
  weightedAverage,
} from "@/lib/analytics";
import {
  dueLabel,
  formatDate,
  formatMinutes,
  formatNumber,
  localDate,
} from "@/lib/format";
import { recommendStudyTime } from "@/lib/recommendationEngine";
import { chartData } from "@/lib/chart-data";
import { ChartPanel } from "../charts/chart-panel";
import { GradeTable } from "../data-tables";
import type { Snapshot } from "@/lib/types";

export function DashboardPage() {
  const { data } = useApp();
  if (!data) return null;
  if (!data.profile.modules.includes("school")) return <GeneralDashboard data={data} />;
  const upcoming = upcomingTests(data).filter(
    (test) => test.date >= localDate(),
  );
  const next = upcoming[0];
  const readiness = next ? currentReadiness(data, next.id) : null;
  const totals = studyTotals(data);
  const focus = focusItems(data).slice(0, 3);
  const weak = topicStats(data)
    .filter((topic) => topic.mistakes > 0)
    .slice(0, 3);
  const charts = chartData(data);
  const recommendation = next ? recommendStudyTime(next, data) : null;
  const recentResults = [...data.results]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 4);
  const date = new Date().toLocaleDateString("sk-SK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <>
      <PageHeading
        eyebrow={date}
        title="Tvoj školský prehľad."
        description="Výsledky, príprava a ďalší krok. Všetko na jednom mieste."
        action={
          <AddButton request={{ entity: "tests" }}>Pridať test</AddButton>
        }
      />
      <div className="stats-grid">
        <StatCard
          label="Celkový vážený priemer"
          value={formatNumber(weightedAverage(data.grades), 2)}
          detail={`${data.grades.length} známok · všetky predmety`}
          icon={GraduationCap}
          accent
        />
        <StatCard
          label="Nadchádzajúce testy"
          value={upcoming.length}
          detail={
            next
              ? `${dueLabel(next.date)} · ${next.title}`
              : "Žiadny naplánovaný termín"
          }
          icon={CalendarDays}
        />
        <StatCard
          label="Učenie tento týždeň"
          value={formatMinutes(totals.week)}
          detail={`Dnes ${formatMinutes(totals.today)} · cieľ ${formatMinutes(data.settings.dailyGoalMinutes)}`}
          icon={Clock3}
        />
        <StatCard
          label="Pripravenosť na najbližší test"
          value={readiness === null ? "—" : `${formatNumber(readiness)} %`}
          detail={
            next
              ? `${next.title} · cieľ ${next.targetPercent} %`
              : "Pridaj test a svoj prvý odhad"
          }
          icon={Target}
        />
      </div>
      <div className="dashboard-grid">
        {data.goals.length > 0 && (
          <Card title="Tvoje ciele" subtitle="Aktuálny postup" action={<TextLink href="/goals">Všetky ciele</TextLink>}>
            {data.goals.slice(0, 3).map((goal) => (
              <div className="material-item" key={goal.id}><div><Link className="item-title" href="/goals">{goal.name}</Link><span className="small muted">{goal.currentValue}{goal.unit ? ` ${goal.unit}` : ""}{goal.targetValue !== null ? ` / ${goal.targetValue} ${goal.unit}` : ""}</span></div><Target size={18} className="muted" /></div>
            ))}
          </Card>
        )}
        <Card
          title="Najbližšie testy"
          subtitle="Tvoje najbližšie termíny a stav prípravy"
          action={<TextLink href="/tests">Všetky testy</TextLink>}
        >
          {!upcoming.length ? (
            <EmptyState
              title="Najbližšie dni máš voľné."
              description="Keď dostaneš termín testu, pridaj ho sem a naplánuj si prípravu."
              action={
                <AddButton request={{ entity: "tests" }} secondary>
                  Pridať prvý test
                </AddButton>
              }
            />
          ) : (
            upcoming.slice(0, 4).map((test) => (
              <div className="upcoming-item" key={test.id}>
                <div className="date-tile">
                  {Number(test.date.slice(8, 10))}
                  <span>
                    {new Date(`${test.date}T12:00:00`).toLocaleDateString(
                      "sk-SK",
                      { month: "short" },
                    )}
                  </span>
                </div>
                <div>
                  <Link className="item-title" href={`/tests/${test.id}`}>
                    {test.title}
                  </Link>
                  <div className="inline">
                    <SubjectBadge
                      subject={data.subjects.find(
                        (s) => s.id === test.subjectId,
                      )}
                    />
                    <span className="small muted">
                      {dueLabel(test.date)}
                      {test.time && ` · ${test.time}`}
                    </span>
                  </div>
                </div>
                <Progress value={currentReadiness(data, test.id)} />
              </div>
            ))
          )}
        </Card>
        <Card
          title="Čomu sa mám venovať"
          subtitle="Priority podľa tvojich údajov"
          className="focus-card"
          action={<Target size={18} className="muted" />}
        >
          {focus.length ? (
            focus.map((item, index) => (
              <div className="focus-topic" key={item.test.id}>
                <span className="focus-number">0{index + 1}</span>
                <div>
                  <Link href={`/tests/${item.test.id}`} className="item-title">
                    {
                      data.subjects.find((s) => s.id === item.test.subjectId)
                        ?.name
                    }
                    <ArrowUpRight size={12} className="inline ml-2" />
                  </Link>
                  <p className="muted">
                    {item.test.title} · {dueLabel(item.test.date)}
                    <br />
                    {item.readiness === null
                      ? "Pripravenosť ešte nie je zaznamenaná."
                      : `Pripravenosť ${item.readiness} %.`}
                    {item.weak && ` Precvič: ${item.weak.name}.`}
                    {item.performance !== null &&
                      ` Historická úspešnosť ${formatNumber(item.performance)} %.`}
                  </p>
                </div>
              </div>
            ))
          ) : weak.length ? (
            weak.map((topic, index) => (
              <div
                className="focus-topic"
                key={`${topic.subjectId}:${topic.name}`}
              >
                <span className="focus-number">0{index + 1}</span>
                <div>
                  <h3>{topic.name}</h3>
                  <p className="muted">
                    {data.subjects.find((s) => s.id === topic.subjectId)?.name}{" "}
                    · {topic.mistakes} chýb z {topic.total} označených odpovedí.
                  </p>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              compact
              title="Tvoje priority sa ešte tvoria."
              description="Pridaj test, pripravenosť alebo chyby. Odporúčania budú vychádzať z nich."
            />
          )}
          {recommendation && (
            <div className="hint-box">
              Na najbližší test odhadujem celkovú prípravu{" "}
              <strong>
                {formatMinutes(recommendation.lowerMinutes)} –{" "}
                {formatMinutes(recommendation.upperMinutes)}
              </strong>
              . Istota: {recommendation.confidence.toLowerCase()}.
            </div>
          )}
        </Card>
        <ChartPanel
          title="Ako sa vyvíjajú známky"
          subtitle="Priebežný vážený priemer · 1 je najlepšia známka"
          data={charts.gradeTrend}
          series={[
            { key: "average", label: "Vážený priemer", color: "#c5ef79" },
          ]}
          domain={[1, 5]}
          reversed
          kind="area"
        />
        <ChartPanel
          title="Čas venovaný učeniu"
          subtitle="Minúty podľa dátumu"
          data={charts.studyTime.slice(-10)}
          kind="bar"
          series={[{ key: "minutes", label: "Učenie (min)", color: "#a5c8a1" }]}
        />
        <Card
          title="Posledné známky"
          action={<TextLink href="/grades">Denník známok</TextLink>}
        >
          <GradeTable
            data={data}
            grades={[...data.grades]
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 4)}
          />
        </Card>
        <Card
          title="Posledné výsledky"
          action={<TextLink href="/charts">Všetky výsledky</TextLink>}
        >
          {!recentResults.length ? (
            <EmptyState
              compact
              title="Zatiaľ bez výsledkov testov."
              description="Po teste doplň body alebo percentá v jeho detaile."
            />
          ) : (
            recentResults.map((result) => {
              const test = data.tests.find((test) => test.id === result.testId);
              return (
                <div className="material-item" key={result.id}>
                  <div>
                    <Link
                      href={`/tests/${result.testId}`}
                      className="item-title"
                    >
                      {test?.title}
                    </Link>
                    <span className="small muted">
                      {test && formatDate(test.date)} ·{" "}
                      {formatMinutes(result.actualStudyMinutes)} prípravy
                    </span>
                  </div>
                  <span className="correct">
                    {formatNumber(result.percentage)} %
                  </span>
                </div>
              );
            })
          )}
        </Card>
      </div>
    </>
  );
}

function GeneralDashboard({ data }: { data: Snapshot }) {
  const active = data.goals.filter((goal) => goal.status === "active");
  const completed = data.goals.filter((goal) => goal.status === "completed");
  const recent = [...data.progressEntries].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 6);
  return <>
    <PageHeading eyebrow="TVOJ PREHĽAD" title={data.profile.name ? `Ahoj, ${data.profile.name}.` : "Tvoj prehľad."} description={data.profile.mainGoal || "Ciele, aktivita a ďalší krok na jednom mieste."} action={<TextLink href="/goals">Spravovať ciele</TextLink>} />
    <div className="stats-grid"><StatCard label="Aktívne ciele" value={active.length} detail="Ciele, na ktorých pracuješ" icon={Target} accent /><StatCard label="Dokončené" value={completed.length} detail="Dosiahnuté ciele" icon={GraduationCap} /><StatCard label="Záznamy pokroku" value={data.progressEntries.length} detail="Skutočné uložené aktivity" icon={Clock3} /></div>
    <div className="dashboard-grid"><Card title="Aktuálne ciele" action={<TextLink href="/goals">Všetky ciele</TextLink>}>{active.length ? active.slice(0,5).map((goal) => <div className="material-item" key={goal.id}><div><Link className="item-title" href="/goals">{goal.name}</Link><span className="small muted">{goal.currentValue}{goal.unit ? ` ${goal.unit}` : ""}{goal.targetValue !== null ? ` z ${goal.targetValue} ${goal.unit}` : ""}</span></div></div>) : <EmptyState compact title="Zatiaľ bez aktívnych cieľov." description="Pridaj svoj prvý cieľ a začni zaznamenávať pokrok." />}</Card><Card title="Posledný pokrok">{recent.length ? recent.map((entry) => <div className="material-item" key={entry.id}><div><strong>{data.goals.find((goal) => goal.id === entry.goalId)?.name}</strong><span className="small muted">{entry.date} · {entry.value ?? "—"}{entry.unit ? ` ${entry.unit}` : ""}</span></div></div>) : <EmptyState compact title="Zatiaľ bez pokroku." description="Prvý záznam pridáš pri svojom cieli." />}</Card></div>
  </>;
}
