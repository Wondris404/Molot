import type { Snapshot, Entity } from "@/lib/types";
import { errorLabels, statusLabels } from "@/lib/types";
import { currentReadiness, studiedMinutes } from "@/lib/analytics";
import { localDate } from "@/lib/format";
import type { EditorRequest } from "./app-provider";

export type FormValues = Record<string, string>;
export interface FieldSpec {
  name: string;
  label: string;
  type:
    | "text"
    | "number"
    | "date"
    | "time"
    | "datetime-local"
    | "color"
    | "textarea"
    | "select"
    | "range";
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  wide?: boolean;
  hint?: string;
  disabled?: boolean;
}
export const entityNames: Record<Entity, string> = {
  subjects: "predmet",
  grades: "známku",
  tests: "test",
  results: "výsledok testu",
  sessions: "učenie",
  readiness: "pripravenosť",
  errors: "odpoveď / chybu",
  settings: "nastavenia",
};

function dateTimeLocal(value: string): string {
  const date = new Date(value);
  return `${localDate(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}
export function initialValues(
  request: EditorRequest,
  data: Snapshot,
): FormValues {
  const record =
    request.entity === "settings"
      ? data.settings
      : request.id
        ? data[request.entity].find((item) => item.id === request.id)
        : undefined;
  if (record) {
    const values = Object.fromEntries(
      Object.entries(record).map(([key, value]) => [
        key,
        value == null ? "" : String(value),
      ]),
    );
    if (request.entity === "readiness")
      values.recordedAt = dateTimeLocal(values.recordedAt);
    return values;
  }
  const test = data.tests.find((test) => test.id === request.testId);
  const subjectId =
    request.subjectId || test?.subjectId || data.subjects[0]?.id || "";
  const common = {
    subjectId,
    testId: request.testId || "",
    date: localDate(),
    note: "",
  };
  switch (request.entity) {
    case "subjects":
      return { name: "", color: "#c5ef79" };
    case "grades":
      return {
        ...common,
        value: "1",
        weight: "1",
        description: "",
        assessmentType: "Písomka",
      };
    case "tests":
      return {
        ...common,
        title: "",
        time: "",
        topics: "",
        notes: "",
        difficulty: "3",
        targetPercent: String(data.settings.defaultTarget),
        plannedMinutes: "0",
        status: "planned",
        initialReadiness: "",
      };
    case "sessions":
      return { ...common, startTime: "", minutes: "30", topic: "" };
    case "readiness":
      return {
        ...common,
        percent: String(test ? (currentReadiness(data, test.id) ?? 0) : 0),
        recordedAt: dateTimeLocal(new Date().toISOString()),
      };
    case "results":
      return {
        ...common,
        earnedPoints: "",
        maxPoints: "",
        percentage: "",
        grade: "",
        actualStudyMinutes: String(test ? studiedMinutes(data, test.id) : 0),
        readinessBefore: String(
          test ? (currentReadiness(data, test.id) ?? 0) : 0,
        ),
        perceivedDifficulty: String(test?.difficulty ?? 3),
      };
    case "errors":
      return {
        ...common,
        materialId: request.materialId || "",
        question: "",
        topic: "",
        subtopic: "",
        answer: "",
        isCorrect: "false",
        errorType: "knowledge",
      };
    case "settings":
      return {};
  }
}
export function editorFields(
  request: EditorRequest,
  data: Snapshot,
  values: FormValues,
): FieldSpec[] {
  const subject: FieldSpec = {
    name: "subjectId",
    label: "Predmet",
    type: "select",
    required: true,
    options: data.subjects.map((subject) => ({
      value: subject.id,
      label: subject.name,
    })),
  };
  const test: FieldSpec = {
    name: "testId",
    label: "Súvisiaci test",
    type: "select",
    options: [
      { value: "", label: "Bez priradenia" },
      ...data.tests
        .filter(
          (test) => !values.subjectId || test.subjectId === values.subjectId,
        )
        .map((test) => ({ value: test.id, label: test.title })),
    ],
  };
  const date: FieldSpec = {
    name: "date",
    label: "Dátum",
    type: "date",
    required: true,
  };
  const note: FieldSpec = {
    name: "note",
    label: "Poznámka",
    type: "textarea",
    wide: true,
  };
  const number = (
    name: string,
    label: string,
    min: number,
    max: number,
    required = true,
  ): FieldSpec => ({
    name,
    label,
    type: "number",
    min,
    max,
    step: 1,
    required,
  });
  switch (request.entity) {
    case "subjects":
      return [
        { name: "name", label: "Názov predmetu", type: "text", required: true },
        {
          name: "color",
          label: "Farba predmetu",
          type: "color",
          required: true,
        },
      ];
    case "grades":
      return [
        subject,
        number("value", "Známka", 1, 5),
        { ...number("weight", "Váha", 0.01, 100), step: 0.01 },
        date,
        {
          name: "assessmentType",
          label: "Typ hodnotenia",
          type: "text",
          required: true,
          hint: "Napr. písomka, ústna odpoveď, projekt",
        },
        { name: "description", label: "Popis", type: "textarea", wide: true },
      ];
    case "tests":
      return [
        {
          name: "title",
          label: "Názov testu",
          type: "text",
          required: true,
          wide: true,
        },
        subject,
        date,
        { name: "time", label: "Čas testu (voliteľný)", type: "time" },
        number("difficulty", "Odhadovaná náročnosť (1–5)", 1, 5),
        number("targetPercent", "Cieľový výsledok (%)", 0, 100),
        number("plannedMinutes", "Plánovaný čas učenia (min)", 0, 100000),
        {
          name: "status",
          label: "Stav",
          type: "select",
          required: true,
          options: Object.entries(statusLabels)
            .filter(
              ([value]) =>
                value !== "evaluated" || values.status === "evaluated",
            )
            .map(([value, label]) => ({ value, label })),
        },
        ...(!request.id
          ? [
              {
                ...number(
                  "initialReadiness",
                  "Úvodná pripravenosť (%)",
                  0,
                  100,
                  false,
                ),
                hint: "Nechaj prázdne, ak ju zatiaľ nevieš odhadnúť.",
              },
            ]
          : []),
        {
          name: "topics",
          label: "Témy",
          type: "textarea",
          wide: true,
          hint: "Jednotlivé témy oddeľ čiarkou alebo novým riadkom.",
        },
        { name: "notes", label: "Poznámky", type: "textarea", wide: true },
      ];
    case "sessions":
      return [
        subject,
        test,
        date,
        { name: "startTime", label: "Čas začiatku (voliteľný)", type: "time" },
        number("minutes", "Dĺžka učenia (min)", 1, 100000),
        { name: "topic", label: "Téma učenia", type: "text" },
        note,
      ];
    case "readiness":
      return [
        {
          ...test,
          required: true,
          disabled: Boolean(request.testId || request.id),
          options: test.options?.filter((option) => option.value),
        },
        {
          name: "recordedAt",
          label: "Čas záznamu",
          type: "datetime-local",
          required: true,
          step: 1,
        },
        {
          name: "percent",
          label: "Pripravenosť",
          type: "range",
          min: 0,
          max: 100,
          step: 1,
          wide: true,
        },
        note,
      ];
    case "results":
      return [
        {
          ...test,
          required: true,
          wide: true,
          disabled: Boolean(request.testId || request.id),
          options: test.options?.filter((option) => option.value),
        },
        {
          ...number(
            "earnedPoints",
            "Získané body (voliteľné)",
            0,
            1000000,
            false,
          ),
          step: 0.01,
        },
        {
          ...number(
            "maxPoints",
            "Maximálne body (voliteľné)",
            0.01,
            1000000,
            false,
          ),
          step: 0.01,
        },
        {
          ...number("percentage", "Výsledok (%)", 0, 100),
          step: 0.01,
          disabled: values.earnedPoints !== "" && Number(values.maxPoints) > 0,
          hint: "Pri zadaní bodov sa vypočíta automaticky.",
        },
        number("grade", "Známka (voliteľná)", 1, 5, false),
        number("actualStudyMinutes", "Reálny čas učenia (min)", 0, 100000),
        number("readinessBefore", "Pripravenosť pred testom (%)", 0, 100),
        number("perceivedDifficulty", "Skutočná náročnosť (1–5)", 1, 5),
        note,
      ];
    case "errors":
      return [
        subject,
        test,
        {
          name: "materialId",
          label: "Materiál (voliteľný)",
          type: "select",
          wide: true,
          options: [
            { value: "", label: "Bez materiálu" },
            ...data.materials
              .filter(
                (material) =>
                  material.subjectId === values.subjectId &&
                  (!material.testId || material.testId === values.testId),
              )
              .map((material) => ({
                value: material.id,
                label: material.name,
              })),
          ],
        },
        {
          name: "question",
          label: "Otázka / číslo úlohy",
          type: "text",
          required: true,
          wide: true,
        },
        { name: "topic", label: "Téma", type: "text", required: true },
        { name: "subtopic", label: "Podtéma", type: "text" },
        {
          name: "answer",
          label: "Moja odpoveď / výsledok",
          type: "textarea",
          wide: true,
        },
        {
          name: "isCorrect",
          label: "Správnosť odpovede",
          type: "select",
          options: [
            { value: "false", label: "Nesprávne" },
            { value: "true", label: "Správne" },
          ],
        },
        {
          name: "errorType",
          label: "Typ chyby",
          type: "select",
          disabled: values.isCorrect === "true",
          options: Object.entries(errorLabels).map(([value, label]) => ({
            value,
            label,
          })),
        },
        date,
        note,
      ];
    case "settings":
      return [
        number("dailyGoalMinutes", "Denný cieľ učenia (min)", 1, 1440),
        number("baselineMinutes", "Základný čas prípravy (min)", 15, 10080),
        number("defaultTarget", "Predvolený cieľ testov (%)", 0, 100),
      ];
  }
}
export function editorPayload(
  entity: Entity,
  values: FormValues,
): Record<string, unknown> {
  const numeric = new Set([
    "value",
    "weight",
    "difficulty",
    "targetPercent",
    "plannedMinutes",
    "initialReadiness",
    "minutes",
    "percent",
    "earnedPoints",
    "maxPoints",
    "percentage",
    "grade",
    "actualStudyMinutes",
    "readinessBefore",
    "perceivedDifficulty",
    "dailyGoalMinutes",
    "baselineMinutes",
    "defaultTarget",
  ]);
  const nullable = new Set([
    "testId",
    "materialId",
    "earnedPoints",
    "maxPoints",
    "grade",
    "initialReadiness",
  ]);
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (nullable.has(key) && value === "") payload[key] = null;
    else if (numeric.has(key))
      payload[key] = value === "" ? undefined : Number(value);
    else if (key === "isCorrect") payload[key] = value === "true";
    else payload[key] = value;
  }
  if (entity === "readiness")
    payload.recordedAt = new Date(values.recordedAt).toISOString();
  return payload;
}
