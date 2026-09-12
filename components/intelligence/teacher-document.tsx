"use client";
import { useState } from "react";
import { Card, Dialog, EmptyState } from "../ui";
import { PdfViewer } from "../pdf-viewer";
import { SimpleForm } from "./simple-form";
import { intelligenceRequest } from "./use-intelligence";
import {
  questionTypes,
  type TeacherDocument,
  type TeacherQuestion,
  type TeacherSnapshot,
  type MaterialTopic,
} from "@/ml/teacher/types";
import type { FieldSpec } from "../editor-config";
const questionFields: FieldSpec[] = [
  {
    name: "text",
    label: "Otázka",
    type: "textarea",
    required: true,
    wide: true,
  },
  { name: "topic", label: "Téma", type: "text" },
  { name: "subtopic", label: "Podtéma", type: "text" },
  {
    name: "questionType",
    label: "Typ otázky",
    type: "select",
    required: true,
    options: Object.entries(questionTypes).map(([value, label]) => ({
      value,
      label,
    })),
  },
  { name: "points", label: "Body (voliteľné)", type: "number", min: 0 },
  { name: "keywords", label: "Kľúčové slová", type: "text", wide: true },
];
const topicFields: FieldSpec[] = [
  { name: "name", label: "Téma / koncept", type: "text", required: true },
  {
    name: "keywords",
    label: "Synonymá a kľúčové slová (čiarkou)",
    type: "text",
  },
  {
    name: "importance",
    label: "Dôležitosť v učive (0–1)",
    type: "number",
    min: 0,
    max: 1,
    step: 0.1,
    required: true,
  },
];
export function TeacherDocumentPanel({
  document,
  data,
  refresh,
}: {
  document: TeacherDocument;
  data: TeacherSnapshot;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(false);
  const [editing, setEditing] = useState<{
    entity: "questions" | "topics";
    record?: TeacherQuestion | MaterialTopic;
  } | null>(null);
  const [suggestions, setSuggestions] = useState<{
    questions?: Partial<TeacherQuestion>[];
    topics?: string[];
  } | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const entries =
    document.kind === "test"
      ? data.questions.filter((q) => q.documentId === document.id)
      : data.topics.filter((t) => t.documentId === document.id);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Spracovanie zlyhalo.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    await action(async () => {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`/api/teacher-files/${document.id}`, {
        method: "POST",
        body: form,
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
    });
  }
  return (
    <div className="stack mt-5">
      <Card
        title={document.title}
        subtitle={`${document.kind === "test" ? "Historický test" : "Učivo"} · ${document.date || document.year || "Dátum neznámy"}`}
      >
        {document.parseStatus === "ocr_partial" && (
          <p className="warning-box">
            OCR spracovalo iba časť dokumentu (najviac 5 strán a limit
            veľkosti). Zvyšok doplň ručne. Skontroluj aj rozpoznaný text.
          </p>
        )}
        <div
          className="drop-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file && !busy) void upload(file);
          }}
        >
          <label className="field">
            {document.storageName
              ? "Nahradiť lokálny súbor"
              : "Nahrať súbor alebo ho sem pretiahnuť"}
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.txt,.docx"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </label>
          <p className="small muted">
            PDF, PNG, JPG, TXT, DOCX · do 20 MB · uložené iba lokálne
          </p>
        </div>
        {document.storageName && (
          <div className="inline mt-5">
            <button
              disabled={busy}
              className="button secondary"
              onClick={() => setPreview(!preview)}
            >
              {preview ? "Skryť náhľad" : "Zobraziť súbor"}
            </button>
            <a
              className="button secondary"
              href={`/api/teacher-files/${document.id}?download=1`}
            >
              Stiahnuť
            </a>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const response = await fetch(
                    `/api/teacher-files/${document.id}`,
                    { method: "PATCH", signal: AbortSignal.timeout(180000) },
                  );
                  const value = await response.json();
                  if (!response.ok) throw new Error(value.error);
                })
              }
            >
              {busy ? "Spracúvam…" : "Extrahovať text / lokálne OCR"}
            </button>
          </div>
        )}
        {preview &&
          document.storageName &&
          (document.mimeType === "application/pdf" ? (
            <PdfViewer url={`/api/teacher-files/${document.id}`} />
          ) : document.mimeType?.startsWith("image/") ? (
            <picture>
              <img
                className="document-image mt-5"
                src={`/api/teacher-files/${document.id}`}
                alt={document.title}
              />
            </picture>
          ) : (
            <p className="hint-box mt-5">
              Text nájdeš v editore nižšie; DOCX môžeš stiahnuť a otvoriť vo
              svojom editore.
            </p>
          ))}
        <p className="hint-box mt-5">
          Stav extrakcie:{" "}
          {(
            {
              manual: "Ručné zadanie",
              pending: "Čaká na extrakciu",
              text: "Textová vrstva — skontroluj poradie a obsah",
              ocr_review: "OCR — skontroluj rozpoznanie",
              ocr_low_quality: "Nízka kvalita OCR — oprav text",
              needs_ocr:
                "PDF nemá textovú vrstvu — doplň text ručne alebo nahraj strany ako obrázky",
              password: "PDF je chránené heslom",
              failed: "Extrakcia zlyhala — text môžeš doplniť ručne",
            } as Record<string, string>
          )[document.parseStatus] || document.parseStatus}
        </p>
        <SimpleForm
          key={`${document.id}:${document.text}`}
          initial={{ text: document.text }}
          fields={[
            {
              name: "text",
              label: "Text dokumentu (môžeš ho opraviť alebo vložiť ručne)",
              type: "textarea",
              wide: true,
            },
          ]}
          onSave={async (values) => {
            await intelligenceRequest({
              operation: "save",
              entity: "documents",
              id: document.id,
              values: { ...document, ...values },
            });
            await refresh();
          }}
          submitLabel="Uložiť opravený text"
        />
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </Card>
      <Card
        title={
          document.kind === "test"
            ? "Otázky historického testu"
            : "Témy a koncepty učiva"
        }
        action={
          <div className="inline">
            <button
              className="button secondary"
              disabled={busy || !document.text}
              onClick={() =>
                void action(async () => {
                  setSuggestions(
                    await intelligenceRequest({
                      operation: "extract",
                      id: document.id,
                    }),
                  );
                  setReviewed(false);
                })
              }
            >
              Navrhnúť z textu
            </button>
            <button
              className="button"
              onClick={() =>
                setEditing({
                  entity: document.kind === "test" ? "questions" : "topics",
                })
              }
            >
              Pridať ručne
            </button>
          </div>
        }
      >
        {!entries.length && (
          <EmptyState
            title="Zatiaľ tu nie sú označené údaje."
            description="Pridaj otázku alebo koncept ručne, prípadne skontroluj návrhy z textu."
          />
        )}
        {entries.map((entry) => (
          <div className="material-item" key={entry.id}>
            <div>
              <strong>{"text" in entry ? entry.text : entry.name}</strong>
              <p className="small muted">
                {"questionType" in entry
                  ? `${entry.topic || "Téma neoznačená"} · ${questionTypes[entry.questionType]} · ${entry.points ?? "—"} bodov`
                  : entry.keywords}
              </p>
            </div>
            <div className="inline">
              <button
                className="button secondary"
                onClick={() =>
                  setEditing({
                    entity: document.kind === "test" ? "questions" : "topics",
                    record: entry,
                  })
                }
              >
                Upraviť
              </button>
              <button
                className="icon-button"
                aria-label="Odstrániť záznam"
                onClick={() => {
                  if (window.confirm("Odstrániť tento označený záznam?"))
                    void action(async () => {
                      await intelligenceRequest({
                        operation: "delete",
                        entity:
                          document.kind === "test" ? "questions" : "topics",
                        id: entry.id,
                      });
                    });
                }}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </Card>
      {editing && (
        <Dialog
          title={editing.entity === "questions" ? "Otázka testu" : "Téma učiva"}
          onClose={() => setEditing(null)}
        >
          <SimpleForm
            fields={
              editing.entity === "questions" ? questionFields : topicFields
            }
            initial={
              editing.record
                ? { ...editing.record }
                : {
                    documentId: document.id,
                    text: "",
                    topic: "",
                    subtopic: "",
                    questionType: "short_answer",
                    points: null,
                    keywords: "",
                    name: "",
                    importance: 1,
                  }
            }
            onSave={async (values) => {
              await intelligenceRequest({
                operation: "save",
                entity: editing.entity,
                id: editing.record?.id,
                values,
              });
              setEditing(null);
              await refresh();
            }}
          />
        </Dialog>
      )}
      {suggestions && (
        <Dialog
          title="Skontroluj návrhy z dokumentu"
          onClose={() => setSuggestions(null)}
        >
          <p className="small muted">
            Rozdelenie otázok a typy sú heuristické návrhy. Správnosť odpovedí
            sa automaticky neurčuje. Po uložení môžeš každý záznam opraviť.
          </p>
          <div className="suggestion-list">
            {suggestions.questions?.map((q, i) => (
              <p key={i}>
                {q.text}
                <br />
                <span className="muted">{q.topic || "Bez témy"}</span>
              </p>
            ))}
            {suggestions.topics?.map((t) => (
              <p key={t}>{t}</p>
            ))}
          </div>
          <label className="inline mt-5">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />{" "}
            Skontroloval som návrhy
          </label>
          <button
            className="button mt-5"
            disabled={!reviewed || busy}
            onClick={() =>
              void action(async () => {
                for (const question of suggestions.questions ?? [])
                  if (
                    !data.questions.some(
                      (q) =>
                        q.documentId === document.id &&
                        q.text === question.text,
                    )
                  )
                    await intelligenceRequest({
                      operation: "save",
                      entity: "questions",
                      values: { ...question, documentId: document.id },
                    });
                for (const name of suggestions.topics ?? [])
                  if (
                    !data.topics.some(
                      (t) => t.documentId === document.id && t.name === name,
                    )
                  )
                    await intelligenceRequest({
                      operation: "save",
                      entity: "topics",
                      values: {
                        documentId: document.id,
                        name,
                        keywords: "",
                        importance: 1,
                      },
                    });
                setSuggestions(null);
              })
            }
          >
            Uložiť skontrolované návrhy
          </button>
        </Dialog>
      )}
    </div>
  );
}
