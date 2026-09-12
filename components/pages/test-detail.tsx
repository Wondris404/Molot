"use client";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3, Timer, Target } from "lucide-react";
import { useApp } from "../app-provider";
import {
  AddButton,
  Card,
  EmptyState,
  PageHeading,
  Progress,
  RowActions,
  StatCard,
  StatusBadge,
  SubjectBadge,
} from "../ui";
import { currentReadiness, studiedMinutes } from "@/lib/analytics";
import { recommendStudyTime } from "@/lib/recommendationEngine";
import {
  dueLabel,
  formatDate,
  formatMinutes,
  formatNumber,
} from "@/lib/format";
import { readinessChart } from "@/lib/chart-data";
import { ChartPanel } from "../charts/chart-panel";
import { ErrorTable, ReadinessTable, SessionTable } from "../data-tables";
import { MaterialsPanel } from "../materials-panel";
import { PredictionPanel } from "../intelligence/prediction-panel";

export function TestDetailPage({ id }: { id: string }) {
  const { data } = useApp();
  if (!data) return null;
  const test = data.tests.find((test) => test.id === id);
  if (!test)
    return (
      <EmptyState
        title="Test sa nenašiel."
        action={
          <Link href="/tests" className="button">
            Späť na testy
          </Link>
        }
      />
    );
  const subject = data.subjects.find((s) => s.id === test.subjectId);
  const recommendation = recommendStudyTime(test, data);
  const studied = studiedMinutes(data, id);
  const result = data.results.find((result) => result.testId === id);
  const recommended = result?.recommendedMinutes ?? recommendation.minutes;
  const readiness = currentReadiness(data, id);
  return (
    <>
      <Link href="/tests" className="back-link">
        <ArrowLeft size={14} />
        Všetky testy
      </Link>
      <PageHeading
        eyebrow={subject?.name || "TEST"}
        title={test.title}
        description={`${formatDate(test.date)}${test.time ? ` o ${test.time}` : ""} · ${dueLabel(test.date)}`}
        action={
          <div className="inline">
            <StatusBadge status={test.status} />
            <RowActions entity="tests" id={id} label={test.title} />
          </div>
        }
      />
      <PredictionPanel testId={id} />
      <div className="stats-grid">
        <StatCard
          label="Plánovaný čas"
          value={formatMinutes(test.plannedMinutes)}
          detail="Tvoj vlastný plán prípravy"
          icon={CalendarDays}
        />
        <StatCard
          label="Odporúčaný čas Molotu"
          value={`≈ ${formatMinutes(recommended)}`}
          detail={
            result
              ? "Odhad uložený pri vyhodnotení"
              : `Celková príprava · istota ${recommendation.confidence.toLowerCase()}`
          }
          icon={Target}
          accent
        />
        <StatCard
          label="Už odštudované"
          value={formatMinutes(studied)}
          detail="Zo záznamov priradených k testu"
          icon={Clock3}
        />
        <StatCard
          label="Zostáva do odhadu"
          value={formatMinutes(Math.max(0, recommended - studied))}
          detail="Stred odhadu mínus zapísané učenie"
          icon={Timer}
        />
      </div>
      <div className="two-column mb-5">
        <Card
          title="Prehľad prípravy"
          action={<SubjectBadge subject={subject} link />}
        >
          <dl className="test-summary">
            <div>
              <dt>Náročnosť</dt>
              <dd>{test.difficulty} / 5</dd>
            </div>
            <div>
              <dt>Cieľový výsledok</dt>
              <dd>{test.targetPercent} %</dd>
            </div>
            <div>
              <dt>Pripravenosť</dt>
              <dd>
                {readiness === null ? "—" : `${formatNumber(readiness)} %`}
              </dd>
            </div>
          </dl>
          <div className="mt-6">
            <Progress value={readiness} />
          </div>
          <div className="topic-tags mt-5">
            {test.topics
              .split(/[,;\n]+/)
              .filter(Boolean)
              .map((topic, index) => (
                <span className="topic-tag" key={index}>
                  {topic.trim()}
                </span>
              ))}
          </div>
          {test.notes && <p className="note-text mt-4">{test.notes}</p>}
          <div className="inline mt-6">
            <AddButton request={{ entity: "readiness", testId: id }} secondary>
              Zaznamenať pripravenosť
            </AddButton>
            <AddButton
              request={{
                entity: "sessions",
                testId: id,
                subjectId: test.subjectId,
              }}
            >
              Zapísať učenie
            </AddButton>
          </div>
        </Card>
        <Card
          title={result ? "Ako by odhad vyzeral teraz" : "Odporúčanie Molotu"}
          subtitle="Vysvetliteľný odhad z lokálnej histórie"
        >
          <div className="confidence">
            Istota: {recommendation.confidence} · {recommendation.sampleCount}{" "}
            historických testov
          </div>
          <div className="recommendation-range">
            {formatMinutes(recommendation.lowerMinutes)} –{" "}
            {formatMinutes(recommendation.upperMinutes)}
          </div>
          <p className="small muted">
            Približný celkový čas prípravy. Rozsah vyjadruje neistotu odhadu,
            nie záruku výsledku.
            {result &&
              ` Pri vyhodnotení bol uložený stred odhadu ${formatMinutes(result.recommendedMinutes)}; v porovnávacom grafe zostáva tento pôvodný údaj.`}
          </p>
          <ul className="recommendation-list">
            {recommendation.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {recommendation.warning && (
            <div className="warning-box">{recommendation.warning}</div>
          )}
        </Card>
        <ChartPanel
          title="Vývoj pripravenosti"
          subtitle="Všetky tvoje záznamy pred týmto testom"
          data={readinessChart(data, id)}
          kind="area"
          series={[
            { key: "readiness", label: "Pripravenosť", color: "#c5ef79" },
          ]}
          domain={[0, 100]}
          unit=" %"
        />
        <Card
          title="História pripravenosti"
          action={
            <AddButton request={{ entity: "readiness", testId: id }} secondary>
              Pridať záznam
            </AddButton>
          }
        >
          <ReadinessTable
            entries={data.readiness.filter((entry) => entry.testId === id)}
          />
        </Card>
        <Card title="Učenie na tento test">
          <SessionTable
            sessions={data.sessions.filter((s) => s.testId === id)}
            data={data}
            testId={id}
            subjectId={test.subjectId}
          />
        </Card>
        <Card
          title="Výsledok testu"
          action={
            result && (
              <RowActions
                entity="results"
                id={result.id}
                label={`Výsledok: ${test.title}`}
              />
            )
          }
        >
          {!result ? (
            <EmptyState
              compact
              title="Výsledok ešte nepoznáme."
              description="Po napísaní testu doplň body, čas prípravy a svoje hodnotenie."
              action={
                <AddButton request={{ entity: "results", testId: id }}>
                  Pridať výsledok
                </AddButton>
              }
            />
          ) : (
            <>
              <dl className="test-summary">
                <div>
                  <dt>Výsledok</dt>
                  <dd className="correct">
                    {formatNumber(result.percentage, 2)} %
                  </dd>
                </div>
                <div>
                  <dt>Body</dt>
                  <dd>
                    {result.earnedPoints === null
                      ? "—"
                      : `${formatNumber(result.earnedPoints)} / ${formatNumber(result.maxPoints)}`}
                  </dd>
                </div>
                <div>
                  <dt>Známka</dt>
                  <dd>{result.grade ?? "—"}</dd>
                </div>
                <div>
                  <dt>Reálny čas učenia</dt>
                  <dd>{formatMinutes(result.actualStudyMinutes)}</dd>
                </div>
                <div>
                  <dt>Pripravenosť pred testom</dt>
                  <dd>{result.readinessBefore} %</dd>
                </div>
                <div>
                  <dt>Skutočná náročnosť</dt>
                  <dd>{result.perceivedDifficulty} / 5</dd>
                </div>
              </dl>
              {result.note && <p className="note-text mt-5">{result.note}</p>}
              <p className="form-note">
                Výsledok testu a denník známok sú samostatné. Ak chceš známku
                zahrnúť do váženého priemeru, pridaj ju do denníka.
              </p>
              <div className="mt-4">
                <AddButton
                  request={{ entity: "grades", subjectId: test.subjectId }}
                  secondary
                >
                  Pridať známku do denníka
                </AddButton>
              </div>
            </>
          )}
        </Card>
      </div>
      <div className="mb-5">
        <MaterialsPanel testId={id} subjectId={test.subjectId} />
      </div>
      <Card
        title="Označené odpovede a chyby"
        action={
          <AddButton
            request={{
              entity: "errors",
              testId: id,
              subjectId: test.subjectId,
            }}
            secondary
          >
            Pridať odpoveď / chybu
          </AddButton>
        }
      >
        <ErrorTable
          entries={data.errors.filter((e) => e.testId === id)}
          data={data}
          testId={id}
          subjectId={test.subjectId}
        />
      </Card>
    </>
  );
}
