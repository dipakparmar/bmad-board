/** Kaneo-style board: four lanes fixed by BMAD's board states. Dropping a card writes the matching status. */
import { usePaged } from '../common/show-more';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useState } from 'react';
import { toast } from 'sonner';
import { useBoardContext } from '@/app/board-context';
import { setStatus } from '@/app/actions';
import { COLUMNS, type Ticket } from '@/app/view-model';
import { statusForDrop, type BoardState } from '@/domain';
import { cn } from '@/lib/cn';
import { COLUMN_META, StateIcon } from './chips';
import { TaskCard, TaskCardBody } from './task-card';

function Column({ state, tickets, limit }: { state: BoardState; tickets: Ticket[]; limit?: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: state });
  const over = limit !== undefined && tickets.length > limit;
  const { visible, more } = usePaged(tickets, 40);
  return (
    <div ref={setNodeRef} className={cn('relative flex h-full min-h-0 w-full flex-col rounded-xl bg-board-lane transition-colors duration-150', isOver && 'ring-2 ring-board-card-ring')}>
      <div className="flex h-9 shrink-0 items-center gap-2 pt-1 pr-2 pl-3">
        <StateIcon state={state} />
        <span className="truncate font-medium text-[13px] text-board-title leading-5">{COLUMN_META[state].label}</span>
        <span className={cn('text-xs tabular-nums', over ? 'font-medium text-destructive' : 'text-board-id')} title={limit !== undefined ? `Work-in-progress limit: ${limit} (set in Settings)` : undefined}>
          {tickets.length}{limit !== undefined ? ` / ${limit}` : ''}
        </span>
        {over && <span className="ml-auto rounded bg-destructive/10 px-1.5 text-[11px] text-destructive">Over limit</span>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden p-1.5">
        {visible.map((t) => <TaskCard key={t.uid} ticket={t} />)}
        {more}
        {tickets.length === 0 && <div className="rounded-[10px] border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">No tickets</div>}
      </div>
    </div>
  );
}

export function KanbanBoard() {
  const state = useBoardContext();
  const [active, setActive] = useState<Ticket | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));

  const columns = COLUMNS.filter((c) => c.id !== 'done' || state.preferences.prefs.showDoneColumn);
  // WIP limits come from the project's settings; with several projects open, the scoped one's apply.
  const ws = state.board.workspaces.find((w) => w.store.id === state.scope.workspaceId) ?? (state.board.workspaces.length === 1 ? state.board.workspaces[0] : undefined);
  const limits: Partial<Record<BoardState, number>> = ws?.tree?.board?.wipLimits ?? {};

  function onDragEnd(e: DragEndEvent) {
    setActive(null);
    const ticket = e.active.data.current?.ticket as Ticket | undefined;
    const target = e.over?.id as BoardState | undefined;
    if (!ticket || !target || target === ticket.leaf.state) return;
    const status = statusForDrop(target, ticket.leaf.status);
    if (!status) return;
    if (status === 'done' && ticket.leaf.status !== 'built' && ticket.leaf.status !== 'in-review') {
      toast.message(`${ticket.ref} hasn't been built yet`, { description: 'Marked done anyway. BMAD only lets a person do this, so it is recorded as your call.' });
    }
    void setStatus(state, ticket, status);
  }

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActive((e.active.data.current?.ticket as Ticket) ?? null)} onDragCancel={() => setActive(null)} onDragEnd={onDragEnd}>
      <div className={cn('grid h-full min-h-0 gap-2', columns.length === 4 ? 'min-w-[880px] grid-cols-4' : 'min-w-[660px] grid-cols-3')}>
        {columns.map((c) => <Column key={c.id} state={c.id} limit={limits[c.id]} tickets={state.inScope.filter((t) => t.leaf.state === c.id)} />)}
      </div>
      <DragOverlay dropAnimation={null}>{active && <div className="w-72 rotate-1"><TaskCardBody ticket={active} dragging /></div>}</DragOverlay>
    </DndContext>
  );
}
