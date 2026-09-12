"use client";
import { useState, type FormEvent } from "react";
import type { FieldSpec } from "../editor-config";
export function SimpleForm({
  fields,
  initial,
  onSave,
  submitLabel = "Uložiť",
}: {
  fields: FieldSpec[];
  initial: Record<string, unknown>;
  onSave: (values: Record<string, unknown>) => Promise<void>;
  submitLabel?: string;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(values);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Uloženie zlyhalo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="form-grid">
        {fields.map((field) => {
          const props = {
            id: `intelligence-${field.name}`,
            name: field.name,
            required: field.required,
            value: String(values[field.name] ?? ""),
            onChange: (
              event: React.ChangeEvent<
                HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
              >,
            ) =>
              setValues({
                ...values,
                [field.name]:
                  field.type === "number"
                    ? event.target.value === ""
                      ? null
                      : Number(event.target.value)
                    : event.target.value,
              }),
          };
          return (
            <label
              key={field.name}
              className={`field ${field.wide ? "field-wide" : ""}`}
            >
              {field.label}
              {field.type === "textarea" ? (
                <textarea
                  {...props}
                  rows={field.name === "text" ? 8 : 3}
                  maxLength={field.name === "text" ? 100000 : 10000}
                />
              ) : field.type === "select" ? (
                <select {...props}>
                  <option value="">Vyber…</option>
                  {field.options?.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  {...props}
                  type={field.type}
                  min={field.min}
                  max={field.max}
                  step={
                    field.step ?? (field.type === "number" ? "any" : undefined)
                  }
                />
              )}{" "}
              {field.hint && <small className="muted">{field.hint}</small>}
            </label>
          );
        })}
      </fieldset>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="button" disabled={busy}>
          {busy ? "Spracúvam…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
