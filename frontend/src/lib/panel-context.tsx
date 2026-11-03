"use client";

import { createContext, useContext } from "react";
import type { PanelRole } from "@/lib/session";

export interface PanelInfo {
  hotelId: string;
  role: PanelRole;
  base: string; // "/boshliq" or "/meneger"
}

const PanelContext = createContext<PanelInfo | null>(null);

export function PanelProvider({ value, children }: { value: PanelInfo; children: React.ReactNode }) {
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanel(): PanelInfo {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error("usePanel must be used inside /boshliq or /meneger");
  return ctx;
}
