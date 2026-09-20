import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { getMatch } from "@/lib/matches";
import { getScoreView } from "@/lib/scores";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

// status: not_finished | pending (worker has not scored yet, poll again) |
// unavailable (finished, not enough speech to score) | ready (score included).
export async function GET(request: NextRequest, context: Context) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    const match = await getMatch(id, user.id);
    return NextResponse.json(await getScoreView(id, user.id, match));
  } catch (error) { return jsonError(error); }
}
