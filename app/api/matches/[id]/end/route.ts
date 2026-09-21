import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ApiError, jsonError } from "@/lib/http";
import { endMatch, getMatch, type EndReason } from "@/lib/matches";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

// A browser may say why it is ending the match. Only the microphone check happens in the browser;
// the language check is decided on the server and cannot be claimed from here.
async function clientReason(request: NextRequest): Promise<EndReason | null> {
  try {
    const body: unknown = JSON.parse(await request.text());
    return (body as { reason?: unknown })?.reason === "silent_mic" ? "silent_mic" : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    const reason = await clientReason(request);
    const match = await getMatch(id, user.id);
    if (match.status !== "playing") throw new ApiError(409, "Match is not playing");
    await endMatch(id, reason ? { reason, userId: user.id } : undefined);
    return NextResponse.json({ match: await getMatch(id, user.id) });
  } catch (error) { return jsonError(error); }
}
