import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, jsonError } from "@/lib/http";
import { getMatch } from "@/lib/matches";
import { closeLiveKitRoom } from "@/lib/livekit";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    const match = await getMatch(id, user.id);
    if (match.status !== "playing") throw new ApiError(409, "Match is not playing");
    const updated = await db().query<{ livekit_room: string }>(
      `UPDATE matches SET status = 'complete', ended_at = now()
       WHERE id = $1 AND status = 'playing' RETURNING livekit_room`,
      [id],
    );
    if (updated.rows[0]) await closeLiveKitRoom(updated.rows[0].livekit_room).catch(console.error);
    return NextResponse.json({ match: await getMatch(id, user.id) });
  } catch (error) { return jsonError(error); }
}
