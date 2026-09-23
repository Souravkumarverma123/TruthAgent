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
