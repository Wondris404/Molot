"use client";
import { useRef, useState } from "react";
import { Card } from "../ui";
import { useApp } from "../app-provider";
import { useIntelligence, intelligenceRequest } from "./use-intelligence";
import { SimpleForm } from "./simple-form";
import type { FieldSpec } from "../editor-config";
export function ModelSettings() {
  const { data, error, refresh } = useIntelligence();
  const { refresh: refreshSchool } = useApp();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const file = useRef<HTMLInputElement>(null);
  if (!data)
    return <Card title="Modely a zálohy">{error || "Načítavam…"}</Card>;
  const active = data.modelStatus.models.find((m) => m.active);
  const fields: FieldSpec[] = Object.entries({
    frequency: "Výskyt témy",
    recency: "Aktuálnosť",
    points: "Bodová váha",
    repetition: "Opakovanie otázok",
    material: "Dôležitosť v učive",
  }).map(([name, label]) => ({
    name,
    label,
    type: "number",
    min: 0,
    max: 1,
    step: 0.05,
    required: true,
  }));
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operácia zlyhala.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Card
        title="Student Performance — stav modelu"
        subtitle={
          active
            ? `Aktívny: ${active.version}`
            : "Baseline · personalizovaný model zatiaľ nie je aktívny"
        }
      >
        <p className="small muted">
          {data.modelStatus.sampleCount} dokončených testov. Tréning potrebuje
          aspoň 30 výsledkov z 12 dátumov. Automaticky sa spustí po 5 nových
          výsledkoch; môžeš ho spustiť aj manuálne.
        </p>
        {active && (
          <dl className="test-summary mt-5">
            <div>
              <dt>Algoritmus</dt>
              <dd>{active.algorithm}</dd>
            </div>
            <div>
              <dt>Vzorky</dt>
              <dd>{active.numberOfSamples}</dd>
            </div>
            <div>
              <dt>MAE</dt>
              <dd>{active.mae.toFixed(1)} p. b.</dd>
            </div>
            <div>
              <dt>RMSE</dt>
              <dd>{active.rmse.toFixed(1)} p. b.</dd>
            </div>
          </dl>
        )}
        <p className="small muted mt-5">
          Kandidáti Ridge a Random Forest sa vyberajú pomocou 3 časových
          validačných blokov. Posledných 20 % dátumov slúži na záverečné
          overenie. Aktivácia vyžaduje MAE do 15 bodov, aspoň 5 % zlepšenie
          proti baseline a nezhoršenie MAE aj RMSE oproti porovnaniu s
          doterajším algoritmom na rovnakých dátach.
        </p>
        <button
          className="button mt-5"
          disabled={busy || data.modelStatus.training}
          onClick={() =>
            void run(async () => {
              const result = await intelligenceRequest<{
                status: string;
                message?: string;
              }>({ operation: "train" });
              setMessage(
                result.message ||
                  (
                    {
                      activated: "Nový model bol overený a aktivovaný.",
                      rejected:
                        "Kandidát nesplnil kritériá aktivácie. Doterajší model alebo baseline zostáva aktívny.",
                    } as Record<string, string>
                  )[result.status] ||
                  result.status,
              );
            })
          }
        >
          {busy ? "Trénujem…" : "Pretrénovať model"}
        </button>
        {data.modelStatus.runs.map((r) => (
          <div className="material-item" key={r.id}>
            <div>
              <strong>{new Date(r.createdAt).toLocaleString("sk-SK")}</strong>
              <p className="small muted">
                {r.numberOfSamples} vzoriek ·{" "}
                {(
                  {
                    activated: "Aktivovaný",
                    rejected: "Neaktivovaný kandidát",
                    insufficient: "Nedostatok dát",
                    failed: "Chyba enginu",
                  } as Record<string, string>
                )[r.status] || r.status}
              </p>
            </div>
            <span>
              {r.payload.mae === undefined
                ? r.payload.message
                : `MAE ${r.payload.mae.toFixed(1)} · RMSE ${r.payload.rmse?.toFixed(1)}`}
            </span>
          </div>
        ))}
        {message && (
          <p role="status" className="hint-box mt-5">
            {message}
          </p>
        )}
      </Card>
      <Card
        title="Váhy učiteľských tém"
        subtitle="Váhy sa pri výpočte normalizujú na súčet 1"
      >
        <SimpleForm
          key={JSON.stringify(data.weights)}
          fields={fields}
          initial={{ ...data.weights }}
          onSave={async (values) => {
            await intelligenceRequest({ operation: "weights", values });
            await refresh();
          }}
        />
      </Card>
      <Card
        title="Úplná lokálna záloha"
        subtitle="Databáza, parametre modelov, nastavenia a materiály"
      >
        <p className="small muted">
          Export vytvorí ZIP aj kópiu v priečinku backups. Import najprv overí
          schému a súbory, vytvorí zálohu súčasného stavu a potom obnoví záznamy
          v transakcii. Limit tejto verzie je 100 MB.
        </p>
        <div className="inline mt-5">
          <a className="button" href="/api/backup">
            Exportovať zálohu ZIP
          </a>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => file.current?.click()}
          >
            Importovať zálohu
          </button>
          <input
            ref={file}
            type="file"
            hidden
            accept=".zip"
            onChange={(e) => {
              const backup = e.target.files?.[0];
              e.target.value = "";
              if (
                !backup ||
                !window.confirm(
                  "Nahradiť aktuálne záznamy obsahom tejto zálohy? Pred obnovou sa automaticky uloží úplná záloha súčasného stavu.",
                )
              )
                return;
              void run(async () => {
                const response = await fetch("/api/backup", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/zip",
                    "x-molot-confirm-restore": "yes",
                  },
                  body: backup,
                  signal: AbortSignal.timeout(120000),
                });
                const value = await response.json();
                if (!response.ok) throw new Error(value.error);
                await refreshSchool();
                window.dispatchEvent(new Event("molot-intelligence"));
                setMessage(
                  `Záloha obnovená. Predchádzajúci stav: ${value.previousBackup}`,
                );
              });
            }}
          />
        </div>
        <p className="small muted mt-5">
          Dáta: <code>{data.paths.data}</code>
          <br />
          Modely: <code>{data.paths.models}</code>
        </p>
      </Card>
    </>
  );
}
