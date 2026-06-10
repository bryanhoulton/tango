import { Database, LogOut, Table2, Zap } from 'lucide-react'
import { ActionIcon, cn } from 'slate-ui'

import type { AdminMetaDocument, AdminModelMeta, AdminUser } from '@/lib/api'
import { navigate, type AdminRoute } from '@/lib/router'

/**
 * Sidebar sections: one group per app (registration order), with app-less
 * models last. When nothing declares an app, the single group keeps the
 * plain "Models" heading.
 */
function groupByApp(
  models: readonly AdminModelMeta[]
): { label: string; models: AdminModelMeta[] }[] {
  const groups = new Map<string, AdminModelMeta[]>()
  const ungrouped: AdminModelMeta[] = []
  for (const model of models) {
    if (model.app === undefined) {
      ungrouped.push(model)
    } else {
      const group = groups.get(model.app)
      if (group === undefined) {
        groups.set(model.app, [model])
      } else {
        group.push(model)
      }
    }
  }
  const sections = [...groups].map(([label, grouped]) => ({
    label,
    models: grouped
  }))
  if (ungrouped.length > 0) {
    sections.push({ label: sections.length === 0 ? 'Models' : 'Other', models: ungrouped })
  }
  return sections
}

export function Layout({
  meta,
  user,
  route,
  onLogout,
  children
}: {
  meta: AdminMetaDocument
  user: AdminUser | undefined
  route: AdminRoute
  onLogout: () => void
  children: React.ReactNode
}) {
  const activeModel = 'model' in route ? route.model : undefined
  return (
    <div className="flex min-h-screen bg-neutral-50">
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r bg-neutral-50">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-500 text-white shadow-sm">
            <Database className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-sm font-semibold tracking-tight">
            {meta.site.title}
          </span>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
          {groupByApp(meta.models).map((section) => (
            <div key={section.label}>
              <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.models.map((model) => {
                  const active = model.name === activeModel
                  return (
                    <button
                      key={model.name}
                      onClick={() => navigate(`/m/${encodeURIComponent(model.name)}`)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                        active
                          ? 'bg-white font-medium text-neutral-900 shadow-sm ring-1 ring-neutral-200'
                          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                      )}
                    >
                      <Table2
                        className={cn(
                          'h-4 w-4 shrink-0',
                          active ? 'text-neutral-700' : 'text-neutral-400'
                        )}
                      />
                      <span className="truncate">{model.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {meta.functions.length > 0 && (
            <div>
              <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                Functions
              </p>
              <div className="space-y-0.5">
                {meta.functions.map((fn) => {
                  const active =
                    route.kind === 'function' &&
                    route.app === fn.app &&
                    route.name === fn.name
                  return (
                    <button
                      key={`${fn.app}/${fn.name}`}
                      onClick={() =>
                        navigate(
                          `/f/${encodeURIComponent(fn.app)}/${encodeURIComponent(fn.name)}`
                        )
                      }
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                        active
                          ? 'bg-white font-medium text-neutral-900 shadow-sm ring-1 ring-neutral-200'
                          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                      )}
                    >
                      <Zap
                        className={cn(
                          'h-4 w-4 shrink-0',
                          active ? 'text-neutral-700' : 'text-neutral-400'
                        )}
                      />
                      <span className="truncate">{fn.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </nav>
        <div className="border-t p-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-500 text-xs font-medium uppercase text-white">
              {user?.email?.charAt(0) ?? '?'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-900">
                {user?.email}
              </p>
              <p className="text-xs text-neutral-400">Staff</p>
            </div>
            <ActionIcon
              icon={LogOut}
              variant="subtle"
              tooltip="Sign out"
              onClick={onLogout}
            />
          </div>
        </div>
      </aside>
      <main className="ml-60 min-w-0 flex-1 bg-white">{children}</main>
    </div>
  )
}
