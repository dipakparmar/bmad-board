# BMAD Project Board

A board, list and ticket view for [BMAD-METHOD](https://github.com/bmad-code-org/bmad-method)'s ticket tree. Tickets stay where BMAD's agents keep them, as markdown and TOML in git. The board reads them, and when you move or edit a ticket it writes the same files and commits the change. It doesn't keep a database of its own.

New here? Start with [docs/getting-started.md](docs/getting-started.md). See [docs/domain-model.md](docs/domain-model.md) for the model and how it maps to Kaneo.

## Install

`bmad-board` is one executable with the app inside. Install it once, then run it in any BMAD project:

```sh
curl -fsSL https://raw.githubusercontent.com/dipakparmar/bmad-board/main/install.sh | sh
cd ~/code/my-project && bmad-board
```

While the repo is private, install with your `gh` login instead (the script then downloads with `gh` too):

```sh
gh api repos/dipakparmar/bmad-board/contents/install.sh -H 'Accept: application/vnd.github.raw' | sh
```

It serves the current folder on <http://127.0.0.1:33714> (or the next free port) and opens your browser. `bmad-board ~/code/other`, `--port 4000` and `--no-open` do what they say; `bmad-board --help` lists the rest. Builds exist for macOS and Linux on arm64 and x64; the script picks yours, checks its checksum, and installs to `/usr/local/bin` when writable, else `~/.local/bin` (`BMAD_BOARD_INSTALL_DIR` and `BMAD_BOARD_VERSION=v0.2.0` change that). You can also download a `.tar.gz` from [Releases](https://github.com/dipakparmar/bmad-board/releases) yourself. It needs `git` on the machine for history and commits, and `gh` only for the GitHub sign-in.

To build it yourself: `bun run build:cli` (this machine) or `bun scripts/build-cli.ts --all`, which writes `release/bmad-board-<os>-<arch>`. Pushing a `v*` tag builds all four, signs the macOS ones, smoke-tests them, and attaches them to a GitHub release.

To use the built binary from this checkout, run `bun run link:local`. This symlinks the matching `release/bmad-board-<os>-<arch>` into `~/.local/bin/bmad-board`; set `BMAD_BOARD_INSTALL_DIR` to choose another directory.

## Three ways to connect a project

| | How | Writes |
|---|---|---|
| **Local checkout** | `bmad-board` inside the project (from source: `bun run start -- --root ~/code/my-project`) | each change is one commit on your current branch (never pushed), or, with **Commit on save** off in Settings, written and left uncommitted |
| **GitHub repo** | "GitHub" in the sidebar, `owner/name`, then sign in with your local `gh` login (needs the local server; the token never reaches the browser) or a fine-grained token (Contents + Pull requests: write) | commits on a `bmad-board/…` branch, one pull request per session |
| **Open folder** | "Open folder" in Chrome or Edge | read-only |

GitHub repos you connect come back when you reload, and every project is cached in the browser by git: file text is kept by blob SHA (in IndexedDB, so it survives reloads and is shared across repos and branches), and the parsed board is kept with the versions of the exact files it read. On reload the board asks for the current file versions in one call (GitHub's branch ref and tree; the local server's `/api/tree`, from `git ls-files` plus `git hash-object` for uncommitted edits), reuses the board outright when none of its files changed, and otherwise fetches only the files whose content changed. Commits that only touch code cost nothing. **Clear cache and reload** in Settings (or a project's ··· menu in the sidebar) starts fresh.

Projects on the older v6 layout are read the way v6's workflows write them, and edited the same way:
- `sprint-status.yaml` (paths from `_bmad/bmm/config.yaml`): project metadata, epic statuses, stories including split ones (`2-6a-…`), retrospectives and their action items. Legacy statuses (`drafted`, `contexted`) are mapped.
- `epics.md` or sharded `epics/epic-N.md`: epic titles and goals, plus stories that sprint planning hasn't picked up yet, which show as backlog.
- Story files (`N-M-slug.md` in `story_location`): title, `Status:`, the user story, acceptance criteria, and the Tasks / Subtasks checklist, which shows as progress on the card. When a story file and sprint-status.yaml disagree, the later status wins, as in v6.
- Retro action items show in the stand-up wrap-up. Each story links to its section of the epics file, its `[Source: …]` citations, and the planning docs.

Edits to a v6 project change only the lines they mean to, so comments, blank lines and key order stay as BMAD wrote them, and BMAD's own sprint-planning, create-story and dev-story keep working on the files:
- **Status** goes to `development_status` in sprint-status.yaml and to the story file's `Status:` line (both, since v6 reads the later of the two). Only v6's statuses are written: ready-for-dev, in-progress, review, done. Code review and built are `review`. The epic turns `in-progress` when a story starts and `done` when every story is; `last_updated` is stamped as `MM-DD-YYYY HH:MM`. v6 has no dropped status, so the board doesn't offer it.
- **Assignee** and **Blocked** are `Assignee:` and `Blocked: reason (since date)` lines under `Status:` in the story file. v6 has no field for either, and a mapping in sprint-status.yaml would break sprint-planning. Assigning or blocking a story that has no story file yet creates one from v6's create-story template, filled with the story and acceptance criteria from the epics file, and moves it to ready-for-dev.
- **Tasks**: tick the Tasks / Subtasks checkboxes in the ticket panel.
- **Title and description**: the story's section in the epics file until it has a story file, and the story file after that (v6 never rewrites the epics file once create-story ran). Renaming a story in the epics file renames its sprint-status key to match, as sprint-planning would derive it.
- **New stories** (New ticket, or `c`) go at the end of the epic in the epics file as `### Story N.M: Title`, with a `backlog` key in sprint-status.yaml.

`bmad migrate method` still moves a v6 project to the ticket tree if you want it.

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

- **Sprints.** The header defaults to the current dated sprint, or an explicitly active sprint between date windows. Choose **All tickets**, **Unscheduled**, or a specific sprint to change it. Sprint dates come from project sprint definitions, including `_super-bmad/followup/board-config.yaml`; assignment comes from sprint-status or story metadata. Projects without a current sprint remain unfiltered. Explicit choices persist in this browser and shared URLs.
- **Reference chips.** Dependency notices and Markdown ticket links show a clickable reference, type icon and title. Local document links use the document's title or section heading when available, with a filename fallback. Long titles truncate with their full text available on hover.
- **Filters** (the Filter button, or `x`) apply to every view at once: status, readiness (ready, refine first, blocked, being worked on), people or agents, specific people, type, risk, initiative and epic, needs a person, and hide done (`h`). They sit in the URL, so a filtered view is a link you can share, and the last ones you used come back next time. A project of more than 300 tickets opens with done tickets hidden.
- **Everything links.** In a ticket, the epic and initiative show their tickets on the board (the file icon opens their file); `Story 1.2`, ticket file names like `story-cart-scaffold` and commit hashes in its text and plan open that ticket or commit; Relations adds **Mentioned in**, the tickets whose text names this one; and the header shows the project's branch. Commit hashes in activity feeds open the **commit view**: who made it and why, the branches it's on, its files, and the **tickets it touched** (by their files, plans, tickets.toml and epic files), each one a click away. In Settings, **Links** picks where files open (the board's reader, GitHub, VS Code or Cursor), where commits open (the board or GitHub) and what branch links do (open on GitHub or copy `git switch`). A choice the project can't reach falls back to GitHub, then the board. The GitHub address comes from the repo's `origin` remote, or the repo you connected.
- **Big projects** stay quick: long lanes, columns and lists show a page at a time, the dependency view opens on epics (one card per epic, one arrow per pair of epics with a count) once more than 300 tickets would be drawn, clicking an epic opens its tickets and the tickets they link to, and double-clicking a ticket shows only its neighbourhood, one to three steps or the whole chain. The dependency view has a full-screen mode. A cold start reads the project's BMAD files in a few large requests; after that the cache makes reloads near-instant. Tested on a generated 2,110-ticket project.
- **Board and list views** of every initiative, epic and backlog ticket, in the Kaneo layout. Each card shows readiness the way BMAD's own `tickets.py next` reports it: ready, blocked (and on what), or needs refining.
- **Drag a card between lanes** to set its status, or pick one in the ticket sheet. **Drag rows in the list** to change an epic's build order.
- **Edit tickets.** You can change the description, risk, needs-a-person and assignee, and block or unblock a ticket with a reason.
- **Add tickets.** New stories and spikes go into an epic's `tickets.toml`. Bugs go into `backlog/`.
- **Users and identity corrections.** Settings lists identities discovered from story owners, ticket metadata, build plans, epics, initiatives, retrospective actions, Git authors and co-authors, and GitHub contributors. Use **Correct** or **Add user** to set a display name, aliases (first names, full names, emails or GitHub logins), person/agent type and visibility. Review **Recommended user matches**, select the groups you want, and use **Accept selected matches** to save them together. Suggestions connect BMAD first or short names with full names, GitHub logins and all observed work, personal and GitHub private emails. Ambiguous first names stay separate for review. You can also edit aliases manually. Matching ignores case and a leading `@`; recommendations take effect only after acceptance. Corrections are stored per project in this browser, separately from the file cache, and apply to ticket displays, filters, suggestions, activity and stand-up grouping. They do not rewrite project files. New assignments use the chosen display name. Removing a mapping restores discovered values. Human co-authors receive stand-up credit alongside bot authors. GitHub avatars appear beside users and recommendations. Cards use custom profile pictures when available, with initials for missing images, the generic GitHub avatar and recognized generated identicons.
- **Assign people and agents.** The assignee field suggests people from git history and GitHub contributors, plus anyone already assigned, and still takes any name. Git is scanned once per HEAD (the last 5,000 commits within a year, configurable with `BMAD_BOARD_PEOPLE_COMMITS` and `BMAD_BOARD_PEOPLE_DAYS`), and GitHub's list is cached for six hours.
- **Open a ticket full screen** from its panel. The URL (`#ticket=1.2&full=1`) links straight to it.
- **Back and Forward work.** The view, the sidebar scope, the open ticket (and full screen), the document in the reader, the commit view and the dependency view's focus all live in the URL, so each step is a browser history entry and any of them can be shared as a link. Changing filters updates the URL without adding entries.
- **⌘K** jumps to any ticket. **Copy ref** puts `1.2`-style refs on your clipboard to hand to an agent ("build story 1.2").
- **Right-click a card** to open it, open it full screen, set its status, or copy its ref or link.
- **Mine** (or `m`) shows only the tickets assigned to you.
- **Keyboard shortcuts**, after Kaneo's: `g` then `n`/`b`/`l`/`d`/`u`/`s` to switch views, `c` for a new ticket, `/` to find in titles, `x` for filters, `h` to hide done tickets, `[` to fold the sidebar, and `?` for the full list.
- **Settings** has two scopes:
  - *Yours*, kept in this browser: theme, which fields cards show (with a live preview), compact cards, the Done column, the view the board opens on, the sidebar, the stand-up range, where links open, and git: whether each change is committed as it's saved, and the commit message.
  - *The project's*, committed to `_bmad/custom/bmad-board.toml` for the whole team and its agents: work-in-progress limits per column (a column over its limit is flagged), names that are agents, and people to leave out of suggestions and stand-up, such as CI users.
- **Commits are up to you.** Settings › Git has **Commit on save**. When it's on (the default), each change is one commit on your current branch. When it's off, a local project's files are written and left uncommitted, so you can review them and commit them yourself, or use **Commit now** in the same card. That commits only the files the board changed, as one commit, and leaves the rest of your working copy alone. The **commit message** template takes `{summary}`, `{author}` and `{kind}` and applies to GitHub projects too, which always commit to their pull request branch. A `Changed-by:` line is added when the template has none, since history uses it to tell people's changes from agents'.
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

`examples/shop` is a small ticket-tree project, `examples/legacy-v6` a v6 one, and `examples/v6-template` a v6 project built from BMAD v6.12's own templates (its sprint-status.yaml is the shipped template, unchanged); tests run against all three, and check edited v6 files against the same rules as BMAD's `sprint_plan.py validate`.
