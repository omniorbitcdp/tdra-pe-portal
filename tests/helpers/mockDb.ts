// In-memory Supabase client implementing the query-builder surface the app uses.
// Lets us exercise real route handlers end-to-end (auth, scoping, workflow).
import { randomUUID } from 'node:crypto';

export type Row = Record<string, any>;
export type Tables = Record<string, Row[]>;

let tables: Tables = {};
export function resetDb(seed: Tables) { tables = structuredClone(seed); }
export function table(name: string): Row[] {
  if (!tables[name]) tables[name] = [];
  return tables[name];
}

type Filter = { kind: 'eq' | 'neq' | 'in' | 'is' | 'gte' | 'lte'; col: string; val: any };
type OrFilter = string;

class QueryBuilder implements PromiseLike<{ data: any; error: any; count?: number }> {
  private filters: Filter[] = [];
  private ors: OrFilter[] = [];
  private orderBy: { col: string; ascending: boolean }[] = [];
  private limitN: number | null = null;
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: Row[] = [];
  private cols = '*';
  private wantCount = false;
  private head = false;
  private singleMode: 'none' | 'single' | 'maybeSingle' = 'none';

  constructor(private name: string) {}

  select(cols = '*', opts?: { count?: string; head?: boolean }) {
    this.cols = cols;
    if (opts?.count === 'exact') this.wantCount = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(v: Row | Row[]) { this.op = 'insert'; this.payload = Array.isArray(v) ? v : [v]; return this; }
  update(v: Row) { this.op = 'update'; this.payload = [v]; return this; }
  upsert(v: Row, _o?: unknown) { this.op = 'upsert'; this.payload = [v]; return this; }
  delete() { this.op = 'delete'; return this; }

  eq(c: string, v: any) { this.filters.push({ kind: 'eq', col: c, val: v }); return this; }
  neq(c: string, v: any) { this.filters.push({ kind: 'neq', col: c, val: v }); return this; }
  in(c: string, v: any[]) { this.filters.push({ kind: 'in', col: c, val: v }); return this; }
  is(c: string, v: any) { this.filters.push({ kind: 'is', col: c, val: v }); return this; }
  gte(c: string, v: any) { this.filters.push({ kind: 'gte', col: c, val: v }); return this; }
  lte(c: string, v: any) { this.filters.push({ kind: 'lte', col: c, val: v }); return this; }
  or(expr: string) { this.ors.push(expr); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.orderBy.push({ col, ascending: o?.ascending !== false }); return this; }
  limit(n: number) { this.limitN = n; return this; }

  single() { this.singleMode = 'single'; return this; }
  maybeSingle() { this.singleMode = 'maybeSingle'; return this; }

  private matches(r: Row): boolean {
    for (const f of this.filters) {
      const v = r[f.col];
      if (f.kind === 'eq' && v !== f.val) return false;
      if (f.kind === 'neq' && v === f.val) return false;
      if (f.kind === 'in' && !f.val.includes(v)) return false;
      if (f.kind === 'is' && f.val === null && v != null) return false;
      if (f.kind === 'gte' && !(String(v) >= String(f.val))) return false;
      if (f.kind === 'lte' && !(String(v) <= String(f.val))) return false;
    }
    for (const expr of this.ors) {
      // supports: col.ilike.%x%,col2.ilike.%y%
      const ok = expr.split(',').some((clause) => {
        const m = clause.trim().match(/^(\w+)\.ilike\.%?(.*?)%?$/);
        if (!m) return false;
        const [, col, needle] = m;
        const hay = String(r[col] ?? '').toLowerCase();
        return hay.includes(needle.replace(/%/g, '').toLowerCase());
      });
      if (!ok) return false;
    }
    return true;
  }

  private run(): { data: any; error: any; count?: number } {
    const rows = table(this.name);

    if (this.op === 'insert' || this.op === 'upsert') {
      const inserted = this.payload.map((p) => {
        const row: Row = { id: p.id ?? randomUUID(), created_at: new Date().toISOString(), ...p };
        if (this.op === 'upsert') {
          const i = rows.findIndex((r) => r.id === row.id || (r.key && row.key && r.key === row.key));
          if (i >= 0) { rows[i] = { ...rows[i], ...row }; return rows[i]; }
        }
        rows.push(row);
        return row;
      });
      return { data: this.singleMode !== 'none' ? inserted[0] : inserted, error: null };
    }

    if (this.op === 'update') {
      const hit = rows.filter((r) => this.matches(r));
      for (const r of hit) Object.assign(r, this.payload[0]);
      return { data: this.singleMode !== 'none' ? (hit[0] ?? null) : hit, error: null };
    }

    if (this.op === 'delete') {
      const keep = rows.filter((r) => !this.matches(r));
      const removed = rows.filter((r) => this.matches(r));
      tables[this.name] = keep;
      return { data: removed, error: null };
    }

    let out = rows.filter((r) => this.matches(r));
    for (const o of [...this.orderBy].reverse()) {
      out = [...out].sort((a, b) => {
        const av = a[o.col], bv = b[o.col];
        if (av === bv) return 0;
        const cmp = av > bv ? 1 : -1;
        return o.ascending ? cmp : -cmp;
      });
    }
    if (this.limitN != null) out = out.slice(0, this.limitN);

    if (this.wantCount && this.head) return { data: null, error: null, count: out.length };
    if (this.singleMode === 'single') return { data: out[0] ?? null, error: out[0] ? null : { message: 'no rows' } };
    if (this.singleMode === 'maybeSingle') return { data: out[0] ?? null, error: null };
    return { data: out, error: null };
  }

  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((v: { data: any; error: any; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((r: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export interface MockClient {
  from(name: string): QueryBuilder;
  storage: { from(bucket: string): { upload: (p: string, b: unknown, o?: unknown) => Promise<{ error: null }>; createSignedUrl: (p: string, s: number) => Promise<{ data: { signedUrl: string }; error: null }> } };
}

export const mockClient: MockClient = {
  from: (name: string) => new QueryBuilder(name),
  storage: {
    from: () => ({
      upload: async () => ({ error: null }),
      createSignedUrl: async (p: string) => ({ data: { signedUrl: `https://signed.test/${p}` }, error: null }),
    }),
  },
};
