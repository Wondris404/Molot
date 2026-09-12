"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="empty-state">
      <h1>Stránku sa nepodarilo zobraziť.</h1>
      <p className="muted">
        Skús ju načítať znova. Uložené údaje zostávajú v databáze.
      </p>
      <button className="button" onClick={reset}>
        Skúsiť znova
      </button>
    </div>
  );
}
