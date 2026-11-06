/**
 * The seam between the UI and where tickets live. The UI only talks to a TicketStore;
 * adapters decide how bytes reach disk, git, or a tracker.
 *
 * Planned adapters:
 * - LocalStore: a small Bun server next to a working copy; reads/writes files and commits on the current branch.
 * - GitHubRepoStore: the same files through the GitHub contents/git API; writes as commits on a branch or a PR.
 * - V6Store: read-only view of the old `_bmad-output/{planning,implementation}-artifacts` layout.
 * - later, GitHubIssuesStore: mirrors leaves to issues the way BMAD's github-ticketing config does.
 */
import type { BoardConfig } from './board-config';
import type { BoardState, LeafStatus } from './status';
import type { BreakdownEntry, TicketKey, TicketTree } from './ticket-tree';

export interface StoreCapabilities {
  write: boolean;
  /** Changes land as commits (local) or a pull request (GitHub). */
  commits: boolean;
  pullRequests: boolean;
  /** Can be watched for changes made by agents outside the board. */
  watch: boolean;
}

/** Where a change came from; recorded in commit messages so history shows who moved what. */
export interface ChangeAuthor {
  kind: 'person' | 'agent';
  name: string;
}

export type TicketChange =
  | { kind: 'mark'; key: TicketKey; status: LeafStatus; assignee?: string; blockedReason?: string }
  | { kind: 'clear-block'; key: TicketKey }
  /** Replaces the team-wide board settings file. */
  | { kind: 'board-config'; config: BoardConfig }
  /** Writes a day's stand-up notes to `<output>/standups/standup-<date>.md`. */
  | { kind: 'standup-notes'; path: string; text: string }
  /** Sets or clears only the assignee; status and any block stay as they are. */
  | { kind: 'assign'; key: TicketKey; assignee: string }
  | { kind: 'edit-entry'; key: TicketKey; patch: Partial<Omit<BreakdownEntry, 'id'>> }
  | { kind: 'add-entry'; folder: string; entry: Omit<BreakdownEntry, 'id'> }
  | { kind: 'reorder'; folder: string; order: (number | string)[] }
  | { kind: 'edit-body'; path: string; body: string }
  | { kind: 'file-bug'; title: string; body: string };

export interface ChangeResult {
  /** Files written, relative to the project root. */
  paths: string[];
  commit?: string;
  pullRequestUrl?: string;
}

export interface TicketStore {
  readonly id: string;
  readonly label: string;
  readonly capabilities: StoreCapabilities;

  load(): Promise<TicketTree>;

  /** Applies changes as one unit (one commit / one PR update). Rejects on a read-only store. */
  apply(changes: TicketChange[], author: ChangeAuthor, message?: string): Promise<ChangeResult>;

  /** Optional: fires when files change outside the board (an agent ran, a pull happened). */
  watch?(onChange: () => void): () => void;
}

/**
 * A drag on the board names a target column; this picks the status to write.
 * People never drag a leaf into the agents' own statuses past `built`; `done` is theirs to set.
 */
export function statusForDrop(target: BoardState, current: LeafStatus | ''): LeafStatus | null {
  switch (target) {
    case 'backlog':
      return current === '' || current === 'draft' || current === 'ready-for-dev' ? null : 'ready-for-dev';
    case 'in-progress':
      return 'in-progress';
    case 'review':
      return 'in-review';
    case 'done':
      return 'done';
    case 'dropped':
      return 'dropped';
  }
}
