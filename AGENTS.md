<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# TruthAgent project rules

- Read `CONTEXT.md` (glossary) and `docs/architecture.md` before writing code; decisions live in `docs/adr/`.
- The app calls **OpenAI only** (Responses API). No Anthropic/Claude API in app code: there is no key for it.
- Default model `gpt-6-luna`; `gpt-6-sol` only for the verdict on hard claims. Budget is $4 total: never add model calls casually.
- Keys only in `.env.local` (see `.env.example`), never in client code, never committed.
- UI in `app/`, checking pipeline in `lib/engine/`. One Next.js app, no separate backend.
- Every outside call (OpenAI, Google, SerpApi, page fetch, Wayback, Sightengine, Redis) goes through the outside-world boundary, which has `live` and `replay` modes. Replay is the default in dev and tests and costs $0; use live only when a ticket says so.
- One test seam: the Engine entry `check(message, options)`. Tests go in through it and assert only on what a user could see (labels, Confidence, Evidence sides, step events), never on internals.

# Working on an issue

Work is tracked in GitHub Issues (`gh` CLI). The spec is issue #1; each ticket links to it.

1. Read the ticket (`gh issue view <n>`) and the spec sections it touches (`gh issue view 1`).
2. Check that its **Blocked by** issues are closed. If they aren't, stop and say so.
3. Priority: P0 first (never cut), then P1, then P2 (first to cut). Stay inside the ticket's scope. If you notice other work, mention it; don't do it.
4. Branch `issue-<n>-<short-slug>` from `main`.
5. Before opening a PR: `npm run lint`, `npm run build`, and the tests (in replay mode) all pass. Tick the ticket's acceptance criteria you met.
6. Open a PR whose body starts with `Closes #<n>` and lists anything left undone.
