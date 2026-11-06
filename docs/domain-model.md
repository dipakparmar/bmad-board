# Domain model: bmad-board as a ticket UI for BMAD

**Goal.** bmad-board becomes the place people and agents meet on BMAD work: a board, list and ticket view over BMAD's ticket tree, which people can also edit. The tree stays in git, so the board is a view and editor on top of it, never a second database. Kaneo (MIT) supplies UI patterns and components; BMAD-METHOD supplies the rules.

Types live in [`src/domain/`](../src/domain). This doc explains them.

## 1. Source of truth: BMAD's ticket tree

BMAD-METHOD has moved off the v6 layout (`sprint-status.yaml` + `epics.md`) to a ticket tree. See upstream `docs/plan/set-up-the-ticket-tree.md` and `tools/ticket-tree-rules.md`.

| Concept | Where it lives | Type |
|---|---|---|
| Store | `output_folder` (default `_bmad-output`), often its own git repo | `TicketTree` |
| Initiative | `initiative-<slug>/initiative-<slug>.md` | `Initiative` |
| Epic order | initiative's `tickets/tickets.toml`, `[[epic]]` tables | `Container.after` |
| Epic | `tickets/epic-<slug>/epic-<slug>.md` | `Epic` |
| Story / spike / bug | `[[entry]]` in the epic's `tickets/tickets.toml`, build order = table order | `BreakdownEntry` |
| Leaf file | `story-<slug>.md`, only once refined or published | `Leaf.file` |
| Plan | `story-<slug>-plan.md`: **status**, assignee, block, baseline commit, review notes | `Plan` |
| Standalone tickets | `backlog/` | `TicketTree.backlog` |
| Tracker choice | `_bmad/custom/ticketing-store-config.toml` | `TrackerKind` |

A **leaf** is the join of entry + optional file + optional plan, keyed `<folder>/<id>`. The domain models it as one object because that's what a card is.

### Status vs board state

Agents write a leaf's `status` to its plan. A column shows its derived `state` (`STATE_OF` in `status.ts`):

| status | state (column) | written by |
|---|---|---|
| *(none)*, `draft`, `ready-for-dev` | backlog | build agent |
| `in-progress`, `blocked` | in-progress | build agent (blocked: build-auto or a person) |
| `in-review`, `built` | review | build agent; `built` is the furthest an agent goes |
| `done` | done | **a person or an orchestrator only** |
| `dropped` | dropped | PO agent when a person says so |

A tracker's `tracker_status` wins over the plan's status when one is present.

### What's next

`whatsNext()` in `next.ts` reproduces `tickets.py next`, so the board and the agents agree on what's ready:

- A prerequisite counts as met once it is done **or in review**. An epic gate (the epic's own `after`) waits until that epic is **done**.
- Blocked: the plan says `blocked`, a prerequisite isn't met, or the entry has an open `unknown`.
- Ready to refine: `refine = true` and not yet refined. Everything else that's open is ready to start.

This drives the "What's next" view and the AI loop (step 4).

## 2. Mapping to Kaneo

| Kaneo | BMAD board | Notes |
|---|---|---|
| Workspace | Project root (folder with `_bmad/`) | one per loaded worktree or repo |
| Project | Initiative | parent initiatives show as a project group |
| Column (user-defined) | Board state (fixed 5) | not configurable: BMAD fixes them |
| Task | Leaf | number becomes `<epic id>.<entry id>` |
| Subtask relation | Epic → leaf hierarchy | epics act as swimlanes or a filter, not cards |
| `blocks` relation | `after` / epic gate | shown both ways ("waits on", "blocks") |
| Labels | type, `risk`, `hitl`, severity | derived; free labels aren't in BMAD |
| Priority | `risk` | low/medium/high |
| Assignee | plan `assignee` | free text (a person or an agent name) |
| Description (tiptap) | leaf markdown body | markdown round-trip, not tiptap JSON |
| Activity | `git log` of the ticket's files + `.memlog.md` | read-only |
| Position | order in `tickets.toml` | drag to reorder = rewrite table order |
| Due/start dates, time tracking, recurrence | — | left out |

**Ported from Kaneo** (`apps/web/src/components/`): `kanban-board/` (dnd-kit board, move queue, collision detection), `list-view/`, `task/` detail sheet (title, properties, relations, description), `command-palette/`, `search-command-menu/`, and the `ui/` shadcn primitives. **Not ported**: the Hono API, Postgres/Drizzle schema, auth, billing, integrations. Kaneo's MIT notice goes in a `THIRD_PARTY_NOTICES.md` next to any copied code.

## 3. Storage: the `TicketStore` seam

`ticket-store.ts` is the only thing the UI calls. Changes are typed (`mark`, `edit-entry`, `add-entry`, `reorder`, `edit-body`, `file-bug`), applied as one unit, and tagged with who made them (person or agent).

| Adapter | How | Writes |
|---|---|---|
| `LocalStore` | small Bun server beside a working copy | files + a commit on the current branch, never push |
| `GitHubRepoStore` | GitHub contents/git API | commit to a branch, or open/update a PR |
| `V6Store` | old `_bmad-output/*-artifacts` layout | read-only; the UI suggests `bmad migrate method` |
| `GitHubIssuesStore` (later) | gh/REST, following BMAD's `github-ticketing.toml` | labels, sub-issues, blocked-by, milestones |

The rules that write status follow BMAD: dragging into **done** is a person's action. Dragging into backlog, in-progress or review writes the matching status (`statusForDrop`), and is shown as a manual override of the agent's status.

## 4. Open questions

- Should the GitHub adapter commit straight to a branch, or always go through a PR? Proposed: a PR per session of edits.
- Should `.memlog.md` and plan `## Code Review` blocks show in the detail view? Proposed: yes, read-only tabs.
- v6 projects: read-only plus a migrate prompt, or write support too? Proposed: read-only.
