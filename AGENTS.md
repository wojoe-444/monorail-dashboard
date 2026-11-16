# Working in this app

This app was started from the MonoRail UI template. Its layout, theme and components are already decided. Build features with them; don't redesign them.

## Commands

```sh
npm install
npm run dev        # Vite dev server
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build into dist/
npm run ui:add -- tabs table   # add shadcn/ui components (see "Components first")
```

Run `npm run typecheck` and `npm run build` before you call a change done. Code style is in `.prettierrc.json`: single quotes, no semicolons.

## Stack

React 19, TypeScript (strict), Vite, Tailwind CSS v4, Radix primitives (`radix-ui`), lucide-react icons. Components follow shadcn/ui conventions. Import from `@/…` (the alias for `src/`), never with long relative paths.

## Where things live

| Path | What it is |
| --- | --- |
| `src/app/config.ts` | App name, tagline, storage prefix, default theme. Edit first in a new app. |
| `src/app/dashboards.ts` | The dashboards in the app. One entry = a plain single dashboard; two or more = a hub (see "Multiple dashboards"). |
| `src/dashboards/<id>/index.ts` | A dashboard's pages and drawer sections. **The place to add a page.** |
| `src/dashboards/<id>/pages/` | One file per page of that dashboard. |
| `src/app/routes.tsx` | Global routes (hub home, Settings) and which drawer to show for a path. Rarely edited. |
| `src/app/hub.ts` | Dashboard type and dashboard-relative links: `dashHref`, `dashNavigate`, `pathIn`. |
| `src/pages/` | Global pages (Settings, Not found, the hub), and `ComponentsPage` as a usage reference. |
| `src/components/layout/` | `AppShell`, `SideNav`, `TopBar`, `PageHeader`, `BrandMark`, nav types. |
| `src/components/ui/` | The UI kit (Button, Card, Dialog, …). |
| `src/components/charts/` | `StatTile`, `Sparkline`, `Legend`, `ChartTooltipContent`, series colors. |
| `src/components/theme/ThemePicker.tsx` | Appearance card used on the Settings page. |
| `src/lib/theme.ts` | Mode + palette store: `useThemeMode`, `usePalette`, `setThemeMode`, `setPalette`. |
| `src/lib/palettes.ts` | The color schemes. Each expands into every color token. |
| `src/lib/prefs.ts` | `prefs` / `readJson` / `writeJson`: localStorage that survives storage being unavailable. |
| `src/lib/router.ts` | Hash router: `useRoute`, `navigate`, `href`, `useSearchParams`. |
| `src/styles/theme.css` | Token defaults, the Tailwind `@theme` mapping, base styles. |

Feature code that isn't a page goes in `src/features/<feature>/` (components, hooks, API calls for that feature). Shared hooks go in `src/hooks/`.

## Adding a page

1. Create `src/dashboards/<id>/pages/ThingsPage.tsx` exporting `function ThingsPage()`.
2. Add it to the dashboard's `sections` in `src/dashboards/<id>/index.ts`: `{ path: '/things', label: 'Things', icon: Boxes, page: ThingsPage }`. Paths are relative to the dashboard (`/` is its home); in hub mode they mount under `/<id>`. Pick an icon from lucide-react.
   - Put it in an existing section or add a `{ heading: 'Section', items: [...] }`.
   - Subpages: add `children: [...]` to an item (one level deep). The breadcrumb shows Section > Parent > Page.
   - Canvas, editor or map pages: add `layout: 'full'` (no padding or max width, and the page handles its own scrolling).
   - Detail pages that shouldn't be in the drawer: add them as a `hidden: true` child of the list page, so the breadcrumb reads Section > Things > Thing and the drawer keeps Things highlighted. Pass the id as a query: `dashNavigate('/things/detail?id=42')`, then `useSearchParams().get('id')` in the page.
   - Links: use `dashNavigate('/path')` in click handlers, and `<a href={dashHref('/path')}>` for real links (rows, cards, text links) so open-in-new-tab works. Both come from `@/app/hub` and resolve inside the current dashboard, so a page works with or without the hub. To link into another dashboard use `href(pathIn('cta', '/rail'))`. Never write `#/...` by hand.
3. Start the page the standard way:

```tsx
export function ThingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Things" description="One line on what this page is for." actions={<Button>New thing</Button>} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">{/* cards */}</div>
    </div>
  )
}
```

`src/pages/ComponentsPage.tsx` shows every component in use, and `src/dashboards/cta/pages/` shows them in a real dashboard. Copy patterns from them.

## Design rules

**Colors: tokens only.** Every color comes from the theme tokens through Tailwind classes. Never use hex, `rgb()`, or Tailwind's own palette (`bg-blue-500`, `text-gray-600`). Those don't follow the palette or dark mode.

| Use | Classes |
| --- | --- |
| Page / text | `bg-background`, `text-foreground`, `text-muted-foreground` |
| Surfaces | `bg-card` (+ `text-card-foreground`), `bg-popover`, `bg-muted`, `bg-secondary` |
| Brand | `bg-primary text-primary-foreground` (solid), `bg-primary-soft text-primary-soft-foreground` (tinted) |
| Second brand color | `bg-highlight`, `bg-highlight-soft text-highlight-soft-foreground` |
| Status | `success`, `warning`, `info`, `destructive`, each solid (`bg-success`) or soft (`bg-success-soft text-success-soft-foreground`) |
| Lines | `border` (uses `--border`), `border-input`, `ring-ring` |
| Hover on neutral items | `hover:bg-accent hover:text-accent-foreground` |
| Drawer only | `sidebar-*` tokens |
| Charts | `var(--series-1)` … `var(--series-6)`, `var(--series-other)`, via `SERIES_COLORS` / `colorForSeries` |

Opacity modifiers are fine (`bg-primary/10`). Status hues mean the same thing in every palette: green = good, amber = needs attention, red = error or destructive, blue = information. Don't use them for decoration.

**Components first.** Use the kit before writing markup: `Button` (variants `default`, `soft`, `outline`, `secondary`, `ghost`, `link`, `destructive`; sizes `sm`, `default`, `lg`, `icon`), `Card` + `CardHeader`/`CardTitle`/`CardDescription`/`CardAction`/`CardContent`/`CardFooter`, `Badge` for status, `Dialog` for modal tasks, `DropdownMenu` for row actions, `Tooltip` for icon-only buttons, `Segmented` for a compact 2–4 option toggle (view mode, filter, time range), `NativeSelect` for picking from a list, `Switch` for on/off settings, `StatTile` for KPIs.

Need a component the kit doesn't have (tabs for switching between panels of content, table, popover, sheet, command, calendar)? Add it with **`npm run ui:add -- <name>`**, not `npx shadcn add` directly. The wrapper runs the shadcn CLI, so the file lands in `src/components/ui/` styled with the theme tokens. Then it points the new file's `cn` import at `@/lib/utils`, because shadcn 4 otherwise adds a separate `cn` npm package. Afterwards, check the new component's colors are token classes. Restyle surfaces to match the kit if needed (e.g. active states use `bg-card shadow-elevation-1` like `Segmented`).

**Layout and spacing.**
- Blocks on a page: `flex flex-col gap-8`. Cards in a grid: `gap-4`. Inside a card: `gap-4` or `gap-6`.
- Responsive grids always set a base column: `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`. Without `grid-cols-1`, the column grows to fit its content and the page scrolls sideways on phones.
- Give flex children that hold long text `min-w-0` and the text `truncate`.
- One primary (`default`) button per view. Everything else is `outline`, `ghost`, `soft` or `secondary`.
- Page titles come from `PageHeader`. Don't add another `h1`.
- Radius comes from the theme (`rounded-md`, `rounded-lg`, `rounded-xl`). Don't use arbitrary values.

**Type.** Inter is the UI font, JetBrains Mono (`font-mono`) is for code and ids. Use `tabular-nums` for numbers that line up. Sizes: `text-2xl` page titles (in PageHeader), `text-sm` body, `text-xs` meta and labels.

**Accessibility.** Every input has a `Label`. Icon-only buttons get an `aria-label` (and usually a `Tooltip`). Use `button` for actions and links for navigation. Don't remove focus rings.

## Theme

- The person picks mode and palette in Settings > Appearance, or toggles light/dark in the top bar. The choice is saved under `APP.storagePrefix`.
- To change the app's default look, set `defaultMode` / `defaultPalette` in `src/app/config.ts` (palette ids are in `src/lib/palettes.ts`). That's all it takes: the theme is applied before React's first render. The `:root` values in `theme.css` only show for the instant before the script loads.
- To add a brand palette, add an entry to `PALETTES` in `src/lib/palettes.ts` (primary hue/chroma, neutral hue/chroma, drawer style). Don't edit token values in `theme.css` to restyle. `theme.ts` overwrites them at runtime.
- Read the current mode with `useThemeMode()` when code needs it (e.g. a chart library's theme option).

## Don't

- Don't add another CSS framework, component library or icon set.
- Don't put new global CSS in `theme.css` for one feature. Use Tailwind classes in the component.
- Don't call `localStorage` directly. Use `prefs`, which handles blocked storage and prefixes keys per app.
- Don't change the drawer, top bar or theme system to build a feature. If the app truly needs a different shell, change `AppShell` once, deliberately.

## Multiple dashboards (optional)

Most apps are one dashboard, and that stays the default: with one entry in `src/app/dashboards.ts` there is no hub page, no switcher, and routes are unprefixed. Register a second dashboard and the app becomes a hub: `/` lists the dashboards, each lives under `/<id>`, the top bar gets a switcher, and the drawer shows only the current dashboard's pages. Settings and the theme are shared.

- A dashboard is a folder, `src/dashboards/<id>/`, with an `index.ts` exporting a `Dashboard` (`id`, `name`, `description`, `icon`, `sections`, optional `summary` and `tag`). Copy `src/dashboards/starter/` to begin.
- Code only one dashboard uses stays in its folder. Code two dashboards share goes in `src/features/<domain>/`. Don't import one dashboard's folder from another.
- Link with `dashHref` / `dashNavigate`. Cross-dashboard links use `pathIn(id, path)`.
- Data: share an existing dataset (as `src/dashboards/accessibility` shares the CTA semantic layer) or give the dashboard its own under `public/data/<id>/` with its own loader. A dashboard must not download another's data until someone opens it; hub card `summary` components are the exception, so keep them cheap.
- When a hub is the wrong tool (different audiences, permissions or release schedules), and the full conventions: `docs/multiple-dashboards.md`.

## This app: CTA ridership on a semantic layer

- **Numbers come from the semantic layer.** Pages ask questions with `useQuery` / `useQueryOrThrow` (`src/features/semantic/useQuery.ts`) in MetricFlow terms: `{ metrics, groupBy: ['metric_time__week', 'station__sector'], where, timeRange }`. Don't aggregate fact tables by hand in a page. If a page needs a number no metric gives, add the metric to `semantic/models/semantic/metrics.yml` and run `npm run data:build`. The exception is `src/features/transit/exceptions.ts`, which needs a per-day baseline per entity.
- **Data pages are wrapped in `withData`** in `src/dashboards/cta/index.ts`. Inside them, `useDataset()` gives the engine plus typed stations, lines, routes and day types.
- **Pages live in `src/dashboards/cta/pages/`**; shared transit code in `src/features/transit/` (also used by the accessibility dashboard).
- **Charts sit in `ChartCard`** (`src/features/semantic/components/ChartCard.tsx`). Pass `view` (a `ViewSpec`) and `result`, and the card gets a table view, CSV, Open in Explore, Pin to board and Copy as mf query.
- **Page state goes in the URL** via `useRangeParam` / `useUrlParams`. Date ranges are presets relative to the last day with data (`src/features/semantic/ranges.ts`).
- **Line colors** (Red Line red, and so on) are the one exception to "tokens only". They are official CTA wayfinding colors, stored as data in the dbt seed `semantic/seeds/lines.csv` and drawn only through `LineSwatch` / `LineChip` or as a line's chart series color. Text never takes a line color.
- **After editing `semantic/`**, run `npm run data:build` and `npm run semantic:parity`. Add a parity query when you add a new kind of metric.
- **Engine files in `src/features/semantic/core`** use relative imports with `.ts` extensions and erasable TypeScript only, so Node runs them directly in `scripts/parity.mjs`.

## Starting a new app from this template

1. Set `name`, `tagline` and `storagePrefix` in `src/app/config.ts`, `"name"` in `package.json` (then `npm install` to sync the lockfile), and `<title>` in `index.html`.
2. Replace the sample content with your own dashboard in `src/dashboards/` and list it in `src/app/dashboards.ts`. Taking `ComponentsPage` out of the routes is fine. Keep the file as a usage reference until the app no longer needs it, then delete it. Delete `PlaceholderPage` once no route uses it.
3. Replace `public/favicon.svg` (it shows an "M"). Optionally swap the `BrandTile` initial for a logo.
4. Rewrite `README.md` for the app.
