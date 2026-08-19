"use client";
import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import {
  DbErrorState,
  PackageLink,
  SeverityBadge,
  Skeleton,
  SkeletonRows,
  StatTile,
} from "@/components/ui";
import { formatDownloads, useApi } from "@/lib/useApi";

interface DashboardData {
  stats: { packages: number; advisories: number; edges: number; maintainers: number };
  worstAdvisories: Array<{
    id: string;
    summary: string;
    severity: string;
    packageName: string;
    downstream: number;
  }>;
  mostDependedOn: Array<{
    name: string;
    description: string;
    weeklyDownloads: number;
    directDependents: number;
  }>;
}

interface ChokePoint {
  name: string;
  weeklyDownloads: number;
  maintainer: string;
  exposedTop: number;
}

export default function Dashboard() {
  const state = useApi<DashboardData>("/api/stats");
  const choke = useApi<ChokePoint[]>("/api/choke-points");

  if (state.status === "error" && state.kind === "db") {
    return <DbErrorState message={state.message} />;
  }

  return (
    <div className="space-y-8">
      <section className="pt-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          What breaks when a package ships a CVE?
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--ink-2)]">
          Blast Radius maps real npm packages, their dependency chains, and real security
          advisories from OSV.dev — as a graph. Search a package to see what it depends on,
          what depends on it, and which vulnerabilities reach it transitively.
        </p>
        <div className="mx-auto mt-5 max-w-lg">
          <SearchBox />
        </div>
      </section>

      <section aria-label="Graph statistics" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {state.status === "ready" ? (
          <>
            <StatTile label="Packages" value={state.data.stats.packages.toLocaleString()} />
            <StatTile
              label="Dependency edges"
              value={state.data.stats.edges.toLocaleString()}
            />
            <StatTile label="Advisories" value={state.data.stats.advisories.toLocaleString()} />
            <StatTile
              label="Maintainers"
              value={state.data.stats.maintainers.toLocaleString()}
            />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20" />)
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="border-b border-[var(--hairline)] px-4 py-3 text-sm font-semibold">
            Advisories with the widest blast radius
          </h2>
          {state.status === "ready" ? (
            <ul className="divide-y divide-[var(--hairline)]">
              {state.data.worstAdvisories.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/advisory/${encodeURIComponent(a.id)}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-2)]"
                  >
                    <SeverityBadge severity={a.severity} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{a.summary || a.id}</span>
                      <span className="block text-xs text-[var(--muted)]">
                        {a.packageName} · {a.id}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-[var(--ink-2)] tabular">
                      {a.downstream.toLocaleString()}
                      <span className="block text-[var(--muted)]">downstream</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <SkeletonRows rows={8} />
          )}
        </section>

        <section className="card">
          <h2 className="border-b border-[var(--hairline)] px-4 py-3 text-sm font-semibold">
            Most depended-upon packages
          </h2>
          {state.status === "ready" ? (
            <ul className="divide-y divide-[var(--hairline)]">
              {state.data.mostDependedOn.map((p) => (
                <li key={p.name} className="flex items-baseline gap-3 px-4 py-3">
                  <PackageLink name={p.name} className="text-sm font-medium" />
                  <span className="min-w-0 flex-1 truncate text-xs text-[var(--muted)]">
                    {p.description}
                  </span>
                  <span className="shrink-0 text-right text-xs text-[var(--ink-2)] tabular">
                    {p.directDependents}
                    <span className="block text-[var(--muted)]">direct dependents</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <SkeletonRows rows={8} />
          )}
        </section>
      </div>

      <section className="card">
        <div className="border-b border-[var(--hairline)] px-4 py-3">
          <h2 className="text-sm font-semibold">Single-maintainer choke points</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Packages with exactly one maintainer that sit inside the dependency trees of 5+
            heavily-downloaded packages — the ecosystem’s quiet single points of failure.
          </p>
        </div>
        {choke.status === "ready" ? (
          choke.data.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--muted)]">
              No choke points at the current thresholds.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--muted)]">
                    <th className="px-4 py-2 font-medium">Package</th>
                    <th className="px-4 py-2 font-medium">Sole maintainer</th>
                    <th className="px-4 py-2 text-right font-medium">Weekly downloads</th>
                    <th className="px-4 py-2 text-right font-medium">
                      High-profile packages exposed
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--hairline)]">
                  {choke.data.map((c) => (
                    <tr key={c.name}>
                      <td className="px-4 py-2">
                        <PackageLink name={c.name} />
                      </td>
                      <td className="px-4 py-2 text-[var(--ink-2)]">{c.maintainer}</td>
                      <td className="px-4 py-2 text-right tabular">
                        {formatDownloads(c.weeklyDownloads)}
                      </td>
                      <td className="px-4 py-2 text-right tabular">{c.exposedTop}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : choke.status === "error" ? (
          <p className="px-4 py-6 text-sm text-[var(--muted)]">{choke.message}</p>
        ) : (
          <SkeletonRows rows={5} />
        )}
      </section>
    </div>
  );
}
