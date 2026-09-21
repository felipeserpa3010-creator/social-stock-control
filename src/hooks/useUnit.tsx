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

const UnitContext = createContext<UnitState | undefined>(undefined);

export function UnitProvider({ children }: { children: ReactNode }) {
  const { profile, role } = useAuth();
  const locked = role === "responsavel";
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
    if (locked && profile?.unit_id) return profile.unit_id;
    if (stored && units.some((u) => u.id === stored)) return stored;
    return units[0]?.id ?? null;
  }, [locked, profile?.unit_id, stored, units]);

  const setUnitId = (id: string) => {
    if (locked) return;
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
    [units, unitId, isLoading, locked],
  );

  return <UnitContext.Provider value={value}>{children}</UnitContext.Provider>;
}

export function useUnit() {
  const ctx = useContext(UnitContext);
  if (!ctx) throw new Error("useUnit deve ser usado dentro de UnitProvider");
  return ctx;
}
