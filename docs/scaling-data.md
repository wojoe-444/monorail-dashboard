# Scaling to large source data

How to keep this dashboard fast, and looking exactly the same, when the source behind it is wide and large (say 70 columns and 100 million rows) instead of the CTA's 720,000 daily totals.

## The key idea: the serving grain

A chart rarely draws more than a few thousand points, and tables page. So the question is not how to move 100 million rows. It is: **what is the finest level of detail anyone slices by?** That level is the *serving grain*, for example one row per entity per day per a few filterable attributes. Detail finer than that never reaches the screen.

This app already works this way. The CTA publishes station × day totals rather than individual tap-ins, which is why 720,000 rows cover every page. With 100 million tap-level rows, the first step would be a dbt model that rolls them up to station × day × fare type, or whatever people actually filter by. That gives a few million rows, and no chart changes.

Wide tables matter less than they look. Columnar warehouses (Snowflake, BigQuery, Databricks, ClickHouse, DuckDB) read only the columns a query touches, and a dashboard query typically touches three to six.

## The options

| Approach | How it works | Good for |
| --- | --- | --- |
| **1. Query at interaction time** | The browser sends a semantic query (metrics, group-by, filters, time range). A server compiles it with MetricFlow, runs it on the warehouse, and returns only the result rows. | The default at real data volumes. The browser receives hundreds of rows, never millions. |
| **2. Pre-aggregated rollups** | dbt builds the serving-grain table, and extra rollups only where measured latency calls for them. | The heavy lifting: "scan 100M rows" becomes "scan 2M rows". |
| **3. Result caching** | Cache each query's result keyed by the query, so the fiftieth person to open the Overview gets it instantly. | Many users, or warehouse cost per query. Cheap and effective. |
| **4. Ship an extract to the browser** | What this app does today: a compact snapshot queried in the browser. DuckDB-WASM over Parquet can stretch this to hundreds of MB, reading only the columns and chunks it needs over HTTP. | Up to a few million aggregated rows, static hosting, no server. Not raw event data. |
| **5. Hybrid** | A snapshot or cache for overview pages, live queries for drill-downs into fine detail. | Where most operational dashboards end up. |

For large sources, combine 2, 1 and 3:

```
warehouse ──dbt──▶ serving-grain model ──▶ MetricFlow semantic layer ──▶ query API + cache ──▶ dashboard
```

## Pitfalls

- **One summary table per chart.** With ten slice-able dimensions you cannot pre-build every combination, and per-chart tables break whenever someone adds a filter. Keep one or a few serving tables and let the semantic layer compute each chart on demand. That is what columnar warehouses are good at.
- **Storing ratios or averages in a rollup.** A monthly "average weekday entries" cannot be combined correctly into a quarter (the average-of-averages trap). Store the parts, sums and counts, and let ratio metrics divide at query time, as `semantic/models/semantic/metrics.yml` does. Distinct counts (unique riders) need either the right grain or approximate sketches such as HyperLogLog.
- **Pre-aggregating on a hunch.** Start with the serving table. Add a rollup only for a query that is measurably slow or expensive, which in practice is usually the landing page.
- **Pulling detail into the browser.** Detail tables over large data need server-side paging and sorting. Very long daily series can be downsampled (for example with LTTB) without visible change.

## Where MetricFlow fits

- **Open-source MetricFlow** compiles semantic queries to SQL and runs them. It does not cache results or route queries to rollups. Point the semantic models at the serving-grain table; a rollup you add becomes its own semantic model.
- **The dbt Cloud Semantic Layer** adds the serving pieces: a query API (JDBC and GraphQL), caching, and exports that materialize saved queries as tables.
- **Cube** is the main alternative when you want automatic routing to rollups ("aggregate awareness") and a built-in cache, at the cost of a second modeling language.
- **Self-hosted:** a small Python service that compiles each request with MetricFlow, runs it on the warehouse, and caches results. A few hundred lines.

## Moving this app to a server

Pages ask for data only through `useQuery(spec)` in `src/features/semantic/useQuery.ts`, and the spec has the same shape as an `mf query` request. Moving to approach 1 is a change to that hook, not to the pages:

```ts
// Today: the in-browser engine answers the query.
return { result: engine.query(spec), error: null }

// With a server: POST the same spec and render the rows it returns.
const result = await fetch('/api/semantic/query', { method: 'POST', body: JSON.stringify(spec) }).then((r) => r.json())
```

Explore, saved views, team views and "Copy as mf query" keep working, because they already speak MetricFlow. During the move, `scripts/parity.mjs` becomes the test that the API and the browser engine agree. The page-level habits large data needs are already here: each page loads only its own data, charts keep their last render while refetching, filter typing is debounced into the URL, and tables page.

## Rough sizes

| Serving table | Where to query it |
| --- | --- |
| Under ~2M rows, a handful of columns | In the browser, as now (`public/data/`). |
| ~2M–50M rows | DuckDB-WASM over Parquet in the browser, or a server. |
| Over ~50M rows, many users, or data that must stay private | A server: warehouse + MetricFlow + cache. |

Data that some users must not see always belongs behind a server: anything shipped to the browser can be read by anyone who can load the app.
