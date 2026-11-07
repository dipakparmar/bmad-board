import { TicketTypeIcon } from '@/components/common/ticket-type-icon';
/** Kaneo-style list, grouped by epic in build order. Dragging rows inside an epic rewrites its tickets.toml order. */
import { usePaged } from '../common/show-more';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, GripVertical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { applyWithToast } from '@/app/actions';
import { useBoardContext } from '@/app/board-context';
import type { Ticket } from '@/app/view-model';
import { cn } from '@/lib/cn';
import { Assignee, HitlChip, ReadinessChip, RiskChip, StatusLabel, TypeChip } from '../board/chips';

interface Group {
  id: string;
  workspaceId: string;
  folder: string;
  title: string;
  subtitle: string;
  tickets: Ticket[];
  sortable: boolean;
}

function groupsOf(tickets: Ticket[]): Group[] {
  const groups = new Map<string, Group>();
  for (const t of tickets) {
    const folder = t.leaf.folder;
    const id = `${t.workspaceId}::${folder}`;
    let g = groups.get(id);
    if (!g) {
      const title = folder === 'backlog' ? 'Backlog' : t.epic?.title ?? t.initiative?.title ?? folder;
      const subtitle = folder === 'backlog' ? 'Standalone tickets' : `${t.epic ? `Epic ${t.epic.id ?? ''}` : 'Initiative'} · ${t.initiative?.title ?? ''}`;
      g = { id, workspaceId: t.workspaceId, folder, title, subtitle, tickets: [], sortable: folder !== 'backlog' && !t.readOnly };
      groups.set(id, g);
    }
    g.tickets.push(t);
  }
  return [...groups.values()];
}

function Row({ ticket, sortable }: { ticket: Ticket; sortable: boolean }) {
  const { select } = useBoardContext();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ticket.uid, disabled: !sortable });
  const { leaf } = ticket;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group flex h-10 items-center gap-3 border-border/60 border-b px-3 text-sm last:border-0 hover:bg-accent/50', isDragging && 'relative z-10 bg-background shadow-md')}
    >
      <button type="button" aria-label={`Reorder ${ticket.ref}`} className={cn('-ml-1 cursor-grab text-muted-foreground/50 hover:text-foreground', !sortable && 'invisible')} {...attributes} {...listeners}>
        <GripVertical className="size-3.5" />
      </button>
      <TicketTypeIcon type={leaf.type} />
      <span title={ticket.ref} className="w-12 shrink-0 truncate font-mono text-[11px] text-board-id">{ticket.ref}</span>
      <button type="button" onClick={() => select(ticket.uid)} className={cn('min-w-0 flex-1 truncate text-left font-medium', leaf.state === 'done' && 'font-normal text-muted-foreground line-through decoration-muted-foreground/40')}>
        {leaf.title}
      </button>
      <div className="hidden items-center gap-1 md:flex">
        <ReadinessChip readiness={ticket.readiness} />
        <TypeChip leaf={leaf} />
        <RiskChip leaf={leaf} />
        <HitlChip leaf={leaf} />
      </div>
      <span className="w-28 shrink-0"><StatusLabel leaf={leaf} /></span>
      <Assignee workspaceId={ticket.workspaceId} name={leaf.plan?.assignee} />
    </div>
  );
}

function GroupSection({ group }: { group: Group }) {
  const state = useBoardContext();
  const [open, setOpen] = useState(true);
  const [order, setOrder] = useState<string[] | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = order ?? group.tickets.map((t) => t.uid);
  const byUid = new Map(group.tickets.map((t) => [t.uid, t]));
  const rows = ids.map((id) => byUid.get(id)).filter((t): t is Ticket => !!t);
  // Rows come a page at a time; the hidden ones stay in `ids`, so reordering keeps them in place.
  const { visible, more } = usePaged(rows, 50);

  async function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    setOrder(next);
    const entryIds = next.map((uid) => byUid.get(uid)?.leaf.id).filter((id): id is number | string => id !== null && id !== undefined);
    await applyWithToast(state, group.workspaceId, [{ kind: 'reorder', folder: group.folder, order: entryIds }], `Build order of ${group.title} updated`);
    setOrder(null);
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 bg-board-lane px-3 py-2 text-left">
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', !open && '-rotate-90')} />
        <TicketTypeIcon type={group.folder === 'backlog' ? 'story' : group.tickets[0]?.epic ? 'epic' : 'initiative'} /><span className="font-medium text-[13px]">{group.title}</span>
        <span className="text-xs text-muted-foreground">{group.subtitle}</span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{group.tickets.filter((t) => t.leaf.state === 'done').length}/{group.tickets.length} done</span>
      </button>
      {open && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
          <SortableContext items={visible.map((t) => t.uid)} strategy={verticalListSortingStrategy}>
            {visible.map((t) => <Row key={t.uid} ticket={t} sortable={group.sortable && !state.search} />)}
          </SortableContext>
          {more}
        </DndContext>
      )}
    </section>
  );
}

export function ListView() {
  const { inScope } = useBoardContext();
  const groups = useMemo(() => groupsOf(inScope), [inScope]);
  const { visible, more } = usePaged(groups, 30);
  return <div className="flex flex-col gap-3 pb-6">{visible.map((g) => <GroupSection key={g.id} group={g} />)}{more}</div>;
}
