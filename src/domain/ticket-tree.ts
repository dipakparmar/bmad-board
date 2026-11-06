/**
 * Domain model of BMAD-METHOD's ticket tree, the source of truth the board reads and edits.
 *
 *   store (output_folder)
 *   ├── initiative-<slug>/            Initiative (or a parent initiative of child initiatives)
 *   │   ├── initiative-<slug>.md
 *   │   └── tickets/tickets.toml      [[epic]] in build order (or [[entry]] when there are no epics)
 *   │       └── epic-<slug>/          Epic
 *   │           ├── epic-<slug>.md
 *   │           └── tickets/
 *   │               ├── tickets.toml  [[entry]] per story/spike/bug in build order
 *   │               ├── story-<slug>.md        leaf file, only once refined or published
 *   │               └── story-<slug>-plan.md   plan: the leaf's status, assignee, block
 *   └── backlog/                      standalone leaves and their plans
 */
import type { BoardState, ContainerStatus, LeafStatus } from './status';

export type LeafType = 'story' | 'spike' | 'bug';
export type ContainerType = 'initiative' | 'epic';
export type TicketType = ContainerType | LeafType;
export type Risk = 'low' | 'medium' | 'high';
export type Severity = 'P0' | 'P1' | 'P2' | 'P3';

/** Requirement id inside a container, e.g. `R3`. Stories cite their epic's ids in `covers`. */
export type RequirementId = `R${number}` | string;

/**
 * A leaf's `after` as written: a sibling id (`2`), another epic's entry (`"1.3"`, epic id + entry id),
 * or a whole epic (`"epic-cart-rules"`). Resolved to a TicketKey when the tree loads.
 */
export type AfterRef = number | string;

/** An epic's or initiative's `after` in its parent's tickets.toml. */
export type ContainerAfter =
  | { epic: number | string; needs: string }
  | { initiative: number | string; needs: string };

/**
 * Stable key of a leaf inside one initiative: `<folder>/<id>` (or `<folder>/<file>` for a backlog leaf),
 * where folder is the epic slug, the initiative slug, or `backlog`. An epic slug alone is a key for an epic gate.
 */
export type TicketKey = string;

/** One [[entry]] table in an epic's (or epic-less initiative's) tickets.toml. */
export interface BreakdownEntry {
  id: number | string;
  type: LeafType;
  title: string;
  description: string;
  verify?: string;
  covers: RequirementId[];
  after: AfterRef[];
  hitl: boolean;
  risk?: Risk;
  estimate?: number;
  /** An open question; blocks the entry until removed. */
  unknown?: string;
  references?: string[];
  notes?: string[];
  /** Refine to full acceptance criteria before building. */
  refine?: boolean;
  /** A person reviews the ticket or plan before the build continues (unattended runs). */
  planCheckpoint?: boolean;
  /** Pause after it until a person says continue (unattended runs). */
  doneCheckpoint?: boolean;
}

/** Frontmatter of a plan file (`<type>-<slug>-plan.md`). Never sent to a tracker. */
export interface Plan {
  path: string;
  /** Entry id, or a backlog file's stem. */
  ticket: string;
  status: LeafStatus | '';
  assignee?: string;
  blockedAt?: string;
  blockedReason?: string;
  /** Commit the build started from; code review diffs from here. */
  baselineRevision?: string;
  /** Body: the build's acceptance criteria and its `## Code Review` blocks. */
  body: string;
}

/** Fields a published leaf carries, written by `tickets.py mirror`. */
export interface TrackerLink {
  trackerId: string;
  remote: string;
  trackerStatus?: BoardState;
}

/** A buildable unit: entry + optional leaf file + optional plan, joined. */
export interface Leaf {
  key: TicketKey;
  id: number | string | null;
  type: LeafType;
  title: string;
  /** Folder holding it: an epic slug, the initiative slug, or `backlog`. */
  folder: string;
  entry?: BreakdownEntry;
  /** Leaf markdown, once refined or published. From then on the file is truth for its body. */
  file?: { path: string; body: string; refined: boolean; severity?: Severity };
  plan?: Plan;
  tracker?: TrackerLink;
  /** Resolved prerequisites (the file's `after` wins over the entry's). */
  after: TicketKey[];
  /** The epic's own `after`: waits for those epics to be done. */
  gatedBy: TicketKey[];
  hitl: boolean;
  risk?: Risk;
  status: LeafStatus | '';
  state: BoardState;
  /** Entry and file disagree on `after` or `hitl`. */
  drift?: { after?: { file: TicketKey[]; entry: TicketKey[] }; hitl?: { file: boolean; entry: boolean } };
}

/** Initiative or epic: a spec at its level, with requirements its children are cut from. */
export interface Container {
  type: ContainerType;
  slug: string;
  id?: number | string;
  title: string;
  description: string;
  path: string;
  status?: ContainerStatus;
  covers: RequirementId[];
  after: ContainerAfter[];
  /** Epic only: false while written thin after slicing. */
  refined?: boolean;
  risk?: Risk;
  /** Planning docs beside it: prd-*, ux-*, architecture-*, retrospectives. */
  companions: string[];
  body: string;
  tracker?: Omit<TrackerLink, 'trackerStatus'>;
}

export interface Initiative extends Container {
  type: 'initiative';
  epics: Epic[];
  /** Leaves directly under an initiative with no epics. */
  leaves: Leaf[];
  /** Set on a parent initiative: its children, in build order. */
  children?: { id: number | string; slug: string; title: string; after: ContainerAfter[] }[];
}

export interface Epic extends Container {
  type: 'epic';
  leaves: Leaf[];
}

/** Which tracker the BMAD config names (`_bmad/custom/ticketing-store-config.toml`). */
export type TrackerKind = 'repo' | 'github' | 'jira' | 'linear' | 'notion' | 'trello';

/** Everything the board needs for one project root. */
export interface TicketTree {
  /** Where `_bmad/` lives. */
  projectRoot: string;
  outputFolder: string;
  activeInitiative?: string;
  tracker: TrackerKind;
  initiatives: Initiative[];
  backlog: Leaf[];
  /** Layout the tree was read from. `v6` trees are read-only until migrated with `bmad migrate method`. */
  layout: 'ticket-tree' | 'v6';
  problems: string[];
}
