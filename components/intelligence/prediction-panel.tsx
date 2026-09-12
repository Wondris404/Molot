"use client";
import { useEffect, useState } from "react";
import { useApp } from "../app-provider";
import { Card } from "../ui";
import { formatMinutes } from "@/lib/format";
import { splitTopics } from "@/ml/common/text";
import { questionTypes } from "@/ml/teacher/types";
import { intelligenceRequest, useIntelligence } from "./use-intelligence";
import type { testPrediction } from "@/lib/intelligence";
type Prediction = ReturnType<typeof testPrediction>;
export function PredictionPanel({ testId }: { testId: string }) {
  const { data: school } = useApp();
  const { data, refresh } = useIntelligence();
  const [prediction, setPrediction] = useState<Prediction | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [teacherId, setTeacherId] = useState<string | null>(null),
    [materialIds, setMaterialIds] = useState<string[] | null>(null),
    [actualTopics, setActualTopics] = useState<string | null>(null),
    [actualStyles, setActualStyles] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/intelligence?testId=${testId}`, { cache: "no-store" })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error);
        if (!cancelled) {
          setPrediction(value);
          setError("");
        }
      })
      .catch((error) => {
        if (!cancelled) setError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [testId, school, data]);
  const test = school?.tests.find((t) => t.id === testId);
  if (!test || !data)
    return (
      <Card title="MOLOT PREDICTION">
        {error || "Načítavam predikčné podklady…"}
      </Card>
    );
  const link = data.links.find((l) => l.testId === testId),
    chosenTeacher = teacherId ?? link?.teacherId ?? "",
    chosenMaterials =
      materialIds ?? (JSON.parse(link?.materialIds || "[]") as string[]);
  const history = data.predictions
    .filter((p) => p.testId === testId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const saved = history[0];
  const actualTopicValue =
    actualTopics ??
    (JSON.parse(saved?.actualTopics || "[]") as string[]).join(", ");
  const actualStyleValue =
    actualStyles ?? (JSON.parse(saved?.actualStyles || "[]") as string[]);
  const completed = ["written", "evaluated"].includes(test.status);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Predikcia nie je dostupná.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card
      title="MOLOT PREDICTION"
      subtitle="Lokálne podklady, vysvetliteľné odhady a vlastná história"
      className="mb-5"
    >
      <div className="form-grid">
        <label className="field">
          Učiteľ
          <select
            value={chosenTeacher}
            onChange={(e) => setTeacherId(e.target.value)}
          >
            <option value="">Bez učiteľa</option>
            {data.teachers
              .filter((t) => t.subjectId === test.subjectId)
              .map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
        <div className="field">
          Učivo pre tento test
          {data.documents
            .filter((d) => d.kind === "notes" && d.subjectId === test.subjectId)
            .map((d) => (
              <label className="inline" key={d.id}>
                <input
                  type="checkbox"
                  checked={chosenMaterials.includes(d.id)}
                  onChange={(e) =>
                    setMaterialIds(
                      e.target.checked
                        ? [...chosenMaterials, d.id]
                        : chosenMaterials.filter((id) => id !== d.id),
                    )
                  }
                />
                {d.title}
              </label>
            ))}
        </div>
      </div>
      <button
        className="button secondary mt-5"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await intelligenceRequest({
              operation: "link",
              values: {
                testId,
                teacherId: chosenTeacher || null,
                materialIds: chosenMaterials,
              },
            });
          })
        }
      >
        Uložiť podklady predikcie
      </button>
      {prediction && (
        <>
          <div className="prediction-metrics mt-5">
            <div>
              <span className="muted small">Očakávaný výsledok</span>
              <strong>≈ {prediction.expected} %</strong>
              <span className="muted small">
                Približne {prediction.lowerResult}–{prediction.upperResult} %
              </span>
            </div>
            <div>
              <span className="muted small">Zdroj / istota</span>
              <strong>{prediction.source}</strong>
              <span>
                {prediction.confidence} · cieľ {prediction.target} %
              </span>
            </div>
            <div>
              <span className="muted small">Celková príprava</span>
              <strong>
                {formatMinutes(prediction.time.lower)} –{" "}
                {formatMinutes(prediction.time.upper)}
              </strong>
              <span className="muted small">
                Aktuálna pripravenosť {prediction.features.readiness} %
              </span>
            </div>
          </div>
          <p className="small muted mt-5">
            {prediction.time.explanation} Rozsah výsledku je orientačný, nie
            štatistický interval spoľahlivosti.
          </p>
          <ul className="recommendation-list">
            {prediction.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {prediction.warning && (
            <p className="warning-box">{prediction.warning}</p>
          )}
          <div className="two-column mt-5">
            <div>
              <h3 className="mb-3">Priority tém a rozdelenie učenia</h3>
              {prediction.priorities.rows.length ? (
                prediction.priorities.rows.map((row) => (
                  <div className="material-item" key={row.name}>
                    <div>
                      <strong>{row.name}</strong>
                      <p className="small muted">{row.evidence}</p>
                      <p className="small muted">
                        Moja úspešnosť:{" "}
                        {row.success === null
                          ? "zatiaľ neznáma"
                          : `${Math.round(row.success)} %`}
                      </p>
                    </div>
                    <span>
                      {row.score}/100 · {formatMinutes(row.minutes)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="muted small">
                  Pridaj témy testu alebo učivo s označenými konceptmi.
                </p>
              )}
              <p className="hint-box mt-4">
                Záverečné opakovanie:{" "}
                {formatMinutes(prediction.priorities.reviewMinutes)}
              </p>
            </div>
            <div>
              <h3 className="mb-3">Historické podklady učiteľa</h3>
              <p className="small muted">
                {prediction.teacher?.testCount
                  ? `${prediction.teacher.testCount} testov · istota ${prediction.teacher.confidence}. Ide o odhad, nie istotu.`
                  : "Nedostatok historických dát učiteľa."}
              </p>
              {prediction.teacher?.styles.map((style) => (
                <div className="material-item" key={style.type}>
                  <span>{style.name}</span>
                  <strong>{Math.round(style.percent)} %</strong>
                </div>
              ))}
            </div>
          </div>
          {!completed && (
            <button
              className="button mt-5"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await intelligenceRequest({
                    operation: "predict",
                    id: testId,
                  });
                })
              }
            >
              Uložiť túto predikciu pred testom
            </button>
          )}
        </>
      )}
      {saved && (
        <div className="hint-box mt-5">
          <strong>
            Uložená predikcia:{" "}
            {new Date(saved.createdAt).toLocaleString("sk-SK")}
          </strong>
          <p className="small muted">
            Pôvodný odhad sa nemení s novými dátami. Aktuálny výpočet vyššie
            môže byť odlišný.
          </p>
          {saved.actualTopics !== null && (
            <p>
              Precision:{" "}
              {saved.precision === null
                ? "—"
                : `${Math.round(saved.precision * 100)} %`}{" "}
              · Recall:{" "}
              {saved.recall === null
                ? "—"
                : `${Math.round(saved.recall * 100)} %`}
            </p>
          )}
        </div>
      )}
      {completed && saved && (
        <div className="mt-5">
          <h3>Čo reálne bolo na teste</h3>
          <label className="field mt-4">
            Skutočné témy (čiarkou)
            <textarea
              value={actualTopicValue}
              onChange={(e) => setActualTopics(e.target.value)}
              placeholder={
                saved.actualTopics
                  ? JSON.parse(saved.actualTopics).join(", ")
                  : "Označ skutočne skúšané témy"
              }
            />
          </label>
          <div className="question-style-options mt-4">
            {Object.entries(questionTypes).map(([key, label]) => (
              <label className="inline" key={key}>
                <input
                  type="checkbox"
                  checked={actualStyleValue.includes(key)}
                  onChange={(e) =>
                    setActualStyles(
                      e.target.checked
                        ? [...actualStyleValue, key]
                        : actualStyleValue.filter((s) => s !== key),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <button
            className="button mt-5"
            disabled={busy || !actualTopicValue.trim()}
            onClick={() =>
              void run(async () => {
                await intelligenceRequest({
                  operation: "evaluate",
                  values: {
                    id: saved.id,
                    topics: splitTopics(actualTopicValue),
                    styles: actualStyleValue,
                  },
                });
              })
            }
          >
            Uložiť skutočný obsah a vyhodnotiť predikciu
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="error-message mt-5">
          {error}
        </p>
      )}
    </Card>
  );
}
