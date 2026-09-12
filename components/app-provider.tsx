"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Entity, Snapshot } from "@/lib/types";
import type { GlobalEntity } from "@/lib/global";

export interface EditorRequest {
  entity: Entity;
  id?: string;
  subjectId?: string;
  testId?: string;
  materialId?: string;
}
export interface DeleteRequest {
  entity: Entity | "materials";
  id: string;
  label: string;
}
interface AppContextValue {
  data: Snapshot | null;
  loading: boolean;
  error: string;
  notice: string;
  refresh: () => Promise<void>;
  save: (
    entity: Entity,
    values: Record<string, unknown>,
    id?: string,
  ) => Promise<string>;
  saveGlobal: (
    entity: GlobalEntity,
    values: Record<string, unknown>,
    id?: string,
  ) => Promise<string>;
  removeGlobal: (entity: "goals" | "progress" | "milestones", id: string) => Promise<void>;
  remove: (request: DeleteRequest) => Promise<void>;
  notify: (message: string) => void;
  editor: EditorRequest | null;
  setEditor: (request: EditorRequest | null) => void;
  deletion: DeleteRequest | null;
  setDeletion: (request: DeleteRequest | null) => void;
  quickAddOpen: boolean;
  setQuickAddOpen: (open: boolean) => void;
}
const AppContext = createContext<AppContextValue | null>(null);

export async function apiRequest(
  url: string,
  init?: RequestInit,
): Promise<{ id?: string }> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      typeof result.error === "string" ? result.error : "Operácia zlyhala.",
    );
  return result;
}
export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<EditorRequest | null>(null);
  const [deletion, setDeletion] = useState<DeleteRequest | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const refresh = useCallback(async () => {
    const response = await fetch("/api/data", {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const snapshot = await response.json();
    if (!response.ok)
      throw new Error(snapshot.error || "Údaje sa nepodarilo načítať.");
    setData(snapshot as Snapshot);
    setError("");
  }, []);
  useEffect(() => {
    const sync = () => {
      void refresh()
        .catch((error) =>
          setError(
            error instanceof Error ? error.message : "Server nie je dostupný.",
          ),
        )
        .finally(() => setLoading(false));
    };
    sync();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timeout);
  }, [notice]);
  async function syncAfterSave() {
    try {
      await refresh();
    } catch {
      setError(
        "Zmena je uložená, ale prehľad sa nepodarilo obnoviť. Obnov stránku.",
      );
    }
  }
  async function save(
    entity: Entity,
    values: Record<string, unknown>,
    id?: string,
  ) {
    const result = await apiRequest(`/api/data/${entity}`, {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, ...(id ? { id } : {}) }),
    });
    await syncAfterSave();
    setNotice("Zmeny sú uložené.");
    return result.id ?? "";
  }
  async function remove(request: DeleteRequest) {
    await apiRequest(
      request.entity === "materials"
        ? `/api/materials/${request.id}`
        : `/api/data/${request.entity}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: request.id }),
      },
    );
    await syncAfterSave();
    setNotice("Záznam bol odstránený.");
  }
  async function saveGlobal(
    entity: GlobalEntity,
    values: Record<string, unknown>,
    id?: string,
  ) {
    const result = await apiRequest(`/api/global/${entity}`, {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, ...(id ? { id } : {}) }),
    });
    await syncAfterSave();
    setNotice("Zmeny sú uložené.");
    return result.id ?? "";
  }
  async function removeGlobal(entity: "goals" | "progress" | "milestones", id: string) {
    await apiRequest(`/api/global/${entity}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await syncAfterSave();
    setNotice("Záznam bol odstránený.");
  }
  return (
    <AppContext.Provider
      value={{
        data,
        loading,
        error,
        notice,
        refresh,
        save,
        saveGlobal,
        removeGlobal,
        remove,
        notify: setNotice,
        editor,
        setEditor,
        deletion,
        setDeletion,
        quickAddOpen,
        setQuickAddOpen,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("AppProvider is missing.");
  return context;
}
