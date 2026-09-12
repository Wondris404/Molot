"use client";
import { useEffect, useState } from "react";
import { Brain, Download, Trash2 } from "lucide-react";
import { Card } from "./ui";

interface Status { installed: boolean; ready: boolean; size: number; runtimeAvailable: boolean; candidate: { approximateSizeMb: number } }
export function MiniAiSettings() {
  const [status, setStatus] = useState<Status | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/api/mini-ai", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error();
      if (active) setStatus(await response.json() as Status);
    }).catch(() => { if (active) setMessage("Stav inteligentného rozpoznávania sa nepodarilo načítať."); });
    return () => { active = false; };
  }, []);
  async function action(method: "POST" | "DELETE") { setBusy(true); setMessage(method === "POST" ? "Sťahujem. Môže to trvať niekoľko minút…" : ""); try { const response = await fetch("/api/mini-ai", { method }); const value = await response.json(); if (!response.ok) throw new Error(value.error); setStatus(value as Status); setMessage(method === "POST" ? "Inteligentné rozpoznávanie je pripravené." : "Voliteľný model bol odstránený."); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Operácia zlyhala."); } finally { setBusy(false); } }
  return <Card title="Inteligentné rozpoznávanie" subtitle="Voliteľné a úplne lokálne" action={<Brain size={18} className="muted" />}>
    <div className="stack"><p className="small muted">Pomáha Molotu pochopiť krátky text a navrhnúť správne polia. Výpočty, známky a štatistiky na ňom nezávisia.</p>
      <div className="hint-box"><strong>{status?.ready ? "Pripravené" : status?.installed ? "Model je uložený, ale chýba lokálny modul" : "Nie je nainštalované"}</strong><br /><span className="small muted">Voliteľné stiahnutie približne {status?.candidate.approximateSizeMb ?? 639} MB</span></div>
      {!status?.installed ? <button className="button self-start" disabled={busy} onClick={() => void action("POST")}><Download size={16} />{busy ? "Sťahujem…" : "Stiahnuť"}</button> : <button className="button secondary self-start" disabled={busy} onClick={() => { if (window.confirm("Odstrániť voliteľné inteligentné rozpoznávanie? Ostatné funkcie Molotu zostanú dostupné.")) void action("DELETE"); }}><Trash2 size={16} />Odstrániť</button>}
      {message && <p className="small" role="status">{message}</p>}
    </div>
  </Card>;
}
