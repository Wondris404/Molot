"use client";
import { useState, type FormEvent } from "react";
import { Download, HardDrive, SlidersHorizontal } from "lucide-react";
import type { Settings } from "@/lib/types";
import { useApp } from "../app-provider";
import { ModelSettings } from "../intelligence/model-settings";
import { MiniAiSettings } from "../mini-ai-settings";
import {
  AddButton,
  Card,
  EmptyState,
  PageHeading,
  RowActions,
  SubjectBadge,
} from "../ui";

function ProfileForm() {
  const { data, saveGlobal } = useApp();
  const [name, setName] = useState(data?.profile.name ?? "");
  const [mainGoal, setMainGoal] = useState(data?.profile.mainGoal ?? "");
  const [modules, setModules] = useState(data?.profile.modules ?? ["school"]);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      if (!data) return;
      await saveGlobal("profile", { name, mainGoal, modules, onboardingComplete: true });
    }
    finally { setBusy(false); }
  }
  return <form className="stack" onSubmit={submit}><label className="field">Meno<input required value={name} onChange={(e) => setName(e.target.value)} /></label><label className="field">Hlavný cieľ<input value={mainGoal} onChange={(e) => setMainGoal(e.target.value)} placeholder="Voliteľné" /></label><fieldset className="check-list"><legend>Aktívne oblasti</legend>{[["school","Škola"],["work","Práca"],["personal","Osobné ciele / hobby"]].map(([id,label]) => <label key={id}><input type="checkbox" checked={modules.includes(id as "school" | "work" | "personal")} onChange={() => setModules((current) => current.includes(id as "school" | "work" | "personal") ? current.filter((item) => item !== id) : [...current, id as "school" | "work" | "personal"])} />{label}</label>)}</fieldset><button className="button self-start" disabled={busy || !modules.length}>{busy ? "Ukladám…" : "Uložiť profil"}</button></form>;
}

function PreferencesForm({ settings }: { settings: Settings }) {
  const { save } = useApp();
  const [values, setValues] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await save("settings", { ...values }, "local");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Uloženie zlyhalo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <fieldset className="form-grid" disabled={busy}>
        <label className="field">
          Denný cieľ učenia (min)
          <input
            type="number"
            min={1}
            max={1440}
            required
            value={values.dailyGoalMinutes}
            onChange={(e) =>
              setValues({ ...values, dailyGoalMinutes: Number(e.target.value) })
            }
          />
        </label>
        <label className="field">
          Predvolený cieľ testu (%)
          <input
            type="number"
            min={0}
            max={100}
            required
            value={values.defaultTarget}
            onChange={(e) =>
              setValues({ ...values, defaultTarget: Number(e.target.value) })
            }
          />
        </label>
        <label className="field field-wide">
          Základný čas prípravy (min)
          <input
            type="number"
            min={15}
            max={10080}
            required
            value={values.baselineMinutes}
            onChange={(e) =>
              setValues({ ...values, baselineMinutes: Number(e.target.value) })
            }
          />
          <small className="muted">
            Východiskový koeficient algoritmu. Molot ho upraví podľa náročnosti,
            cieľa a neskôr tvojej histórie.
          </small>
        </label>
      </fieldset>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button type="submit" className="button" disabled={busy}>
          {busy ? "Ukladám…" : "Uložiť nastavenia"}
        </button>
      </div>
    </form>
  );
}
export function SettingsPage() {
  const { data } = useApp();
  if (!data) return null;
  function exportData() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            format: "molot-export",
            version: 1,
            exportedAt: new Date().toISOString(),
            data,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `molot-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <PageHeading
        eyebrow="TVOJ PRACOVNÝ PRIESTOR"
        title="Nastavenia"
        description="Predmety, vlastné ciele a lokálne ukladanie."
      />
      <div className="two-column">
        <Card title="Môj profil" subtitle="Lokálny profil bez online účtu"><ProfileForm /></Card>
        <Card title="O aplikácii">
          <div className="stack small muted"><p><strong className="text-[#d3ddcb]">MOLOT</strong></p><p>Created by Ondrej Lučivjanský-Wondris404</p><p>Open-source software. Tvoje údaje zostávajú uložené lokálne.</p></div>
        </Card>
        <MiniAiSettings />
        <ModelSettings />
        <Card
          title="Moje predmety"
          subtitle="Vlastné názvy a farby pre celý prehľad"
          action={
            <AddButton request={{ entity: "subjects" }}>
              Pridať predmet
            </AddButton>
          }
        >
          {data.subjects.length ? (
            data.subjects.map((subject) => (
              <div className="material-item" key={subject.id}>
                <SubjectBadge subject={subject} link />
                <RowActions
                  entity="subjects"
                  id={subject.id}
                  label={subject.name}
                />
              </div>
            ))
          ) : (
            <EmptyState
              title="Začni prvým predmetom."
              description="Predmety si vytváraš podľa vlastného rozvrhu."
            />
          )}
        </Card>
        <Card
          title="Ciele a odhady"
          action={<SlidersHorizontal size={18} className="muted" />}
        >
          <PreferencesForm
            key={JSON.stringify(data.settings)}
            settings={data.settings}
          />
        </Card>
        <Card
          title="Lokálne dáta"
          action={<HardDrive size={18} className="muted" />}
        >
          <div className="stack">
            <p className="small muted">
              Databáza sa vytvára automaticky pri prvom spustení. Dáta a
              materiály zostávajú lokálne. Presnú aktívnu cestu nájdeš vyššie v
              sekcii zálohovania.
            </p>
            <div className="hint-box">
              <strong>Databáza</strong>
              <br />
              <code>molot.sqlite v aktívnom dátovom priečinku</code>
              <br />
              <br />
              <strong>Nahrané materiály</strong>
              <br />
              <code>
                uploads/ a teacher-tests/ v aktívnom dátovom priečinku
              </code>
            </div>
            <p className="small muted">
              Na obnoviteľnú zálohu použi ZIP export vyššie. Tento doplnkový
              JSON export obsahuje iba základné školské záznamy; neobsahuje
              učiteľské dáta, modely ani súbory.
            </p>
            <button
              className="button secondary self-start"
              onClick={exportData}
            >
              <Download size={16} />
              Exportovať záznamy do JSON
            </button>
          </div>
        </Card>
        <Card title="Ako Molot počíta">
          <div className="stack small muted">
            <p>
              <strong className="text-[#d3ddcb]">Známky.</strong> Vážený priemer
              = súčet (známka × váha) / súčet váh. Celkový priemer počíta všetky
              známky spolu.
            </p>
            <p>
              <strong className="text-[#d3ddcb]">Výsledky.</strong> Zadané body
              majú prednosť pred percentami. Výsledok testu sa do denníka známok
              pridáva samostatne.
            </p>
            <p>
              <strong className="text-[#d3ddcb]">Pripravenosť.</strong> Aktuálna
              hodnota je najnovší časový záznam. Predošlé záznamy zostávajú
              uložené.
            </p>
            <p>
              <strong className="text-[#d3ddcb]">Chyby.</strong> Úspešnosť sa
              počíta len z ručne označených správnych a nesprávnych odpovedí.
            </p>
            <p>
              <strong className="text-[#d3ddcb]">Odporúčanie.</strong> Ide o
              deterministický odhad alebo overený osobný regresný model. Zdroj,
              rozsah, istotu a vysvetlenie uvidíš pri teste. Odhad nie je záruka
              výsledku.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
