import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { joinMatch } from "@/lib/matches";
import { jsonBody, jsonError } from "@/lib/http";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body = await jsonBody(request);
    const id = await joinMatch(user.id, String(body.code ?? "").toUpperCase());
    return NextResponse.json({ id });
  } catch (error) { return jsonError(error); }
}
