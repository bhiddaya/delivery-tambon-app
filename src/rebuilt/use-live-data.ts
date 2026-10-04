"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useLiveData<T>(loader: () => Promise<T>, tables = "") {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [source, setSource] = useState<{ loader: () => Promise<T> } | null>(null);
  const refresh = useCallback(() => { setLoading(true); setVersion(v => v + 1); }, []);

  useEffect(() => {
    let stopped = false;
    let latest = 0;
    const load = async () => {
      const request = ++latest;
      try {
        const result = await loader();
        if (!stopped && request === latest) { setData(result); setError(false); setUpdated(new Date()); setSource({ loader }); }
      } catch {
        if (!stopped && request === latest) { setError(true); setSource({ loader }); }
      } finally {
        if (!stopped && request === latest) setLoading(false);
      }
    };
    void load();
    const supabase = createClient();
    let channel = supabase.channel(`rebuilt-${crypto.randomUUID()}`);
    for (const table of tables.split(",").filter(Boolean)) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, load);
    }
    if (tables) channel.subscribe();
    window.addEventListener("online", load);
    return () => { stopped = true; window.removeEventListener("online", load); void supabase.removeChannel(channel); };
  }, [loader, tables, version]);

  const current = source?.loader === loader;
  return { data: current ? data : null, loading: loading || !current, error: current && error, refresh, updated: current ? updated : null };
}
