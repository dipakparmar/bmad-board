import type { Scope } from './board-context';
import type { Workspace } from './use-board';

export interface Crumb {
  label: string;
  go: () => void;
  title?: string;
  className?: string;
}
const labelKey = (label: string) => label.normalize('NFKC').trim().toLowerCase().replace(/[\s_-]+/g, '-');

export function scopeBreadcrumbs(ws: Workspace | undefined, scope: Scope, go: (scope: Scope) => void): Crumb[] {
  if (!ws) return [];
  const project = ws.store.label.split(' · ')[0] ?? ws.store.label;
  const out: Crumb[] = [{ label: project, title: `All tickets in ${ws.store.label}`, go: () => go({ workspaceId: ws.store.id }) }];
  const initiative = ws.tree?.initiatives.find((i) => i.slug === scope.initiative);
  // v6 adds a project-named initiative. A sole same-named level adds no context to the path.
  const redundant = ws.tree?.initiatives.length === 1 && initiative && labelKey(initiative.title) === labelKey(project);
  if (initiative && !redundant) out.push({ label: initiative.title, title: `Tickets in ${initiative.title}`, go: () => go({ workspaceId: ws.store.id, initiative: initiative.slug }) });
  if (scope.epic === 'backlog') out.push({ label: 'Backlog', go: () => go({ workspaceId: ws.store.id, epic: 'backlog' }) });
  else {
    const epic = initiative?.epics.find((e) => e.slug === scope.epic);
    if (epic) out.push({ label: epic.title, title: `Tickets in ${epic.title}`, go: () => go({ workspaceId: ws.store.id, initiative: initiative?.slug, epic: epic.slug }) });
  }
  return out;
}
