// The team's demo pass: a cookie holding a secret that lives only in the server's DEMO_PASS_SECRET.
import { createHash, timingSafeEqual } from "node:crypto";

export const DEMO_PASS_COOKIE = "demo_pass";

/** Whether `value` is the secret. Never true when no secret is set. */
export function isDemoPass(value: string | undefined | null): boolean {
  const secret = process.env.DEMO_PASS_SECRET;
  if (!secret || !value) return false;
  // Hashed to equal lengths so the comparison takes the same time however much of the secret matches.
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(value), digest(secret));
}
