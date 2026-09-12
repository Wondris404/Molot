export type TestStatus = "planned" | "preparing" | "written" | "evaluated";
export type ErrorType =
  | "knowledge"
  | "forgotten"
  | "careless"
  | "misunderstood"
  | "calculation"
  | "terminology"
  | "other";
export interface BaseRecord {
  id: string;
  createdAt: string;
}
export interface Subject extends BaseRecord {
  name: string;
  color: string;
}
export interface Grade extends BaseRecord {
  subjectId: string;
  value: number;
  weight: number;
  date: string;
  description: string;
  assessmentType: string;
}
export interface Test extends BaseRecord {
  subjectId: string;
  title: string;
  date: string;
  time: string;
  topics: string;
  notes: string;
  difficulty: number;
  targetPercent: number;
  plannedMinutes: number;
  status: TestStatus;
}
export interface TestResult extends BaseRecord {
  testId: string;
  earnedPoints: number | null;
  maxPoints: number | null;
  percentage: number;
  grade: number | null;
  actualStudyMinutes: number;
  readinessBefore: number;
  perceivedDifficulty: number;
  note: string;
  recommendedMinutes: number;
}
export interface StudySession extends BaseRecord {
  subjectId: string;
  testId: string | null;
  date: string;
  startTime: string;
  minutes: number;
  topic: string;
  note: string;
}
export interface ReadinessEntry extends BaseRecord {
  testId: string;
  percent: number;
  recordedAt: string;
  note: string;
}
export interface UploadedMaterial extends BaseRecord {
  subjectId: string;
  testId: string | null;
  name: string;
  storageName: string;
  mimeType: string;
  size: number;
}
export interface ErrorEntry extends BaseRecord {
  subjectId: string;
  testId: string | null;
  materialId: string | null;
  question: string;
  topic: string;
  subtopic: string;
  answer: string;
  isCorrect: boolean;
  errorType: ErrorType;
  note: string;
  date: string;
}
export interface Settings {
  id: string;
  dailyGoalMinutes: number;
  baselineMinutes: number;
  defaultTarget: number;
}
export type ModuleType = "school" | "work" | "personal";
export type GoalCategory = ModuleType;
export type GoalStatus = "active" | "completed" | "paused";
export interface Profile {
  id: "local";
  name: string;
  modules: ModuleType[];
  mainGoal: string;
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface Goal extends BaseRecord {
  name: string;
  category: GoalCategory;
  description: string;
  targetValue: number | null;
  currentValue: number;
  unit: string;
  deadline: string | null;
  status: GoalStatus;
  updatedAt: string;
}
export interface ProgressEntry extends BaseRecord {
  goalId: string;
  date: string;
  value: number | null;
  unit: string;
  activity: string;
  note: string;
}
export interface Milestone extends BaseRecord {
  goalId: string;
  name: string;
  completed: boolean;
  dueDate: string | null;
  updatedAt: string;
}
export interface GoalAttachment extends BaseRecord {
  goalId: string;
  name: string;
  storageName: string;
  mimeType: string;
  size: number;
}
export interface Snapshot {
  subjects: Subject[];
  grades: Grade[];
  tests: Test[];
  results: TestResult[];
  sessions: StudySession[];
  readiness: ReadinessEntry[];
  materials: UploadedMaterial[];
  errors: ErrorEntry[];
  settings: Settings;
  profile: Profile;
  goals: Goal[];
  progressEntries: ProgressEntry[];
  milestones: Milestone[];
  goalAttachments: GoalAttachment[];
}
export type Entity =
  | "subjects"
  | "grades"
  | "tests"
  | "results"
  | "sessions"
  | "readiness"
  | "errors"
  | "settings";
export const statusLabels: Record<TestStatus, string> = {
  planned: "Plánovaný",
  preparing: "Pripravujem sa",
  written: "Napísaný",
  evaluated: "Vyhodnotený",
};
export const errorLabels: Record<ErrorType, string> = {
  knowledge: "Nevedomosť",
  forgotten: "Zabudnutie",
  careless: "Neopatrnosť",
  misunderstood: "Nepochopenie otázky",
  calculation: "Výpočet",
  terminology: "Terminológia",
  other: "Iné",
};
