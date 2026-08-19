import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SearchBox } from "@/components/SearchBox";

export const metadata: Metadata = {
  title: "Blast Radius — npm dependency risk explorer",
  description:
    "Explore how security advisories ripple through the npm dependency graph. Backed by CognoDB.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="sticky top-0 z-40 border-b border-[var(--hairline)] bg-[var(--page)]/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <span aria-hidden className="text-lg">💥</span>
              <span className="font-semibold tracking-tight">Blast Radius</span>
            </Link>
            <nav className="hidden gap-4 text-sm text-[var(--ink-2)] sm:flex">
              <Link href="/paths" className="hover:text-[var(--ink)]">
                Path finder
              </Link>
            </nav>
            <div className="ml-auto w-full max-w-xs">
              <SearchBox compact />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl border-t border-[var(--hairline)] px-4 py-6 text-xs text-[var(--muted)]">
          Data: npm registry &amp; OSV.dev snapshot · Graph: CognoDB (openCypher over Bolt)
        </footer>
      </body>
    </html>
  );
}
