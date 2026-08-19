"use client";
import { useEffect, useState } from "react";

export type ApiState<T> =
  | { status: "loading" }
  | { status: "error"; kind: "db" | "notfound" | "other"; message: string }
  | { status: "ready"; data: T };

/** Fetch a JSON API route and expose loading / error / data states. */
export function useApi<T>(path: string | null): ApiState<T> {
  // state is keyed by the path it belongs to; a stale key derives to "loading"
  // without needing a synchronous reset inside the effect
  const [result, setResult] = useState<{ path: string; state: ApiState<T> } | null>(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(path);
        const body = await res.json();
        if (cancelled) return;
        if (body.ok) {
          setResult({ path, state: { status: "ready", data: body.data as T } });
        } else {
          const kind =
            body.error === "database_unavailable" ? "db" : body.error === "not_found" ? "notfound" : "other";
          setResult({ path, state: { status: "error", kind, message: body.message ?? "Request failed." } });
        }
      } catch {
        if (!cancelled) {
          setResult({
            path,
            state: { status: "error", kind: "other", message: "Network error — please retry." },
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path || result?.path !== path) return { status: "loading" };
  return result.state;
}

export function formatDownloads(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}
