# BMAD Project Board

A board, list and ticket view for [BMAD-METHOD](https://github.com/bmad-code-org/bmad-method)'s ticket tree. Tickets stay where BMAD's agents keep them, as markdown and TOML in git. The board reads them, and when you move or edit a ticket it writes the same files and commits the change. It doesn't keep a database of its own.

New here? Start with [docs/getting-started.md](docs/getting-started.md). See [docs/domain-model.md](docs/domain-model.md) for the model and how it maps to Kaneo.

## Three ways to connect a project

| | How | Writes |
|---|---|---|
| **Local checkout** | `bun run start -- --root ~/code/my-project` and open <http://127.0.0.1:33714> | each change is one commit on your current branch (never pushed) |
| **GitHub repo** | "GitHub" in the sidebar, `owner/name`, then sign in with your local `gh` login (needs the local server; the token never reaches the browser) or a fine-grained token (Contents + Pull requests: write) | commits on a `bmad-board/…` branch, one pull request per session |
| **Open folder** | "Open folder" in Chrome or Edge | read-only |

Projects on the older v6 layout (`_bmad-output/implementation-artifacts/sprint-status.yaml`) open read-only. Run `bmad migrate method` to move them to the ticket tree.

## What you can do on the board

- **What's next** (the default view) shows the AI-driven loop the way BMAD's agents see it:
  - *Your call*: built work for you to check and mark done, and blocks only a person can answer.
  - *Ready for an agent*: tickets whose prerequisites are met, in build order.
  - *Needs refining*, *Agents working* (with their plan checklist), and *Waiting on other work*.
  - Every ticket offers its next **hand-off**: a ready-to-paste prompt for the right BMAD skill (`bmad-build`, `bmad-build-auto`, `bmad-agent-po`, `bmad-code-review`).
  - A **recent activity** feed lists the commits that touched the tickets, and marks which came from agents and which from people.

- **Stand-up** gives one card per person and agent. Each card shows what they finished since the last working day (from git), what they're on, what waits on review, and what blocks them. **Run stand-up** walks the team one member at a time with a timer, ending on unowned and up-for-grabs work. The pencil on any ticket changes its status or reassigns it on the spot. Each person has a notes box, plus team notes. **Save notes** commits them to `_bmad-output/standups/standup-<date>.md`, where agents can read them, and **Copy notes** gives the same markdown for your team channel.

- **Dependencies** draws what waits on what, left to right in build order: `after` links as solid arrows and epic gates as dashed ones. Hover a ticket to light up its whole chain, and loops are flagged.

- **Board and list views** of every initiative, epic and backlog ticket, in the Kaneo layout. Each card shows readiness the way BMAD's own `tickets.py next` reports it: ready, blocked (and on what), or needs refining.
- **Drag a card between lanes** to set its status, or pick one in the ticket sheet. **Drag rows in the list** to change an epic's build order.
- **Edit tickets.** You can change the description, risk, needs-a-person and assignee, and block or unblock a ticket with a reason.
- **Add tickets.** New stories and spikes go into an epic's `tickets.toml`. Bugs go into `backlog/`.
- **Assign people and agents.** The assignee field suggests people from git history and GitHub contributors, plus anyone already assigned, and still takes any name. Git is scanned once per HEAD (the last 5,000 commits within a year, configurable with `BMAD_BOARD_PEOPLE_COMMITS` and `BMAD_BOARD_PEOPLE_DAYS`), and GitHub's list is cached for six hours.
- **Open a ticket full screen** from its panel. The URL (`#ticket=1.2&full=1`) links straight to it.
- **⌘K** jumps to any ticket. **Copy ref** puts `1.2`-style refs on your clipboard to hand to an agent ("build story 1.2").
- Light and dark themes.

The board follows BMAD's rules for who changes what: status, assignee and blocks go to each story's `*-plan.md`, and order and dependencies go to `tickets.toml`. Only a person moves a ticket to Done.

## Develop

```sh
bun install
bun run server -- --root examples/shop   # API on :33714 (needs git in the root to commit)
bun run dev                              # app on :33713, /api proxied to the server
bun test && bun run typecheck
```

The UI borrows Kaneo's primitives and theme; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

`examples/shop` is a small ticket-tree project and `examples/legacy-v6` a v6 one; tests run against both.
