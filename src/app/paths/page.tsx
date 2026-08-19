"use client";
import { useState } from "react";
import { Chain, DbErrorState, EmptyState } from "@/components/ui";

interface PathResult {
  chain: string[];
}

export default function PathsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; kind: "db" | "other"; message: string }
    | { status: "ready"; paths: PathResult[] }
  >({ status: "idle" });

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!from.trim() || !to.trim()) return;
    setState({ status: "loading" });
    try {
      const res = await fetch(
        `/api/paths?from=${encodeURIComponent(from.trim())}&to=${encodeURIComponent(to.trim())}`
      );
      const body = await res.json();
      if (body.ok) setState({ status: "ready", paths: body.data });
      else
        setState({
          status: "error",
          kind: body.error === "database_unavailable" ? "db" : "other",
          message: body.message ?? "Request failed.",
        });
    } catch {
      setState({ status: "error", kind: "other", message: "Network error — please retry." });
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="pt-2 text-center">
        <h1 className="text-2xl font-semibold">How am I exposed?</h1>
        <p className="mt-1 text-sm text-[var(--ink-2)]">
          Find the shortest dependency chain from one package to another — e.g. how{" "}
          <em>next</em> ends up pulling in <em>picocolors</em>.
        </p>
      </header>

      <form onSubmit={run} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs text-[var(--muted)]">
          From (the package you use)
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="next"
            className="mt-1 w-full rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="flex-1 text-xs text-[var(--muted)]">
          To (the package you’re worried about)
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="picocolors"
            className="mt-1 w-full rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          />
        </label>
        <button
          type="submit"
          disabled={state.status === "loading" || !from.trim() || !to.trim()}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {state.status === "loading" ? "Tracing…" : "Trace path"}
        </button>
      </form>

      {state.status === "idle" && (
        <p className="text-center text-sm text-[var(--muted)]">
          Enter two package names to trace the chain between them.
        </p>
      )}
      {state.status === "error" &&
        (state.kind === "db" ? (
          <DbErrorState message={state.message} />
        ) : (
          <EmptyState title="Couldn’t trace that" body={state.message} />
        ))}
      {state.status === "ready" &&
        (state.paths.length === 0 ? (
          <EmptyState
            title="No dependency path found"
            body={`“${from.trim()}” doesn’t reach “${to.trim()}” within 6 hops in this snapshot — either it truly doesn’t depend on it, or one of the names isn’t in the graph.`}
          />
        ) : (
          <div className="card p-4">
            <h2 className="text-sm font-semibold">Shortest chain</h2>
            <div className="mt-3 space-y-2">
              {state.paths.map((p, i) => (
                <div key={i} className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
                  <Chain chain={p.chain} />
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-[var(--muted)]">
              {state.paths[0].chain.length - 1} hop
              {state.paths[0].chain.length - 1 > 1 ? "s" : ""} — found with Cypher’s{" "}
              <code>shortestPath()</code> over <code>DEPENDS_ON_PKG</code> edges.
            </p>
          </div>
        ))}
    </div>
  );
}
