/**
 * Status rules from BMAD-METHOD's ticket tree (tools/ticket-tree-rules.md, tickets.py).
 * A leaf's `status` is what agents write; its board `state` is what a column shows.
 */

/** Written to a leaf's plan file by bmad-build / bmad-build-auto, or by a person through `tickets.py mark`. */
export const LEAF_STATUSES = ['draft', 'ready-for-dev', 'in-progress', 'in-review', 'built', 'done', 'blocked', 'dropped'] as const;
export type LeafStatus = (typeof LEAF_STATUSES)[number];

/** Board columns. Trackers map these, never the raw status. */
export const BOARD_STATES = ['backlog', 'in-progress', 'review', 'done', 'dropped'] as const;
export type BoardState = (typeof BOARD_STATES)[number];

/** An initiative or epic file's own `status`; absent until its first ticket starts. */
export const CONTAINER_STATUSES = ['in-progress', 'done', 'dropped'] as const;
export type ContainerStatus = (typeof CONTAINER_STATUSES)[number];

/** No status yet (an entry with no file and no plan) reads as `backlog`. */
export const STATE_OF: Record<LeafStatus | '', BoardState> = {
  '': 'backlog',
  draft: 'backlog',
  'ready-for-dev': 'backlog',
  'in-progress': 'in-progress',
  blocked: 'in-progress',
  'in-review': 'review',
  built: 'review',
  done: 'done',
  dropped: 'dropped',
};

/** A tracker's status (read back into `tracker_status`) wins over the plan's. */
export function boardState(status: LeafStatus | '', trackerStatus?: BoardState | ''): BoardState {
  return trackerStatus || STATE_OF[status];
}

/** Who may move a leaf to a status. The UI uses this to keep agents' and people's moves apart. */
export type StatusActor = 'build-agent' | 'po-agent' | 'person' | 'orchestrator';

export const WRITTEN_BY: Record<LeafStatus, readonly StatusActor[]> = {
  draft: ['build-agent'],
  'ready-for-dev': ['build-agent'],
  'in-progress': ['build-agent'],
  'in-review': ['build-agent'],
  built: ['build-agent'],
  blocked: ['build-agent', 'person'],
  done: ['person', 'orchestrator'],
  dropped: ['po-agent', 'person'],
};

export function isLeafStatus(value: string): value is LeafStatus {
  return (LEAF_STATUSES as readonly string[]).includes(value);
}
