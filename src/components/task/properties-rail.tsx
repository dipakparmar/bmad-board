/** Right-hand properties, as in Kaneo's task sheet: status, assignee, risk, needs-a-person, block. */
import { ExternalLink, FileText } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { applyWithToast, setStatus } from '@/app/actions';
import { useBoardContext } from '@/app/board-context';
import { statusesFor, type Ticket } from '@/app/view-model';
import { HITL_LABEL, RISK_LABELS, SEVERITY_LABELS, statusLabel, TYPE_LABELS, type LeafStatus, type Risk, type TicketChange } from '@/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { STATUS_HELP, StateIcon } from '../board/chips';
import { AssigneePicker } from './assignee-picker';
import { CommitLink, FileLink } from '../common/links';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  );
}

/** The ticket's epic or initiative: its title shows its tickets on the board; the icon opens its file. */
function ContainerLink({ ticket, kind }: { ticket: Ticket; kind: 'epic' | 'initiative' }) {
  const { select, setScope, setView, view } = useBoardContext();
  const c = kind === 'epic' ? ticket.epic : ticket.initiative;
  if (!c) return null;
  const show = () => {
    select(null);
    setScope({ workspaceId: ticket.workspaceId, initiative: ticket.initiative?.slug, ...(kind === 'epic' ? { epic: c.slug } : {}) });
    if (view === 'settings' || view === 'docs') setView('board');
  };
  return (
    <span className="flex min-w-0 items-center gap-1">
      <button type="button" onClick={show} title={`Show the ${kind}'s tickets`} className="min-w-0 truncate text-left text-primary underline-offset-2 hover:underline">{c.title}</button>
      {c.path && <FileLink workspaceId={ticket.workspaceId} path={c.path} className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"><FileText className="size-3.5" aria-label={`Open the ${kind} file`} /></FileLink>}
    </span>
  );
}

export function PropertiesRail({ ticket, className }: { ticket: Ticket; className?: string }) {
  const state = useBoardContext();
  const { leaf } = ticket;
  const [reason, setReason] = useState('');
  const ro = ticket.readOnly;
  // v6 stories have no tickets.toml entry, so no risk or needs-a-person to set.
  const hasEntry = leaf.id !== null && leaf.folder !== 'backlog' && !leaf.v6;

  const edit = (change: TicketChange, msg: string) => applyWithToast(state, ticket.workspaceId, [change], msg);

  return (
    <aside className={cn('flex flex-col gap-1 p-5', className)}>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Properties</h3>
      <Row label="Status">
        {ro ? (
          <span className="inline-flex items-center gap-1.5"><StateIcon state={leaf.state} className="size-3.5" />{statusLabel(leaf.status)}</span>
        ) : (
          <Select value={leaf.status || null} onValueChange={(v) => typeof v === 'string' && void setStatus(state, ticket, v as LeafStatus)}>
            <SelectTrigger size="sm" className="w-full" aria-label="Status"><SelectValue>{statusLabel(leaf.status)}</SelectValue></SelectTrigger>
            <SelectPopup>
              {statusesFor(ticket).map((s) => (
                <SelectItem key={s} value={s}>
                  <span className="flex flex-col"><span>{statusLabel(s)} <span className="font-mono text-[10px] text-muted-foreground">{s}</span></span><span className="text-[11px] text-muted-foreground">{STATUS_HELP[s]}</span></span>
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        )}
      </Row>
      <Row label="Assignee">
        {ro ? (leaf.plan?.assignee ?? 'Unassigned') : (
          <AssigneePicker
            workspaceId={ticket.workspaceId}
            value={leaf.plan?.assignee ?? ''}
            onCommit={(a) => void edit({ kind: 'assign', key: leaf.key, assignee: a }, a ? `${ticket.ref} assigned to ${a}` : `${ticket.ref} unassigned`)}
          />
        )}
      </Row>
      {!leaf.v6 && (
        <>
      <Row label="Risk">
        {ro || !hasEntry ? (leaf.risk ? RISK_LABELS[leaf.risk].label : 'Not set') : (
          <Select value={leaf.risk ?? null} onValueChange={(v) => typeof v === 'string' && void edit({ kind: 'edit-entry', key: leaf.key, patch: { risk: v as Risk } }, `${ticket.ref} is now ${RISK_LABELS[v as Risk].label.toLowerCase()}`)}>
            <SelectTrigger size="sm" className="w-full" aria-label="Risk"><SelectValue>{leaf.risk ? RISK_LABELS[leaf.risk].label : 'Not set'}</SelectValue></SelectTrigger>
            <SelectPopup>{(['low', 'medium', 'high'] as const).map((r) => <SelectItem key={r} value={r}><span className="flex flex-col"><span>{RISK_LABELS[r].label}</span><span className="text-[11px] text-muted-foreground">{RISK_LABELS[r].help}</span></span></SelectItem>)}</SelectPopup>
          </Select>
        )}
      </Row>
      <Row label={HITL_LABEL.label}>
        {ro || !hasEntry ? (leaf.hitl ? 'Yes' : 'No') : (
          <Button size="xs" variant="outline" onClick={() => void edit({ kind: 'edit-entry', key: leaf.key, patch: { hitl: !leaf.hitl } }, `${ticket.ref} ${leaf.hitl ? 'no longer needs' : 'now needs'} a person`)}>
            {leaf.hitl ? 'Yes' : 'No'}
          </Button>
        )}
      </Row>
        </>
      )}
      <Row label="Type"><span title={TYPE_LABELS[leaf.type].help}>{TYPE_LABELS[leaf.type].label}</span>{leaf.file?.severity ? <span title={SEVERITY_LABELS[leaf.file.severity].help}> · {SEVERITY_LABELS[leaf.file.severity].label} ({leaf.file.severity})</span> : ''}</Row>
      <Row label="Epic">
        {ticket.epic ? <ContainerLink ticket={ticket} kind="epic" /> : leaf.folder === 'backlog' ? 'Backlog' : 'None'}
      </Row>
      {ticket.initiative && <Row label="Initiative"><ContainerLink ticket={ticket} kind="initiative" /></Row>}
      {leaf.entry?.covers.length ? <Row label="Covers">{leaf.entry.covers.join(', ')}</Row> : null}
      {leaf.plan?.baselineRevision && <Row label="Baseline">{/^[0-9a-f]{7,40}$/i.test(leaf.plan.baselineRevision) ? <CommitLink workspaceId={ticket.workspaceId} sha={leaf.plan.baselineRevision} className="text-xs" /> : <code className="font-mono text-xs">{leaf.plan.baselineRevision}</code>}</Row>}
      {leaf.tracker?.remote && <Row label="Tracker"><a className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline" href={leaf.tracker.remote} target="_blank" rel="noreferrer">{leaf.tracker.trackerId}<ExternalLink className="size-3" /></a></Row>}

      <div className="mt-4 border-border border-t pt-4">
        {leaf.plan?.blockedAt ? (
          <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <span className="font-medium text-destructive">Blocked since {leaf.plan.blockedAt}</span>
            <span className="text-muted-foreground">{leaf.plan.blockedReason}</span>
            {!ro && <Button size="xs" variant="outline" onClick={() => void edit({ kind: 'clear-block', key: leaf.key }, `${ticket.ref} unblocked`)}>Clear block</Button>}
          </div>
        ) : !ro && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) void edit({ kind: 'mark', key: leaf.key, status: leaf.status || 'draft', blockedReason: reason.trim() }, `${ticket.ref} marked blocked`).then(() => setReason('')); }}>
            <Input size="sm" placeholder="Blocked because…" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button size="sm" variant="outline" type="submit" disabled={!reason.trim()}>Block</Button>
          </form>
        )}
      </div>
    </aside>
  );
}
