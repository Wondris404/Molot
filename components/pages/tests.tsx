"use client";
import { useState } from "react";
import { CalendarDays, CircleCheck, Target, Timer } from "lucide-react";
import { useApp } from "../app-provider";
import { AddButton, Card, PageHeading, StatCard } from "../ui";
import { TestTable } from "../data-tables";
import { statusLabels } from "@/lib/types";
import { average, upcomingTests } from "@/lib/analytics";
import { dueLabel, formatNumber, localDate } from "@/lib/format";

export function TestsPage() {
  const { data } = useApp();
  const [subjectId, setSubjectId] = useState("");
  const [status, setStatus] = useState("");
  if (!data) return null;
  const tests = data.tests.filter(
    (test) =>
      (!subjectId || test.subjectId === subjectId) &&
      (!status || test.status === status),
  );
  const active = upcomingTests(data).filter((test) => test.date >= localDate());
  return (
    <>
      <PageHeading
        eyebrow="TERMÍNY A PRÍPRAVA"
        title="Testy"
        description="Od prvého termínu až po výsledok a poučenie z chýb."
        action={
          <AddButton
            request={{ entity: "tests", subjectId: subjectId || undefined }}
          >
            Pridať test
          </AddButton>
        }
      />
      <div className="stats-grid">
        <StatCard
          label="Nadchádzajúce testy"
          value={active.length}
          detail={
            active[0]
              ? `${dueLabel(active[0].date)} · ${active[0].title}`
              : "Žiadne budúce termíny"
          }
          icon={CalendarDays}
          accent
        />
        <StatCard
          label="Rozpracovaná príprava"
          value={data.tests.filter((t) => t.status === "preparing").length}
          detail="Stav Pripravujem sa"
          icon={Timer}
        />
        <StatCard
          label="Vyhodnotené testy"
          value={data.results.length}
          detail="S uloženým výsledkom"
          icon={CircleCheck}
        />
        <StatCard
          label="Priemerná úspešnosť"
          value={
            data.results.length
              ? `${formatNumber(average(data.results.map((r) => r.percentage)))} %`
              : "—"
          }
          detail="Aritmetický priemer výsledkov"
          icon={Target}
        />
      </div>
      <div className="filter-bar">
        <label>
          Predmet
          <select
            aria-label="Filtrovať testy podľa predmetu"
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
          Stav
          <select
            aria-label="Filtrovať testy podľa stavu"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Všetky stavy</option>
            {Object.entries(statusLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span className="filter-count">
          {tests.length} testov · zoradené podľa termínu
        </span>
      </div>
      <Card title="Prehľad termínov">
        <TestTable
          tests={tests}
          data={data}
          subjectId={subjectId || undefined}
        />
      </Card>
    </>
  );
}
