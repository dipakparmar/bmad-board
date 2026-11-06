/**
 * Plain-language names for the values BMAD writes in its files (`ready-for-dev`, `P1`, `hitl`, …).
 * The files keep BMAD's spelling; the UI shows these, with the raw value on hover so people can map
 * what they see to what an agent will write.
 */
import type { LeafStatus } from './status';
import type { LeafType, Risk, Severity } from './ticket-tree';

export interface Label {
  label: string;
  /** One line on what it means and who acts next. */
  help: string;
}

export const STATUS_LABELS: Record<LeafStatus | '', Label> = {
  '': { label: 'Not started', help: 'No build plan yet. It starts once it is ready and someone picks it up.' },
  draft: { label: 'Planning', help: 'The build agent is drafting the plan.' },
  'ready-for-dev': { label: 'Ready to build', help: 'The plan is written; a build can start.' },
  'in-progress': { label: 'Building', help: 'A build is under way.' },
  built: { label: 'Built', help: 'The build finished. A person reviews it and calls it done.' },
  'in-review': { label: 'In code review', help: 'Built and being reviewed.' },
  done: { label: 'Done', help: 'A person checked it and called it done.' },
  blocked: { label: 'Blocked', help: 'Waiting on a person or an answer.' },
  dropped: { label: 'Dropped', help: 'Not going to be built.' },
};

export const TYPE_LABELS: Record<LeafType, Label> = {
  story: { label: 'Story', help: 'A slice of user-facing work with acceptance criteria.' },
  spike: { label: 'Spike', help: 'A time-boxed investigation that ends in a decision, not shipped code.' },
  bug: { label: 'Bug', help: 'Something broken, filed in the backlog.' },
};

export const SEVERITY_LABELS: Record<Severity, Label> = {
  P0: { label: 'Critical', help: 'P0: drop everything.' },
  P1: { label: 'High', help: 'P1: fix this cycle.' },
  P2: { label: 'Medium', help: 'P2: fix soon.' },
  P3: { label: 'Low', help: 'P3: fix when convenient.' },
};

export const RISK_LABELS: Record<Risk, Label> = {
  low: { label: 'Low risk', help: 'Routine change.' },
  medium: { label: 'Medium risk', help: 'Worth a careful review.' },
  high: { label: 'High risk', help: 'Needs a person close to the build and the review.' },
};

export const HITL_LABEL: Label = { label: 'Needs a person', help: 'A person does part of this work (hitl = true), so it cannot run unattended.' };

export function statusLabel(status: LeafStatus | ''): string {
  return STATUS_LABELS[status]?.label ?? status;
}
