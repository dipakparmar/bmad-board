# BMAD Project Board

A board, list and ticket view for [BMAD-METHOD](https://github.com/bmad-code-org/bmad-method)'s ticket tree. Tickets stay where BMAD's agents keep them, as markdown and TOML in git. The board reads them, and when you move or edit a ticket it writes the same files and commits the change. It doesn't keep a database of its own.

New here? Start with [docs/getting-started.md](docs/getting-started.md). See [docs/domain-model.md](docs/domain-model.md) for the model and how it maps to Kaneo.

## Three ways to connect a project

| | How | Writes |
|---|---|---|
| **Local checkout** | `bun run start -- --root ~/code/my-project` and open <http://127.0.0.1:33714> | each change is one commit on your current branch (never pushed) |
| **GitHub repo** | "GitHub" in the sidebar, `owner/name`, then sign in with your local `gh` login (needs the local server; the token never reaches the browser) or a fine-grained token (Contents + Pull requests: write) | commits on a `bmad-board/…` branch, one pull request per session |
| **Open folder** | "Open folder" in Chrome or Edge | read-only |

GitHub repos you connect come back when you reload, and every project is cached in the browser by git: file text is kept by blob SHA (in IndexedDB, so it survives reloads and is shared across repos and branches), and the parsed board is kept with the versions of the exact files it read. On reload the board asks for the current file versions in one call (GitHub's branch ref and tree; the local server's `/api/tree`, from `git ls-files` plus `git hash-object` for uncommitted edits), reuses the board outright when none of its files changed, and otherwise fetches only the files whose content changed. Commits that only touch code cost nothing. **Clear cache and reload** in Settings (or a project's ··· menu in the sidebar) starts fresh.

Projects on the older v6 layout open read-only, parsed the way v6's workflows write them:
- `sprint-status.yaml` (paths from `_bmad/bmm/config.yaml`): project metadata, epic statuses, stories including split ones (`2-6a-…`), retrospectives and their action items. Legacy statuses (`drafted`, `contexted`) are mapped.
- `epics.md` or sharded `epics/epic-N.md`: epic titles and goals, plus stories that sprint planning hasn't picked up yet, which show as backlog.
- Story files (`N-M-slug.md` in `story_location`): title, `Status:`, the user story, acceptance criteria, and the Tasks / Subtasks checklist, which shows as progress on the card. When a story file and sprint-status.yaml disagree, the later status wins, as in v6.
- Retro action items show in the stand-up wrap-up. Each story links to its section of the epics file, its `[Source: …]` citations, and the planning docs.

Run `bmad migrate method` to move a v6 project to the ticket tree and edit it here.

## What you can do on the board

- **What's next** (the default view) shows the AI-driven loop the way BMAD's agents see it:
  - *Your call*: built work for you to check and mark done, and blocks only a person can answer.
  - *Ready for an agent*: tickets whose prerequisites are met, in build order.
  - *Needs refining*, *Agents working* (with their plan checklist), and *Waiting on other work*.
  - Every ticket offers its next **hand-off**: a ready-to-paste prompt for the right BMAD skill (`bmad-build`, `bmad-build-auto`, `bmad-agent-po`, `bmad-code-review`).
  - A **recent activity** feed lists the commits that touched the tickets, and marks which came from agents and which from people.

- **Stand-up** gives one card per person and agent. Each card shows what they finished since the last working day (from git), what they're on, what waits on review, and what blocks them. **Run stand-up** walks the team one member at a time with a timer, ending on unowned and up-for-grabs work. The pencil on any ticket changes its status or reassigns it on the spot. Each person has a notes box, plus team notes. **Save notes** commits them to `_bmad-output/standups/standup-<date>.md`, where agents can read them, and **Copy notes** gives the same markdown for your team channel. Cards sit side by side at screen height and each scrolls on its own, so the notes boxes and team notes are always in view; the full-screen button hides the rest of the board for running the meeting on a shared screen.

- **Dependencies** draws what waits on what with React Flow, laid out left to right in build order by dagre. It reads every place BMAD records it: `after` in tickets.toml and a ticket's front matter (solid arrows); an epic's `after`, in its file or in the initiative's tickets.toml (dashed, one arrow per pair of epics); prerequisites written in words, such as a `## Dependencies` section, a `**Prerequisites:** Story 1.2` or `Depends on:` line, a `Waits on epic-x because:` note, or `depends_on` front matter (blue, marked "named in the ticket"); and, on request, build order from table order or v6 story order (dotted, inferred). Only `after` and epic gates decide readiness, as in BMAD's own tools; the ticket panel lists all of them under Relations. Pan, zoom and the minimap get around a big project; hover a ticket to light up its whole chain, and loops are flagged. Where the project is writable, drag from a ticket's right dot to another ticket to make that one wait on it, or select an arrow and press Delete (or its ×) to remove it. Each is a commit to `tickets.toml`, and loops are refused.

- **Docs** reads the project's planning and implementation documents in the board: PRDs, architecture, UX, epics, sprint status, retrospectives, stand-up notes and the project's `docs/` folder, with an outline, front matter details, and links between docs that open in place. Every ticket lists its **Linked docs**, gathered from what BMAD records: `sources`, `companions` and plan `context` front matter, tickets.toml `references` (with `#anchor`s that jump to the section), a `## References` section, `[Source: …]` citations and markdown links, plus the PRD, UX and architecture folders beside its epic and initiative. **Back to 1.2** returns to the ticket.

- **Board and list views** of every initiative, epic and backlog ticket, in the Kaneo layout. Each card shows readiness the way BMAD's own `tickets.py next` reports it: ready, blocked (and on what), or needs refining.
- **Drag a card between lanes** to set its status, or pick one in the ticket sheet. **Drag rows in the list** to change an epic's build order.
- **Edit tickets.** You can change the description, risk, needs-a-person and assignee, and block or unblock a ticket with a reason.
- **Add tickets.** New stories and spikes go into an epic's `tickets.toml`. Bugs go into `backlog/`.
- **Assign people and agents.** The assignee field suggests people from git history and GitHub contributors, plus anyone already assigned, and still takes any name. Git is scanned once per HEAD (the last 5,000 commits within a year, configurable with `BMAD_BOARD_PEOPLE_COMMITS` and `BMAD_BOARD_PEOPLE_DAYS`), and GitHub's list is cached for six hours.
- **Open a ticket full screen** from its panel. The URL (`#ticket=1.2&full=1`) links straight to it.
- **⌘K** jumps to any ticket. **Copy ref** puts `1.2`-style refs on your clipboard to hand to an agent ("build story 1.2").
- **Right-click a card** to open it, open it full screen, set its status, or copy its ref or link.
- **Mine** (or `m`) shows only the tickets assigned to you.
- **Keyboard shortcuts**, after Kaneo's: `g` then `n`/`b`/`l`/`d`/`u`/`s` to switch views, `c` for a new ticket, `/` to filter, `[` to fold the sidebar, and `?` for the full list.
- **Settings** has two scopes:
  - *Yours*, kept in this browser: theme, which fields cards show (with a live preview), compact cards, the Done column, the view the board opens on, the sidebar, and the stand-up range.
  - *The project's*, committed to `_bmad/custom/bmad-board.toml` for the whole team and its agents: work-in-progress limits per column (a column over its limit is flagged), names that are agents, and people to leave out of suggestions and stand-up, such as CI users.
- Light and dark themes.

The board follows BMAD's rules for who changes what: status, assignee and blocks go to each story's `*-plan.md`, and order and dependencies go to `tickets.toml`. Only a person moves a ticket to Done.

## Develop

`bun scripts/generate-project.ts <folder> --tickets 2110 --git` writes a made-up BMAD project of any size, with all of the dependency styles above, to try the board at scale.


```sh
bun install
bun run server -- --root examples/shop   # API on :33714 (needs git in the root to commit)
bun run dev                              # app on :33713, /api proxied to the server
bun test && bun run typecheck
```

The UI borrows Kaneo's primitives and theme; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

`examples/shop` is a small ticket-tree project and `examples/legacy-v6` a v6 one; tests run against both.
