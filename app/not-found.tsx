import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>Stránka sa nenašla.</h1>
      <p className="muted">Tento odkaz už možno neexistuje.</p>
      <Link href="/" className="button">
        Späť na dashboard
      </Link>
    </div>
  );
}
