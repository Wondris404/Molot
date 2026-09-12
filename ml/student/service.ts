import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { getDatabase, getSnapshot, transaction } from "../../lib/db";
import { modelsDirectory } from "../../lib/paths";
import { logEvent } from "../../lib/logger";
import { callPython } from "../common/python-bridge";
import { trainingSamples } from "./features";
import type { PortableModel } from "./prediction";

export interface TrainingResult {
  status: "insufficient" | "activated" | "rejected";
  numberOfSamples: number;
  message?: string;
  algorithm?: string;
  mae?: number;
  rmse?: number;
  baselineMae?: number;
  validationMethod?: string;
  features?: string[];
  candidates?: { algorithm: string; cvMae: number }[];
  holdoutSize?: number;
  model?: Omit<
    PortableModel,
    "version" | "numberOfSamples" | "algorithm" | "mae" | "rmse"
  >;
  referencePredictions?: number[];
}
const state = globalThis as typeof globalThis & {
  molotTraining?: Promise<TrainingResult>;
};
export function isStudentTraining(): boolean {
  return Boolean(state.molotTraining);
}
export function activeStudentModel(): PortableModel | null {
  try {
    const row = getDatabase()
      .prepare(
        "SELECT payload FROM StudentModelMetadata WHERE active=1 ORDER BY createdAt DESC LIMIT 1",
      )
      .get();
    return row
      ? (JSON.parse(String(row.payload)).model as PortableModel)
      : null;
  } catch {
    logEvent("model_read_failed");
    return null;
  }
}
export function modelStatus() {
  const db = getDatabase();
  return {
    models: db
      .prepare(
        "SELECT id,version,createdAt,numberOfSamples,features,algorithm,mae,rmse,validationMethod,active FROM StudentModelMetadata ORDER BY createdAt DESC",
      )
      .all(),
    runs: db
      .prepare(
        "SELECT * FROM ModelTrainingRun ORDER BY createdAt DESC LIMIT 10",
      )
      .all()
      .map((r) => ({ ...r, payload: JSON.parse(String(r.payload)) })),
    sampleCount: trainingSamples(getSnapshot()).length,
    training: isStudentTraining(),
    minimumSamples: 30,
    retrainEvery: 5,
  };
}
export function trainStudentModel(): Promise<TrainingResult> {
  if (state.molotTraining) return state.molotTraining;
  const samples = trainingSamples(getSnapshot());
  const work = async (): Promise<TrainingResult> => {
    const createdAt = new Date().toISOString();
    logEvent("training_started", { samples: samples.length });
    try {
      const result = await callPython<TrainingResult>({
        operation: "train",
        samples,
        incumbentAlgorithm: activeStudentModel()?.algorithm,
      });
      const db = getDatabase();
      let version: string | undefined;
      let model: PortableModel | undefined;
      if (
        result.model &&
        result.algorithm &&
        result.mae !== undefined &&
        result.rmse !== undefined
      ) {
        const count = Number(
          db.prepare("SELECT COUNT(*) AS count FROM StudentModelMetadata").get()
            ?.count,
        );
        version = `student-model-v${count + 1}`;
        model = {
          ...result.model,
          version,
          algorithm: result.algorithm,
          numberOfSamples: samples.length,
          mae: result.mae,
          rmse: result.rmse,
        };
        mkdirSync(modelsDirectory, { recursive: true });
        const target = path.join(modelsDirectory, `${version}.json`);
        writeFileSync(`${target}.tmp`, JSON.stringify(model));
        renameSync(`${target}.tmp`, target);
      }
      transaction(() => {
        const summary = {
          ...result,
          model: undefined,
          referencePredictions: undefined,
        };
        db.prepare("INSERT INTO ModelTrainingRun VALUES(?,?,?,?,?)").run(
          randomUUID(),
          createdAt,
          samples.length,
          result.status,
          JSON.stringify(summary),
        );
        if (model && version) {
          if (result.status === "activated")
            db.exec("UPDATE StudentModelMetadata SET active=0");
          db.prepare(
            "INSERT INTO StudentModelMetadata VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          ).run(
            randomUUID(),
            version,
            createdAt,
            samples.length,
            JSON.stringify(result.features),
            result.algorithm!,
            result.mae!,
            result.rmse!,
            result.validationMethod!,
            Number(result.status === "activated"),
            JSON.stringify({ ...summary, model }),
          );
        }
      });
      logEvent("training_finished", {
        samples: samples.length,
        status: result.status,
      });
      return { ...result, model: undefined };
    } catch (error) {
      getDatabase()
        .prepare("INSERT INTO ModelTrainingRun VALUES(?,?,?,?,?)")
        .run(
          randomUUID(),
          createdAt,
          samples.length,
          "failed",
          JSON.stringify({
            message:
              "Lokálny engine nie je dostupný. Baseline a školské funkcie zostávajú dostupné.",
          }),
        );
      logEvent("training_failed", { samples: samples.length });
      throw error;
    }
  };
  state.molotTraining = work().finally(() => {
    state.molotTraining = undefined;
  });
  return state.molotTraining;
}
export async function autoRetrain() {
  const count = trainingSamples(getSnapshot()).length;
  const last = getDatabase()
    .prepare(
      "SELECT numberOfSamples FROM ModelTrainingRun ORDER BY createdAt DESC LIMIT 1",
    )
    .get();
  if (count >= 30 && count - Number(last?.numberOfSamples ?? 0) >= 5) {
    try {
      await trainStudentModel();
    } catch {
      /* Training must never break school CRUD. */
    }
  }
}
