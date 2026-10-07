import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { unitsOptions, type Unit } from "@/lib/queries";

const STORAGE_KEY = "inventario:unit";

type UnitState = {
  units: Unit[];
  unitId: string | null;
  unit: Unit | null;
  loading: boolean;
  locked: boolean;
  setUnitId: (id: string) => void;
};

// Keep one context instance across hot reloads so provider and consumers match.
const globalKey = "__inventarioUnitContext" as const;
const g = globalThis as unknown as Record<string, ReturnType<typeof createContext<UnitState | undefined>> | undefined>;
const UnitContext = g[globalKey] ?? (g[globalKey] = createContext<UnitState | undefined>(undefined));

export function UnitProvider({ children }: { children: ReactNode }) {
  const { profile, role } = useAuth();
  const locked = role === "responsavel";
  const viewer = role === "visualizador";
  const { data: units = [], isLoading } = useQuery(unitsOptions(false));
  const [stored, setStored] = useState<string | null>(null);

  useEffect(() => {
    try {
      setStored(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      setStored(null);
    }
  }, []);

  const unitId = useMemo(() => {
    if (viewer) {
      if (stored && units.some((u) => u.id === stored)) return stored;
      return units[0]?.id ?? null;
    }
    if (locked && profile?.unit_id) return profile.unit_id;
    if (stored && units.some((u) => u.id === stored)) return stored;
    return units[0]?.id ?? null;
  }, [locked, profile?.unit_id, stored, units, viewer]);

  const setUnitId = (id: string) => {
    if (locked || (viewer && !units.some((u) => u.id === id))) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* armazenamento indisponível */
    }
    setStored(id);
  };

  const value = useMemo<UnitState>(
    () => ({
      units,
      unitId,
      unit: units.find((u) => u.id === unitId) ?? null,
      loading: isLoading,
      locked,
      setUnitId,
    }),
    [units, unitId, isLoading, locked, viewer],
  );

  return <UnitContext.Provider value={value}>{children}</UnitContext.Provider>;
}

export function useUnit() {
  const ctx = useContext(UnitContext);
  if (!ctx) throw new Error("useUnit deve ser usado dentro de UnitProvider");
  return ctx;
}
