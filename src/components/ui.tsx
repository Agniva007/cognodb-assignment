import Link from "next/link";

/* Severity badge: color + text label together — color never carries alone. */
const SEVERITY: Record<string, { color: string; label: string }> = {
  CRITICAL: { color: "var(--critical)", label: "Critical" },
  HIGH: { color: "var(--serious)", label: "High" },
  MODERATE: { color: "var(--warning)", label: "Moderate" },
  LOW: { color: "var(--muted)", label: "Low" },
  UNKNOWN: { color: "var(--muted)", label: "Unrated" },
};

export function SeverityBadge({ severity }: { severity: string }) {
  const s = SEVERITY[severity] ?? SEVERITY.UNKNOWN;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{ borderColor: s.color, color: s.color }}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: s.color }}
      />
      {s.label}
    </span>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-[var(--ink-2)]">{hint}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </div>
  );
}

export function DbErrorState({ message }: { message?: string }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span aria-hidden className="text-3xl">🔌</span>
      <h2 className="text-lg font-semibold">Can’t reach the graph database</h2>
      <p className="max-w-md text-sm text-[var(--ink-2)]">
        {message ?? "The CognoDB instance didn’t respond."} The data will load as soon as the
        connection recovers — try refreshing in a moment.
      </p>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span aria-hidden className="text-3xl">🕳️</span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-[var(--ink-2)]">{body}</p>
    </div>
  );
}

export function PackageLink({ name, className = "" }: { name: string; className?: string }) {
  return (
    <Link
      href={`/package/${encodeURIComponent(name)}`}
      className={`text-[var(--accent)] hover:underline ${className}`}
    >
      {name}
    </Link>
  );
}

/** A dependency chain rendered as breadcrumb: a → b → c */
export function Chain({ chain }: { chain: string[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-sm">
      {chain.map((n, i) => (
        <span key={`${n}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-[var(--muted)]">depends on</span>}
          <PackageLink name={n} />
        </span>
      ))}
    </span>
  );
}
