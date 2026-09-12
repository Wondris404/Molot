export const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export const splitTopics = (value: string) => [
  ...new Set(
    value
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];
export function textSimilarity(a: string, b: string): number {
  const tokens = (value: string) =>
    new Set(
      normalize(value)
        .split(" ")
        .filter((s) => s.length > 2),
    );
  const left = tokens(a),
    right = tokens(b);
  const shared = [...left].filter((s) => right.has(s)).length;
  return shared / Math.max(1, Math.sqrt(left.size * right.size));
}
export function setMetrics(predicted: string[], actual: string[]) {
  const p = new Set(predicted.map(normalize)),
    a = new Set(actual.map(normalize));
  const matches = [...p].filter((topic) => a.has(topic)).length;
  return {
    precision: p.size ? matches / p.size : null,
    recall: a.size ? matches / a.size : null,
  };
}
