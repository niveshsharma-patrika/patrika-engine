import { pool } from "./index";

/**
 * Minimal supabase-js–compatible query builder over raw Postgres (pg), so the
 * existing `createAdminClient().from(...).select()...` call-sites keep working
 * against RDS with no rewrites. Returns snake_case rows + `{ data, error }`
 * exactly like supabase-js (service-role: no RLS).
 *
 * Supported surface (everything the codebase uses — verified by enumeration):
 *   select / insert / update / delete / upsert
 *   eq neq gt gte lt lte in is not like ilike · order · limit · range
 *   single · maybeSingle · { count:'exact', head:bool }
 *   one-level embeds: signals→sources, ai_models→ai_providers
 */

// jsonb columns must be JSON.stringify'd; real array columns pass through as PG arrays.
const JSONB_COLS: Record<string, Set<string>> = {
  trends: new Set(["angles"]),
  ai_models: new Set(["capabilities"]),
  watchlist: new Set(["handles"]),
  drafts: new Set(["generation_metadata"]),
  signals: new Set(["metadata"]),
  source_candidates: new Set(["evidence"]),
};
const ARRAY_COLS: Record<string, Set<string>> = {
  signals: new Set(["keywords"]),
};

// One-level embed relationships (base table → embedded table + join keys).
const EMBED_FK: Record<string, Record<string, { fk: string; ref: string }>> = {
  signals: { sources: { fk: "source_id", ref: "id" } },
  ai_models: { ai_providers: { fk: "provider_id", ref: "id" } },
};

type Row = Record<string, unknown>;
type PgError = { message: string; code?: string } | null;
// data is `any` to match untyped supabase-js (no generated DB types were used).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = { data: any; error: PgError; count: number | null };

function q(id: string): string {
  return '"' + id.replace(/"/g, '""') + '"';
}

function serialize(table: string, col: string, val: unknown): unknown {
  if (val === null || val === undefined) return val ?? null;
  const isArrayCol = ARRAY_COLS[table]?.has(col);
  if (isArrayCol) return val; // pg turns JS arrays into PG arrays
  const isJsonb = JSONB_COLS[table]?.has(col);
  if (isJsonb && typeof val === "object") return JSON.stringify(val);
  if (typeof val === "object" && !(val instanceof Date)) return JSON.stringify(val);
  return val;
}

type Filter = { col: string; op: string; val: unknown };
type EmbedSpec = { table: string; cols: string[]; inner: boolean };

/** Split a select string at top-level commas (commas inside () belong to embeds). */
function splitSelect(sel: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of sel) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

class PostgrestQuery implements PromiseLike<Result> {
  private table: string;
  private action: "select" | "insert" | "update" | "delete" = "select";
  private columns = "*";
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean; nullsFirst: boolean | null }[] = [];
  private _limit: number | null = null;
  private _offset: number | null = null;
  private _rangeCount: number | null = null;
  private values: Row | Row[] | null = null;
  private onConflict: string | null = null;
  private ignoreDuplicates = false;
  private wantData = false; // .select() chained after a mutation
  private mode: "" | "single" | "maybe" = "";
  private countMode: "exact" | null = null;
  private head = false;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = "*", opts?: { count?: "exact"; head?: boolean }) {
    if (this.action === "select") this.columns = columns || "*";
    this.wantData = true;
    if (opts?.count) this.countMode = opts.count;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(values: Row | Row[], opts?: { count?: "exact" }) {
    this.action = "insert";
    this.values = values;
    this.wantData = false;
    if (opts?.count) this.countMode = opts.count;
    return this;
  }
  update(values: Row, opts?: { count?: "exact" }) {
    this.action = "update";
    this.values = values;
    if (opts?.count) this.countMode = opts.count;
    return this;
  }
  delete(opts?: { count?: "exact" }) {
    this.action = "delete";
    if (opts?.count) this.countMode = opts.count;
    return this;
  }
  upsert(
    values: Row | Row[],
    opts?: { onConflict?: string; ignoreDuplicates?: boolean; count?: "exact" }
  ) {
    this.action = "insert";
    this.values = values;
    this.onConflict = opts?.onConflict ?? "id";
    this.ignoreDuplicates = opts?.ignoreDuplicates ?? false;
    if (opts?.count) this.countMode = opts.count;
    return this;
  }

  eq(col: string, val: unknown) { this.filters.push({ col, op: "=", val }); return this; }
  neq(col: string, val: unknown) { this.filters.push({ col, op: "<>", val }); return this; }
  gt(col: string, val: unknown) { this.filters.push({ col, op: ">", val }); return this; }
  gte(col: string, val: unknown) { this.filters.push({ col, op: ">=", val }); return this; }
  lt(col: string, val: unknown) { this.filters.push({ col, op: "<", val }); return this; }
  lte(col: string, val: unknown) { this.filters.push({ col, op: "<=", val }); return this; }
  in(col: string, vals: unknown[]) { this.filters.push({ col, op: "in", val: vals }); return this; }
  is(col: string, val: unknown) { this.filters.push({ col, op: "is", val }); return this; }
  like(col: string, pat: string) { this.filters.push({ col, op: "like", val: pat }); return this; }
  ilike(col: string, pat: string) { this.filters.push({ col, op: "ilike", val: pat }); return this; }
  not(col: string, op: string, val: unknown) { this.filters.push({ col, op: "not:" + op, val }); return this; }

  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({
      col,
      asc: opts?.ascending ?? true,
      nullsFirst: opts?.nullsFirst ?? null,
    });
    return this;
  }
  limit(n: number) { this._limit = n; return this; }
  range(from: number, to: number) {
    this._offset = from;
    this._rangeCount = to - from + 1;
    return this;
  }
  single() { this.mode = "single"; this.wantData = true; return this; }
  maybeSingle() { this.mode = "maybe"; this.wantData = true; return this; }

  // ---- SQL building ----
  private whereSql(params: unknown[]): string {
    if (!this.filters.length) return "";
    const clauses = this.filters.map((f) => {
      const negate = f.op.startsWith("not:");
      const op = negate ? f.op.slice(4) : f.op;
      let clause: string;
      if (op === "is") {
        clause = `${q(f.col)} IS ${f.val === null ? "NULL" : f.val === true ? "TRUE" : f.val === false ? "FALSE" : `$${params.push(f.val)}`}`;
      } else if (op === "in") {
        clause = `${q(f.col)} = ANY($${params.push(f.val)})`;
      } else if (op === "like" || op === "ilike") {
        clause = `${q(f.col)} ${op.toUpperCase()} $${params.push(f.val)}`;
      } else {
        clause = `${q(f.col)} ${op} $${params.push(f.val)}`;
      }
      return negate ? `NOT (${clause})` : clause;
    });
    return " WHERE " + clauses.join(" AND ");
  }

  private orderLimitSql(): string {
    let sql = "";
    if (this.orders.length) {
      sql +=
        " ORDER BY " +
        this.orders
          .map((o) => {
            const nulls =
              o.nullsFirst === null ? "" : o.nullsFirst ? " NULLS FIRST" : " NULLS LAST";
            return `${q(o.col)} ${o.asc ? "ASC" : "DESC"}${nulls}`;
          })
          .join(", ");
    }
    const lim = this._rangeCount ?? this._limit;
    if (lim !== null) sql += ` LIMIT ${Number(lim)}`;
    if (this._offset !== null) sql += ` OFFSET ${Number(this._offset)}`;
    return sql;
  }

  private buildSelect(params: unknown[]): { sql: string } {
    const parts = splitSelect(this.columns);
    const baseCols: string[] = [];
    const embeds: EmbedSpec[] = [];
    for (const p of parts) {
      const m = p.match(/^([a-z_]+)(!inner)?\(([^)]*)\)$/i);
      if (m) {
        embeds.push({
          table: m[1],
          inner: Boolean(m[2]),
          cols: m[3].split(",").map((c) => c.trim()).filter(Boolean),
        });
      } else baseCols.push(p);
    }

    const selectList: string[] = [];
    if (baseCols.length === 1 && baseCols[0] === "*") {
      selectList.push(`${q(this.table)}.*`);
    } else if (baseCols.length) {
      for (const c of baseCols) selectList.push(`${q(this.table)}.${q(c)}`);
    }

    let joinSql = "";
    for (const e of embeds) {
      const rel = EMBED_FK[this.table]?.[e.table];
      if (!rel) throw new Error(`compat: unknown embed ${this.table}->${e.table}`);
      const alias = e.table;
      joinSql += ` ${e.inner ? "INNER" : "LEFT"} JOIN ${q(e.table)} ${q(alias)} ON ${q(alias)}.${q(rel.ref)} = ${q(this.table)}.${q(rel.fk)}`;
      const obj = e.cols.map((c) => `'${c}', ${q(alias)}.${q(c)}`).join(", ");
      selectList.push(
        `CASE WHEN ${q(alias)}.${q(rel.ref)} IS NULL THEN NULL ELSE json_build_object(${obj}) END AS ${q(alias)}`
      );
    }

    const cols = selectList.length ? selectList.join(", ") : `${q(this.table)}.*`;
    const sql =
      `SELECT ${cols} FROM ${q(this.table)}` +
      joinSql +
      this.whereSql(params) +
      this.orderLimitSql();
    return { sql };
  }

  private async exec(): Promise<Result> {
    try {
      // count / head — select only; mutations report count via rowCount below
      if (this.action === "select" && (this.countMode || this.head)) {
        const cparams: unknown[] = [];
        const countSql = `SELECT count(*)::int AS count FROM ${q(this.table)}${this.whereSql(cparams)}`;
        const cres = await pool.query(countSql, cparams);
        const count = cres.rows[0]?.count ?? 0;
        if (this.head) return { data: null, error: null, count };
        const params2: unknown[] = [];
        const sql2 = this.buildSelect(params2).sql;
        const res = await pool.query(sql2, params2);
        return { data: res.rows, error: null, count };
      }

      if (this.action === "select") {
        const params: unknown[] = [];
        const { sql } = this.buildSelect(params);
        const res = await pool.query(sql, params);
        return this.shape(res.rows);
      }

      if (this.action === "insert") {
        const rows = Array.isArray(this.values) ? this.values : [this.values!];
        if (!rows.length) return { data: this.wantData ? [] : null, error: null, count: null };
        const cols = Object.keys(rows[0]);
        const params: unknown[] = [];
        const valuesSql = rows
          .map(
            (r) =>
              "(" +
              cols.map((c) => `$${params.push(serialize(this.table, c, r[c]))}`).join(", ") +
              ")"
          )
          .join(", ");
        let sql = `INSERT INTO ${q(this.table)} (${cols.map(q).join(", ")}) VALUES ${valuesSql}`;
        if (this.onConflict) {
          const target = this.onConflict.split(",").map((c) => q(c.trim())).join(", ");
          const updates = cols
            .filter((c) => c !== this.onConflict)
            .map((c) => `${q(c)} = EXCLUDED.${q(c)}`)
            .join(", ");
          sql +=
            this.ignoreDuplicates || !updates
              ? ` ON CONFLICT (${target}) DO NOTHING`
              : ` ON CONFLICT (${target}) DO UPDATE SET ${updates}`;
        }
        if (this.wantData) sql += " RETURNING *";
        const res = await pool.query(sql, params);
        return this.wantData
          ? this.shape(res.rows)
          : { data: null, error: null, count: this.countMode ? res.rowCount : null };
      }

      if (this.action === "update") {
        const v = this.values as Row;
        const cols = Object.keys(v);
        const params: unknown[] = [];
        const setSql = cols
          .map((c) => `${q(c)} = $${params.push(serialize(this.table, c, v[c]))}`)
          .join(", ");
        let sql = `UPDATE ${q(this.table)} SET ${setSql}${this.whereSql(params)}`;
        if (this.wantData) sql += " RETURNING *";
        const res = await pool.query(sql, params);
        return this.wantData
          ? this.shape(res.rows)
          : { data: null, error: null, count: this.countMode ? res.rowCount : null };
      }

      // delete
      const params: unknown[] = [];
      let sql = `DELETE FROM ${q(this.table)}${this.whereSql(params)}`;
      if (this.wantData) sql += " RETURNING *";
      const res = await pool.query(sql, params);
      return this.wantData
        ? this.shape(res.rows)
        : { data: null, error: null, count: this.countMode ? res.rowCount : null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "query failed";
      return { data: null, error: { message }, count: null };
    }
  }

  private shape(rows: Row[]): Result {
    if (this.mode === "single") {
      if (rows.length !== 1) {
        return {
          data: rows[0] ?? null,
          error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" },
          count: null,
        };
      }
      return { data: rows[0], error: null, count: null };
    }
    if (this.mode === "maybe") {
      if (rows.length > 1) {
        return { data: null, error: { message: "multiple rows returned" }, count: null };
      }
      return { data: rows[0] ?? null, error: null, count: null };
    }
    return { data: rows, error: null, count: null };
  }

  then<R1 = Result, R2 = never>(
    onfulfilled?: ((v: Result) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return this.exec().then(onfulfilled, onrejected);
  }
}

/** Drop-in replacement for the supabase service-role client (the subset used). */
export function makeCompatClient() {
  return {
    from(table: string) {
      return new PostgrestQuery(table);
    },
  };
}

/** Type of the compat client — use in place of the old `SupabaseClient` param. */
export type DbClient = ReturnType<typeof makeCompatClient>;
