# BMAD Project Board

A board, list and ticket view for [BMAD-METHOD](https://github.com/bmad-code-org/bmad-method)'s ticket tree. Tickets stay where BMAD's agents keep them, as markdown and TOML in git. The board reads them, and when you move or edit a ticket it writes the same files and commits the change. It doesn't keep a database of its own.

See [docs/domain-model.md](docs/domain-model.md) for the model and how it maps to Kaneo.

## Three ways to connect a project

| | How | Writes |
|---|---|---|
| **Local checkout** | `bun run start -- --root ~/code/my-project` and open <http://127.0.0.1:33714> | each change is one commit on your current branch (never pushed) |
| **GitHub repo** | "GitHub repo" in the header, `owner/name` plus an optional fine-grained token (Contents + Pull requests: write) | commits on a `bmad-board/…` branch, one pull request per session |
| **Open folder** | "Open folder" in Chrome or Edge | read-only |

Projects on the older v6 layout (`_bmad-output/implementation-artifacts/sprint-status.yaml`) open read-only. Run `bmad migrate method` to move them to the ticket tree.

The board follows BMAD's rules for who changes what: status, assignee and blocks go to each story's `*-plan.md`, and order and dependencies go to `tickets.toml`. Only a person moves a ticket to Done.

## Develop

```sh
bun install
bun run server -- --root examples/shop   # API on :33714 (needs git in the root to commit)
bun run dev                              # app on :33713, /api proxied to the server
bun test && bun run typecheck
```

`examples/shop` is a small ticket-tree project and `examples/legacy-v6` a v6 one; tests run against both.
