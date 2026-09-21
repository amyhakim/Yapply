import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clientEndReason } from "@/lib/end-reason";
import { ApiError, jsonError } from "@/lib/http";
import { endMatch, getMatch } from "@/lib/matches";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    const reason = clientEndReason(await request.text());
    const match = await getMatch(id, user.id);
    if (match.status !== "playing") throw new ApiError(409, "Match is not playing");
    // A silent microphone is that player's doing; a long pause belongs to nobody in particular.
    await endMatch(id, reason ? { reason, userId: reason === "silent_mic" ? user.id : undefined } : undefined);
    return NextResponse.json({ match: await getMatch(id, user.id) });
  } catch (error) { return jsonError(error); }
}
