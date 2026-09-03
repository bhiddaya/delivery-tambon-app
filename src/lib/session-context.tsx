"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Tables } from "@/lib/types";

export type SessionValue = {
  userId: string;
  email: string | null;
  profile: Tables<"profiles">;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  value,
  children,
}: {
  value: SessionValue;
  children: ReactNode;
}) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
