"use client";
import { use, useState } from "react";
import { BlastGraph } from "@/components/BlastGraph";
import {
  DbErrorState,
  EmptyState,
  PackageLink,
  SeverityBadge,
  Skeleton,
} from "@/components/ui";
import { formatDownloads, useApi } from "@/lib/useApi";

interface Advisory {
  id: string;
  summary: string;
  severity: string;
  cvss: number | null;
  url: string;
  publishedAt: string;
  packageName: string;
  vulnerableRange: string;
}
interface Blast {
  nodes: Array<{ name: string; weeklyDownloads: number; distance: number; chains: number }>;
  edges: Array<{ from: string; to: string }>;
}

export default function AdvisoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = use(params);
  const id = decodeURIComponent(raw);
  const [hops, setHops] = useState(4);
  const advisory = useApi<Advisory>(`/api/advisory/${encodeURIComponent(id)}`);
  const blast = useApi<Blast>(`/api/advisory/${encodeURIComponent(id)}/blast?hops=${hops}`);

  if (advisory.status === "error") {
    if (advisory.kind === "db") return <DbErrorState message={advisory.message} />;
    if (advisory.kind === "notfound")
      return (
        <EmptyState
          title={`Advisory “${id}” isn’t in this snapshot`}
          body="Only advisories affecting the ~750 packages in the graph are loaded. Head back to the dashboard to browse the ones with the widest blast radius."
        />
      );
    return <EmptyState title="Something went wrong" body={advisory.message} />;
  }

  const affected = blast.status === "ready" ? blast.data.nodes.filter((n) => n.distance > 0) : [];

  return (
    <div className="space-y-6">
      {advisory.status === "ready" ? (
        <header className="card px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={advisory.data.severity} />
            <span className="text-xs text-[var(--muted)]">{advisory.data.id}</span>
            {advisory.data.publishedAt && (
              <span className="text-xs text-[var(--muted)]">
                · published {advisory.data.publishedAt.slice(0, 10)}
              </span>
            )}
          </div>
          <h1 className="mt-1 text-xl font-semibold">
            {advisory.data.summary || advisory.data.id}
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-2)]">
            Affects <PackageLink name={advisory.data.packageName} />{" "}
            <span className="text-[var(--muted)]">({advisory.data.vulnerableRange})</span>
            {" · "}
            <a
              href={advisory.data.url}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--accent)] hover:underline"
            >
              full advisory ↗
            </a>
          </p>
        </header>
      ) : (
        <Skeleton className="h-28" />
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--hairline)] px-4 py-3">
          <h2 className="text-sm font-semibold">Blast radius</h2>
          <p className="text-xs text-[var(--muted)]">
            every package that transitively depends on the vulnerable one
          </p>
          <label className="ml-auto flex items-center gap-2 text-xs text-[var(--ink-2)]">
            depth
            <select
              value={hops}
              onChange={(e) => setHops(Number(e.target.value))}
              className="rounded border border-[var(--hairline)] bg-[var(--surface-2)] px-2 py-1"
            >
              {[1, 2, 3, 4, 5].map((h) => (
                <option key={h} value={h}>
                  {h} hop{h > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        {blast.status === "ready" ? (
          affected.length === 0 ? (
            <EmptyState
              title="No downstream impact in this snapshot"
              body="Nothing in the graph depends on the vulnerable package — its blast radius is just itself."
            />
          ) : (
            <BlastGraph nodes={blast.data.nodes} edges={blast.data.edges} />
          )
        ) : blast.status === "error" ? (
          <p className="px-4 py-8 text-sm text-[var(--muted)]">{blast.message}</p>
        ) : (
          <div className="grid h-[520px] place-items-center text-sm text-[var(--muted)]">
            computing blast radius…
          </div>
        )}
      </section>

      {blast.status === "ready" && affected.length > 0 && (
        <section className="card">
          <h2 className="border-b border-[var(--hairline)] px-4 py-3 text-sm font-semibold">
            Affected packages ({affected.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted)]">
                  <th className="px-4 py-2 font-medium">Package</th>
                  <th className="px-4 py-2 text-right font-medium">Hops away</th>
                  <th className="px-4 py-2 text-right font-medium">Dependency chains</th>
                  <th className="px-4 py-2 text-right font-medium">Weekly downloads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--hairline)]">
                {affected.map((n) => (
                  <tr key={n.name}>
                    <td className="px-4 py-2">
                      <PackageLink name={n.name} />
                    </td>
                    <td className="px-4 py-2 text-right tabular">{n.distance}</td>
                    <td className="px-4 py-2 text-right tabular">{n.chains}</td>
                    <td className="px-4 py-2 text-right tabular">
                      {formatDownloads(n.weeklyDownloads)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
