# Multiple dashboards in one app

This is optional. Most apps built on this template are one dashboard, and nothing here is needed for that. Keep a single entry in `src/app/dashboards.ts` and the app behaves exactly like a single dashboard: no hub page, no switcher, unprefixed routes.

This guide covers the other case: several dashboards in one app, each with its own pages, behind a shared hub.

## Do you need a hub?

| Situation | Use |
| --- | --- |
| One team, one subject, up to roughly 15 pages | **One dashboard.** The drawer's sections are enough structure. |
| Several subjects for the same people (ridership, accessibility, maintenance) that share sign-in, theme, and often data | **A hub.** One deploy, one design, a switcher between dashboards. |
| Different audiences or permissions, separate release schedules, or data one group must not download | **Separate apps** from the same template. The hash router has no access control: anything in the bundle or under `public/` is readable by anyone who can load the app. |
| One dashboard with a few pages for a second audience | **One dashboard** with an extra drawer section, not a second dashboard. |

A rule of thumb: if the dashboards would want different names in the browser tab, logos, or login rules, they are separate apps.

## How the hub works

- `src/app/dashboards.ts` lists the dashboards. Order there is the order on the hub and in the switcher.
- Each dashboard is a folder, `src/dashboards/<id>/`, whose `index.ts` exports a `Dashboard`:

  ```ts
  export const accessibilityDashboard: Dashboard = {
    id: 'accessibility',           // URL segment: #/accessibility/...
    name: 'Station accessibility',
    description: 'Where riders enter stations without step-free access.',
    icon: Accessibility,
    tag: 'Example',                // optional label on the hub card
    summary: Summary,              // optional live figure on the hub card
    sections: [{ items: [{ path: '/', label: 'Step-free access', icon: Accessibility, page: withData(AccessibilityPage) }] }],
  }
  ```

  Section and item paths are **relative to the dashboard**: `/` is its home, `/rail` a page in it.
- `src/app/routes.tsx` turns that into routes. With one dashboard, its sections are used as they are. With two or more:
  - `#/` is the hub page (`src/pages/HubPage.tsx`): one card per dashboard.
  - Each dashboard mounts under `/<id>`: `#/cta`, `#/cta/rail/station?id=40380`.
  - Inside a dashboard, the drawer shows "All dashboards", that dashboard's sections (its first, untitled section is headed with the dashboard's name), and Settings.
  - The top bar gets a dashboard switcher (`src/app/HubShell.tsx`).
  - Settings (`#/settings`) and the theme are global.
  - Links from before the hub existed (`#/rail`, old shared Explore links) redirect into the first dashboard.
- `AppShell` is unchanged: `HubShell` feeds it the drawer for the current path.

## Adding a dashboard

1. Copy `src/dashboards/starter/` to `src/dashboards/<id>/`. The id becomes the URL segment: lowercase letters, digits and dashes. `settings` is reserved.
2. Rename the export in `index.ts` and fill in `name`, `description`, `icon` and `sections`.
3. Add it to `DASHBOARDS` in `src/app/dashboards.ts`.
4. Add pages under `src/dashboards/<id>/pages/`, lazy-loaded from `index.ts` as the CTA dashboard does, so a dashboard costs nothing until someone opens it.
5. Run `npm run typecheck` and `npm run build`, and open `#/` to see the new card.

To go back to one dashboard, remove the others from `DASHBOARDS`. The hub switches itself off and routes lose their prefix.

## Conventions

### Links

Pages must work with and without the hub, so never write `#/...` or pass an absolute path to `href`/`navigate` for a page inside your dashboard.

| To | Use |
| --- | --- |
| A page in the current dashboard | `dashHref('/rail')` for `<a>`, `dashNavigate('/rail')` in handlers (`@/app/hub`) |
| A page in another dashboard | `href(pathIn('cta', '/rail/station?id=40380'))` |
| A global page | `href('/settings')`, `navigate('/')` |

### Where code lives

| Code used by | Lives in |
| --- | --- |
| One dashboard | `src/dashboards/<id>/` (`pages/`, `features/`, `Summary.tsx`) |
| Several dashboards on the same subject | `src/features/<domain>/` (here: `src/features/transit/`, used by CTA ridership and Station accessibility) |
| Every dashboard | `src/components/`, `src/lib/`, `src/hooks/` |

Don't import from another dashboard's folder. If two dashboards need the same thing, move it to `src/features/`.

### Data

Each dashboard picks one of three patterns. `src/dashboards/starter` lists them for whoever copies it.

1. **Share a semantic dataset.** Read an existing dataset with `useDataset` and `useQuery`, under `withData`. Station accessibility does this with the CTA semantic layer: same metric definitions and numbers, no copies. Charts link to the dataset's own Explore page through `semanticPath()` (`src/features/semantic/config.ts`).
2. **Own a dataset.** Put its snapshot under `public/data/<id>/` and give it its own loader and data boundary in `src/dashboards/<id>/features/`. For a semantic layer, either add semantic models to the existing dbt project (one warehouse, one manifest) or give the dashboard its own dbt project and manifest. Use one project when the dashboards share entities (stations, routes); use separate projects when they share nothing.
3. **Call an API.** Fetch from a hook in the dashboard's folder, and render loading, empty and error states. Secrets belong on a server, never in the bundle.

Two rules apply to all three:

- **Load lazily.** A dashboard must not download another dashboard's data until someone opens it. The one exception is a hub card's `summary`, which renders on the hub, so keep it to one cheap query.
- **Scope saved state.** Saved views, pins and other preferences belong to a dataset. The CTA ones are stored under `explore.views`. A second semantic dataset should use its own key (for example `<id>.explore.views`) so views from one never appear in the other.

### Design

- One theme for the whole hub. Don't give each dashboard its own palette, and never tell dashboards apart with status colors (green, amber, red, blue already mean good, attention, error and information).
- Tell dashboards apart by icon and name. The hub card, switcher and drawer heading all use them.
- `tag` is for labels like "Example", "Template" or "Beta". It shows on hub cards and in the switcher, but not in the drawer, where badges are for counts.

### Checklist for a new dashboard

- [ ] Folder `src/dashboards/<id>/` with `index.ts`; listed in `src/app/dashboards.ts`.
- [ ] Pages lazy-loaded; data pages wrapped in their dataset's boundary.
- [ ] Links use `dashHref` / `dashNavigate` / `pathIn`; no hand-written `#/`.
- [ ] No imports from another dashboard's folder.
- [ ] Its data loads only when it's opened (summary aside).
- [ ] Saved state keyed by its dataset.
- [ ] `npm run typecheck` and `npm run build` pass; the hub and the dashboard render in light and dark.

## The dashboards in this repo

| Dashboard | Shows |
| --- | --- |
| `cta`: CTA ridership | The full pattern: many pages, its own semantic dataset, Explore, saved views, a hub summary. |
| `accessibility`: Station accessibility | A light dashboard that **shares** the CTA dataset and links back into the CTA dashboard. |
| `starter`: New dashboard | A blank scaffold to copy. It loads no data and shows no numbers. |
