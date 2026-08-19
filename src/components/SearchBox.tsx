"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDownloads } from "@/lib/useApi";

interface Hit {
  name: string;
  description: string;
  weeklyDownloads: number;
}

export function SearchBox({ compact = false }: { compact?: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) {
        setHits([]);
        return;
      }
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        const body = await res.json();
        if (body.ok) {
          setHits(body.data);
          setOpen(true);
          setActive(0);
        }
      } catch {
        /* typeahead failures are silent; the dashboard surfaces DB errors */
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(name: string) {
    setOpen(false);
    setQ("");
    router.push(`/package/${encodeURIComponent(name)}`);
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, hits.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter" && hits[active]) go(hits[active].name);
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={compact ? "Search packages…" : "Search a package — try express, lodash, axios…"}
        aria-label="Search packages"
        className={`w-full rounded-lg border border-[var(--hairline)] bg-[var(--surface)] px-3 text-[var(--ink)] placeholder-[var(--muted)] outline-none focus:border-[var(--accent)] ${
          compact ? "py-1.5 text-sm" : "py-3 text-base"
        }`}
      />
      {open && hits.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] shadow-xl">
          {hits.map((h, i) => (
            <li key={h.name}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h.name)}
                className={`flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm ${
                  i === active ? "bg-[var(--surface)]" : ""
                }`}
              >
                <span className="font-medium">{h.name}</span>
                <span className="truncate text-xs text-[var(--muted)]">{h.description}</span>
                <span className="ml-auto shrink-0 text-xs text-[var(--ink-2)] tabular">
                  {formatDownloads(h.weeklyDownloads)}/wk
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && q.trim().length >= 2 && hits.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--muted)]">
          No packages match “{q.trim()}” in this snapshot.
        </div>
      )}
    </div>
  );
}
