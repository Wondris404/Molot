"use client";
import { useRef, useState, type DragEvent } from "react";
import { FileText, ImagePlus, PenLine, Sparkles } from "lucide-react";
import type { SmartInput } from "@/lib/smart-input";
import { Dialog } from "./ui";
import { apiRequest, useApp } from "./app-provider";

export function QuickAdd() {
  const { data, quickAddOpen, setQuickAddOpen, save, saveGlobal, setEditor, notify, refresh } = useApp();
  const [text, setText] = useState("");
  const [result, setResult] = useState<SmartInput | null>(null);
  const [originalResult, setOriginalResult] = useState<SmartInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileMode, setFileMode] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [attachmentTarget, setAttachmentTarget] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  if (!quickAddOpen || !data) return null;
  const fields = result?.fields ?? {};
  const selectedSubject = String(fields.subjectId ?? "");
  const proposedPercentage = Number(fields.maxPoints) > 0
    ? Math.round((Number(fields.earnedPoints) / Number(fields.maxPoints)) * 10000) / 100
    : null;
  const selectedFileTest = attachmentTarget.startsWith("test:") ? data.tests.find((test) => test.id === attachmentTarget.slice(5)) : undefined;
  const selectedFileGoal = attachmentTarget.startsWith("goal:") ? data.goals.find((goal) => goal.id === attachmentTarget.slice(5)) : undefined;
  async function analyze() {
    setBusy(true); setError("");
    try {
      const response = await apiRequest("/api/smart-input", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const proposal = response as SmartInput;
      setResult(proposal); setOriginalResult(proposal);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Spracovanie zlyhalo."); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!result) return;
    if (!data) return;
    setBusy(true); setError("");
    try {
      if (result.kind === "test") {
        if (!selectedSubject) throw new Error("Vyber existujúci predmet; nový môžeš pridať v Nastaveniach.");
        await save("tests", { subjectId: selectedSubject, title: String(fields.title ?? "Nový test"), date: String(fields.date ?? new Date().toISOString().slice(0, 10)), time: "", topics: String(fields.topics ?? ""), notes: "Pridané cez Pridať informácie.", difficulty: 3, targetPercent: data.settings.defaultTarget, plannedMinutes: Number(fields.plannedMinutes ?? 0), status: "planned" });
      } else if (result.kind === "grade") {
        if (!selectedSubject || !fields.value) throw new Error("Pre známku vyber predmet a doplň známku.");
        await save("grades", { subjectId: selectedSubject, value: Number(fields.value), weight: 1, date: String(fields.date ?? new Date().toISOString().slice(0, 10)), description: fields.earnedPoints ? `${fields.earnedPoints}/${fields.maxPoints} bodov` : "Pridané cez Pridať informácie.", assessmentType: "Hodnotenie" });
      } else if (result.kind === "test_result") {
        if (!fields.testId || fields.readinessBefore === null || fields.readinessBefore === undefined) throw new Error("Vyber test a doplň pripravenosť pred testom.");
        if (!(Number(fields.maxPoints) > 0) || Number(fields.earnedPoints) < 0 || Number(fields.earnedPoints) > Number(fields.maxPoints)) throw new Error("Body musia byť od 0 po zadané maximum.");
        await save("results", { testId: fields.testId, earnedPoints: Number(fields.earnedPoints), maxPoints: Number(fields.maxPoints), percentage: 0, grade: fields.grade ? Number(fields.grade) : null, actualStudyMinutes: Number(fields.actualStudyMinutes ?? 0), readinessBefore: Number(fields.readinessBefore), perceivedDifficulty: 3, note: "Pridané cez Pridať informácie." });
      } else if (result.kind === "goal") {
        await saveGlobal("goals", { name: String(fields.name ?? text), category: fields.category ?? "personal", description: "", targetValue: fields.value == null ? null : Number(fields.value), currentValue: 0, unit: String(fields.unit ?? ""), deadline: null, status: "active" });
      } else if (result.kind === "progress") {
        const goal = data.goals.find((item) => item.id === fields.goalId);
        if (!goal) throw new Error("Najprv si vytvor cieľ, ku ktorému patrí tento pokrok.");
        await saveGlobal("progress", { goalId: goal.id, date: fields.date ?? new Date().toISOString().slice(0, 10), value: Number(fields.value), unit: fields.unit, activity: fields.activity, note: fields.note });
      } else throw new Error("Vyber manuálny typ záznamu.");
      if (originalResult?.source === "mini_ai") {
        void apiRequest("/api/mini-ai/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task: "smart_input",
            suggested: originalResult,
            confirmed: result,
            accepted: JSON.stringify(originalResult) === JSON.stringify(result),
          }),
        }).catch(() => undefined);
      }
      setQuickAddOpen(false); setResult(null); setOriginalResult(null); setText("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Uloženie zlyhalo."); }
    finally { setBusy(false); }
  }
  function manual(entity: "grades" | "tests" | "sessions") { setQuickAddOpen(false); setEditor({ entity }); }
  function chooseFile(candidate?: File) {
    if (!candidate) return;
    if (candidate.size > 20 * 1024 * 1024) { setError("Súbor môže mať najviac 20 MB."); return; }
    setFile(candidate); setError("");
  }
  function drop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); chooseFile(event.dataTransfer.files[0]); }
  async function upload() {
    if (!file || (!selectedFileTest && !selectedFileGoal)) { setError("Vyber súbor aj miesto, ku ktorému patrí."); return; }
    const form = new FormData(); form.set("file", file);
    if (selectedFileTest) { form.set("subjectId", selectedFileTest.subjectId); form.set("testId", selectedFileTest.id); }
    if (selectedFileGoal) form.set("goalId", selectedFileGoal.id);
    setBusy(true); setError("");
    try { await apiRequest("/api/materials", { method: "POST", body: form }); await refresh(); notify("Materiál je uložený lokálne."); setQuickAddOpen(false); setFileMode(false); setFile(null); setAttachmentTarget(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Nahranie zlyhalo."); }
    finally { setBusy(false); }
  }
  return <Dialog title="Pridať informácie" onClose={() => setQuickAddOpen(false)}>
    {fileMode ? <div className="stack">
      <p className="muted">Vyber fotku, PDF alebo text a priraď ho k testu alebo cieľu. Súbor zostane iba v Molote.</p>
      <div className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
        <input ref={fileInput} className="sr-only" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain" capture="environment" onChange={(event) => chooseFile(event.target.files?.[0])} />
        <button className="button secondary" type="button" onClick={() => fileInput.current?.click()}><ImagePlus size={16} />Vybrať alebo odfotiť</button>
        <p className="small muted mt-3">{file ? `${file.name} · ${Math.ceil(file.size / 1024)} KB` : "Môžeš sem súbor aj pretiahnuť. Maximum 20 MB."}</p>
      </div>
      <label className="field">Priradiť k<select value={attachmentTarget} onChange={(event) => setAttachmentTarget(event.target.value)}><option value="">Vyber test alebo cieľ</option>{data.tests.length > 0 && <optgroup label="Testy">{[...data.tests].sort((a,b) => b.date.localeCompare(a.date)).map((test) => <option key={test.id} value={`test:${test.id}`}>{data.subjects.find((subject) => subject.id === test.subjectId)?.name} · {test.title}</option>)}</optgroup>}{data.goals.length > 0 && <optgroup label="Ciele">{data.goals.map((goal) => <option key={goal.id} value={`goal:${goal.id}`}>{goal.name}</option>)}</optgroup>}</select></label>
      {!data.tests.length && !data.goals.length && <p className="error-message">Najprv vytvor test alebo cieľ.</p>}
      {error && <p className="error-message">{error}</p>}
      <div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => { setFileMode(false); setError(""); }}>Späť</button><button className="button" disabled={busy || !file || !attachmentTarget} onClick={() => void upload()}>{busy ? "Nahrávam…" : "Potvrdiť a uložiť"}</button></div>
    </div> : !result ? <div className="stack">
      <p className="muted">Napíš to vlastnými slovami. Pred uložením ti Molot vždy ukáže návrh.</p>
      <label className="field">Čo chceš pridať?
        <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Biológia – test budúci piatok, fotosyntéza, asi 4 hodiny prípravy." rows={5} />
      </label>
      <div className="quick-actions">
        <button className="button secondary" onClick={() => manual("grades")}><PenLine size={16} />Známka</button>
        <button className="button secondary" onClick={() => manual("tests")}><FileText size={16} />Test</button>
        <button className="button secondary" onClick={() => manual("sessions")}><PenLine size={16} />Učenie</button>
        <button className="button secondary" onClick={() => { setFileMode(true); setError(""); }}><ImagePlus size={16} />Súbor / fotka</button>
      </div>
      {error && <p className="error-message">{error}</p>}
      <div className="modal-actions"><button className="button secondary" onClick={() => setQuickAddOpen(false)}>Zrušiť</button><button className="button" disabled={busy || !text.trim()} onClick={() => void analyze()}><Sparkles size={16} />{busy ? "Spracúvam…" : "Rozpoznať"}</button></div>
    </div> : <div className="stack">
      <p><strong>Molot našiel:</strong> {result.note}</p>
      {(result.kind === "test" || result.kind === "grade") && <label className="field">Predmet<select value={selectedSubject} onChange={(event) => setResult({ ...result, fields: { ...fields, subjectId: event.target.value } })}><option value="">Vyber predmet</option>{data.subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></label>}
      <div className="hint-box small">Typ: {result.kind === "test" ? "Test" : result.kind === "test_result" ? "Výsledok testu" : result.kind === "grade" ? "Známka" : result.kind === "goal" ? "Cieľ" : result.kind === "progress" ? "Pokrok" : "Neznáme"} · istota: {result.confidence === "high" ? "vysoká" : result.confidence === "medium" ? "stredná" : "nízka"}</div>
      {result.kind === "test" && <><label className="field">Názov<input value={String(fields.title ?? "")} onChange={(e) => setResult({ ...result, fields: { ...fields, title: e.target.value } })} /></label><label className="field">Dátum<input type="date" value={String(fields.date ?? "")} onChange={(e) => setResult({ ...result, fields: { ...fields, date: e.target.value } })} /></label><label className="field">Témy<input value={String(fields.topics ?? "")} onChange={(e) => setResult({ ...result, fields: { ...fields, topics: e.target.value } })} /></label></>}
      {result.kind === "grade" && <label className="field">Známka<input type="number" min="1" max="5" value={String(fields.value ?? "")} onChange={(e) => setResult({ ...result, fields: { ...fields, value: Number(e.target.value) } })} /></label>}
      {result.kind === "test_result" && <><p className="small muted">Predmet: {String(fields.subjectName ?? "neurčený")} · vypočítaný výsledok: {proposedPercentage == null || !Number.isFinite(proposedPercentage) ? "—" : `${proposedPercentage} %`}</p><label className="field">Test<select value={String(fields.testId ?? "")} onChange={(e) => setResult({ ...result, fields: { ...fields, testId: e.target.value } })}><option value="">Vyber test</option>{data.tests.filter((test) => !data.results.some((item) => item.testId === test.id) && (!fields.subjectId || test.subjectId === fields.subjectId)).map((test) => <option key={test.id} value={test.id}>{test.title}</option>)}</select></label><div className="form-grid"><label className="field">Body<input type="number" min="0" value={String(fields.earnedPoints ?? "")} onChange={(e) => setResult({ ...result, fields: { ...fields, earnedPoints: Number(e.target.value) } })} /></label><label className="field">Maximum<input type="number" min="1" value={String(fields.maxPoints ?? "")} onChange={(e) => setResult({ ...result, fields: { ...fields, maxPoints: Number(e.target.value) } })} /></label><label className="field">Známka<input type="number" min="1" max="5" value={String(fields.grade ?? "")} onChange={(e) => setResult({ ...result, fields: { ...fields, grade: e.target.value ? Number(e.target.value) : null } })} /></label><label className="field">Pripravenosť pred testom (%)<input type="number" min="0" max="100" value={String(fields.readinessBefore ?? "")} onChange={(e) => setResult({ ...result, fields: { ...fields, readinessBefore: Number(e.target.value) } })} /></label><label className="field">Skutočný čas učenia (min)<input type="number" min="0" value={String(fields.actualStudyMinutes ?? 0)} onChange={(e) => setResult({ ...result, fields: { ...fields, actualStudyMinutes: Number(e.target.value) } })} /></label></div></>}
      {result.kind === "goal" && <label className="field">Cieľ<input value={String(fields.name ?? "")} onChange={(e) => setResult({ ...result, fields: { ...fields, name: e.target.value } })} /></label>}
      {result.kind === "progress" && <label className="field">Cieľ<select value={String(fields.goalId ?? "")} onChange={(event) => setResult({ ...result, fields: { ...fields, goalId: event.target.value } })}><option value="">Vyber cieľ</option>{data.goals.map((goal) => <option value={goal.id} key={goal.id}>{goal.name}</option>)}</select></label>}
      {error && <p className="error-message">{error}</p>}
      <div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => setResult(null)}>Späť</button><button className="button" disabled={busy || result.kind === "unknown"} onClick={() => void confirm()}>{busy ? "Ukladám…" : "Potvrdiť a uložiť"}</button></div>
    </div>}
  </Dialog>;
}
