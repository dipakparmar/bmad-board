/** The ticket sheet, laid out like Kaneo's task-details-sheet: content on the left, properties rail on the right. */
import { ReferenceText } from '../common/reference-text';
import { TicketReferenceChip, DocumentReferenceLabel } from '../common/reference-chip';
import { ArrowLeft, ArrowUpRight, Copy, FileText, Link2, Maximize2, Minimize2, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { applyWithToast } from '@/app/actions';
import { useBoardContext } from '@/app/board-context';
import { bodyOf, refOf, type Ticket } from '@/app/view-model';
import { Button } from '@/components/ui/button';
import { Sheet, SheetPopup, SheetTitle } from '@/components/ui/sheet';
import { Bot } from 'lucide-react';
import { Assignee, ReadinessChip, StateIcon } from '../board/chips';
import { ActivityList, useHistory } from '../next/activity-feed';
import { copyHandoff, ticketHandoffs } from '../next/handoff-menu';
import { Markdown } from './markdown';
import { KindBadge } from '../docs/docs-view';
import { DOC_KIND_LABELS, type DocLink } from '@/domain';
import { PropertiesRail } from './properties-rail';
import { BranchLink, FileLink, useTicketRefs } from '../common/links';
import { Breadcrumbs, useScopeCrumbs } from '../layout/breadcrumbs';
import { TaskDescription } from './task-description';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** Tickets whose text names this one: `Story 1.2` in the same initiative, or its file name. */
function mentionsOf(ticket: Ticket, peers: Ticket[]): Ticket[] {
  const name = ticket.leaf.file?.path.split('/').pop()?.replace(/\.md$/, '');
  const ref = new RegExp(String.raw`\b(?:stor(?:y|ies)|spike|bug|ticket)[ \t]+#?${ticket.ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\w.])`, 'i');
  return peers.filter((t) => {
    if (t.uid === ticket.uid) return false;
    const text = `${bodyOf(t.leaf) ?? ''}\n${t.leaf.plan?.body ?? ''}`;
    return (!!name && text.includes(name)) || (t.initiative?.slug === ticket.initiative?.slug && /^\d+\.\d+/.test(ticket.ref) && ref.test(text));
  });
}

function Relations({ ticket }: { ticket: Ticket }) {
  const { tickets, select } = useBoardContext();
  const peers = tickets.filter((t) => t.workspaceId === ticket.workspaceId);
  const find = (k: string) => peers.find((t) => t.leaf.key === k);
  const links = ticket.leaf.links ?? {};
  const waitsOn = ticket.leaf.after;
  const noted = links.noted ?? [];
  const blocks = peers.filter((t) => t.leaf.after.includes(ticket.leaf.key) || t.leaf.links?.noted?.includes(ticket.leaf.key));
  const epicWaits = [...ticket.leaf.gatedBy, ...(links.epicAfter ?? []), ...(links.epicNoted ?? [])];
  const previous = links.previous ? find(links.previous) : undefined;
  const following = peers.find((t) => t.leaf.links?.previous === ticket.leaf.key);
  const mentions = mentionsOf(ticket, peers).filter((t) => !blocks.includes(t));
  if (!waitsOn.length && !noted.length && !blocks.length && !epicWaits.length && !previous && !following && !mentions.length) return null;
  const item = (key: string, note?: string) => {
    const t = find(key);
    return (
      <button key={key} type="button" disabled={!t} onClick={() => t && select(t.uid)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent disabled:cursor-default">
        {t ? <StateIcon state={t.leaf.state} className="size-3.5" /> : null}
        <span className="w-10 shrink-0 font-mono text-[11px] text-board-id">{t?.ref ?? refOf(key, peers)}</span>
        <span className="min-w-0 flex-1 truncate">{t?.leaf.title ?? key}</span>
        {note && <span className="shrink-0 text-[11px] text-muted-foreground">{note}</span>}
      </button>
    );
  };
  const group = (label: string, keys: string[], note?: (k: string) => string | undefined) =>
    keys.length > 0 && <div className="mb-3"><div className="mb-1 text-xs text-muted-foreground">{label}</div>{keys.map((k) => item(k, note?.(k)))}</div>;
  const epicTitle = (k: string) => {
    const leaf = peers.find((t) => t.leaf.folder === k);
    return leaf ? `epic ${leaf.ref.split('.')[0]}` : undefined;
  };
  return (
    <Section title="Relations">
      {group('Waits on', waitsOn)}
      {group('Its text names these as prerequisites', noted, () => 'from the text')}
      {epicWaits.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-xs text-muted-foreground">Its epic waits on</div>
          {[...new Set(epicWaits)].map((g) => (find(g) ? item(g) : <div key={g} className="flex items-center gap-2 px-2 py-1 text-sm"><span className="font-mono text-xs">{g}</span>{epicTitle(g) && <span className="text-[11px] text-muted-foreground">{epicTitle(g)}{ticket.leaf.gatedBy.includes(g) ? ' · must be done first' : ''}</span>}</div>))}
        </div>
      )}
      {group('Blocks', blocks.map((t) => t.leaf.key))}
      {group('Mentioned in', mentions.slice(0, 30).map((t) => t.leaf.key))}
      {(previous || following) && group('Build order', [previous?.leaf.key, following?.leaf.key].filter((k): k is string => !!k), (k) => (k === previous?.leaf.key ? (links.sequential ? 'before it, must be done first' : 'before it') : 'after it'))}
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
  return <Section title="Activity">{items === null ? <p className="text-xs text-muted-foreground">Loading…</p> : <ActivityList items={items} workspaceId={ticket.workspaceId} empty="No commits for this ticket yet." />}</Section>;
}

/** The ticket itself: content plus the properties rail. Used by the sheet and the full-page view. */
/** Docs the ticket links to, then the ones its epic and initiative link to (PRD, architecture, UX…). */
function LinkedDocs({ ticket: t }: { ticket: Ticket }) {
  const { openDoc } = useBoardContext();
  const groups: { title: string; docs: DocLink[] }[] = [
    { title: 'This ticket', docs: (t.leaf.docs ?? []).filter((d) => d.kind !== 'plan' || d.candidates[0] !== t.leaf.plan?.path) },
    { title: t.epic ? `Epic · ${t.epic.title}` : '', docs: t.epic?.docs ?? [] },
    { title: t.initiative ? `Initiative · ${t.initiative.title}` : '', docs: t.initiative?.docs ?? [] },
  ].filter((g) => g.title && g.docs.length);
  if (!groups.length) return null;
  return (
    <Section title="Linked docs">
      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="mb-1.5 truncate text-xs text-muted-foreground">{g.title}</div>
            <div className="flex flex-wrap gap-1.5">
              {g.docs.map((d) => {
                const path = d.candidates[0] ?? '';
                return (
                  <button key={`${path}#${d.anchor ?? ''}`} type="button" title={`${path}${d.anchor ? `#${d.anchor}` : ''}`} onClick={() => openDoc(t.workspaceId, d)} className="flex max-w-full items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
                    <KindBadge kind={d.kind} />
                    <DocumentReferenceLabel workspaceId={t.workspaceId} link={d} />
                    {d.label && !d.title && !['source', 'companion', 'reference', 'file', 'document', DOC_KIND_LABELS[d.kind].toLowerCase()].includes(d.label) && <span className="text-muted-foreground">· {d.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

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
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-destructive">{t.blockedReason ? <ReferenceText text={t.blockedReason} ticket={t} /> : <>Waiting on {t.waitingOn.map((key) => { const target = peers.find((peer) => peer.leaf.key === key); return target ? <TicketReferenceChip key={key} ticket={target} /> : <span key={key}>{refOf(key, peers)}</span>; })}</>}</div>
          )}
          <PropertiesRail ticket={t} className="-mx-5 mt-4 border-border border-y lg:hidden" />
          <div className="mt-6"><TaskDescription ticket={t} /></div>
          <LinkedDocs ticket={t} />
          <NextStep ticket={t} />
          <Relations ticket={t} />
          {t.leaf.plan?.body.trim() && (
            <Section title="Build plan">
              <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"><Assignee workspaceId={t.workspaceId} name={t.leaf.plan.assignee} />{t.leaf.plan.assignee ?? 'No assignee'} · {t.leaf.plan.path.split('/').pop()}</div>
              <PlanBody ticket={t} />
            </Section>
          )}
          <TicketActivity ticket={t} />
          <Section title="Files">
            {[t.leaf.file?.path, t.leaf.plan?.path, t.leaf.folder === 'backlog' ? undefined : `${t.leaf.dir}/tickets.toml`].filter((p): p is string => !!p).map((p) => (
              <FileLink key={p} workspaceId={t.workspaceId} path={p} className="mb-1 flex w-full items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-left font-mono text-[11px] text-muted-foreground enabled:hover:bg-accent enabled:hover:text-foreground [&:is(a)]:hover:bg-accent [&:is(a)]:hover:text-foreground">
                <FileText className="size-3.5 shrink-0" /><span className="truncate">{p}</span><ArrowUpRight className="ml-auto size-3 shrink-0" />
              </FileLink>
            ))}
          </Section>
        </div>
      </div>
      <PropertiesRail ticket={t} className="hidden w-80 shrink-0 overflow-y-auto border-border border-l lg:flex" />
    </div>
  );
}

function PlanBody({ ticket }: { ticket: Ticket }) {
  const refs = useTicketRefs(ticket);
  const state = useBoardContext();
  const onTask = ticket.readOnly ? undefined : (index: number, checked: boolean) => {
    void applyWithToast(state, ticket.workspaceId, [{ kind: 'toggle-task', key: ticket.leaf.key, index, checked }], `${checked ? 'Ticked' : 'Unticked'} a task on ${ticket.ref}`);
  };
  return <Markdown source={ticket.leaf.plan?.body ?? ''} refs={refs} onTask={onTask} />;
}

/** The sheet's title must be a SheetTitle for accessibility; the full page uses a plain heading. */
function TicketTitle({ full, className, children }: { full?: boolean; className?: string; children: ReactNode }) {
  return full ? <h1 className={className}>{children}</h1> : <SheetTitle className={className}>{children}</SheetTitle>;
}

export function TicketHeader({ ticket: t, full }: { ticket: Ticket; full?: boolean }) {
  const { select, setExpanded, board } = useBoardContext();
  const scopeCrumbs = useScopeCrumbs();
  const branch = board.workspaces.find((w) => w.store.id === t.workspaceId)?.store.links()?.branch;
  return (
    <header className="flex shrink-0 flex-col gap-1.5 border-border border-b px-4 py-2">
      <div className="flex min-w-0 items-start gap-2">
        {full && <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setExpanded(false)}><ArrowLeft />Back</Button>}
        <Breadcrumbs className="min-w-0 flex-1 self-center" size="xs" items={[
          ...scopeCrumbs({ workspaceId: t.workspaceId, initiative: t.initiative?.slug, epic: t.leaf.folder === 'backlog' ? 'backlog' : t.epic?.slug }),
          { label: t.ref, title: full ? `${t.ref}: ${t.leaf.title}` : `Open ${t.ref} full screen`, className: 'font-mono whitespace-nowrap', go: () => setExpanded(true) },
        ]} />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button size="icon-sm" variant="ghost" aria-label="Copy link" title="Copy link to this ticket" onClick={() => { void navigator.clipboard?.writeText(location.href); toast.success('Link copied'); }}><Link2 /></Button>
          <Button size="icon-sm" variant="ghost" aria-label="Copy BMAD ref" title="Copy BMAD ref" onClick={() => { void navigator.clipboard?.writeText(t.ref); toast.success(`Copied ${t.ref}`, { description: `Hand it to an agent, for example "build story ${t.ref}".` }); }}><Copy /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={full ? 'Open as panel' : 'Open full screen'} title={full ? 'Open as panel' : 'Open full screen'} onClick={() => setExpanded(!full)}>{full ? <Minimize2 /> : <Maximize2 />}</Button>
          <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={() => select(null)}><X /></Button>
        </div>
      </div>
      {branch && <BranchLink workspaceId={t.workspaceId} branch={branch} wrap className="max-w-full px-1 text-[10px]" />}
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
