import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AccessToken, TrackSource } from "livekit-server-sdk";
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
    if (!["queued", "matched", "ready", "playing"].includes(match.status)) {
      throw new ApiError(409, "This match has ended");
    }
    const url = process.env.LIVEKIT_URL;
    const key = process.env.LIVEKIT_API_KEY;
    const secret = process.env.LIVEKIT_API_SECRET;
    if (!url || !key || !secret) throw new Error("LiveKit credentials are required");
    const token = new AccessToken(key, secret, {
      identity: user.id,
      name: user.username,
      ttl: "10m",
    });
    token.addGrant({
      roomJoin: true,
      room: match.livekit_room,
      canPublish: true,
      canPublishSources: [TrackSource.MICROPHONE],
      canSubscribe: true,
      canPublishData: false,
    });
    return NextResponse.json({ url, token: await token.toJwt() });
  } catch (error) { return jsonError(error); }
}
