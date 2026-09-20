import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ApiError, jsonError } from "@/lib/http";
import { getMatch } from "@/lib/matches";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new ApiError(400, "Invalid match ID");
    const user = await requireUser(request);
    return NextResponse.json({ match: await getMatch(id, user.id) });
  } catch (error) { return jsonError(error); }
}
