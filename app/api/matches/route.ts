import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createMatch } from "@/lib/matches";
import { jsonBody, jsonError } from "@/lib/http";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body = await jsonBody(request);
    const id = await createMatch(user.id, String(body.language ?? ""));
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) { return jsonError(error); }
}
