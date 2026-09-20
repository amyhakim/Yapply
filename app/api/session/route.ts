import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createGuest, currentUser, sessionCookie } from "@/lib/session";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await currentUser(request);
    return NextResponse.json({ user }, { status: user ? 200 : 401 });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const existing = await currentUser(request);
    if (existing) return NextResponse.json({ user: existing });
    const { user, cookie } = await createGuest();
    const response = NextResponse.json({ user }, { status: 201 });
    response.cookies.set(sessionCookie.name, cookie, sessionCookie.options);
    return response;
  } catch (error) { return jsonError(error); }
}
