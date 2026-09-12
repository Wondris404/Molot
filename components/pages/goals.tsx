"use client";
import { useState, type FormEvent } from "react";
import { Check, Circle, Paperclip, Plus, Target, Trash2 } from "lucide-react";
import { useApp } from "../app-provider";
import { Card, EmptyState, PageHeading, Progress } from "../ui";
import { ChartPanel } from "../charts/chart-panel";
import { formatDate } from "@/lib/format";

const goalCategories = { school: "Škola", work: "Práca", personal: "Osobné" } as const;

export function GoalsPage() {
  const { data, saveGlobal, removeGlobal, setDeletion } = useApp();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"school" | "work" | "personal">("personal");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState("");
  if (!data) return null;
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    try { await saveGlobal("goals", { name, category, description, targetValue: target ? Number(target) : null, currentValue: 0, unit, deadline: deadline || null, status: "active" }); setAdding(false); setName(""); setTarget(""); setUnit(""); setDescription(""); setDeadline(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Cieľ sa nepodarilo uložiť."); }
  }
  return <>
    <PageHeading eyebrow="TVOJ SMER" title="Ciele" description="Jednoducho sleduj, kam sa chceš posunúť." action={<button className="button" onClick={() => setAdding(true)}><Plus size={16} />Pridať cieľ</button>} />
      {adding && <Card title="Nový cieľ"><form className="stack" onSubmit={submit}><div className="form-grid"><label className="field field-wide">Názov<input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Napr. Zabehnúť 10 km pod 50 minút" /></label><label className="field field-wide">Poznámka<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></label><label className="field">Oblasť<select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>{Object.entries(goalCategories).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label className="field">Termín (voliteľné)<input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label><label className="field">Cieľová hodnota (voliteľné)<input type="number" value={target} onChange={(e) => setTarget(e.target.value)} /></label><label className="field">Jednotka<input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="km, %, hodín…" /></label></div>{error && <p className="error-message">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={() => setAdding(false)}>Zrušiť</button><button className="button">Uložiť cieľ</button></div></form></Card>}
    <div className="dashboard-grid">
      {!data.goals.length ? <Card><EmptyState title="Zatiaľ nemáš žiadny cieľ." description="Pridaj školský, pracovný alebo osobný cieľ." action={<button className="button" onClick={() => setAdding(true)}>Pridať prvý cieľ</button>} /></Card> : data.goals.map((goal) => {
        const percent = goal.targetValue && goal.targetValue > 0 ? Math.min(100, Math.max(0, (goal.currentValue / goal.targetValue) * 100)) : null;
        const entries = data.progressEntries.filter((entry) => entry.goalId === goal.id).sort((a,b) => a.date.localeCompare(b.date));
        const attachments = data.goalAttachments.filter((attachment) => attachment.goalId === goal.id);
        return <div className="goal-group" key={goal.id}><Card title={goal.name} subtitle={`${goalCategories[goal.category]} · ${goal.status === "completed" ? "Hotový" : "Aktívny"}`} action={<button className="icon-button danger" aria-label={`Odstrániť ${goal.name}`} onClick={() => { if (window.confirm(`Odstrániť cieľ „${goal.name}“ a jeho pokrok?`)) void removeGlobal("goals", goal.id); }}><Trash2 size={16} /></button>}>
          <div className="stack">{goal.description && <p className="muted">{goal.description}</p>}{goal.deadline && <p className="small muted">Termín: {formatDate(goal.deadline)}</p>}<p className="stat-value">{goal.currentValue}{goal.unit ? ` ${goal.unit}` : ""}{goal.targetValue !== null ? ` / ${goal.targetValue} ${goal.unit}` : ""}</p>{percent !== null && <Progress value={percent} label="Postup" />}<div className="quick-actions"><button className="button secondary" onClick={() => void saveGlobal("goals", { ...goal, status: goal.status === "completed" ? "active" : "completed" }, goal.id)}>{goal.status === "completed" ? "Znovu otvoriť" : "Označiť ako hotové"}</button><button className="button secondary" onClick={() => void saveGlobal("goals", { ...goal, status: goal.status === "paused" ? "active" : "paused" }, goal.id)}>{goal.status === "paused" ? "Pokračovať" : "Pozastaviť"}</button></div><GoalProgress goalId={goal.id} unit={goal.unit} /><Milestones goalId={goal.id} />{attachments.length > 0 && <div className="stack"><strong>Prílohy</strong>{attachments.map((attachment) => <div className="material-item" key={attachment.id}><a href={`/api/materials/${attachment.id}`} target="_blank" rel="noreferrer"><Paperclip size={15} />{attachment.name}</a><button className="icon-button danger" aria-label={`Odstrániť ${attachment.name}`} onClick={() => setDeletion({ entity: "materials", id: attachment.id, label: attachment.name })}><Trash2 size={14} /></button></div>)}</div>}{entries.slice(-3).reverse().map((entry) => <div className="material-item" key={entry.id}><div><strong>{entry.value ?? "—"}{entry.unit ? ` ${entry.unit}` : ""}</strong><span className="small muted">{formatDate(entry.date)}{entry.note ? ` · ${entry.note}` : ""}</span></div></div>)}</div>
        </Card>{entries.some((entry) => entry.value !== null) && <ChartPanel title={`Vývoj: ${goal.name}`} subtitle="Skutočné uložené hodnoty" data={entries.filter((entry) => entry.value !== null).map((entry) => ({ name: entry.date, value: entry.value }))} series={[{ key: "value", label: goal.unit || "Hodnota", color: "#c5ef79" }]} kind="line" unit={goal.unit ? ` ${goal.unit}` : ""} />}</div>;
      })}
    </div>
  </>;
}
function Milestones({ goalId }: { goalId: string }) {
  const { data, saveGlobal, removeGlobal } = useApp(); const [name, setName] = useState("");
  if (!data) return null; const items = data.milestones.filter((item) => item.goalId === goalId);
  return <div className="stack"><strong>Medzikroky</strong>{items.map((item) => <div className="material-item" key={item.id}><button className="plain-check" onClick={() => void saveGlobal("milestones", { goalId, name: item.name, completed: !item.completed, dueDate: item.dueDate }, item.id)}>{item.completed ? <Check size={17} /> : <Circle size={17} />}{item.name}</button><button className="icon-button danger" aria-label={`Odstrániť ${item.name}`} onClick={() => void removeGlobal("milestones", item.id)}><Trash2 size={14} /></button></div>)}<form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (!name.trim()) return; void saveGlobal("milestones", { goalId, name, completed: false, dueDate: null }).then(() => setName("")); }}><input aria-label="Názov medzikroku" value={name} onChange={(event) => setName(event.target.value)} placeholder="Pridať medzikrok" /><button className="button secondary"><Plus size={15} />Pridať medzikrok</button></form></div>;
}
function GoalProgress({ goalId, unit }: { goalId: string; unit: string }) {
  const { saveGlobal } = useApp();
  const [value, setValue] = useState(""); const [note, setNote] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setError(""); try { await saveGlobal("progress", { goalId, date: new Date().toISOString().slice(0, 10), value: value ? Number(value) : null, unit, activity: "", note }); setValue(""); setNote(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Pokrok sa nepodarilo uložiť."); } }
  return <form className="inline-form" onSubmit={submit}><input aria-label="Aktuálna hodnota" type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Aktuálny stav" /><input aria-label="Poznámka" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Poznámka" /><button className="button secondary"><Target size={16} />Pridať pokrok</button>{error && <span className="error-message">{error}</span>}</form>;
}
