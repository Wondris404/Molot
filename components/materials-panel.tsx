"use client";
import { useRef, useState, type FormEvent } from "react";
import { Download, Eye, FileText, Pencil, Trash2, Upload } from "lucide-react";
import type { UploadedMaterial } from "@/lib/types";
import { apiRequest, useApp } from "./app-provider";
import { Card, Dialog, EmptyState } from "./ui";
import { formatDate, formatNumber } from "@/lib/format";
import { PdfViewer } from "./pdf-viewer";

export function MaterialsPanel({
  testId,
  subjectId,
}: {
  testId?: string;
  subjectId?: string;
}) {
  const { data, refresh, notify, setDeletion, setEditor } = useApp();
  const [selectedSubject, setSelectedSubject] = useState(subjectId || "");
  const [selectedTest, setSelectedTest] = useState(testId || "");
  const [preview, setPreview] = useState<UploadedMaterial | null>(null);
  const [rename, setRename] = useState<UploadedMaterial | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  if (!data) return null;
  const selected = subjectId || selectedSubject || data.subjects[0]?.id || "";
  const materials = data.materials.filter(
    (material) =>
      (!subjectId || material.subjectId === subjectId) &&
      (!testId || material.testId === testId),
  );
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setError("Vyber súbor.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Súbor môže mať najviac 20 MB.");
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("subjectId", selected);
    form.set("testId", testId || selectedTest);
    setBusy(true);
    try {
      await apiRequest("/api/materials", { method: "POST", body: form });
      if (fileInput.current) fileInput.current.value = "";
      try {
        await refresh();
        notify("Materiál je uložený lokálne.");
      } catch {
        setError("Materiál je uložený. Obnov stránku, aby sa zobrazil.");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Nahranie zlyhalo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card
      title="Materiály a pracovné listy"
      subtitle="PDF, PNG, JPG/JPEG, TXT · do 20 MB · lokálne súbory"
    >
      {materials.length ? (
        <div className="mb-5">
          {materials.map((material) => (
            <div className="material-item" key={material.id}>
              <div className="inline">
                <FileText size={19} className="muted shrink-0" />
                <div>
                  <p className="material-name">{material.name}</p>
                  <p className="material-meta">
                    {material.size < 1024
                      ? `${material.size} B`
                      : `${formatNumber(material.size / 1024)} KB`}{" "}
                    · {formatDate(material.createdAt)}
                    {!subjectId &&
                      ` · ${data.subjects.find((s) => s.id === material.subjectId)?.name}`}
                  </p>
                </div>
              </div>
              <div className="row-actions">
                <button
                  className="icon-button"
                  onClick={() => setPreview(material)}
                  aria-label={`Zobraziť: ${material.name}`}
                  title="Zobraziť"
                >
                  <Eye size={16} />
                </button>
                <a
                  className="icon-button"
                  href={`/api/materials/${material.id}?download=1`}
                  aria-label={`Stiahnuť: ${material.name}`}
                  title="Stiahnuť"
                >
                  <Download size={16} />
                </a>
                <button
                  className="icon-button"
                  onClick={() => {
                    setRename(material);
                    setName(material.name);
                    setError("");
                  }}
                  aria-label={`Premenovať: ${material.name}`}
                  title="Premenovať"
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="icon-button danger"
                  onClick={() =>
                    setDeletion({
                      entity: "materials",
                      id: material.id,
                      label: material.name,
                    })
                  }
                  aria-label={`Odstrániť: ${material.name}`}
                  title="Odstrániť"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          compact
          title="Zatiaľ bez materiálov."
          description="Nahraj zadanie alebo pracovný list a označ v ňom jednotlivé odpovede."
        />
      )}
      {data.subjects.length > 0 && (
        <form className="upload-box" onSubmit={upload}>
          {!subjectId && (
            <div className="form-grid">
              <label className="field">
                Predmet materiálu
                <select
                  value={selected}
                  onChange={(event) => {
                    setSelectedSubject(event.target.value);
                    setSelectedTest("");
                  }}
                  required
                >
                  {data.subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Test materiálu
                <select
                  value={selectedTest}
                  onChange={(e) => setSelectedTest(e.target.value)}
                >
                  <option value="">Bez testu</option>
                  {data.tests
                    .filter((test) => test.subjectId === selected)
                    .map((test) => (
                      <option key={test.id} value={test.id}>
                        {test.title}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          )}
          <label className="field">
            Vybrať materiál
            <input
              ref={fileInput}
              type="file"
              name="file"
              accept=".pdf,.png,.jpg,.jpeg,.txt"
              required
              disabled={busy}
            />
          </label>
          <div className="inline spaced">
            <span className="small muted">
              Súbor zostáva v priečinku data/uploads.
            </span>
            <button className="button secondary" disabled={busy} type="submit">
              <Upload size={15} />
              {busy ? "Nahrávam…" : "Nahrať materiál"}
            </button>
          </div>
        </form>
      )}
      {error && !rename && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      <p className="form-note">
        Správnosť odpovedí označuješ ručne. Automatické rozpoznávanie ani OCR
        zatiaľ nie sú pripojené.
      </p>
      {preview && (
        <Dialog title={preview.name} onClose={() => setPreview(null)}>
          {preview.mimeType.startsWith("image/") ? (
            /* Local original assets need no Next image optimization. */ <picture>
              <img
                className="image-preview"
                src={`/api/materials/${preview.id}`}
                alt={`Nahraný materiál ${preview.name}`}
              />
            </picture>
          ) : preview.mimeType === "application/pdf" ? (
            <PdfViewer key={preview.id} url={`/api/materials/${preview.id}`} />
          ) : (
            <iframe
              className="file-preview"
              title={preview.name}
              src={`/api/materials/${preview.id}`}
              sandbox="allow-same-origin"
            />
          )}
          <div className="inline spaced mt-4">
            <a
              className="text-link"
              href={`/api/materials/${preview.id}`}
              target="_blank"
              rel="noreferrer"
            >
              Otvoriť samostatne ↗
            </a>
            <button
              className="button"
              onClick={() => {
                setEditor({
                  entity: "errors",
                  materialId: preview.id,
                  subjectId: preview.subjectId,
                  testId: preview.testId || undefined,
                });
                setPreview(null);
              }}
            >
              Označiť odpoveď
            </button>
          </div>
          <p className="form-note">
            PDF sa vykresľuje lokálne v Molote. Materiál môžeš aj stiahnuť alebo
            otvoriť samostatne.
          </p>
        </Dialog>
      )}
      {rename && (
        <Dialog
          title="Premenovať materiál"
          onClose={() => {
            if (!busy) setRename(null);
          }}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              try {
                await apiRequest(`/api/materials/${rename.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name }),
                });
                await refresh();
                setRename(null);
                notify("Názov materiálu je uložený.");
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : "Premenovanie zlyhalo.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              Názov materiálu
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={200}
              />
            </label>
            {error && (
              <div role="alert" className="error-message">
                {error}
              </div>
            )}
            <div className="modal-actions">
              <button className="button" type="submit" disabled={busy}>
                Uložiť názov
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </Card>
  );
}
