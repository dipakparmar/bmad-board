/**
 * The filter menu and the row of active filters under the header. Filters apply to every view and are
 * kept in the URL, so a filtered board can be shared as a link.
 */
import { ListFilter, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useBoardContext } from '@/app/board-context';
import { activeCount, facets, NO_FILTERS, UNASSIGNED, type Facet, type Filters } from '@/app/filters';
import type { Readiness } from '@/app/view-model';
import { RISK_LABELS, TYPE_LABELS, type BoardState, type LeafType, type Risk } from '@/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/cn';

const STATES: { value: BoardState; label: string }[] = [
  { value: 'backlog', label: 'Backlog' }, { value: 'in-progress', label: 'In progress' }, { value: 'review', label: 'Review' }, { value: 'done', label: 'Done' },
];
const READINESS: { value: Readiness; label: string }[] = [
  { value: 'ready', label: 'Ready to start' }, { value: 'refine', label: 'Refine first' }, { value: 'blocked', label: 'Blocked' }, { value: 'active', label: 'Being worked on' },
];
const TYPES: LeafType[] = ['story', 'spike', 'bug'];
const RISKS: Risk[] = ['low', 'medium', 'high'];
const KINDS: { value: Filters['kind']; label: string }[] = [{ value: 'all', label: 'Everyone' }, { value: 'people', label: 'People' }, { value: 'agents', label: 'Agents' }];

type ListKey = 'states' | 'readiness' | 'who' | 'types' | 'risk' | 'initiatives' | 'epics';

function Pill({ on, onClick, children, count }: { on: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn('inline-flex h-6 items-center gap-1 rounded-md border px-2 text-xs transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent')}>
      {children}
      {count !== undefined && <span className={cn('tabular-nums', on ? 'opacity-80' : 'text-muted-foreground')}>{count}</span>}
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

/** A long facet (people, epics): searchable, the busiest first, capped. */
function LongFacet({ title, items, selected, toggle, limit = 24 }: { title: string; items: Facet[]; selected: string[]; toggle: (v: string) => void; limit?: number }) {
  const [q, setQ] = useState('');
  const shown = items.filter((f) => selected.includes(f.value) || !q || f.label.toLowerCase().includes(q.toLowerCase()));
  const capped = [...shown.filter((f) => selected.includes(f.value)), ...shown.filter((f) => !selected.includes(f.value))].slice(0, Math.max(limit, selected.length));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</span>
        {items.length > 8 && <Input size="sm" className="ml-auto h-6 w-36 text-xs" placeholder={`Find ${title.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />}
      </div>
      <div className="flex flex-wrap gap-1">
        {capped.map((f) => <Pill key={f.value} on={selected.includes(f.value)} onClick={() => toggle(f.value)} count={f.count}>{f.label}</Pill>)}
        {shown.length > capped.length && <span className="self-center text-[11px] text-muted-foreground">+{shown.length - capped.length} more, search to narrow</span>}
      </div>
    </div>
  );
}

export function FilterMenu() {
  const { filters, setFilters, tickets, scope } = useBoardContext();
  const pool = useMemo(() => tickets.filter((t) => t.leaf.state !== 'dropped' && (!scope.workspaceId || t.workspaceId === scope.workspaceId)), [tickets, scope.workspaceId]);
  const f = useMemo(() => facets(pool), [pool]);
  // Epics narrow to the chosen initiatives.
  const epics = filters.initiatives.length ? f.epics.filter((e) => filters.initiatives.some((i) => e.value.startsWith(`${i}/`))) : f.epics;
  const toggle = (key: ListKey, value: string) =>
    setFilters((cur) => ({ ...cur, [key]: (cur[key] as string[]).includes(value) ? (cur[key] as string[]).filter((v) => v !== value) : [...(cur[key] as string[]), value] }));
  const n = activeCount(filters);
  const count = (pred: (t: (typeof pool)[number]) => boolean) => pool.reduce((a, t) => a + Number(pred(t)), 0);

  return (
    <Popover>
      <PopoverTrigger render={<Button size="sm" variant={n ? 'secondary' : 'ghost'} className={n ? '' : 'text-muted-foreground'} title="Filter every view (x)" data-filter-trigger />}>
        <ListFilter />Filter{n > 0 && <span className="rounded bg-primary px-1 text-[10px] font-medium tabular-nums text-primary-foreground">{n}</span>}
      </PopoverTrigger>
      <PopoverPopup align="end" className="w-[min(560px,calc(100vw-24px))]">
        <div className="flex max-h-[min(70vh,640px)] flex-col gap-4 overflow-y-auto p-3">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={filters.hideDone} onChange={(e) => setFilters((c) => ({ ...c, hideDone: e.target.checked }))} />Hide done</label>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={filters.hitl} onChange={(e) => setFilters((c) => ({ ...c, hitl: e.target.checked }))} />Needs a person</label>
            {n > 0 && <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setFilters(NO_FILTERS)}>Clear all</Button>}
          </div>
          <Group title="Status">{STATES.map((s) => <Pill key={s.value} on={filters.states.includes(s.value)} onClick={() => toggle('states', s.value)} count={count((t) => t.leaf.state === s.value)}>{s.label}</Pill>)}</Group>
          <Group title="Readiness">{READINESS.map((s) => <Pill key={s.value} on={filters.readiness.includes(s.value)} onClick={() => toggle('readiness', s.value)} count={count((t) => t.readiness === s.value)}>{s.label}</Pill>)}</Group>
          <Group title="Assigned to">{KINDS.map((k) => <Pill key={k.value} on={filters.kind === k.value} onClick={() => setFilters((c) => ({ ...c, kind: k.value }))}>{k.label}</Pill>)}</Group>
          <LongFacet title="People" items={f.who} selected={filters.who} toggle={(v) => toggle('who', v)} />
          <Group title="Type">{TYPES.map((t) => <Pill key={t} on={filters.types.includes(t)} onClick={() => toggle('types', t)} count={count((x) => x.leaf.type === t)}>{TYPE_LABELS[t].label}</Pill>)}</Group>
          <Group title="Risk">{RISKS.map((r) => <Pill key={r} on={filters.risk.includes(r)} onClick={() => toggle('risk', r)} count={count((x) => x.leaf.risk === r)}>{RISK_LABELS[r].label}</Pill>)}</Group>
          {f.initiatives.length > 1 && <LongFacet title="Initiatives" items={f.initiatives} selected={filters.initiatives} toggle={(v) => toggle('initiatives', v)} limit={30} />}
          {epics.length > 1 && <LongFacet title="Epics" items={epics} selected={filters.epics} toggle={(v) => toggle('epics', v)} />}
        </div>
      </PopoverPopup>
    </Popover>
  );
}

/** The active filters as removable chips; nothing when none are set. */
export function ActiveFilters() {
  const { filters, setFilters, tickets } = useBoardContext();
  if (!activeCount(filters)) return null;
  const titleOf = (key: ListKey, v: string) => {
    if (key === 'states') return STATES.find((s) => s.value === v)?.label ?? v;
    if (key === 'readiness') return READINESS.find((s) => s.value === v)?.label ?? v;
    if (key === 'types') return TYPE_LABELS[v as LeafType]?.label ?? v;
    if (key === 'risk') return RISK_LABELS[v as Risk]?.label ?? v;
    if (key === 'who') return v === UNASSIGNED ? 'Unassigned' : tickets.find((t) => t.leaf.plan?.assignee?.trim().toLowerCase() === v)?.leaf.plan?.assignee ?? v;
    if (key === 'initiatives') return tickets.find((t) => t.initiative?.slug === v)?.initiative?.title ?? v;
    return tickets.find((t) => t.epic && `${t.initiative?.slug}/${t.epic.slug}` === v)?.epic?.title ?? v;
  };
  const chips: { id: string; label: string; remove: () => void }[] = [];
  if (filters.hideDone) chips.push({ id: 'done', label: 'Done hidden', remove: () => setFilters((c) => ({ ...c, hideDone: false })) });
  if (filters.hitl) chips.push({ id: 'hitl', label: 'Needs a person', remove: () => setFilters((c) => ({ ...c, hitl: false })) });
  if (filters.kind !== 'all') chips.push({ id: 'kind', label: filters.kind === 'agents' ? 'Agents only' : 'People only', remove: () => setFilters((c) => ({ ...c, kind: 'all' })) });
  for (const key of ['states', 'readiness', 'who', 'types', 'risk', 'initiatives', 'epics'] as ListKey[]) {
    for (const v of filters[key] as string[]) chips.push({ id: `${key}:${v}`, label: titleOf(key, v), remove: () => setFilters((c) => ({ ...c, [key]: (c[key] as string[]).filter((x) => x !== v) })) });
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
      {chips.map((c) => (
        <span key={c.id} className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-muted/60 pl-2 pr-1 text-xs">
          {c.label}
          <button type="button" aria-label={`Remove ${c.label}`} onClick={c.remove} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-3" /></button>
        </span>
      ))}
      <button type="button" onClick={() => setFilters(NO_FILTERS)} className="text-xs text-muted-foreground underline-offset-2 hover:underline">Clear</button>
    </div>
  );
}
