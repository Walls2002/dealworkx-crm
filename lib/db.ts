import "server-only";
import { SCHEMA } from "./schema";
import { seedDatabase } from "./seed";
import { isDemo } from "./mode";

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
  const pool = new Pool({ connectionString: url, max: 5, ssl: local ? undefined : { rejectUnauthorized: false } });
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
  const pg = new PGlite(dir);
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

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL?.trim();
  const db = url ? await createPg(url) : await createPglite();
  await db.exec(SCHEMA);
  const [{ count }] = await db.query<{ count: number }>("select count(*)::int as count from users");
  if (count === 0) await seedDatabase(db, isDemo());
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
      await d.exec(SCHEMA);
      return d;
    });
  }
  return g.__dwxDb;
}
