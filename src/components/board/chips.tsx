/** Small pieces shared by cards, rows and the ticket sheet. Chip styling follows Kaneo's task chips. */
import { Ban, Bug, CheckCircle2, Circle, CircleDashed, CircleDot, FlaskConical, Hand, Sparkles, Timer, UserRound } from 'lucide-react';
import { HITL_LABEL, RISK_LABELS, SEVERITY_LABELS, STATUS_LABELS, TYPE_LABELS, type BoardState, type Leaf, type LeafStatus } from '@/domain';
import type { Readiness } from '@/app/view-model';
import { cn } from '@/lib/cn';

export const taskChipClass =
  'inline-flex h-5.5 min-w-0 shrink-0 items-center gap-1.25 rounded-md border border-chip-border px-1.5 text-chip-foreground text-xs outline-none transition-colors [&_svg]:size-3 [&_svg]:shrink-0';

export const COLUMN_META: Record<BoardState, { label: string; icon: typeof Circle; tone: string }> = {
  backlog: { label: 'Backlog', icon: CircleDashed, tone: 'text-muted-foreground' },
  'in-progress': { label: 'In progress', icon: Timer, tone: 'text-info' },
  review: { label: 'Review', icon: CircleDot, tone: 'text-warning' },
  done: { label: 'Done', icon: CheckCircle2, tone: 'text-success' },
  dropped: { label: 'Dropped', icon: Ban, tone: 'text-muted-foreground' },
};

export const STATUS_HELP: Record<LeafStatus, string> = Object.fromEntries(Object.entries(STATUS_LABELS).filter(([k]) => k).map(([k, v]) => [k, v.help])) as Record<LeafStatus, string>;

export function StateIcon({ state, className }: { state: BoardState; className?: string }) {
  const { icon: Icon, tone } = COLUMN_META[state];
  return <Icon className={cn('size-4', tone, className)} />;
}

export function StatusLabel({ leaf }: { leaf: Leaf }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={`${STATUS_LABELS[leaf.status].help} (status: ${leaf.status || 'none'})`}>
      <StateIcon state={leaf.state} className="size-3.5" />
      {STATUS_LABELS[leaf.status].label}
    </span>
  );
}

const READINESS: Record<Readiness, { label: string; className: string } | null> = {
  ready: { label: 'Ready', className: 'border-success/30 text-success' },
  refine: { label: 'Refine first', className: 'border-info/30 text-info' },
  blocked: { label: 'Blocked', className: 'border-destructive/30 text-destructive' },
  active: null,
  closed: null,
};

export function ReadinessChip({ readiness, title }: { readiness: Readiness; title?: string }) {
  const meta = READINESS[readiness];
  if (!meta) return null;
  return <span title={title} className={cn(taskChipClass, meta.className)}>{meta.label}</span>;
}

export function TypeChip({ leaf }: { leaf: Leaf }) {
  if (leaf.type === 'story') return null;
  const Icon = leaf.type === 'bug' ? Bug : FlaskConical;
  const sev = leaf.file?.severity;
  return <span className={taskChipClass} title={[TYPE_LABELS[leaf.type].help, sev && SEVERITY_LABELS[sev].help].filter(Boolean).join(' ')}><Icon />{TYPE_LABELS[leaf.type].label}{sev ? ` · ${SEVERITY_LABELS[sev].label}` : ''}</span>;
}

export function RiskChip({ leaf }: { leaf: Leaf }) {
  if (!leaf.risk || leaf.risk === 'low') return null;
  return <span title={RISK_LABELS[leaf.risk].help} className={cn(taskChipClass, leaf.risk === 'high' && 'border-destructive/30 text-destructive')}><Sparkles />{RISK_LABELS[leaf.risk].label}</span>;
}

export function HitlChip({ leaf }: { leaf: Leaf }) {
  if (!leaf.hitl) return null;
  return <span className={taskChipClass} title={HITL_LABEL.help}><Hand />{HITL_LABEL.label}</span>;
}

export function Assignee({ name, className }: { name?: string; className?: string }) {
  if (!name) return <UserRound className={cn('size-4 text-muted-foreground/60', className)} aria-label="Unassigned" />;
  const agent = /agent|claude|bot/i.test(name);
  return (
    <span title={name} className={cn('grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-semibold', agent ? 'bg-info/15 text-info' : 'bg-primary/12 text-primary', className)}>
      {name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()}
    </span>
  );
}
