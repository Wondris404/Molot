"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "../app-provider";
import { Card, Dialog, EmptyState, PageHeading } from "../ui";
import { useIntelligence, intelligenceRequest } from "./use-intelligence";
import { SimpleForm } from "./simple-form";
import { TeacherCharts } from "./teacher-charts";
import { TeacherDocumentPanel } from "./teacher-document";
import type { Teacher, TeacherDocument } from "@/ml/teacher/types";
import type { FieldSpec } from "../editor-config";
export function TeachersPage({ id }: { id?: string }) {
  const router = useRouter();
  const { data: school } = useApp();
  const { data, error, refresh } = useIntelligence();
  const [editor, setEditor] = useState<{
    entity: "teachers" | "documents";
    record?: Teacher | TeacherDocument;
    kind?: "test" | "notes";
  } | null>(null);
  const [selected, setSelected] = useState("");
  const [failure, setFailure] = useState("");
  if (!data || !school)
    return (
      <Card title="Učitelia">{error || "Načítavam lokálne záznamy…"}</Card>
    );
  const teacher = data.teachers.find((t) => t.id === id);
  const documents = data.documents.filter((d) => d.teacherId === id);
  const document = documents.find((d) => d.id === selected);
  const subjectOptions = school.subjects.map((s) => ({
    value: s.id,
    label: s.name,
  }));
  const fields: FieldSpec[] =
    editor?.entity === "teachers"
      ? [
          { name: "name", label: "Meno učiteľa", type: "text", required: true },
          {
            name: "subjectId",
            label: "Predmet",
            type: "select",
            required: true,
            options: subjectOptions,
          },
          {
            name: "schoolYear",
            label: "Školský rok (voliteľný)",
            type: "text",
          },
          { name: "notes", label: "Poznámky", type: "textarea", wide: true },
        ]
      : [
          {
            name: "title",
            label: "Názov dokumentu",
            type: "text",
            required: true,
          },
          { name: "year", label: "Rok (voliteľný)", type: "text" },
          { name: "date", label: "Približný dátum (voliteľný)", type: "date" },
          { name: "chapter", label: "Kapitola", type: "text" },
          {
            name: "topics",
            label: "Označené témy (čiarkou)",
            type: "textarea",
            wide: true,
          },
          { name: "testType", label: "Typ testu", type: "text" },
          {
            name: "totalQuestions",
            label: "Počet otázok",
            type: "number",
            min: 0,
            step: 1,
          },
          {
            name: "totalPoints",
            label: "Celkový počet bodov",
            type: "number",
            min: 0,
          },
          { name: "source", label: "Zdroj", type: "text" },
          { name: "notes", label: "Poznámky", type: "textarea", wide: true },
        ];
  async function remove(entity: "teachers" | "documents", recordId: string) {
    if (
      !window.confirm(
        entity === "teachers"
          ? "Odstrániť učiteľa vrátane historických dokumentov a otázok? Lokálne súbory zostanú v úložisku obnoviteľné zo zálohy."
          : "Odstrániť dokument a jeho označené otázky/témy?",
      )
    )
      return;
    try {
      await intelligenceRequest({ operation: "delete", entity, id: recordId });
      await refresh();
      if (entity === "teachers") router.push("/teachers");
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : "Odstránenie zlyhalo.",
      );
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="HISTÓRIA A UČIVO"
        title={teacher?.name || "Učitelia"}
        description={
          teacher
            ? `${school.subjects.find((s) => s.id === teacher.subjectId)?.name} · ${teacher.schoolYear || "Školský rok nezadaný"}`
            : "Vlastné profily, historické testy a lokálna analýza tém."
        }
        action={
          <button
            className="button"
            disabled={!school.subjects.length}
            onClick={() => setEditor({ entity: "teachers", record: teacher })}
          >
            {teacher ? "Upraviť profil" : "Pridať učiteľa"}
          </button>
        }
      />
      {(error || failure) && (
        <p role="alert" className="error-message">
          {error || failure}
        </p>
      )}
      {!school.subjects.length && (
        <EmptyState
          title="Najprv pridaj predmet."
          action={
            <Link href="/settings" className="button">
              Otvoriť nastavenia
            </Link>
          }
        />
      )}
      {id && !teacher ? (
        <EmptyState
          title="Učiteľ sa nenašiel."
          action={<Link href="/teachers">Všetci učitelia</Link>}
        />
      ) : teacher ? (
        <>
          <Link className="back-link" href="/teachers">
            ← Všetci učitelia
          </Link>
          <p className="note-text mb-5">{teacher.notes}</p>
          <Card
            title="Historické testy a učivo"
            action={
              <div className="inline">
                <button
                  className="button secondary"
                  onClick={() =>
                    setEditor({ entity: "documents", kind: "notes" })
                  }
                >
                  Pridať učivo
                </button>
                <button
                  className="button"
                  onClick={() =>
                    setEditor({ entity: "documents", kind: "test" })
                  }
                >
                  Pridať historický test
                </button>
              </div>
            }
          >
            {!documents.length && (
              <EmptyState
                title="Zatiaľ nemáš historické dokumenty."
                description="Pridaj metadáta, potom nahraj lokálny súbor alebo vlož text."
              />
            )}
            {documents.map((d) => (
              <div className="material-item" key={d.id}>
                <button className="text-link" onClick={() => setSelected(d.id)}>
                  {d.title}{" "}
                  <span className="muted small">
                    {d.kind === "test" ? "Test" : "Učivo"} ·{" "}
                    {d.date || d.year || "—"}
                  </span>
                </button>
                <div className="inline">
                  <button
                    className="button secondary"
                    onClick={() =>
                      setEditor({ entity: "documents", record: d })
                    }
                  >
                    Upraviť
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Odstrániť: ${d.title}`}
                    onClick={() => void remove("documents", d.id)}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </Card>
          {document && (
            <TeacherDocumentPanel
              key={document.id}
              document={document}
              data={data}
              refresh={refresh}
            />
          )}
          <div className="mt-5">
            <TeacherCharts data={data} teacherId={teacher.id} />
          </div>
          <button
            className="button secondary mt-5"
            onClick={() => void remove("teachers", teacher.id)}
          >
            Odstrániť profil učiteľa
          </button>
        </>
      ) : (
        <div className="two-column">
          {!data.teachers.length && (
            <EmptyState
              title="Zatiaľ nemáš žiadnych učiteľov."
              description="Pridaj prvý profil a jeho historické testy."
            />
          )}
          {data.teachers.map((t) => (
            <Card
              key={t.id}
              title={t.name}
              subtitle={school.subjects.find((s) => s.id === t.subjectId)?.name}
            >
              <p className="small muted mb-5">
                {
                  data.documents.filter(
                    (d) => d.teacherId === t.id && d.kind === "test",
                  ).length
                }{" "}
                historických testov
              </p>
              <Link className="button secondary" href={`/teachers/${t.id}`}>
                Otvoriť profil
              </Link>
            </Card>
          ))}
        </div>
      )}
      {editor && (
        <Dialog
          title={
            editor.entity === "teachers"
              ? "Profil učiteľa"
              : editor.kind === "notes"
                ? "Učivo / poznámky"
                : "Historický dokument"
          }
          onClose={() => setEditor(null)}
        >
          <SimpleForm
            fields={fields}
            initial={
              editor.record
                ? { ...editor.record }
                : {
                    subjectId: teacher?.subjectId || school.subjects[0]?.id,
                    teacherId: teacher?.id ?? null,
                    kind: editor.kind || "test",
                    name: "",
                    title: "",
                    schoolYear: "",
                    notes: "",
                    totalQuestions: null,
                    totalPoints: null,
                  }
            }
            onSave={async (values) => {
              const result = await intelligenceRequest<{ id: string }>({
                operation: "save",
                entity: editor.entity,
                id: editor.record?.id,
                values,
              });
              if (editor.entity === "documents") setSelected(result.id);
              setEditor(null);
              await refresh();
            }}
          />
        </Dialog>
      )}
    </>
  );
}
