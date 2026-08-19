import neo4j, { Driver, Record as Neo4jRecord } from "neo4j-driver";

export class DatabaseUnavailableError extends Error {
  constructor(message = "The graph database is unreachable.") {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

const UNAVAILABLE_CODES = new Set([
  "ServiceUnavailable",
  "SessionExpired",
  "Neo.ClientError.Security.Unauthorized",
]);

/**
 * Connection manager for the graph database.
 *
 * A process-wide singleton wraps one Bolt driver: created lazily at first
 * query, reused across warm serverless invocations. The pool is kept small —
 * the CognoDB free tier allows 200 connections and Vercel may run several
 * instances at once.
 */
export class Database {
  private static instance: Database | null = null;
  private driver: Driver | null = null;

  private constructor() {}

  static getInstance(): Database {
    Database.instance ??= new Database();
    return Database.instance;
  }

  private getDriver(): Driver {
    if (this.driver) return this.driver;
    const uri = process.env.NEO4J_URI;
    const user = process.env.NEO4J_USER;
    const password = process.env.NEO4J_PASSWORD;
    if (!uri || !user || !password) {
      throw new DatabaseUnavailableError(
        "Database credentials are not configured (NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD)."
      );
    }
    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      maxConnectionPoolSize: 5,
      connectionAcquisitionTimeout: 5_000,
      connectionTimeout: 5_000,
      // fail fast when the DB is down — the UI shows a friendly 503 state
      // instead of hanging behind the driver's default 30s retry window
      maxTransactionRetryTime: 5_000,
    });
    return this.driver;
  }

  /**
   * Run a read query with parameters and map each record.
   * Connectivity/auth failures become DatabaseUnavailableError so the
   * controller layer can turn them into a single friendly 503.
   */
  async read<T>(
    cypher: string,
    params: Record<string, unknown>,
    mapper: (record: Neo4jRecord) => T
  ): Promise<T[]> {
    let session = null;
    try {
      session = this.getDriver().session({ defaultAccessMode: neo4j.session.READ });
      const result = await session.executeRead((tx) => tx.run(cypher, params));
      return result.records.map(mapper);
    } catch (err: unknown) {
      if (err instanceof DatabaseUnavailableError) throw err;
      const code = (err as { code?: string })?.code ?? "";
      const name = (err as { name?: string })?.name ?? "";
      if (
        UNAVAILABLE_CODES.has(code) ||
        UNAVAILABLE_CODES.has(name) ||
        code.startsWith("Neo.TransientError")
      ) {
        throw new DatabaseUnavailableError();
      }
      throw err;
    } finally {
      await session?.close();
    }
  }
}

/** Wrap a JS number as a Bolt integer — LIMIT/SKIP params reject floats. */
export function int(value: number) {
  return neo4j.int(Math.trunc(value));
}

/** Coerce a neo4j Integer / number to a JS number. */
export function toNum(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (neo4j.isInt(value)) return value.toNumber();
  return Number(value);
}
