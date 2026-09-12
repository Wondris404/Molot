"use client";
import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { useApp, type EditorRequest } from "./app-provider";
import { Dialog } from "./ui";
import {
  editorFields,
  editorPayload,
  entityNames,
  initialValues,
} from "./editor-config";
import type { Snapshot } from "@/lib/types";

function RecordEditor({
  request,
  data,
}: {
  request: EditorRequest;
  data: Snapshot;
}) {
  const { save, setEditor } = useApp();
  const [values, setValues] = useState(() => initialValues(request, data));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fields = editorFields(request, data, values);
  function change(name: string, value: string) {
    setValues((previous) => {
      const next = { ...previous, [name]: value };
      if (name === "subjectId") {
        next.testId = "";
        next.materialId = "";
      }
      if (name === "testId") next.materialId = "";
      if (
        request.entity === "results" &&
        ["earnedPoints", "maxPoints"].includes(name) &&
        next.earnedPoints !== "" &&
        Number(next.maxPoints) > 0
      )
        next.percentage = String(
          Math.round(
            (Number(next.earnedPoints) / Number(next.maxPoints)) * 10000,
          ) / 100,
        );
      return next;
    });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await save(
        request.entity,
        editorPayload(request.entity, values),
        request.id,
      );
      setEditor(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Uloženie zlyhalo.");
      setBusy(false);
    }
  }
  const missingSubjects =
    data.subjects.length === 0 &&
    request.entity !== "subjects" &&
    request.entity !== "settings";
  return (
    <Dialog
      title={`${request.id ? "Upraviť" : "Pridať"} ${entityNames[request.entity]}`}
      onClose={() => {
        if (!busy) setEditor(null);
      }}
    >
      {missingSubjects ? (
        <div className="stack">
          <p>Najprv si vytvor predmet, ku ktorému bude záznam patriť.</p>
          <button
            className="button"
            onClick={() => setEditor({ entity: "subjects" })}
          >
            Pridať predmet
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <fieldset disabled={busy} className="form-grid">
            {fields.map((field) => (
              <label
                key={field.name}
                className={`field ${field.wide ? "field-wide" : ""}`}
              >
                <span>
                  {field.label}
                  {field.required && <span className="required"> *</span>}
                  {field.type === "range" && (
                    <strong className="range-value">
                      {values[field.name]} %
                    </strong>
                  )}
                </span>
                {field.type === "textarea" ? (
                  <textarea
                    name={field.name}
                    rows={3}
                    maxLength={10000}
                    value={values[field.name] ?? ""}
                    onChange={(event) => change(field.name, event.target.value)}
                    required={field.required}
                  />
                ) : field.type === "select" ? (
                  <select
                    name={field.name}
                    value={values[field.name] ?? ""}
                    required={field.required}
                    disabled={field.disabled}
                    onChange={(event) => change(field.name, event.target.value)}
                  >
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name={field.name}
                    type={field.type}
                    value={values[field.name] ?? ""}
                    onChange={(event) => change(field.name, event.target.value)}
                    required={field.required}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    readOnly={field.disabled}
                    maxLength={field.type === "text" ? 200 : undefined}
                  />
                )}
                {field.hint && <small className="muted">{field.hint}</small>}
              </label>
            ))}
          </fieldset>
          {request.entity === "results" && (
            <p className="form-note">
              Čas je predvyplnený zo záznamov učenia; môžeš ho doplniť. Známka
              výsledku sa do denníka známok pridáva samostatne.
            </p>
          )}
          {request.entity === "errors" && (
            <p className="form-note">
              Označuj aj správne odpovede. Úspešnosť sa počíta iba z odpovedí,
              ktoré tu zaznamenáš.
            </p>
          )}
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => setEditor(null)}
            >
              Zrušiť
            </button>
            <button className="button" disabled={busy} type="submit">
              {busy && <LoaderCircle className="spin" size={16} />}
              {busy ? "Ukladám…" : "Uložiť"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
function DeleteDialog() {
  const { deletion, setDeletion, remove } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!deletion) return null;
  return (
    <Dialog
      title="Odstrániť záznam?"
      onClose={() => {
        if (!busy) setDeletion(null);
      }}
    >
      <p>
        Chystáš sa odstrániť: <strong>{deletion.label}</strong>.
      </p>
      <p className="muted small mt-3">
        {deletion.entity === "subjects"
          ? "Odstránia sa aj všetky známky, testy, výsledky, učenie, pripravenosť, odpovede a súbory tohto predmetu."
          : deletion.entity === "tests"
            ? "Odstráni sa aj výsledok a história pripravenosti. Učenie, odpovede a materiály zostanú pri predmete bez priradenia k testu."
            : deletion.entity === "materials"
              ? "Súbor sa odstráni z disku. Označené odpovede zostanú uložené bez priradenia k súboru."
              : "Túto zmenu nemožno vrátiť späť."}
      </p>
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      <div className="modal-actions">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => setDeletion(null)}
        >
          Zrušiť
        </button>
        <button
          className="button destructive"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await remove(deletion);
              setDeletion(null);
            } catch (error) {
              setError(
                error instanceof Error ? error.message : "Odstránenie zlyhalo.",
              );
              setBusy(false);
            }
          }}
        >
          {busy ? "Odstraňujem…" : "Odstrániť"}
        </button>
      </div>
    </Dialog>
  );
}
export function EditorHost() {
  const { data, editor, deletion } = useApp();
  return (
    <>
      {data && editor && (
        <RecordEditor
          key={`${editor.entity}:${editor.id ?? "new"}`}
          request={editor}
          data={data}
        />
      )}
      {deletion && <DeleteDialog key={deletion.id} />}
    </>
  );
}
