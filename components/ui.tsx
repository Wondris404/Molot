"use client";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import {
  ArrowUpRight,
  Inbox,
  Pencil,
  Plus,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useApp, type EditorRequest } from "./app-provider";
import type { Entity, Subject, TestStatus } from "@/lib/types";
import { statusLabels } from "@/lib/types";

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
export function AddButton({
  children,
  request,
  secondary = false,
}: {
  children: ReactNode;
  request: EditorRequest;
  secondary?: boolean;
}) {
  const { setEditor } = useApp();
  return (
    <button
      className={secondary ? "button secondary" : "button"}
      onClick={() => setEditor(request)}
    >
      <Plus size={17} />
      {children}
    </button>
  );
}
export function Card({
  title,
  subtitle,
  children,
  action,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="muted small">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function EmptyState({
  title,
  description,
  action,
  compact = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state ${compact ? "compact" : ""}`}>
      <div className="empty-icon">
        <Inbox size={23} strokeWidth={1.4} />
      </div>
      <h3>{title}</h3>
      {description && <p className="muted">{description}</p>}
      {action}
    </div>
  );
}
export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <div className={`stat-card ${accent ? "accent-stat" : ""}`}>
      <div className="stat-label">
        {label}
        <Icon size={18} />
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-detail">{detail}</div>
    </div>
  );
}
export function SubjectBadge({
  subject,
  link = false,
}: {
  subject?: Subject;
  link?: boolean;
}) {
  if (!subject) return <span className="muted">Bez predmetu</span>;
  const content = (
    <>
      <span className="subject-dot" style={{ background: subject.color }} />
      {subject.name}
    </>
  );
  return link ? (
    <Link className="subject-badge" href={`/subjects/${subject.id}`}>
      {content}
    </Link>
  ) : (
    <span className="subject-badge">{content}</span>
  );
}
export function StatusBadge({ status }: { status: TestStatus }) {
  return (
    <span className={`status status-${status}`}>{statusLabels[status]}</span>
  );
}
export function Progress({
  value,
  label = "Pripravenosť",
}: {
  value: number | null;
  label?: string;
}) {
  return (
    <div className="progress-wrap">
      <div className="progress-label">
        <span>{label}</span>
        <strong>
          {value === null ? "Nezadaná" : `${Math.round(value)} %`}
        </strong>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
      >
        <div style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}
export function RowActions({
  entity,
  id,
  label,
}: {
  entity: Entity;
  id: string;
  label: string;
}) {
  const { setEditor, setDeletion } = useApp();
  return (
    <div className="row-actions">
      <button
        className="icon-button"
        title={`Upraviť: ${label}`}
        aria-label={`Upraviť: ${label}`}
        onClick={() => setEditor({ entity, id })}
      >
        <Pencil size={15} />
      </button>
      <button
        className="icon-button danger"
        title={`Odstrániť: ${label}`}
        aria-label={`Odstrániť: ${label}`}
        onClick={() => setDeletion({ entity, id, label })}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
export function TextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="text-link">
      {children}
      <ArrowUpRight size={15} />
    </Link>
  );
}
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="modal-inner">
        <div className="modal-heading">
          <h2 id="dialog-title">{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Zavrieť"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function DataBoundary({ children }: { children: ReactNode }) {
  const { data, loading, error, refresh } = useApp();
  if (loading)
    return (
      <div className="loading" role="status">
        <span className="spinner" />
        Načítavam tvoj prehľad…
      </div>
    );
  if (!data)
    return (
      <Card>
        <EmptyState
          title="Údaje sa nepodarilo načítať"
          description={error}
          action={
            <button
              className="button"
              onClick={() => {
                void refresh().catch(() => window.location.reload());
              }}
            >
              Skúsiť znova
            </button>
          }
        />
      </Card>
    );
  return <>{children}</>;
}
