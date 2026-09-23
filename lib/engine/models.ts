// The one place model ids live. Swapping a model is a one-line change here.
// IDs per docs/architecture.md §3; must be confirmed against `GET /v1/models`
// on the real key before a live run (tracked separately in issue #2).
export const MODELS = {
  /** Everything by default: understand, agent loop, stance, verdict. */
  luna: "gpt-6-luna",
  /** Verdict only, and only for Hard claims (check.ts). Used nowhere else. */
  sol: "gpt-6-sol",
} as const;
