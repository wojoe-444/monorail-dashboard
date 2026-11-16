import { Database, FileCode2, FolderTree, Network } from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const STEPS = [
  { title: 'Copy this folder', body: 'Copy src/dashboards/starter to src/dashboards/<your-id> and rename the export in index.ts.' },
  { title: 'Register it', body: 'Add it to DASHBOARDS in src/app/dashboards.ts. Order there is the order on the hub and in the switcher.' },
  { title: 'Add pages', body: "List them in the dashboard's sections, with paths relative to the dashboard ('/' is its home). Link with dashHref and dashNavigate." },
  { title: 'Pick a data source', body: 'Reuse an existing semantic dataset, add your own snapshot and loader, or call an API. See the options below.' },
  { title: 'Delete what you do not need', body: 'Remove this starter from DASHBOARDS once you have your own. With one dashboard left, the hub switches itself off.' },
]

const DATA_OPTIONS = [
  {
    icon: Network,
    title: 'Share a semantic dataset',
    body: 'Read the CTA semantic layer with useDataset and useQuery, as the Station accessibility dashboard does. Same metric definitions, no copied numbers.',
  },
  {
    icon: Database,
    title: 'Add your own dataset',
    body: 'Give the dashboard its own dbt models or snapshot under public/data/<id>/ and its own loader and data boundary. Keep it inside src/dashboards/<id>/ unless another dashboard needs it.',
  },
  {
    icon: FileCode2,
    title: 'Call an API',
    body: 'Fetch in a hook under src/dashboards/<id>/ and render loading, empty and error states. Keep secrets on a server, never in the bundle.',
  },
]

/** The page a new dashboard starts from. It holds no data, so it never shows made-up numbers. */
export function StarterPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Starter"
        title="New dashboard"
        description="A blank dashboard to copy. It shows the folder layout and the steps to add a dashboard to this hub. See docs/multiple-dashboards.md."
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="gap-4 xl:col-span-2">
          <CardHeader>
            <CardTitle>Add a dashboard in five steps</CardTitle>
            <CardDescription>About fifteen minutes before the first page shows real data.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="grid grid-cols-[1.75rem_1fr] gap-3">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground">{i + 1}</span>
                  <span>
                    <span className="block text-sm font-medium">{s.title}</span>
                    <span className="block text-sm text-muted-foreground">{s.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="size-4 text-muted-foreground" aria-hidden />
              Folder layout
            </CardTitle>
            <CardDescription>Everything a dashboard owns lives in its folder.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">{`src/dashboards/<id>/
  index.ts        definition: id, name, icon, sections
  Summary.tsx     optional figure for the hub card
  pages/          one file per page
  features/       components and hooks only it uses
public/data/<id>/ its snapshot, if it has one`}</pre>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Where the data comes from</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {DATA_OPTIONS.map((o) => (
            <Card key={o.title} className="gap-3 px-5 py-5">
              <div className="flex items-center gap-2">
                <o.icon className="size-4 text-primary" aria-hidden />
                <span className="text-sm font-semibold">{o.title}</span>
              </div>
              <p className="text-sm text-muted-foreground">{o.body}</p>
            </Card>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        <Badge variant="outline" className="mr-2">
          Template
        </Badge>
        This dashboard is a scaffold. Remove it from src/app/dashboards.ts when you no longer need it.
      </p>
    </div>
  )
}
