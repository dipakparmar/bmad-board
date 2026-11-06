/**
 * Stand-up: one card per person or agent with what they finished, what they're on, what waits on
 * review and what blocks them. "Run stand-up" walks the team one member at a time with a timer.
 */
import { Bot, CheckCheck, ChevronLeft, ChevronRight, ClipboardCopy, Hand, Pencil, Play, Save, Square, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { applyWithToast, setStatus } from '@/app/actions';
import { useBoardContext } from '@/app/board-context';
import type { Ticket } from '@/app/view-model';
import { LEAF_STATUSES, lastWorkingDay, parseStandupNotes, standup, standupNotes, standupNotesPath, statusLabel, STATUS_LABELS, type LeafStatus, type StandupCommit, type StandupMember, type StandupNotes } from '@/domain';
import { Button } from '@/components/ui/button';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AssigneePicker } from '../task/assignee-picker';
import { cn } from '@/lib/cn';
import { StateIcon } from '../board/chips';
import { actorOf, useHistory } from '../next/activity-feed';

type Since = 'workday' | '24h' | '7d';
const SINCE: { id: Since; label: string }[] = [
  { id: 'workday', label: 'Last working day' },
  { id: '24h', label: '24 hours' },
  { id: '7d', label: '7 days' },
];

function sinceDate(s: Since, now = new Date()): Date {
  if (s === 'workday') return lastWorkingDay(now);
  return new Date(now.getTime() - (s === '24h' ? 1 : 7) * 86_400_000);
}

/** A ticket in a stand-up card. The pencil opens a quick edit: status and assignee, saved as commits. */
function TicketLine({ ticket, note }: { ticket: Ticket; note?: string }) {
  const state = useBoardContext();
  const [editing, setEditing] = useState(false);
  return (
    <div className="group/line rounded-md hover:bg-accent/50">
      <div className="flex items-start gap-1">
        <button type="button" onClick={() => state.select(ticket.uid)} className="flex min-w-0 flex-1 items-start gap-2 px-1.5 py-1 text-left">
          <StateIcon state={ticket.leaf.state} className="mt-0.5 size-3.5 shrink-0" />
          <span className="font-mono text-[11px] text-board-id">{ticket.ref}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px]">{ticket.leaf.title}</span>
            {note && <span className="block text-xs text-muted-foreground">{note}</span>}
          </span>
        </button>
        {!ticket.readOnly && (
          <button type="button" aria-label={`Edit ${ticket.ref}`} title="Change status or assignee" onClick={() => setEditing((e) => !e)} className={cn('mt-1 shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground', editing ? 'opacity-100' : 'opacity-0 group-hover/line:opacity-100 focus-visible:opacity-100')}>
            <Pencil className="size-3" />
          </button>
        )}
      </div>
      {editing && (
        <div className="grid grid-cols-2 gap-2 px-1.5 pb-2 pl-7">
          <Select value={ticket.leaf.status || null} onValueChange={(v) => typeof v === 'string' && void setStatus(state, ticket, v as LeafStatus)}>
            <SelectTrigger size="sm" aria-label={`Status of ${ticket.ref}`}><SelectValue>{statusLabel(ticket.leaf.status)}</SelectValue></SelectTrigger>
            <SelectPopup>{LEAF_STATUSES.map((st) => <SelectItem key={st} value={st}>{STATUS_LABELS[st].label}</SelectItem>)}</SelectPopup>
          </Select>
          <AssigneePicker workspaceId={ticket.workspaceId} value={ticket.leaf.plan?.assignee ?? ''} onCommit={(a) => void applyWithToast(state, ticket.workspaceId, [{ kind: 'assign', key: ticket.leaf.key, assignee: a }], a ? `${ticket.ref} reassigned to ${a}` : `${ticket.ref} unassigned`)} />
        </div>
      )}
    </div>
  );
}

function NoteBox({ value, onChange, placeholder, rows = 2 }: { value: string; onChange: (v: string) => void; placeholder: string; rows?: number }) {
  return <Textarea value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="min-h-0 text-[13px]" />;
}

function Section({ title, tone, children, empty }: { title: string; tone: string; children: ReactNode[]; empty?: string }) {
  if (children.length === 0 && !empty) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <h4 className={cn('px-1.5 text-[11px] font-medium uppercase tracking-wide', tone)}>{title}</h4>
      {children.length ? children : <p className="px-1.5 text-xs text-muted-foreground">{empty}</p>}
    </div>
  );
}

function MemberCard({ m, focused, big, note, onNote }: { m: StandupMember<Ticket>; focused?: boolean; big?: boolean; note: string; onNote: (v: string) => void }) {
  const Icon = m.agent ? Bot : UserRound;
  // Commits that touched no ticket we know of still count as work done; list a few.
  const loose = m.finished.length ? [] : m.commits.slice(0, big ? 8 : 3);
  return (
    <section className={cn('flex flex-col gap-3 rounded-xl border bg-board-card p-4 shadow-board-card', focused ? 'border-primary ring-2 ring-primary/20' : 'border-board-card-border', big && 'p-6')}>
      <header className="flex items-center gap-2">
        <span className={cn('grid size-7 place-items-center rounded-full', m.agent ? 'bg-info/15 text-info' : 'bg-primary/12 text-primary')}><Icon className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <div className={cn('truncate font-medium', big ? 'text-lg' : 'text-sm')}>{m.name}</div>
          <div className="text-xs text-muted-foreground">{m.agent ? 'Agent' : 'Person'} · {m.commits.length} commit{m.commits.length === 1 ? '' : 's'} since</div>
        </div>
        {m.blocked.length > 0 && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive-foreground">{m.blocked.length} blocked</span>}
      </header>
      <Section title="Done since" tone="text-success" empty="Nothing new.">
        {[
          ...m.finished.map((t) => <TicketLine key={t.uid} ticket={t} note={t.leaf.status === 'done' ? undefined : 'Built, waiting for review'} />),
          ...loose.map((c: StandupCommit) => <div key={c.sha} className="truncate px-1.5 text-xs text-muted-foreground">· {c.subject}</div>),
        ]}
      </Section>
      <Section title="Working on" tone="text-info" empty="Nothing in progress.">
        {m.doing.map((t) => <TicketLine key={t.uid} ticket={t} />)}
      </Section>
      <Section title="Waiting on review" tone="text-warning">
        {m.review.map((t) => <TicketLine key={t.uid} ticket={t} />)}
      </Section>
      <Section title="Blocked" tone="text-destructive-foreground">
        {m.blocked.map((t) => <TicketLine key={t.uid} ticket={t} note={t.leaf.plan?.blockedReason ?? t.blockedReason ?? 'No reason given'} />)}
      </Section>
      <Section title="Up next" tone="text-muted-foreground">
        {m.upNext.map((t) => <TicketLine key={t.uid} ticket={t} />)}
      </Section>
      <NoteBox value={note} onChange={onNote} rows={big ? 4 : 2} placeholder={`Notes on ${m.name}'s update…`} />
    </section>
  );
}

function useTimer(running: boolean, resetKey: unknown) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => setSeconds(0), [resetKey]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function StandupView() {
  const { inScope, board, scope } = useBoardContext();
  const [since, setSince] = useState<Since>('workday');
  const [turn, setTurn] = useState<number | null>(null);

  const ws = board.workspaces.find((w) => w.store.id === scope.workspaceId) ?? board.workspaces[0];
  const history = useHistory(ws?.store.id, ws?.tree ? [ws.tree.outputFolder] : [], 200);
  const cutoff = useMemo(() => sinceDate(since), [since]);
  const report = useMemo(() => {
    const tickets = inScope.filter((t) => !ws || t.workspaceId === ws.store.id);
    // Saving stand-up notes is bookkeeping, not work done; leave those commits out.
    const commits: StandupCommit[] = (history ?? []).filter((a) => !(a.paths.length && a.paths.every((p) => p.includes('/standups/')))).map((a) => {
      const actor = actorOf(a);
      return { sha: a.sha, date: a.date, subject: a.subject, actor: actor.name, agent: actor.agent, paths: a.paths, url: a.url };
    });
    return standup(tickets, commits, cutoff);
  }, [inScope, history, cutoff, ws]);

  const { members } = report;
  const running = turn !== null;
  const clock = useTimer(running, turn);

  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') setTurn((t) => (t === null ? t : Math.min(t + 1, members.length)));
      if (e.key === 'ArrowLeft') setTurn((t) => (t === null ? t : Math.max(t - 1, 0)));
      if (e.key === 'Escape') setTurn(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, members.length]);

  // Today's notes: loaded from the saved file if there is one, with an unsaved draft kept in this browser.
  const state = useBoardContext();
  const notesPath = ws?.tree ? standupNotesPath(ws.tree.outputFolder, new Date()) : null;
  const draftKey = notesPath && ws ? `bmad-board:standup-draft:${ws.store.id}:${notesPath}` : null;
  const [notes, setNotes] = useState<StandupNotes>({ members: {}, team: '' });
  const [saved, setSaved] = useState<string>('');
  const [savedNotes, setSavedNotes] = useState(false);
  useEffect(() => {
    if (!ws || !notesPath) return;
    let live = true;
    void ws.store.source.read(notesPath).catch(() => null).then((text) => {
      if (!live) return;
      const fromFile = text ? parseStandupNotes(text, members) : { members: {}, team: '' };
      setSavedNotes(!!text);
      setSaved(JSON.stringify(fromFile));
      let draft: StandupNotes | null = null;
      try { draft = JSON.parse(localStorage.getItem(draftKey ?? '') ?? 'null'); } catch { /* storage unavailable */ }
      setNotes(draft ?? fromFile);
    });
    return () => { live = false; };
    // members only seed name matching; reload when the file location changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws?.store.id, notesPath]);
  const dirty = JSON.stringify(notes) !== saved;
  const updateNotes = (next: StandupNotes) => {
    setNotes(next);
    try { if (draftKey) localStorage.setItem(draftKey, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };
  const noteFor = (id: string) => notes.members[id] ?? '';
  const setNoteFor = (id: string) => (v: string) => updateNotes({ ...notes, members: { ...notes.members, [id]: v } });
  const canSave = !!ws && !!notesPath && ws.store.capabilities.write && ws.tree?.layout !== 'v6';
  const saveNotes = async () => {
    if (!ws || !notesPath) return;
    const text = `# Stand-up ${notesPath.split('standup-').pop()?.replace(/\.md$/, '')}\n\n${standupNotes(report, (t) => t.ref, notes)}`;
    const ok = await applyWithToast(state, ws.store.id, [{ kind: 'standup-notes', path: notesPath, text }], 'Stand-up notes saved');
    if (ok) {
      setSaved(JSON.stringify(notes));
      setSavedNotes(true);
      try { if (draftKey) localStorage.removeItem(draftKey); } catch { /* storage unavailable */ }
    }
  };

  const copyNotes = async () => {
    try {
      await navigator.clipboard.writeText(standupNotes(report, (t) => t.ref, notes));
      toast.success('Stand-up notes copied');
    } catch {
      toast.error('Could not copy to the clipboard');
    }
  };

  // The last "turn" is the team-wide wrap-up: unowned work and what's up for grabs.
  const wrapUp = turn !== null && turn >= members.length;
  const current = turn !== null && !wrapUp ? members[turn] : undefined;

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {SINCE.map((s) => (
            <button key={s.id} type="button" onClick={() => setSince(s.id)} className={cn('h-7 rounded-md px-2.5 text-xs', since === s.id ? 'bg-background font-medium shadow-xs' : 'text-muted-foreground hover:text-foreground')}>{s.label}</button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">since {cutoff.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {notesPath && <span className="text-xs text-muted-foreground" title={notesPath}>{dirty ? 'Unsaved notes' : savedNotes ? 'Notes saved' : ''}</span>}
          {canSave && <Button size="sm" variant="outline" disabled={!dirty} onClick={() => void saveNotes()}><Save />Save notes</Button>}
          <Button size="sm" variant="outline" onClick={() => void copyNotes()}><ClipboardCopy />Copy notes</Button>
          {running
            ? <Button size="sm" variant="outline" onClick={() => setTurn(null)}><Square />End stand-up</Button>
            : <Button size="sm" disabled={members.length === 0} onClick={() => setTurn(0)}><Play />Run stand-up</Button>}
        </div>
      </div>

      {history === null && <p className="text-xs text-muted-foreground">Loading git activity…</p>}
      {history !== null && !ws?.store.source.history && <p className="text-xs text-muted-foreground">"Done since" needs git history, from the local server or a GitHub repo. Open folders show current work only.</p>}

      {running ? (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          <div className="flex items-center gap-2">
            <Button size="icon-sm" variant="ghost" aria-label="Previous" disabled={turn === 0} onClick={() => setTurn((t) => Math.max((t ?? 0) - 1, 0))}><ChevronLeft /></Button>
            <div className="flex flex-1 items-center justify-center gap-1.5">
              {[...members, null].map((m, i) => (
                <button key={m?.id ?? 'wrap'} type="button" aria-label={m?.name ?? 'Wrap-up'} onClick={() => setTurn(i)} className={cn('h-1.5 rounded-full transition-all', i === turn ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30')} />
              ))}
            </div>
            <span className="w-12 text-right font-mono text-xs tabular-nums text-muted-foreground">{clock}</span>
            <Button size="icon-sm" variant="ghost" aria-label="Next" disabled={wrapUp} onClick={() => setTurn((t) => Math.min((t ?? 0) + 1, members.length))}><ChevronRight /></Button>
          </div>
          {current && <MemberCard m={current} focused big note={noteFor(current.id)} onNote={setNoteFor(current.id)} />}
          {wrapUp && <WrapUp unowned={report.unowned} upForGrabs={report.upForGrabs} big team={notes.team} onTeam={(v) => updateNotes({ ...notes, team: v })} />}
          <p className="text-center text-xs text-muted-foreground">← → to move between people · Esc to end</p>
        </div>
      ) : (
        <>
          {members.length === 0 && <p className="text-sm text-muted-foreground">No one holds a ticket or committed since then. Assign tickets in the ticket sheet to see people here.</p>}
          <div className="grid content-start gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {members.map((m) => <MemberCard key={m.id} m={m} note={noteFor(m.id)} onNote={setNoteFor(m.id)} />)}
          </div>
          <WrapUp unowned={report.unowned} upForGrabs={report.upForGrabs} team={notes.team} onTeam={(v) => updateNotes({ ...notes, team: v })} />
        </>
      )}
    </div>
  );
}

function WrapUp({ unowned, upForGrabs, big, team, onTeam }: { unowned: Ticket[]; upForGrabs: Ticket[]; big?: boolean; team: string; onTeam: (v: string) => void }) {
  return (
    <section className={cn('grid gap-4 rounded-xl border border-dashed border-border p-4', !big && 'md:grid-cols-2', big && 'p-6')}>
      <Section title="Needs an owner" tone="text-warning" empty="Every built or blocked ticket has someone.">
        {unowned.map((t) => <TicketLine key={t.uid} ticket={t} note={t.leaf.plan?.blockedAt ? `Blocked: ${t.leaf.plan.blockedReason ?? ''}` : 'Built, waiting for review'} />)}
      </Section>
      <Section title="Up for grabs" tone="text-success" empty="No unassigned ready tickets.">
        {upForGrabs.map((t) => <TicketLine key={t.uid} ticket={t} />)}
      </Section>
      <div className={cn('flex flex-col gap-1', !big && 'md:col-span-2')}>
        <h4 className="px-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Team notes</h4>
        <NoteBox value={team} onChange={onTeam} rows={big ? 4 : 2} placeholder="Decisions, follow-ups, who pairs with whom…" />
      </div>
      {big && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Hand className="size-3.5" />Pick owners, then end the stand-up. <CheckCheck className="size-3.5" /></p>}
    </section>
  );
}
