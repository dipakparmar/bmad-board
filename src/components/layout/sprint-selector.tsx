import { CalendarDays } from 'lucide-react';
import { useBoardContext } from '@/app/board-context';
import { currentSprint } from '@/domain/sprints';

export function SprintSelector() {
  const { board, scope, tickets, filters, setFilters } = useBoardContext();
  const workspaces = board.workspaces.filter((w) => !scope.workspaceId || w.store.id === scope.workspaceId);
  const definitions = [...new Map(workspaces.flatMap((w) => w.tree?.sprints ?? []).map((s) => [s.id, s])).values()];
  const ids = [...new Set([...definitions.map((s) => s.id), ...tickets.filter((t) => !scope.workspaceId || t.workspaceId === scope.workspaceId).map((t) => t.leaf.sprint).filter((s): s is string => !!s)])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!ids.length) return null;
  const current = workspaces.map((w) => currentSprint(w.tree?.sprints ?? [])).filter((s) => !!s);
  const currentIds = [...new Set(current.map((s) => s.id))];
  const selection = filters.sprint ?? 'current';
  const selected = selection === 'current' ? current.length === 1 ? current[0] : undefined : definitions.find((s) => s.id === selection);
  const dates = selected?.start && selected.end ? `${selected.start} to ${selected.end}` : undefined;
  return <label className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs" title={dates ?? 'Filter every ticket view by sprint'}>
    <CalendarDays aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
    <span className="sr-only">Sprint</span>
    <select aria-label="Sprint" value={selection} onChange={(e) => setFilters((f) => ({ ...f, sprint: e.target.value }))} className="h-8 max-w-64 min-w-0 bg-transparent pr-1 text-xs outline-none">
      <option value="current">{currentIds.length === 1 ? `Current: ${currentIds[0]}` : currentIds.length > 1 ? 'Current sprint (per project)' : 'Current sprint (all tickets)'}</option>
      <option value="all">All tickets</option>
      <option value="unscheduled">Unscheduled</option>
      {ids.map((id) => <option key={id} value={id}>{id}</option>)}
      {!['current', 'all', 'unscheduled', ...ids].includes(selection) && <option value={selection}>{selection}</option>}
    </select>
    {dates && <span className="hidden whitespace-nowrap text-muted-foreground xl:inline">{dates}</span>}
  </label>;
}
