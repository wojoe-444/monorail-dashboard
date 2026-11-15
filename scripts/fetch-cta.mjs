#!/usr/bin/env node
/**
 * Step 1 of the data pipeline: download the CTA source tables from the City of
 * Chicago open data portal (Socrata) into semantic/data/raw/ as CSV.
 *
 *   node scripts/fetch-cta.mjs            # ridership since 2019-01-01
 *   node scripts/fetch-cta.mjs 2021-01-01 # a different start date
 *
 * Next: `npm run data:build` (dbt build + snapshot export). See README "Data pipeline".
 *
 * Source: Chicago Transit Authority via data.cityofchicago.org. Use is subject
 * to the City of Chicago Data Portal terms of use.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(ROOT, 'semantic', 'data', 'raw')
const PORTAL = 'https://data.cityofchicago.org'
const START = process.argv[2] ?? '2019-01-01'
const PAGE = 200_000

const SOURCES = [
  {
    file: 'rail_station_entries.csv',
    id: '5neh-572f',
    select: 'station_id,stationname,date,daytype,rides',
    where: `date >= '${START}'`,
    order: 'date,station_id',
  },
  {
    file: 'bus_route_rides.csv',
    id: 'jyb9-n7fm',
    select: 'route,date,daytype,rides',
    where: `date >= '${START}'`,
    order: 'date,route',
  },
  {
    // Small tables come down as JSON: the location column holds newlines that a line-based CSV split would break.
    file: 'l_stops.csv',
    id: '8pix-ypme',
    json: true,
    select: 'stop_id,direction_id,stop_name,station_name,station_descriptive_name,map_id,ada,red,blue,g,brn,p,y,pnk,o,location',
    order: 'map_id,stop_id',
    columns: ['stop_id', 'direction_id', 'stop_name', 'station_name', 'station_descriptive_name', 'map_id', 'ada', 'red', 'blue', 'g', 'brn', 'p', 'y', 'pnk', 'o', 'latitude', 'longitude'],
    map: (r) => ({ ...r, latitude: r.location?.latitude, longitude: r.location?.longitude }),
  },
  { file: 'bus_routes.csv', id: '6uva-a5ei', json: true, select: 'route,name', order: 'route', columns: ['route', 'name'] },
]

const csvCell = (v) => {
  if (v === undefined || v === null) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function downloadJson(src) {
  const q = new URLSearchParams({ $select: src.select, $order: src.order, $limit: '50000' })
  const res = await fetch(`${PORTAL}/resource/${src.id}.json?${q}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${src.id}`)
  const rows = (await res.json()).map(src.map ?? ((r) => r))
  const lines = [src.columns.join(','), ...rows.map((r) => src.columns.map((c) => csvCell(r[c])).join(','))]
  await writeFile(join(RAW, src.file), lines.join('\n') + '\n')
  console.log(`  ${src.file}: ${rows.length.toLocaleString()} rows`)
  return rows.length
}

async function fetchText(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { Accept: 'text/csv' } })
    if (res.ok) return res.text()
    if (attempt >= 4) throw new Error(`${res.status} ${res.statusText} for ${url}`)
    await new Promise((r) => setTimeout(r, attempt * 2000))
  }
}

async function download(src) {
  let header = null
  const rows = []
  for (let offset = 0; ; offset += PAGE) {
    const q = new URLSearchParams({ $select: src.select, $order: src.order, $limit: String(PAGE), $offset: String(offset) })
    if (src.where) q.set('$where', src.where)
    const text = await fetchText(`${PORTAL}/resource/${src.id}.csv?${q}`)
    const lines = text.split('\n').filter((l) => l.trim() !== '')
    header ??= lines[0]
    const body = lines.slice(1)
    for (const line of body) rows.push(line)
    process.stdout.write(`  ${src.file}: ${rows.length.toLocaleString()} rows\r`)
    if (body.length < PAGE) break
  }
  await writeFile(join(RAW, src.file), [header, ...rows].join('\n') + '\n')
  process.stdout.write('\n')
  return rows.length
}

async function metadata(id) {
  const res = await fetch(`${PORTAL}/api/views/${id}.json`)
  if (!res.ok) return {}
  const m = await res.json()
  return {
    name: m.name,
    attribution: m.attribution,
    license: m.license?.name ?? 'City of Chicago Data Portal terms of use',
    rowsUpdatedAt: m.rowsUpdatedAt ? new Date(m.rowsUpdatedAt * 1000).toISOString() : null,
    url: `${PORTAL}/d/${id}`,
  }
}

await mkdir(RAW, { recursive: true })
console.log(`Fetching CTA open data (ridership since ${START})`)
const sources = []
for (const src of SOURCES) {
  const rowCount = src.json ? await downloadJson(src) : await download(src)
  sources.push({ file: src.file, id: src.id, rowCount, ...(await metadata(src.id)) })
}
const meta = { fetchedAt: new Date().toISOString(), start: START, sources }
await writeFile(join(RAW, 'sources.json'), JSON.stringify(meta, null, 2) + '\n')
console.log('Done. Next: npm run data:build')
