/** The ticket sheet, laid out like Kaneo's task-details-sheet: content on the left, properties rail on the right. */
import { ArrowLeft, ArrowUpRight, Copy, FileText, Link2, Maximize2, Minimize2, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { useBoardContext } from '@/app/board-context';
import { refOf, type Ticket } from '@/app/view-model';
import { Button } from '@/components/ui/button';
import { Sheet, SheetPopup, SheetTitle } from '@/components/ui/sheet';
import { Bot } from 'lucide-react';
import { Assignee, ReadinessChip, StateIcon } from '../board/chips';
import { ActivityList, useHistory } from '../next/activity-feed';
import { copyHandoff, ticketHandoffs } from '../next/handoff-menu';
import { Markdown } from './markdown';
import { PropertiesRail } from './properties-rail';
import { TaskDescription } from './task-description';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Relations({ ticket }: { ticket: Ticket }) {
  const { tickets, select } = useBoardContext();
  const peers = tickets.filter((t) => t.workspaceId === ticket.workspaceId);
  const waitsOn = ticket.leaf.after.map((k) => peers.find((t) => t.leaf.key === k));
  const blocks = peers.filter((t) => t.leaf.after.includes(ticket.leaf.key));
  const gates = ticket.leaf.gatedBy;
  if (!waitsOn.length && !blocks.length && !gates.length) return null;
  const item = (t: Ticket | undefined, key: string) => (
    <button key={key} type="button" disabled={!t} onClick={() => t && select(t.uid)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent disabled:cursor-default">
      {t ? <StateIcon state={t.leaf.state} className="size-3.5" /> : null}
      <span className="w-10 shrink-0 font-mono text-[11px] text-board-id">{t?.ref ?? refOf(key, peers)}</span>
      <span className="truncate">{t?.leaf.title ?? key}</span>
    </button>
  );
  return (
    <Section title="Relations">
      {waitsOn.length > 0 && <div className="mb-3"><div className="mb-1 text-xs text-muted-foreground">Waits on</div>{waitsOn.map((t, i) => item(t, ticket.leaf.after[i] ?? String(i)))}</div>}
      {gates.length > 0 && <div className="mb-3"><div className="mb-1 text-xs text-muted-foreground">Its epic waits for these epics to be done</div>{gates.map((g) => <div key={g} className="px-2 py-1 font-mono text-xs">{g}</div>)}</div>}
      {blocks.length > 0 && <div><div className="mb-1 text-xs text-muted-foreground">Blocks</div>{blocks.map((t) => item(t, t.uid))}</div>}
    </Section>
  );
}

function NextStep({ ticket }: { ticket: Ticket }) {
  const all = ticketHandoffs(ticket);
  if (all.length === 0) return null;
  return (
    <Section title="Next step">
      <div className="flex flex-col gap-2">
        {all.map((h) => (
          <div key={h.label} className="flex items-start gap-3 rounded-lg border border-border p-3">
            <Bot className="mt-0.5 size-4 shrink-0 text-info" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{h.label} <span className="font-normal text-xs text-muted-foreground">· {h.skill}</span></div>
              <div className="text-xs text-muted-foreground">{h.why}</div>
              <code className="mt-2 block whitespace-pre-wrap break-words rounded bg-muted px-2 py-1 font-mono text-[11px]">{h.prompt}</code>
            </div>
            <Button size="xs" variant="outline" onClick={() => void copyHandoff(h)}><Copy />Copy</Button>
          </div>
        ))}
      </div>
    </Section>
  );
}

function TicketActivity({ ticket }: { ticket: Ticket }) {
  const paths = [ticket.leaf.file?.path, ticket.leaf.plan?.path].filter((p): p is string => !!p);
  const items = useHistory(ticket.workspaceId, paths, 15);
  if (paths.length === 0) return null;
  return <Section title="Activity">{items === null ? <p className="text-xs text-muted-foreground">Loading…</p> : <ActivityList items={items} empty="No commits for this ticket yet." />}</Section>;
}

/** The ticket itself: content plus the properties rail. Used by the sheet and the full-page view. */
export function TicketDetail({ ticket: t, full }: { ticket: Ticket; full?: boolean }) {
  const { tickets } = useBoardContext();
  const peers = tickets.filter((x) => x.workspaceId === t.workspaceId);
  return (
    <div key={t.uid} className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <div className={cn('min-w-0 flex-1 px-5 pt-5 pb-10 lg:overflow-y-auto lg:px-9 lg:pt-7', full && 'lg:px-16 lg:pt-10')}>
        <div className={cn(full && 'mx-auto max-w-3xl')}>
          <div className="mb-2 flex items-center gap-2">
            <ReadinessChip readiness={t.readiness} />
            {t.leaf.drift && <span className="text-xs text-warning">The story file and tickets.toml disagree on {Object.keys(t.leaf.drift).join(' and ')}</span>}
          </div>
          <TicketTitle full={full} className={cn('font-semibold', full ? 'text-2xl leading-8' : 'text-xl leading-7')}>{t.leaf.title}</TicketTitle>
          {t.readiness === 'blocked' && (t.blockedReason || t.waitingOn.length > 0) && (
            <p className="mt-2 text-sm text-destructive">{t.blockedReason ?? `Waiting on ${t.waitingOn.map((k) => refOf(k, peers)).join(', ')}`}</p>
          )}
          <PropertiesRail ticket={t} className="-mx-5 mt-4 border-border border-y lg:hidden" />
          <div className="mt-6"><TaskDescription ticket={t} /></div>
          <NextStep ticket={t} />
          <Relations ticket={t} />
          {t.leaf.plan?.body.trim() && (
            <Section title="Build plan">
              <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"><Assignee name={t.leaf.plan.assignee} />{t.leaf.plan.assignee ?? 'No assignee'} · {t.leaf.plan.path.split('/').pop()}</div>
              <Markdown source={t.leaf.plan.body} />
            </Section>
          )}
          <TicketActivity ticket={t} />
          <Section title="Files">
            {[t.leaf.file?.path, t.leaf.plan?.path, t.leaf.folder === 'backlog' ? undefined : `${t.leaf.dir}/tickets.toml`].filter((p): p is string => !!p).map((p) => (
              <div key={p} className="mb-1 flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                <FileText className="size-3.5 shrink-0" /><span className="truncate">{p}</span><ArrowUpRight className="ml-auto size-3 shrink-0" />
              </div>
            ))}
          </Section>
        </div>
      </div>
      <PropertiesRail ticket={t} className="hidden w-80 shrink-0 overflow-y-auto border-border border-l lg:flex" />
    </div>
  );
}

/** The sheet's title must be a SheetTitle for accessibility; the full page uses a plain heading. */
function TicketTitle({ full, className, children }: { full?: boolean; className?: string; children: ReactNode }) {
  return full ? <h1 className={className}>{children}</h1> : <SheetTitle className={className}>{children}</SheetTitle>;
}

export function TicketHeader({ ticket: t, full }: { ticket: Ticket; full?: boolean }) {
  const { select, setExpanded } = useBoardContext();
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-border border-b px-4">
      {full && <Button size="sm" variant="ghost" onClick={() => setExpanded(false)}><ArrowLeft />Back</Button>}
      <span className="font-mono text-xs text-muted-foreground">{t.ref}</span>
      <span className="min-w-0 truncate text-xs text-muted-foreground">· {t.workspace}{full ? ` · ${t.epic?.title ?? (t.leaf.folder === 'backlog' ? 'Backlog' : t.initiative?.title ?? '')}` : ''}</span>
      <div className="ml-auto flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" aria-label="Copy link" title="Copy link to this ticket" onClick={() => { void navigator.clipboard?.writeText(location.href); toast.success('Link copied'); }}><Link2 /></Button>
        <Button size="icon-sm" variant="ghost" aria-label="Copy BMAD ref" title="Copy BMAD ref" onClick={() => { void navigator.clipboard?.writeText(t.ref); toast.success(`Copied ${t.ref}`, { description: `Hand it to an agent, for example "build story ${t.ref}".` }); }}><Copy /></Button>
        <Button size="icon-sm" variant="ghost" aria-label={full ? 'Open as panel' : 'Open full screen'} title={full ? 'Open as panel' : 'Open full screen'} onClick={() => setExpanded(!full)}>{full ? <Minimize2 /> : <Maximize2 />}</Button>
        <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={() => select(null)}><X /></Button>
      </div>
    </header>
  );
}

export function TaskSheet() {
  const { selected, select, expanded } = useBoardContext();
  const t = expanded ? null : selected;
  return (
    <Sheet open={!!t} onOpenChange={(open) => !open && select(null)}>
      <SheetPopup side="right" showCloseButton={false} className="w-full max-w-full gap-0 p-0 sm:max-w-lg md:max-w-2xl lg:max-w-4xl">
        {t && (
          <>
            <TicketHeader ticket={t} />
            <TicketDetail ticket={t} />
          </>
        )}
      </SheetPopup>
    </Sheet>
  );
}

/** Full-page ticket, in place of the board views. */
export function TicketPage() {
  const { selected } = useBoardContext();
  if (!selected) return null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TicketHeader ticket={selected} full />
      <TicketDetail ticket={selected} full />
    </div>
  );
}
