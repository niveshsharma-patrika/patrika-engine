import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

/**
 * Postgres (RDS in prod, local Postgres in dev) connection for the AWS
 * deployment — replaces the Supabase/PostgREST client. One pooled connection
 * is reused across route invocations and dev HMR so we don't exhaust RDS.
 *
 * DATABASE_URL:
 *   • dev  → postgresql://<you>@localhost:5432/patrika_engine_dev
 *   • prod → the RDS instance (set PGSSL=require — RDS enforces TLS).
 */
const globalForDb = globalThis as unknown as { __patrikaPool?: Pool };

const pool =
  globalForDb.__patrikaPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    ssl:
      process.env.PGSSL === "require"
        ? { rejectUnauthorized: false }
        : undefined,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__patrikaPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
