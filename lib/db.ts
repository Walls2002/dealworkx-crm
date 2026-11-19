import "server-only";
import { SCHEMA } from "./schema";
import { seedDatabase } from "./seed";
import { isDemo } from "./mode";
import { ensureCaches } from "./cache";

/**
 * One tiny query interface over two Postgres drivers:
 * - DATABASE_URL set   -> node-postgres against a real server (Neon, Supabase, Render…)
 * - DATABASE_URL empty -> PGlite, Postgres compiled to WASM, persisted in ./.data/pg
 * Both speak the same SQL and return { rows }, so nothing else in the app cares which one runs.
 */
export type Row = Record<string, unknown>;
export interface Db {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

async function createPg(url: string): Promise<Db> {
  const { Pool } = await import("pg");
  // Hosted databases (Supabase, Neon…) are reached over the internet: always encrypt.
  // Supabase's pooler presents its own CA, so the chain isn't verified against the system store.
  const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url) || /sslmode=disable/.test(url);
  // Pages run up to ~10 queries side by side, and every round trip to a hosted database costs ~50 ms, so:
  // enough connections for one page at once, kept open between clicks (a new TLS connection costs several round trips).
  // Exception: Supabase's session pooler (port 5432) allows only 15 clients across every server using the database
  // (dev, production, scripts), so there the pool stays small and lets idle connections go. Prefer port 6543.
  const sessionPooler = /\.pooler\.supabase\.com:5432\//.test(url);
  const pool = new Pool({
    connectionString: url,
    max: sessionPooler ? 4 : 10,
    idleTimeoutMillis: sessionPooler ? 30_000 : 5 * 60_000,
    keepAlive: true,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
  // The host can drop an idle connection. Without a listener that error would crash the server; the pool replaces it.
  pool.on("error", (error) => console.error("Database connection dropped:", error.message));
  const wrap = (client: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }): Db => ({
    async query<T>(sql: string, params: unknown[] = []) {
      return (await client.query(sql, params)).rows as T[];
    },
    async exec(sql: string) {
      await client.query(sql);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>) {
      return fn(this);
    },
  });
  const db = wrap(pool);
  db.transaction = async <T,>(fn: (tx: Db) => Promise<T>) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(wrap(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
  return db;
}

async function createPglite(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const path = await import("node:path");
  const { mkdirSync } = await import("node:fs");
  const dir = path.join(process.cwd(), ".data", "pg");
  mkdirSync(dir, { recursive: true });
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const pg = new PGlite(dir, { extensions: { pg_trgm } });
  await pg.waitReady;
  type Q = { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }>; exec: (s: string) => Promise<unknown> };
  const wrap = (client: Q): Db => ({
    async query<T>(sql: string, params: unknown[] = []) {
      return (await client.query(sql, params)).rows as T[];
    },
    async exec(sql: string) {
      await client.exec(sql);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>) {
      return pg.transaction((tx) => fn(wrap(tx as unknown as Q)));
    },
  });
  return wrap(pg as unknown as Q);
}

/**
 * Apply SCHEMA only when it changed. Even an "add column if not exists" takes an exclusive table lock, so running the
 * script on every start (or hot reload) while pages read the same tables caused "deadlock detected" errors.
 * Now: compare a hash of the script with the one stored in settings and skip when equal; otherwise apply it in one
 * transaction under an advisory lock, so two servers starting together never run it side by side.
 */
async function applySchema(db: Db): Promise<void> {
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(SCHEMA).digest("hex").slice(0, 16);
  const current = async (q: Db) => {
    const [t] = await q.query<{ ok: boolean }>("select to_regclass('public.settings') is not null as ok");
    if (!t?.ok) return null;
    const [row] = await q.query<{ value: string }>("select value from settings where key = 'schema_hash'");
    return row?.value ?? null;
  };
  if ((await current(db)) === hash) return;
  await db.transaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(4242002)");
    if ((await current(tx)) === hash) return; // another server applied it while we waited
    // Wait at most this long for a busy table instead of queueing every page behind the migration.
    await tx.query("set local lock_timeout = '15s'");
    await tx.exec(SCHEMA);
    await tx.query(
      "insert into settings (key, value) values ('schema_hash', $1) on conflict (key) do update set value = excluded.value",
      [hash],
    );
  });
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL?.trim();
  const db = url ? await createPg(url) : await createPglite();
  await applySchema(db);
  const [{ count }] = await db.query<{ count: number }>("select count(*)::int as count from users");
  if (count === 0) await seedDatabase(db, isDemo());
  await ensureCaches(db);
  return db;
}

// Survive hot reloads in dev: one connection per server process.
const g = globalThis as unknown as { __dwxDb?: Promise<Db>; __dwxSchema?: string };

export function db(): Promise<Db> {
  if (!g.__dwxDb) {
    g.__dwxSchema = SCHEMA;
    g.__dwxDb = connect().catch((error) => {
      g.__dwxDb = undefined;
      throw error;
    });
  } else if (g.__dwxSchema !== SCHEMA) {
    // The schema changed under a hot reload: apply the (idempotent) schema once more.
    g.__dwxSchema = SCHEMA;
    g.__dwxDb = g.__dwxDb.then(async (d) => {
      await applySchema(d);
      await ensureCaches(d);
      return d;
    });
  }
  return g.__dwxDb;
}
