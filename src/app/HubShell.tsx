import { useEffect } from 'react'
import { Check, ChevronsUpDown, LayoutGrid } from 'lucide-react'

import { dashboardFor, dashboards, isHub, pathIn } from '@/app/hub'
import { navFor } from '@/app/routes'
import { AppShell } from '@/components/layout/AppShell'
import { findNavItem } from '@/components/layout/nav'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { navigate, useRoute } from '@/lib/router'

/**
 * The template's AppShell, fed the drawer for the current dashboard. In hub mode
 * the top bar gets a dashboard switcher. The shell itself is unchanged.
 */
export function HubShell() {
  const [path] = useRoute()
  // Links from before the hub (#/rail, #/explore?q=...) belong to the first dashboard: send them there.
  useEffect(() => {
    if (!isHub() || dashboardFor(path) || path === '/' || path.startsWith('/settings')) return
    const first = dashboards()[0]
    if (first && findNavItem(first.sections, path)) window.location.replace(`#${pathIn(first.id, path)}`)
  }, [path])
  return <AppShell sections={navFor(path)} topBarActions={isHub() ? <DashboardSwitcher path={path} /> : undefined} />
}

function DashboardSwitcher({ path }: { path: string }) {
  const current = dashboardFor(path)
  const Icon = current?.icon ?? LayoutGrid
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Dashboard: ${current?.name ?? 'All dashboards'}. Switch dashboard`}>
          <Icon />
          <span className="hidden max-w-48 truncate sm:inline">{current?.name ?? 'All dashboards'}</span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Dashboards</DropdownMenuLabel>
        {dashboards().map((d) => (
          <DropdownMenuItem key={d.id} onSelect={() => navigate(pathIn(d.id, '/'))} className="items-start">
            <d.icon className="mt-0.5" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2">
                <span className="truncate font-medium">{d.name}</span>
                {d.tag && <Badge variant="outline">{d.tag}</Badge>}
              </span>
              <span className="line-clamp-2 text-xs text-muted-foreground">{d.description}</span>
            </span>
            {current?.id === d.id && <Check className="mt-0.5" aria-label="Current" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/')}>
          <LayoutGrid />
          All dashboards
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
