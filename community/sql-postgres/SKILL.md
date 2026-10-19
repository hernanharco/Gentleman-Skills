---
name: sql-postgres
description: >
  PostgreSQL patterns: query writing, schema design, indexing, and performance diagnosis.
  Trigger: When writing or reviewing SQL, when designing tables or migrations, when a query is slow, when choosing indexes, when debugging locks or connection issues.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## When to Use

Load this skill when:
- Writing or reviewing queries (SELECT, INSERT ... ON CONFLICT, CTEs, window functions)
- Designing schemas or writing migrations
- Diagnosing slow queries or bad query plans
- Choosing indexes (B-tree, partial, covering, GIN)
- Debugging deadlocks, lock waits, or connection pool exhaustion

---

## Critical Patterns

- **Index what you filter and join**: every `WHERE`, `JOIN`, and `ORDER BY` on a large
  table needs a supporting index; a missing index is the most common cause of slow
  queries, not "Postgres being slow".
- **Read the plan before optimizing**: `EXPLAIN (ANALYZE, BUFFERS)` is the authority.
  Never rewrite a query for speed without comparing plans and actual rows vs estimates.
- **Estimates far off = stale stats**: when estimated rows differ from actual rows by
  >10x, run `ANALYZE`; bad plans are usually stale statistics, not bad SQL.
- **Migrations are forward-only in production**: additive changes first (add column
  nullable/backfilled, then constrain); never rewrite or drop in the same deploy that
  stops using the old shape.
- **Constraints over application checks**: `UNIQUE`, `CHECK`, `NOT NULL`, and `FOREIGN
  KEY` enforce invariants the database can guarantee; app-level validation can be
  bypassed by any other writer.
- **Bound every write**: always use transactions for multi-statement writes; a partial
  write without a transaction is a corruption waiting for a crash.
- **Parameterize, never interpolate**: `$1` placeholders everywhere — string-built SQL
  is SQL injection by construction.
- **Paginate with keyset, not OFFSET**: `WHERE (created_at, id) < ($1, $2) ORDER BY
  created_at DESC, id DESC LIMIT $3` stays fast at any depth; `OFFSET` degrades linearly.

## Query Patterns

```sql
-- Keyset pagination (fast at any depth)
SELECT id, created_at, title
FROM posts
WHERE (created_at, id) < ($1, $2)   -- last seen cursor
ORDER BY created_at DESC, id DESC
LIMIT $3;

-- Upsert with explicit conflict target
INSERT INTO user_emails (user_id, email)
VALUES ($1, $2)
ON CONFLICT (user_id) DO UPDATE
SET email = EXCLUDED.email, updated_at = now()
RETURNING id;

-- Window function instead of correlated subquery
SELECT user_id, amount,
       amount / SUM(amount) OVER (PARTITION BY user_id) AS share,
       ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY amount DESC) AS rank
FROM transactions;
```

## Indexing

| Access pattern | Index |
|---|---|
| `WHERE status = 'active'` (few distinct values) | Partial: `CREATE INDEX ON jobs (created_at) WHERE status = 'pending'` |
| `WHERE tenant_id = $1 ORDER BY created_at DESC` | Composite `(tenant_id, created_at DESC)` — tenant first, always |
| `SELECT ... covering, no table lookup` | `INCLUDE`: `CREATE INDEX ON orders (customer_id) INCLUDE (total)` |
| `WHERE jsonb->>'x' = ...` / `@>` | GIN on the jsonb expression |
| `WHERE name ILIKE '%term%'` | Not B-tree; trigram (`pg_trgm` GIN) or full-text search |
| `WHERE daterange @> $1` | GiST on the range column |

- Composite index column order: equality columns first, then range/sort columns.
- Every index slows writes and costs storage — justify each one with a query.
- Drop unused indexes: check `pg_stat_user_indexes.idx_scan = 0` (after a
  representative workload period).

## Performance Diagnosis

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;   -- actual execution, cache hits
-- Red flags in output:
--   Seq Scan on big table with a selective WHERE  -> missing index
--   rows removed by filter: millions              -> bad index or stale stats
--   actual rows >> estimated rows (10x+)          -> ANALYZE the table
--   nested loop over an inner join with many rows -> should be hash/merge join
```

- Locks: `pg_locks` joined with `pg_stat_activity` shows who blocks whom;
  `pg_cancel_backend(pid)` cancels a query, `pg_terminate_backend(pid)` kills the
  session — the latter is a last resort.
- Connection issues: size the pool to `max_connections` minus reserve; use PgBouncer in
  transaction mode for high connection churn.
- Bloat/autovacuum: dead tuples growing means vacuum can't keep up — check
  `pg_stat_user_tables.n_dead_tup` and autovacuum thresholds before adding RAM.

## Migrations

- Add columns as nullable or with defaults; backfill in batches on large tables; only
  then add `NOT NULL`/constraints.
- Create indexes concurrently (`CREATE INDEX CONCURRENTLY`) on live tables — plain
  `CREATE INDEX` locks writes.
- Never `ALTER` a column type in place on a large table; add new, backfill, swap.
- Every migration needs a tested rollback story, even if rollback is "forward fix".

## Anti-Patterns

- **SELECT \***: fetches unneeded columns, breaks covering indexes, couples to schema.
- **OFFSET pagination** on large tables.
- **Indexes on every column "just in case"**: write amplification with no reader.
- **App-side uniqueness checks** (`SELECT` then `INSERT`) without a DB `UNIQUE` constraint — race condition by default.
- **Transactions around remote calls** (HTTP, queues): holds locks while waiting on the network.
- **Implicit joins via comma-separated tables**: use explicit `JOIN ... ON`; missing
  `WHERE` linkage produces cross products silently.
