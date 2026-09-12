import type { BaseRecord } from "../../lib/types";
export interface Teacher extends BaseRecord {
  subjectId: string;
  name: string;
  schoolYear: string;
  notes: string;
}
export interface TeacherDocument extends BaseRecord {
  teacherId: string | null;
  subjectId: string;
  kind: "test" | "notes";
  title: string;
  year: string;
  date: string;
  chapter: string;
  topics: string;
  testType: string;
  totalQuestions: number | null;
  totalPoints: number | null;
  source: string;
  notes: string;
  storageName: string | null;
  mimeType: string | null;
  text: string;
  parseStatus: string;
}
export const questionTypes = {
  multiple_choice: "Výber odpovede",
  short_answer: "Krátka odpoveď",
  definition: "Definícia",
  explanation: "Vysvetlenie",
  calculation: "Výpočet",
  comparison: "Porovnanie",
  diagram: "Diagram",
  fill_in: "Doplňovanie",
  essay: "Esej",
  true_false: "Pravda / nepravda",
};
export interface TeacherQuestion extends BaseRecord {
  documentId: string;
  text: string;
  topic: string;
  subtopic: string;
  questionType: keyof typeof questionTypes;
  points: number | null;
  keywords: string;
}
export interface MaterialTopic extends BaseRecord {
  documentId: string;
  name: string;
  keywords: string;
  importance: number;
}
export interface TestIntelligence {
  testId: string;
  teacherId: string | null;
  materialIds: string;
}
export interface TeacherPrediction extends BaseRecord {
  testId: string;
  teacherId: string | null;
  payload: string;
  actualTopics: string | null;
  actualStyles: string | null;
  precision: number | null;
  recall: number | null;
  stylePrecision: number | null;
  styleRecall: number | null;
}
export interface TopicWeights {
  frequency: number;
  recency: number;
  points: number;
  repetition: number;
  material: number;
}
export interface TeacherSnapshot {
  teachers: Teacher[];
  documents: TeacherDocument[];
  questions: TeacherQuestion[];
  topics: MaterialTopic[];
  links: TestIntelligence[];
  predictions: TeacherPrediction[];
  weights: TopicWeights;
}
export interface TopicEvidence {
  name: string;
  score: number;
  count: number;
  totalTests: number;
  points: number;
  recency: number;
  repeated: number;
  materialImportance: number;
  priority: "Vysoká" | "Stredná" | "Nízka";
  evidence: string;
}
export interface TeacherAnalysis {
  topics: TopicEvidence[];
  styles: { name: string; type: string; count: number; percent: number }[];
  testCount: number;
  confidence: "Nízka" | "Stredná" | "Vysoká";
  timeline: { name: string; count: number; points: number }[];
  repetitions: { firstId: string; secondId: string; similarity: number }[];
}
