"use client";
import Link from "next/link";
import { useState } from "react";
import { BookOpen, GraduationCap, ListChecks, Weight } from "lucide-react";
import { useApp } from "../app-provider";
import {
  AddButton,
  Card,
  PageHeading,
  StatCard,
  SubjectBadge,
  TextLink,
} from "../ui";
import { weightedAverage } from "@/lib/analytics";
import { formatNumber } from "@/lib/format";
import { GradeTable } from "../data-tables";
import { ChartPanel } from "../charts/chart-panel";
import { chartData } from "@/lib/chart-data";

export function GradesPage() {
  const { data } = useApp();
  const [subjectId, setSubjectId] = useState("");
  if (!data) return null;
  const grades = data.grades.filter(
    (grade) => !subjectId || grade.subjectId === subjectId,
  );
  const charts = chartData({ ...data, grades });
  return (
    <>
      <PageHeading
        eyebrow="HODNOTENIE"
        title="Známky"
        description="Tvoje hodnotenia a vážené priemery bez ručného počítania."
        action={
          <AddButton
            request={{ entity: "grades", subjectId: subjectId || undefined }}
          >
            Pridať známku
          </AddButton>
        }
      />
      <div className="stats-grid">
        <StatCard
          label="Vážený priemer"
          value={formatNumber(weightedAverage(grades), 2)}
          detail={subjectId ? "Vybraný predmet" : "Všetky uložené známky"}
          icon={GraduationCap}
          accent
        />
        <StatCard
          label="Počet známok"
          value={grades.length}
          detail="V aktuálnom výbere"
          icon={ListChecks}
        />
        <StatCard
          label="Predmety"
          value={data.subjects.length}
          detail="Vlastné školské predmety"
          icon={BookOpen}
        />
        <StatCard
          label="Súčet váh"
          value={formatNumber(
            grades.reduce((sum, g) => sum + g.weight, 0),
            2,
          )}
          detail="Priemer = súčet známka × váha / súčet váh"
          icon={Weight}
        />
      </div>
      <div className="section-title">
        <h2>Predmety</h2>
        <TextLink href="/settings">Spravovať predmety</TextLink>
      </div>
      {data.subjects.length > 0 && (
        <div className="three-column mb-6">
          {data.subjects.map((subject) => {
            const subjectGrades = data.grades.filter(
              (g) => g.subjectId === subject.id,
            );
            return (
              <Link
                href={`/subjects/${subject.id}`}
                key={subject.id}
                className="card subject-card"
              >
                <SubjectBadge subject={subject} />
                <div className="subject-card-stats">
                  <div>
                    <div className="subject-card-value">
                      {formatNumber(weightedAverage(subjectGrades), 2)}
                    </div>
                    <p className="muted">Vážený priemer</p>
                  </div>
                  <span className="small muted">
                    {subjectGrades.length} známok ↗
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <div className="filter-bar">
        <label>
          Predmet
          <select
            aria-label="Filtrovať známky podľa predmetu"
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
        <span className="filter-count">{grades.length} záznamov</span>
      </div>
      <Card title="Denník známok" className="mb-5">
        <GradeTable
          grades={grades}
          data={data}
          subjectId={subjectId || undefined}
        />
      </Card>
      <div className="two-column">
        <ChartPanel
          title="Vývoj váženého priemeru"
          subtitle="Priebežne zo všetkých skorších známok · 1 je najlepšia"
          data={charts.gradeTrend}
          series={[
            { key: "average", label: "Vážený priemer", color: "#c5ef79" },
          ]}
          reversed
          domain={[1, 5]}
        />
        <ChartPanel
          title="Známky podľa predmetu"
          subtitle="Vážený priemer jednotlivých predmetov"
          data={charts.gradesBySubject}
          series={[{ key: "average", label: "Priemer", color: "#c5ef79" }]}
          kind="bar"
          domain={[0, 5]}
        />
      </div>
    </>
  );
}
