/**
 * "What's next": the board as the AI-driven loop sees it. Agents take ready tickets; people answer
 * blocks, refine, and call built work done. Same grouping as BMAD's `tickets.py next`.
 */
import { CheckCheck, Hourglass, Inbox, PlayCircle, Sparkles, Timer } from 'lucide-react';
import type { ReactNode } from 'react';
import { setStatus } from '@/app/actions';
import { useBoardContext } from '@/app/board-context';
import { refOf, type Ticket } from '@/app/view-model';
import { awaitsPerson, planProgress } from '@/domain';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { Assignee, HitlChip, RiskChip, StateIcon, TypeChip } from '../board/chips';
import { ActivityList, useHistory } from './activity-feed';
import { HandoffMenu } from './handoff-menu';
import { usePaged } from '../common/show-more';

function Lane({ title, hint, icon: Icon, tone, tickets, children }: { title: string; hint: string; icon: typeof Inbox; tone: string; tickets: Ticket[]; children: (t: Ticket) => ReactNode }) {
  const { visible, more } = usePaged(tickets, 25);
  return (
    <section className="flex min-h-0 flex-col rounded-xl bg-board-lane">
      <header className="flex items-start gap-2 px-3 pt-3 pb-2">
        <Icon className={cn('mt-0.5 size-4', tone)} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] font-medium">{title}<span className="text-xs tabular-nums text-board-id">{tickets.length}</span></div>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </header>
      <div className="flex flex-col gap-1.5 p-1.5">
        {visible.map((t) => <div key={t.uid}>{children(t)}</div>)}
        {more}
        {tickets.length === 0 && <div className="rounded-[10px] border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Nothing here</div>}
      </div>
    </section>
  );
}

function Row({ ticket, children, note }: { ticket: Ticket; children?: ReactNode; note?: ReactNode }) {
  const { select } = useBoardContext();
  const { leaf } = ticket;
  const progress = planProgress(leaf.plan?.body);
  return (
    <div role="button" tabIndex={0} onClick={() => select(ticket.uid)} onKeyDown={(e) => e.key === 'Enter' && select(ticket.uid)} className="flex flex-col gap-2 rounded-[10px] border border-board-card-border bg-board-card p-3 text-left shadow-board-card hover:border-board-card-border-hover">
      <div className="flex items-center gap-2">
        <StateIcon state={leaf.state} className="size-3.5" />
        <span title={ticket.ref} className="max-w-24 truncate font-mono text-[11px] text-board-id">{ticket.ref}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{leaf.title}</span>
        <Assignee name={leaf.plan?.assignee} />
      </div>
      {note && <div className="text-xs text-muted-foreground">{note}</div>}
      <div className="flex flex-wrap items-center gap-1">
        <TypeChip leaf={leaf} />
        <RiskChip leaf={leaf} />
        <HitlChip leaf={leaf} />
        {progress && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1 w-14 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-info" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></span>
            {progress.done}/{progress.total}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>{children}</div>
      </div>
    </div>
  );
}

function EpicProgress() {
  const { inScope } = useBoardContext();
  const epics = new Map<string, { title: string; counts: Record<string, number>; total: number }>();
  for (const t of inScope) {
    const k = t.epic ? `${t.initiative?.slug}/${t.epic.slug}` : t.leaf.folder === 'backlog' ? 'backlog' : t.initiative?.slug ?? '';
    const e = epics.get(k) ?? { title: t.epic?.title ?? (k === 'backlog' ? 'Backlog' : t.initiative?.title ?? k), counts: {}, total: 0 };
    e.counts[t.leaf.state] = (e.counts[t.leaf.state] ?? 0) + 1;
    e.total += 1;
    epics.set(k, e);
  }
  const segs: [string, string][] = [['done', 'bg-success'], ['review', 'bg-warning'], ['in-progress', 'bg-info'], ['backlog', 'bg-muted-foreground/25']];
  // Epics with work under way first; a big project shows a few rows and the rest on request.
  const active = (e: { counts: Record<string, number> }) => (e.counts['in-progress'] ?? 0) + (e.counts.review ?? 0);
  const sorted = [...epics.entries()].sort(([, a], [, b]) => Number(active(b) > 0) - Number(active(a) > 0));
  const { visible, more } = usePaged(sorted, 12);
  return (
    <div className="flex flex-col gap-1">
    <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map(([key, e]) => (
        <div key={key} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs"><span className="truncate font-medium">{e.title}</span><span className="tabular-nums text-muted-foreground">{e.counts.done ?? 0}/{e.total}</span></div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
            {segs.map(([s, c]) => <span key={s} className={c} style={{ width: `${((e.counts[s] ?? 0) / e.total) * 100}%` }} />)}
          </div>
        </div>
      ))}
    </div>
    {more}
    </div>
  );
}

export function NextView() {
  const state = useBoardContext();
  const { inScope, tickets, board, scope } = state;
  const open = inScope.filter((t) => t.readiness !== 'closed' || awaitsPerson(t.leaf));

  const yourCall = open.filter((t) => awaitsPerson(t.leaf) || t.leaf.plan?.blockedAt || (t.readiness === 'blocked' && t.blockedReason && !t.waitingOn.length));
  const mine = new Set(yourCall.map((t) => t.uid));
  const ready = open.filter((t) => t.readiness === 'ready' && !mine.has(t.uid));
  const refine = open.filter((t) => t.readiness === 'refine' && !mine.has(t.uid));
  const working = open.filter((t) => t.readiness === 'active' && !mine.has(t.uid));
  const waiting = open.filter((t) => t.readiness === 'blocked' && !mine.has(t.uid));

  const ws = board.workspaces.find((w) => w.store.id === scope.workspaceId) ?? board.workspaces[0];
  const activity = useHistory(ws?.store.id, ws?.tree ? [ws.tree.outputFolder] : [], 15);

  return (
    <div className="flex flex-col gap-6 pb-6">
      <EpicProgress />
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <div className="grid content-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          <Lane title="Your call" hint="Built work to check, and blocks only a person can answer." icon={Inbox} tone="text-warning" tickets={yourCall}>
            {(t) => (
              <Row ticket={t} note={t.leaf.plan?.blockedAt ? `Blocked: ${t.leaf.plan.blockedReason ?? 'no reason given'}` : awaitsPerson(t.leaf) ? 'The build finished. Review it, then mark it done.' : t.blockedReason}>
                <HandoffMenu ticket={t} />
                {awaitsPerson(t.leaf) && !t.readOnly && <Button size="xs" onClick={() => void setStatus(state, t, 'done')}><CheckCheck />Done</Button>}
              </Row>
            )}
          </Lane>
          <Lane title="Ready for an agent" hint="Prerequisites met, in build order. Hand one to bmad-build." icon={PlayCircle} tone="text-success" tickets={ready}>
            {(t) => <Row ticket={t} note={t.leaf.entry?.verify ? `Verify: ${t.leaf.entry.verify}` : undefined}><HandoffMenu ticket={t} /></Row>}
          </Lane>
          <Lane title="Needs refining" hint="Write acceptance criteria with the PO agent first." icon={Sparkles} tone="text-info" tickets={refine}>
            {(t) => <Row ticket={t}><HandoffMenu ticket={t} /></Row>}
          </Lane>
          <Lane title="Agents working" hint="Builds in progress, with their plan checklist." icon={Timer} tone="text-info" tickets={working}>
            {(t) => <Row ticket={t}><HandoffMenu ticket={t} /></Row>}
          </Lane>
          <Lane title="Waiting on other work" hint="Starts once its prerequisites are done or in review." icon={Hourglass} tone="text-muted-foreground" tickets={waiting}>
            {(t) => <Row ticket={t} note={t.waitingOn.length ? `Waits on ${t.waitingOn.map((k) => refOf(k, tickets.filter((x) => x.workspaceId === t.workspaceId))).join(', ')}` : t.blockedReason} />}
          </Lane>
        </div>
        <aside className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent activity{ws ? ` · ${ws.store.label}` : ''}</h3>
          {activity === null ? <p className="text-xs text-muted-foreground">Loading…</p> : <ActivityList items={activity} workspaceId={ws?.store.id} empty={ws?.store.source.history ? 'No commits touch the tickets yet.' : 'History needs the local server or GitHub.'} />}
        </aside>
      </div>
    </div>
  );
}
