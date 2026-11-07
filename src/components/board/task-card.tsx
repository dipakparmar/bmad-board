import { TicketTypeIcon } from '@/components/common/ticket-type-icon';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ListChecks, Link2 } from 'lucide-react';
import { useBoardContext } from '@/app/board-context';
import type { Ticket } from '@/app/view-model';
import { awaitsPerson, planProgress } from '@/domain';
import { cn } from '@/lib/cn';
import { CardMenu } from './card-menu';
import { Assignee, HitlChip, ReadinessChip, RiskChip, taskChipClass, TypeChip } from './chips';

export function TaskCardBody({ ticket, dragging = false }: { ticket: Ticket; dragging?: boolean }) {
  const { preferences } = useBoardContext();
  const { cardFields: show, compactCards: compact } = preferences.prefs;
  const { leaf } = ticket;
  const done = leaf.state === 'done';
  const progress = planProgress(leaf.plan?.body);
  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-[10px] border transition-[background-color,border-color,box-shadow] duration-150 ease-out',
        done ? 'border-board-card-done-border bg-board-card-done' : 'border-board-card-border bg-board-card shadow-board-card hover:border-board-card-border-hover',
        dragging && 'border-board-card-border-hover shadow-[0_8px_24px_rgb(0_0_0/0.12)]',
        ticket.readOnly ? 'cursor-pointer' : 'cursor-grab',
        compact ? 'px-2.5 py-2' : 'p-3',
      )}
    >
      <div className="flex h-4.5 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5"><TicketTypeIcon type={leaf.type} /><span className={cn('truncate font-mono text-[11px] leading-3.5', done ? 'text-board-id-done' : 'text-board-id')}>{ticket.ref}</span></span>
        {show.assignee && <Assignee workspaceId={ticket.workspaceId} name={leaf.plan?.assignee} />}
      </div>
      <div className={cn(compact ? 'mt-0.5 line-clamp-2' : 'mt-1 line-clamp-3', 'break-words text-[13px] leading-[18px]', done ? 'text-board-title-done' : 'font-medium text-board-title')}>{leaf.title}</div>
      {!done && (
        <div className={cn('flex flex-wrap items-center gap-1 empty:hidden', compact ? 'mt-1.5' : 'mt-2.5')}>
          {show.yourCall && awaitsPerson(leaf) && <span className={cn(taskChipClass, 'border-warning/40 text-warning')} title="The build finished; a person marks it done">Your call</span>}
          {show.progress && progress && <span className={cn(taskChipClass, 'tabular-nums')} title="Build plan checklist"><ListChecks />{progress.done}/{progress.total}</span>}
          {show.readiness && <ReadinessChip readiness={ticket.readiness} title={ticket.blockedReason ?? (ticket.waitingOn.length ? `Waits on ${ticket.waitingOn.join(', ')}` : undefined)} />}
          {show.type && <TypeChip leaf={leaf} />}
          {show.risk && <RiskChip leaf={leaf} />}
          {show.hitl && <HitlChip leaf={leaf} />}
          {show.deps && leaf.after.length > 0 && <span className={taskChipClass} title={`Waits on ${leaf.after.join(', ')}`}><Link2 />{leaf.after.length}</span>}
          {show.epic && ticket.epic && <span className={cn(taskChipClass, 'max-w-40')}><span className="truncate">{ticket.epic.title}</span></span>}
        </div>
      )}
    </div>
  );
}

export function TaskCard({ ticket }: { ticket: Ticket }) {
  const { select } = useBoardContext();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: ticket.uid, disabled: ticket.readOnly, data: { ticket } });
  return (
    <CardMenu ticket={ticket}>
    <div
      ref={setNodeRef}
      data-task-id={ticket.uid}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={() => select(ticket.uid)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') select(ticket.uid);
      }}
      className="rounded-[10px] outline-none focus-visible:ring-[3px] focus-visible:ring-board-card-ring"
    >
      <TaskCardBody ticket={ticket} />
    </div>
    </CardMenu>
  );
}
