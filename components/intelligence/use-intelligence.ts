"use client";
import { useCallback, useEffect, useState } from "react";
import type { TeacherSnapshot } from "@/ml/teacher/types";
export interface IntelligenceSnapshot extends TeacherSnapshot {
  paths: { data: string; models: string };
  modelStatus: {
    sampleCount: number;
    minimumSamples: number;
    retrainEvery: number;
    training: boolean;
    models: {
      id: string;
      version: string;
      createdAt: string;
      numberOfSamples: number;
      features: string;
      algorithm: string;
      mae: number;
      rmse: number;
      validationMethod: string;
      active: number;
    }[];
    runs: {
      id: string;
      createdAt: string;
      status: string;
      numberOfSamples: number;
      payload: {
        message?: string;
        mae?: number;
        rmse?: number;
        baselineMae?: number;
      };
    }[];
  };
}
export async function intelligenceRequest<T>(
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch("/api/intelligence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Operácia zlyhala.");
  window.dispatchEvent(new Event("molot-intelligence"));
  return value as T;
}
export function useIntelligence() {
  const [data, setData] = useState<IntelligenceSnapshot | null>(null),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/intelligence", {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setData(value);
      setError("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Analytické údaje nie sú dostupné.",
      );
    }
  }, []);
  useEffect(() => {
    const reload = () => {
      void refresh();
    };
    reload();
    window.addEventListener("molot-intelligence", reload);
    window.addEventListener("focus", reload);
    return () => {
      window.removeEventListener("molot-intelligence", reload);
      window.removeEventListener("focus", reload);
    };
  }, [refresh]);
  return { data, error, refresh };
}
