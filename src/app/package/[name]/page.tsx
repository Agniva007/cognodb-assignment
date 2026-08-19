"use client";
import { use } from "react";
import Link from "next/link";
import {
  Chain,
  DbErrorState,
  EmptyState,
  PackageLink,
  SeverityBadge,
  Skeleton,
  StatTile,
} from "@/components/ui";
import { formatDownloads, useApi } from "@/lib/useApi";

interface PackageData {
  pkg: {
    name: string;
    description: string;
    license: string;
    weeklyDownloads: number;
    latestVersion: string;
    maintainers: string[];
  };
  deps: Array<{ name: string; range: string; weeklyDownloads: number }>;
  dependents: Array<{ name: string; weeklyDownloads: number }>;
  advisories: Array<{
    id: string;
    summary: string;
    severity: string;
    vulnerableRange: string;
  }>;
  treeAdvisories: Array<{
    id: string;
    summary: string;
    severity: string;
    packageName: string;
    distance: number;
    exampleChain: string[];
  }>;
}

export default function PackagePage({ params }: { params: Promise<{ name: string }> }) {
  const { name: raw } = use(params);
  const name = decodeURIComponent(raw);
  const state = useApi<PackageData>(`/api/package/${encodeURIComponent(name)}`);

  if (state.status === "error") {
    if (state.kind === "db") return <DbErrorState message={state.message} />;
    if (state.kind === "notfound")
      return (
        <EmptyState
          title={`“${name}” isn’t in this snapshot`}
          body="The graph holds ~750 popular packages and their dependency closure. Try searching for another package from the header."
        />
      );
    return <EmptyState title="Something went wrong" body={state.message} />;
  }

  if (state.status === "loading") {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const { pkg, deps, dependents, advisories, treeAdvisories } = state.data;
  const transitive = treeAdvisories.filter((a) => a.distance > 0);

  return (
    <div className="space-y-6">
      <header className="card px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold">{pkg.name}</h1>
          <span className="text-sm text-[var(--muted)]">v{pkg.latestVersion}</span>
          {pkg.license && (
            <span className="rounded border border-[var(--hairline)] px-1.5 py-0.5 text-xs text-[var(--ink-2)]">
              {pkg.license}
            </span>
          )}
        </div>
        {pkg.description && <p className="mt-1 text-sm text-[var(--ink-2)]">{pkg.description}</p>}
        {pkg.maintainers.length > 0 && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Maintained by {pkg.maintainers.join(", ")}
          </p>
        )}
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Weekly downloads" value={formatDownloads(pkg.weeklyDownloads)} />
        <StatTile label="Direct dependencies" value={String(deps.length)} />
        <StatTile label="Direct dependents" value={String(dependents.length)} hint="in this snapshot" />
        <StatTile
          label="Advisories in tree"
          value={String(treeAdvisories.length)}
          hint={`${advisories.length} direct · ${transitive.length} transitive`}
        />
      </section>

      <section className="card">
        <h2 className="border-b border-[var(--hairline)] px-4 py-3 text-sm font-semibold">
          Vulnerabilities reaching this package (up to 4 hops)
        </h2>
        {treeAdvisories.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--muted)]">
            No known advisories anywhere in {pkg.name}’s dependency tree. 🎉
          </p>
        ) : (
          <ul className="divide-y divide-[var(--hairline)]">
            {treeAdvisories.map((a) => (
              <li key={`${a.id}-${a.packageName}`} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={a.severity} />
                  <Link
                    href={`/advisory/${encodeURIComponent(a.id)}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {a.summary || a.id}
                  </Link>
                  <span className="text-xs text-[var(--muted)]">
                    {a.distance === 0 ? "direct" : `${a.distance} hop${a.distance > 1 ? "s" : ""} away`} · in{" "}
                    {a.packageName}
                  </span>
                </div>
                {a.distance > 0 && (
                  <div className="mt-1 text-xs text-[var(--ink-2)]">
                    <Chain chain={a.exampleChain} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="border-b border-[var(--hairline)] px-4 py-3 text-sm font-semibold">
            Depends on ({deps.length})
          </h2>
          {deps.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--muted)]">
              No runtime dependencies — a leaf of the graph.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-[var(--hairline)] overflow-y-auto">
              {deps.map((d) => (
                <li key={d.name} className="flex items-baseline gap-2 px-4 py-2 text-sm">
                  <PackageLink name={d.name} />
                  <span className="text-xs text-[var(--muted)]">{d.range}</span>
                  <span className="ml-auto text-xs text-[var(--ink-2)] tabular">
                    {formatDownloads(d.weeklyDownloads)}/wk
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="border-b border-[var(--hairline)] px-4 py-3 text-sm font-semibold">
            Depended on by (top {dependents.length})
          </h2>
          {dependents.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--muted)]">
              Nothing in this snapshot depends on {pkg.name}.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-[var(--hairline)] overflow-y-auto">
              {dependents.map((d) => (
                <li key={d.name} className="flex items-baseline gap-2 px-4 py-2 text-sm">
                  <PackageLink name={d.name} />
                  <span className="ml-auto text-xs text-[var(--ink-2)] tabular">
                    {formatDownloads(d.weeklyDownloads)}/wk
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
