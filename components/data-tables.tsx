"use client";
import Link from "next/link";
import type {
  ErrorEntry,
  Grade,
  ReadinessEntry,
  Snapshot,
  StudySession,
  Test,
} from "@/lib/types";
import { errorLabels } from "@/lib/types";
import { currentReadiness, studiedMinutes } from "@/lib/analytics";
import {
  dueLabel,
  formatDate,
  formatMinutes,
  formatNumber,
} from "@/lib/format";
import {
  AddButton,
  EmptyState,
  Progress,
  RowActions,
  StatusBadge,
  SubjectBadge,
} from "./ui";

export function GradeTable({
  grades,
  data,
  subjectId,
}: {
  grades: Grade[];
  data: Snapshot;
  subjectId?: string;
}) {
  if (!grades.length)
    return (
      <EmptyState
        title="Zatiaľ nemáš žiadne známky."
        description="Pridaj prvé hodnotenie a Molot vypočíta tvoj vážený priemer."
        action={
          <AddButton request={{ entity: "grades", subjectId }}>
            Pridať prvú známku
          </AddButton>
        }
      />
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Predmet / hodnotenie</th>
            <th>Známka</th>
            <th>Váha</th>
            <th>Dátum</th>
            <th>
              <span className="sr-only">Akcie</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {[...grades]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((grade) => (
              <tr key={grade.id}>
                <td>
                  <SubjectBadge
                    subject={data.subjects.find(
                      (s) => s.id === grade.subjectId,
                    )}
                    link
                  />
                  <span className="table-description">
                    {grade.assessmentType}
                    {grade.description && ` · ${grade.description}`}
                  </span>
                </td>
                <td>
                  <span
                    className={`grade-number ${grade.value > 3 ? "grade-poor" : ""}`}
                  >
                    {grade.value}
                  </span>
                </td>
                <td className="muted">×{formatNumber(grade.weight, 2)}</td>
                <td className="muted">{formatDate(grade.date)}</td>
                <td>
                  <RowActions
                    entity="grades"
                    id={grade.id}
                    label={
                      grade.description ||
                      `${grade.assessmentType} (${grade.value})`
                    }
                  />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
export function TestTable({
  tests,
  data,
  subjectId,
}: {
  tests: Test[];
  data: Snapshot;
  subjectId?: string;
}) {
  if (!tests.length)
    return (
      <EmptyState
        title="Zatiaľ tu nie sú žiadne testy."
        description="Pridaj termín, témy a cieľ. Prípravu potom nájdeš na jednom mieste."
        action={
          <AddButton request={{ entity: "tests", subjectId }}>
            Pridať test
          </AddButton>
        }
      />
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Test</th>
            <th>Termín</th>
            <th>Pripravenosť</th>
            <th>Učenie</th>
            <th>Stav</th>
            <th>
              <span className="sr-only">Akcie</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {[...tests]
            .sort((a, b) =>
              `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`),
            )
            .map((test) => (
              <tr key={test.id}>
                <td>
                  <Link href={`/tests/${test.id}`} className="item-title">
                    {test.title}
                  </Link>
                  <SubjectBadge
                    subject={data.subjects.find((s) => s.id === test.subjectId)}
                  />
                </td>
                <td>
                  {dueLabel(test.date)}
                  <span className="table-description">
                    {formatDate(test.date)}
                    {test.time && ` · ${test.time}`}
                  </span>
                </td>
                <td>
                  <Progress value={currentReadiness(data, test.id)} />
                </td>
                <td>{formatMinutes(studiedMinutes(data, test.id))}</td>
                <td>
                  <StatusBadge status={test.status} />
                </td>
                <td>
                  <RowActions entity="tests" id={test.id} label={test.title} />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
export function SessionTable({
  sessions,
  data,
  testId,
  subjectId,
}: {
  sessions: StudySession[];
  data: Snapshot;
  testId?: string;
  subjectId?: string;
}) {
  if (!sessions.length)
    return (
      <EmptyState
        compact
        title="Zatiaľ nemáš záznam učenia."
        description="Zapíš čas, ktorý si venoval príprave."
        action={
          <AddButton
            request={{ entity: "sessions", testId, subjectId }}
            secondary
          >
            Zapísať učenie
          </AddButton>
        }
      />
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Predmet / téma</th>
            <th>Dátum</th>
            <th>Trvanie</th>
            <th>
              <span className="sr-only">Akcie</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {[...sessions]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((session) => (
              <tr key={session.id}>
                <td>
                  <SubjectBadge
                    subject={data.subjects.find(
                      (s) => s.id === session.subjectId,
                    )}
                    link
                  />
                  <span className="table-description">
                    {session.topic || "Bez témy"}
                  </span>
                  {session.testId && (
                    <Link
                      className="text-link"
                      href={`/tests/${session.testId}`}
                    >
                      {data.tests.find((t) => t.id === session.testId)?.title}
                    </Link>
                  )}
                  {session.note && (
                    <span className="table-description">{session.note}</span>
                  )}
                </td>
                <td className="muted">
                  {formatDate(session.date)}
                  {session.startTime && (
                    <span className="table-description">
                      {session.startTime}
                    </span>
                  )}
                </td>
                <td>{formatMinutes(session.minutes)}</td>
                <td>
                  <RowActions
                    entity="sessions"
                    id={session.id}
                    label={session.topic || `Učenie ${session.date}`}
                  />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
export function ErrorTable({
  entries,
  data,
  testId,
  subjectId,
}: {
  entries: ErrorEntry[];
  data: Snapshot;
  testId?: string;
  subjectId?: string;
}) {
  if (!entries.length)
    return (
      <EmptyState
        title="Zatiaľ nemáš označené odpovede."
        description="Zapíš chybu alebo správnu odpoveď a priraď jej tému."
        action={
          <AddButton
            request={{ entity: "errors", testId, subjectId }}
            secondary
          >
            Pridať odpoveď / chybu
          </AddButton>
        }
      />
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Otázka / téma</th>
            <th>Predmet</th>
            <th>Správnosť</th>
            <th>Typ chyby</th>
            <th>
              <span className="sr-only">Akcie</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {[...entries]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((entry) => (
              <tr key={entry.id}>
                <td>
                  {entry.question}
                  <span className="table-description">
                    {entry.topic}
                    {entry.subtopic && ` / ${entry.subtopic}`}
                  </span>
                  {entry.answer && (
                    <span className="table-description">
                      Odpoveď: {entry.answer}
                    </span>
                  )}
                  {entry.note && (
                    <span className="table-description">{entry.note}</span>
                  )}
                  <span className="table-description">
                    {formatDate(entry.date)}
                    {entry.materialId &&
                      ` · ${data.materials.find((m) => m.id === entry.materialId)?.name ?? "Materiál"}`}
                  </span>
                  {entry.testId && (
                    <Link className="text-link" href={`/tests/${entry.testId}`}>
                      {data.tests.find((t) => t.id === entry.testId)?.title}
                    </Link>
                  )}
                </td>
                <td>
                  <SubjectBadge
                    subject={data.subjects.find(
                      (s) => s.id === entry.subjectId,
                    )}
                  />
                </td>
                <td className={entry.isCorrect ? "correct" : "incorrect"}>
                  {entry.isCorrect ? "Správne" : "Nesprávne"}
                </td>
                <td className="muted">
                  {entry.isCorrect ? "—" : errorLabels[entry.errorType]}
                </td>
                <td>
                  <RowActions
                    entity="errors"
                    id={entry.id}
                    label={entry.question}
                  />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
export function ReadinessTable({ entries }: { entries: ReadinessEntry[] }) {
  if (!entries.length)
    return <p className="small muted">Pridaj prvý záznam pripravenosti.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Záznam</th>
            <th>Pripravenosť</th>
            <th>
              <span className="sr-only">Akcie</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {[...entries]
            .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
            .map((entry) => (
              <tr key={entry.id}>
                <td>
                  {new Date(entry.recordedAt).toLocaleString("sk-SK")}
                  <span className="table-description">{entry.note}</span>
                </td>
                <td>{formatNumber(entry.percent)} %</td>
                <td>
                  <RowActions
                    entity="readiness"
                    id={entry.id}
                    label={`Pripravenosť ${entry.percent} %`}
                  />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
