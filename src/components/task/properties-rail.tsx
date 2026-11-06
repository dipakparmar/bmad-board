/** Right-hand properties, as in Kaneo's task sheet: status, assignee, risk, needs-a-person, block. */
import { ExternalLink } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { applyWithToast, setStatus } from '@/app/actions';
import { useBoardContext } from '@/app/board-context';
import type { Ticket } from '@/app/view-model';
import { LEAF_STATUSES, type LeafStatus, type Risk, type TicketChange } from '@/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { STATUS_HELP, StateIcon } from '../board/chips';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  );
}

export function PropertiesRail({ ticket, className }: { ticket: Ticket; className?: string }) {
  const state = useBoardContext();
  const { leaf } = ticket;
  const [assignee, setAssignee] = useState(leaf.plan?.assignee ?? '');
  const [reason, setReason] = useState('');
  const ro = ticket.readOnly;
  const hasEntry = leaf.id !== null && leaf.folder !== 'backlog';

  const edit = (change: TicketChange, msg: string) => applyWithToast(state, ticket.workspaceId, [change], msg);

  return (
    <aside className={cn('flex flex-col gap-1 p-5', className)}>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Properties</h3>
      <Row label="Status">
        {ro ? (
          <span className="inline-flex items-center gap-1.5"><StateIcon state={leaf.state} className="size-3.5" />{leaf.status || 'planned'}</span>
        ) : (
          <Select value={leaf.status || null} onValueChange={(v) => typeof v === 'string' && void setStatus(state, ticket, v as LeafStatus)}>
            <SelectTrigger size="sm" className="w-full" aria-label="Status"><SelectValue>{leaf.status || 'planned'}</SelectValue></SelectTrigger>
            <SelectPopup>
              {LEAF_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className="flex flex-col"><span>{s}</span><span className="text-[11px] text-muted-foreground">{STATUS_HELP[s]}</span></span>
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        )}
      </Row>
      <Row label="Assignee">
        {ro ? (leaf.plan?.assignee ?? 'Unassigned') : (
          <Input
            size="sm"
            value={assignee}
            placeholder="Person or agent"
            onChange={(e) => setAssignee(e.target.value)}
            onBlur={() => {
              if (assignee !== (leaf.plan?.assignee ?? '')) void edit({ kind: 'mark', key: leaf.key, status: leaf.status || 'draft', assignee }, assignee ? `${ticket.ref} assigned to ${assignee}` : `${ticket.ref} unassigned`);
            }}
          />
        )}
      </Row>
      <Row label="Risk">
        {ro || !hasEntry ? (leaf.risk ?? 'Not set') : (
          <Select value={leaf.risk ?? null} onValueChange={(v) => typeof v === 'string' && void edit({ kind: 'edit-entry', key: leaf.key, patch: { risk: v as Risk } }, `${ticket.ref} risk set to ${v}`)}>
            <SelectTrigger size="sm" className="w-full" aria-label="Risk"><SelectValue>{leaf.risk ?? 'Not set'}</SelectValue></SelectTrigger>
            <SelectPopup>{['low', 'medium', 'high'].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectPopup>
          </Select>
        )}
      </Row>
      <Row label="Needs a person">
        {ro || !hasEntry ? (leaf.hitl ? 'Yes' : 'No') : (
          <Button size="xs" variant="outline" onClick={() => void edit({ kind: 'edit-entry', key: leaf.key, patch: { hitl: !leaf.hitl } }, `${ticket.ref} ${leaf.hitl ? 'no longer needs' : 'now needs'} a person`)}>
            {leaf.hitl ? 'Yes' : 'No'}
          </Button>
        )}
      </Row>
      <Row label="Type">{leaf.type}{leaf.file?.severity ? ` · ${leaf.file.severity}` : ''}</Row>
      <Row label="Epic">{ticket.epic?.title ?? (leaf.folder === 'backlog' ? 'Backlog' : ticket.initiative?.title)}</Row>
      {leaf.entry?.covers.length ? <Row label="Covers">{leaf.entry.covers.join(', ')}</Row> : null}
      {leaf.plan?.baselineRevision && <Row label="Baseline"><code className="font-mono text-xs">{leaf.plan.baselineRevision}</code></Row>}
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
