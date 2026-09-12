"use client";
import { useState } from "react";
import { Clock3, CalendarDays, BookOpen, Target } from "lucide-react";
import { useApp } from "../app-provider";
import { AddButton, Card, PageHeading, Progress, StatCard } from "../ui";
import { studyTotals } from "@/lib/analytics";
import { formatMinutes } from "@/lib/format";
import { chartData } from "@/lib/chart-data";
import { ChartPanel } from "../charts/chart-panel";
import { SessionTable } from "../data-tables";

export function StudyPage() {
  const { data } = useApp();
  const [subjectId, setSubjectId] = useState("");
  if (!data) return null;
  const sessions = data.sessions.filter(
    (session) => !subjectId || session.subjectId === subjectId,
  );
  const filtered = { ...data, sessions };
  const totals = studyTotals(filtered);
  const charts = chartData(filtered);
  const goal = Math.min(
    100,
    (totals.today / data.settings.dailyGoalMinutes) * 100,
  );
  return (
    <>
      <PageHeading
        eyebrow="SÚSTREDENIE A ČAS"
        title="Učenie"
        description="Zapíš si prípravu. Aj krátke učenie sa počíta."
        action={
          <AddButton
            request={{ entity: "sessions", subjectId: subjectId || undefined }}
          >
            Zapísať učenie
          </AddButton>
        }
      />
      <div className="stats-grid">
        <StatCard
          label="Dnes odštudované"
          value={formatMinutes(totals.today)}
          detail={`Denný cieľ ${formatMinutes(data.settings.dailyGoalMinutes)}`}
          icon={Clock3}
          accent
        />
        <StatCard
          label="Tento týždeň"
          value={formatMinutes(totals.week)}
          detail="Od pondelka do dneška"
          icon={CalendarDays}
        />
        <StatCard
          label="Celkový čas"
          value={formatMinutes(totals.all)}
          detail={`${sessions.length} záznamov učenia`}
          icon={BookOpen}
        />
        <StatCard
          label="Denný cieľ"
          value={`${Math.round(goal)} %`}
          detail={<Progress value={goal} label="Splnené" />}
          icon={Target}
        />
      </div>
      <div className="filter-bar">
        <label>
          Predmet
          <select
            aria-label="Filtrovať učenie podľa predmetu"
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
        <ChartPanel
          title="Čas učenia v čase"
          subtitle="Zapísané minúty podľa dátumu"
          data={charts.studyTime}
          kind="area"
          series={[{ key: "minutes", label: "Učenie (min)", color: "#c5ef79" }]}
        />
        <ChartPanel
          title="Čas učenia podľa predmetu"
          subtitle="Súčet všetkých záznamov v aktuálnom výbere"
          data={charts.studyBySubject}
          kind="bar"
          series={[{ key: "minutes", label: "Učenie (min)", color: "#a1c4b4" }]}
        />
      </div>
      <Card title="Záznamy učenia">
        <SessionTable
          data={data}
          sessions={sessions}
          subjectId={subjectId || undefined}
        />
      </Card>
    </>
  );
}
