import { cookies } from "next/headers";
import { DEMO_PASS_COOKIE, isDemoPass } from "@/lib/demo-pass.ts";

// Opening /api/demo-pass?secret=<DEMO_PASS_SECRET> on the team's laptop or phone sets the demo-pass
// cookie, then goes to the input page. ponytail: the secret sits in the URL (browser history,
// request logs); fine for a hackathon, a POST form if that ever matters.
export async function GET(request: Request) {
  const secret = new URL(request.url).searchParams.get("secret");
  if (!isDemoPass(secret)) return new Response("Not a demo pass.", { status: 403 });
  (await cookies()).set(DEMO_PASS_COOKIE, secret!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });
  return Response.redirect(new URL("/check", request.url), 303);
}
