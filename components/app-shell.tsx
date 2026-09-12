"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  GraduationCap,
  CalendarDays,
  Timer,
  ScanLine,
  ChartNoAxesCombined,
  Target,
  Plus,
  Settings2,
  Menu,
  X,
  HardDrive,
  Check,
  ArrowUpRight,
} from "lucide-react";
import { useApp } from "./app-provider";
import { DataBoundary } from "./ui";
import { EditorHost } from "./record-editor";
import { QuickAdd } from "./quick-add";
import { Onboarding } from "./onboarding";
import packageMetadata from "../package.json";

const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/grades", label: "Známky", icon: GraduationCap },
  { href: "/tests", label: "Testy", icon: CalendarDays },
  { href: "/teachers", label: "Učitelia", icon: GraduationCap },
  { href: "/study", label: "Učenie", icon: Timer },
  { href: "/errors", label: "Analýza chýb", icon: ScanLine },
  { href: "/charts", label: "Grafy", icon: ChartNoAxesCombined },
  { href: "/goals", label: "Ciele", icon: Target },
  { href: "/settings", label: "Nastavenia", icon: Settings2 },
];
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);
  const { data, notice, error, setQuickAddOpen } = useApp();
  const schoolEnabled = !data?.profile.onboardingComplete || data.profile.modules.includes("school");
  const availableNavigation = schoolEnabled ? navigation : navigation.filter((item) => ["/", "/goals", "/charts", "/settings"].includes(item.href));
  const current =
    availableNavigation.find((item) =>
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
    )?.label ?? "Detail predmetu";
  const close = () => setMenuOpen(false);
  return (
    <div className="app-shell">
      {menuOpen && (
        <button
          className="mobile-backdrop"
          onClick={close}
          aria-label="Zavrieť navigáciu"
        />
      )}
      <aside
        className={`sidebar ${menuOpen ? "is-open" : ""}`}
        aria-label="Hlavná navigácia"
      >
        <Link href="/" className="brand" onClick={close}>
          <span className="brand-mark">
            M<span />
          </span>
          <span>
            MOLOT<span className="brand-caption">OSOBNÝ PROGRESOVÝ SYSTÉM</span>
          </span>
        </Link>
        <button
          className="icon-button mobile-close"
          onClick={close}
          aria-label="Zavrieť menu"
        >
          <X size={20} />
        </button>
        <div className="sidebar-label">PRACOVNÝ PRIESTOR</div>
        <nav>
          {availableNavigation.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : pathname.startsWith(href) ||
                  (href === "/grades" && pathname.startsWith("/subjects"));
            return (
              <Link
                key={href}
                href={href}
                onClick={close}
                className={`nav-item ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={19} strokeWidth={1.65} />
                {label}
                {active && <span className="nav-active-dot" />}
              </Link>
            );
          })}
        </nav>
        {schoolEnabled && <div className="sidebar-subjects">
          <div className="sidebar-label">
            TVOJE PREDMETY{" "}
            <Link
              href="/settings"
              onClick={close}
              aria-label="Spravovať predmety"
            >
              <ArrowUpRight size={14} />
            </Link>
          </div>
          {data?.subjects.length ? (
            data.subjects.slice(0, 7).map((subject) => (
              <Link
                onClick={close}
                href={`/subjects/${subject.id}`}
                className="sidebar-subject"
                key={subject.id}
              >
                <span
                  className="subject-dot"
                  style={{ background: subject.color }}
                />
                {subject.name}
              </Link>
            ))
          ) : (
            <p className="small muted">
              Predmety si pridáš
              <br />v nastaveniach.
            </p>
          )}
        </div>}
        <div className="sidebar-footer">
          <div className="local-icon">
            <HardDrive size={18} />
          </div>
          <div>
            <strong>Lokálny priestor</strong>
            <span>Len ty a tvoje dáta.</span>
          </div>
          <span className="online-dot" />
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-location">
            <button
              className="icon-button mobile-toggle"
              aria-label="Otvoriť menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span className="muted">Pracovný priestor</span>
            <span className="topbar-slash">/</span>
            <span>{current}</span>
          </div>
          <div className="local-badge">
            <span className="online-dot" />
            Uložené lokálne
          </div>
          <button className="button topbar-add" onClick={() => setQuickAddOpen(true)}><Plus size={16} />Pridať informácie</button>
        </header>
        <main id="main-content">
          <DataBoundary>{children}</DataBoundary>
        </main>
        <footer className="main-footer">
          <span>
            MOLOT{" "}
            <span className="muted">— Made by WONDRIS dev · Open-source software</span>
          </span>
          <span className="muted">LOCAL · v{packageMetadata.version}</span>
        </footer>
      </div>
      {error && data && (
        <div className="global-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      <EditorHost />
      <QuickAdd />
      <Onboarding />
    </div>
  );
}
