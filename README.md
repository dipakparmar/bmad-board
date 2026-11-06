# BMAD Project Board

A local, read-only board for BMAD planning and implementation artifacts. Choose a worktree folder with the browser's local directory picker. The app reads `_bmad-output/implementation-artifacts/sprint-status.yaml`, matching story Markdown, and `_bmad-output/planning-artifacts/epics.md` directly in the browser. Files are not uploaded or modified.

## Run locally

```sh
bun install
bun run dev
```

Open <http://127.0.0.1:33713>. Use Chrome or Edge for local directory access, then choose a worktree root containing `_bmad-output`.

The board supports multiple loaded worktrees, sprint and worktree filters, search, board and list views, and a story detail drawer with rendered Markdown.
