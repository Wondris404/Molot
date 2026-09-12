import type { Features } from "./features";
import { baselineResult } from "./features";
export interface Tree {
  left: number[];
  right: number[];
  feature: number[];
  threshold: number[];
  value: number[];
}
export interface PortableModel {
  algorithm: string;
  features: string[];
  mean: number[];
  scale: number[];
  coefficients?: number[];
  intercept?: number;
  trees?: Tree[];
  version: string;
  numberOfSamples: number;
  mae: number;
  rmse: number;
}
export function predictResult(
  features: Features,
  model: PortableModel | null,
): number {
  if (!model) return baselineResult(features);
  const row = model.features.map((name, i) => {
    const equals = name.indexOf("=");
    const raw =
      equals >= 0
        ? Number(
            String(features[name.slice(0, equals)]) === name.slice(equals + 1),
          )
        : Number(features[name] ?? 0);
    return (raw - model.mean[i]) / model.scale[i];
  });
  let value = 0;
  if (model.coefficients)
    value =
      (model.intercept || 0) +
      model.coefficients.reduce((sum, c, i) => sum + c * row[i], 0);
  else if (model.trees?.length)
    value =
      model.trees.reduce((sum, tree) => {
        let node = 0;
        for (let step = 0; step < 100 && tree.left[node] !== -1; step++)
          node =
            row[tree.feature[node]] <= tree.threshold[node]
              ? tree.left[node]
              : tree.right[node];
        return sum + tree.value[node];
      }, 0) / model.trees.length;
  else throw new Error("Neplatný model.");
  if (!Number.isFinite(value)) throw new Error("Neplatný výstup modelu.");
  return Math.min(100, Math.max(0, value));
}
export function solveStudyTime(
  features: Features,
  target: number,
  model: PortableModel | null,
  fallbackMinutes: number,
) {
  const currentMinutes = Math.round(Math.expm1(Number(features.logMinutes)));
  const limit = Math.min(
    1440,
    Math.max(480, currentMinutes, fallbackMinutes * 3),
  );
  let found: number | null = null;
  for (let minutes = currentMinutes; minutes <= limit; minutes += 15) {
    if (
      predictResult({ ...features, logMinutes: Math.log1p(minutes) }, model) >=
      target
    ) {
      found = minutes;
      break;
    }
  }
  const estimate = found ?? Math.max(currentMinutes, fallbackMinutes);
  const spread = model ? Math.min(0.5, Math.max(0.2, model.mae / 25)) : 0.4;
  const round = (value: number) => Math.max(0, Math.round(value / 15) * 15);
  return {
    minutes: round(estimate),
    lower: round(estimate * (1 - spread)),
    upper: round(estimate * (1 + spread)),
    reachable: found !== null,
    explanation:
      found === null
        ? "Pri nezmenenej pripravenosti model v rozumnom rozsahu času nedosiahol cieľ. Použitý je historický časový odhad; precvič témy a znovu over pripravenosť."
        : "Časový scenár drží ostatné vstupy nezmenené. Súvislosť času a výsledku nedokazuje, že samotné ďalšie minúty spôsobia zlepšenie.",
  };
}
