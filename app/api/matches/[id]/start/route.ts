import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, jsonError } from "@/lib/http";
import { getMatch } from "@/lib/matches";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    const match = await getMatch(id, user.id);
    if (match.seat !== 1) throw new ApiError(403, "Only the room creator can start the match");
    if (match.status === "playing") return NextResponse.json({ match });
    if (match.status !== "matched" || match.participant_count !== 2) {
      throw new ApiError(409, "Wait for the second player");
    }
    await db().query(
      "UPDATE matches SET status = 'playing', started_at = now() WHERE id = $1 AND status = 'matched'",
      [id],
    );
    return NextResponse.json({ match: await getMatch(id, user.id) });
  } catch (error) { return jsonError(error); }
}
