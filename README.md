# Monorail Ops: CTA ridership dashboard

An operations dashboard for Chicago Transit Authority ridership, built on public CTA data and a dbt + MetricFlow semantic layer. Every number on every page comes from one set of metric definitions, and anyone can build, save and share their own views from those same definitions.

Built on the [MonoRail UI template](https://github.com/wojoe-444/monorail-ui) (React 19, TypeScript, Vite, Tailwind v4, Radix). See [`AGENTS.md`](./AGENTS.md) for the UI conventions.

## What's in it

| Page | For |
| --- | --- |
| **Overview** | Weekday ridership vs 52 weeks earlier and vs 2019, daily trend, day-type mix, busiest stations, biggest movers, lines, and the last week's exceptions. |
| **Rail stations** | All 145 'L' stations: weekday, Saturday and Sunday/holiday averages, change, recovery, share, 12-week trend. Filter by line, sector or ADA access. |
| **Station detail** | Daily entries against last year, the trend since 2019, a day-of-week profile, a 12-month calendar, exceptions, and nearby stations. |
| **Lines** | Weekday entries per line, both allocated (adds up) and at the line's stations (reach). |
| **Bus routes** and **Route detail** | The same treatment for 133 bus routes, including rail-replacement shuttles. |
| **Station map** | Stations at their real coordinates, sized by weekday entries, colored by change or recovery. |
| **Exceptions** | Closures, counting outages, events and diversions: days that ran far off the usual pattern for that weekday, merged into episodes. Adjustable sensitivity. |
| **Explore** | A query builder over the semantic layer: pick metrics, split them by time and dimensions, filter, save. Shows the equivalent `mf query`, how the query ran, and the YAML to make it a team view. |
| **My board** | Your saved and pinned views. |
| **Metrics** and **Data & quality** | The metric catalog, generated from the dbt definitions; sources, freshness, and the data-quality checks. |

Every chart has a table view, CSV export, "Open in Explore" and "Copy as mf query". Filters live in the URL, so any view is a link.

## Run it

```sh
npm install
npm run dev
```

The repo includes a data snapshot (`public/data/cta`, about 1.4 MB gzipped), so the app runs without Python or a database.

## Data pipeline

```
data.cityofchicago.org ──fetch──▶ semantic/data/raw/*.csv ──dbt build──▶ DuckDB marts ──export──▶ public/data/cta/*.json
                                         semantic/models/semantic/*.yml ──dbt parse──▶ semantic_manifest.json ──▶ src/features/semantic/manifest.json
```

| Command | What it does |
| --- | --- |
| `npm run data:fetch` | Download CTA ridership (since 2019), the 'L' stops list and bus route names from the Socrata API. |
| `npm run data:build` | `dbt build` (models plus 39 tests), export the marts, pack the snapshot, compile the semantic manifest. |
| `npm run data:pack` | Repack from the last export, without running dbt. |
| `npm run semantic:parity` | Run 12 queries through the browser engine **and** through `mf query` on DuckDB, and fail if any value differs. |

The dbt toolchain is needed only to refresh the data:

```sh
uv tool install "dbt-metricflow[dbt-duckdb]" --with-executables-from dbt-core
```

On Windows, set `PYTHONUTF8=1` before running `mf` in a terminal (its spinner prints an emoji the default code page can't encode). The npm scripts set it for you.

### Sources

All four tables come from the [City of Chicago data portal](https://data.cityofchicago.org) and are published by the Chicago Transit Authority. Use is subject to the portal's terms of use.

- [CTA – Ridership – 'L' Station Entries – Daily Totals](https://data.cityofchicago.org/d/5neh-572f)
- [CTA – Ridership – Bus Routes – Daily Totals by Route](https://data.cityofchicago.org/d/jyb9-n7fm)
- [CTA – System Information – List of 'L' Stops](https://data.cityofchicago.org/d/8pix-ypme)
- [CTA – Bus Routes](https://data.cityofchicago.org/d/6uva-a5ei)

The CTA publishes about eight weeks behind, so "last 28 days" means the 28 days before the last day with data.

## The semantic layer

`semantic/` is a regular dbt project on DuckDB:

- `models/staging`: typed, deduplicated source tables.
- `models/marts`: dimensions (stations, lines, routes, service days) and facts (station-days, route-days, station-line-days).
- `models/semantic/semantic_models.yml`: 7 MetricFlow semantic models with their entities, dimensions and measures.
- `models/semantic/metrics.yml`: 34 metrics (simple, ratio and derived, including weekday averages and "vs 52 weeks earlier").
- `models/semantic/saved_queries.yml`: 8 team views, which appear in Explore for everyone.

The browser runs those definitions with a small MetricFlow-compatible engine (`src/features/semantic/core`). It does joins through entities, metric filters, ratio and derived metrics, offset windows, and time grains from day to year, all over the same marts. `npm run semantic:parity` holds it to MetricFlow's answers.

**To add a metric:** add it to `metrics.yml`, then run `npm run data:build`. It appears in the Metrics catalog and in Explore. `scripts/build-data.mjs` fails the build if a definition uses something the browser engine does not run.

**To share a view:** build it in Explore, open "Share with the team", and paste the YAML into `saved_queries.yml` in a pull request.

Modeling decisions that affect the numbers:

- **Entries vs boardings.** Rail counts turnstile entries, so a transfer between 'L' lines inside a station is not counted. Bus counts boardings, so a bus-to-bus transfer counts twice. "Total rides" adds the two, as the CTA does.
- **Lines.** A turnstile can't tell which line a rider takes, so line metrics come two ways. *Allocated* splits a transfer station evenly across its lines, and lines sum to the system total. *At its stations* counts the whole station for every line that stops there, and shows reach.
- **"vs 52 weeks earlier"** offsets by 364 days, so weekdays line up. Offsets sit on simple metrics only. MetricFlow applies an offset on a ratio or derived input *after* aggregating at the query grain, so a 364-day offset at month grain never joins and returns nulls. The build enforces this rule.
- **Day types** come from the CTA feeds. A weekday the CTA ran a Sunday schedule counts as a holiday.
- **Sectors** are approximate, from each station's bearing to State & Madison, with "Loop" inside the elevated Loop. They are a navigation aid, not an official district.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload. |
| `npm run typecheck` | TypeScript check. |
| `npm run build` | Typecheck and production build to `dist/`. |
| `npm run ui:add -- <name>` | Add shadcn/ui components wired to this app's `cn`. |

## Licenses

See [licenses](./licenses) for shadcn/ui, Tailwind CSS, tw-animate-css, and the Inter and JetBrains Mono fonts. CTA data is subject to the City of Chicago data portal terms of use.
