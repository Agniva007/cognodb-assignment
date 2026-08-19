/**
 * semver-match.ts — the single source of truth for "is this version affected
 * by this advisory?".
 *
 * OSV expresses affected ranges as an ordered event stream (`introduced`,
 * `fixed`, `last_affected`) rather than a semver range string, so matching is
 * a fold over those events. Both scripts import this: `fetch-data.ts` uses it
 * to pick which historical versions are worth snapshotting, and `seed.ts` uses
 * it to draw the AFFECTS_VERSION edges. Semver logic stays in code — the graph
 * stores only the conclusion.
 */
import semver from "semver";

export interface AffectedEvent {
  introduced?: string;
  fixed?: string;
  lastAffected?: string;
}

/** Is `version` inside the advisory's affected events (introduced/fixed pairs)? */
export function versionAffected(version: string, events: AffectedEvent[]): boolean {
  const v = semver.coerce(version)?.version;
  if (!v) return false;
  let affected = false;
  for (const e of events) {
    if (e.introduced !== undefined) {
      const intro = e.introduced === "0" ? "0.0.0" : semver.coerce(e.introduced)?.version;
      if (intro && semver.gte(v, intro)) affected = true;
    }
    if (e.fixed !== undefined) {
      const fixed = semver.coerce(e.fixed)?.version;
      if (fixed && semver.gte(v, fixed)) affected = false;
    }
    if (e.lastAffected !== undefined) {
      const last = semver.coerce(e.lastAffected)?.version;
      if (last && semver.gt(v, last)) affected = false;
    }
  }
  return affected;
}

/**
 * Pick a representative sample of the versions an advisory actually hits.
 *
 * A package can have hundreds of published versions and an advisory can span
 * most of them; snapshotting every one would bloat the graph without adding
 * information. The interesting ones are the boundaries — the first version
 * that became vulnerable and the last one before the fix landed — so we keep
 * those plus a few in between, oldest and newest first.
 */
export function selectVulnerableVersions(
  allVersions: string[],
  events: AffectedEvent[],
  limit = 3
): string[] {
  const hits = allVersions
    .filter((v) => !semver.prerelease(v)) // prereleases aren't what people run
    .filter((v) => versionAffected(v, events))
    .sort(semver.compare);
  if (hits.length <= limit) return hits;
  // boundaries first (last-vulnerable, first-vulnerable), then fill from the
  // newest end — that is where real-world installs cluster.
  const picked = [hits[hits.length - 1], hits[0]];
  for (let i = hits.length - 2; i > 0 && picked.length < limit; i--) {
    if (!picked.includes(hits[i])) picked.push(hits[i]);
  }
  return picked.sort(semver.compare);
}
