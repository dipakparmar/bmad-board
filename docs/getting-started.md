# Getting started

This walks through one loop of BMAD's AI-driven flow with the board open beside your coding agent.

## 1. Open your project

```sh
git clone https://github.com/dipakparmar/bmad-board && cd bmad-board
bun install
bun run start -- --root ~/code/my-project
```

Open <http://127.0.0.1:33714>. The project needs BMAD's ticket tree (`_bmad-output/initiative-*/…`). A v6 project opens read-only until you run `bmad migrate method` in it.

No local checkout? Use **GitHub repo** in the header instead. Changes then land on a `bmad-board/…` branch with one pull request per session.

## 2. Read "What's next"

It is the default view, and it answers "what should happen now?":

| Lane | Means | You do |
|---|---|---|
| Your call | an agent finished (`built`), or a block only a person can answer | review, then **Done**, or answer the block |
| Ready for an agent | prerequisites met, in build order | copy the hand-off |
| Needs refining | bug, unplanned leaf, or `refine = true` | refine with `bmad-agent-po` |
| Agents working | `in-progress`, with plan checklist progress | wait |
| Waiting on other work | blocked by an `after` ref or an epic gate | nothing yet |

## 3. Hand off to an agent

Each ticket's button copies a prompt for the right skill, for example `Use bmad-build to build story 1.2.`. Paste it into Claude Code in the project. The agent updates the story's `*-plan.md` and commits, and the board picks the change up (live for a local checkout, on reload for GitHub).

## 4. Review and close

When the agent stops at `built`, the ticket shows under **Your call**. Use the review hand-off (`bmad-code-review` against the plan's baseline), then press **Done**. Only a person marks Done.

## 5. Plan the next work

- **New ticket** adds a story or spike to an epic's `tickets.toml`, or a bug to `backlog/`.
- Drag rows in **List** to change build order, and drag cards on **Board** to change status.
- Every change is one commit with a `Changed-by: person:<name> via bmad-board` trailer, so the activity feed tells people's changes apart from agents'.
