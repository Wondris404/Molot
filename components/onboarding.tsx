"use client";
import { useState, type FormEvent } from "react";
import { Dialog } from "./ui";
import { useApp } from "./app-provider";

export function Onboarding() {
  const { data, saveGlobal } = useApp();
  const [name, setName] = useState("");
  const [mainGoal, setMainGoal] = useState("");
  const [modules, setModules] = useState<string[]>(["school"]);
  const [error, setError] = useState("");
  if (!data || data.profile.onboardingComplete) return null;
  function toggle(module: string) { setModules((current) => current.includes(module) ? current.filter((item) => item !== module) : [...current, module]); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    try { await saveGlobal("profile", { name, mainGoal, modules, onboardingComplete: true }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Profil sa nepodarilo uložiť."); }
  }
  return <Dialog title="Vitaj v MOLOTe" onClose={() => undefined}>
    <form className="stack" onSubmit={submit}>
      <p className="muted">Čo chceš v Molote sledovať? Všetko zostáva len v tvojom zariadení.</p>
      <label className="field">Ako ťa máme oslovovať?<input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="Meno" /></label>
      <label className="field">Hlavný cieľ (voliteľné)<input value={mainGoal} onChange={(e) => setMainGoal(e.target.value)} placeholder="Napr. lepšie sa pripraviť na maturitu" /></label>
      <fieldset className="check-list"><legend>Čo chceš sledovať?</legend>{[["school","Škola"],["work","Práca"],["personal","Osobné ciele / hobby"]].map(([id,label]) => <label key={id}><input type="checkbox" checked={modules.includes(id)} onChange={() => toggle(id)} />{label}</label>)}</fieldset>
      {error && <p className="error-message">{error}</p>}<div className="modal-actions"><button className="button" disabled={!modules.length}>Začať</button></div>
    </form>
  </Dialog>;
}
