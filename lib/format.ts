export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function daysUntil(date: string, today = localDate()): number {
  return Math.round(
    (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) /
      86_400_000,
  );
}
export function dueLabel(date: string): string {
  const days = daysUntil(date);
  if (days === 0) return "Dnes";
  if (days === 1) return "Zajtra";
  if (days < 0) return `Pred ${Math.abs(days)} dňami`;
  return `O ${days} ${days < 5 ? "dni" : "dní"}`;
}
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date.includes("T") ? date : `${date}T12:00:00`));
}
export function formatNumber(
  value: number | null | undefined,
  decimals = 1,
): string {
  return value == null
    ? "—"
    : new Intl.NumberFormat("sk-SK", {
        maximumFractionDigits: decimals,
      }).format(value);
}
export function formatMinutes(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  return rounded < 60
    ? `${rounded} min`
    : `${Math.floor(rounded / 60)} h${rounded % 60 ? ` ${rounded % 60} min` : ""}`;
}
export function weekStart(today = localDate()): string {
  const date = new Date(`${today}T12:00:00`);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return localDate(date);
}
