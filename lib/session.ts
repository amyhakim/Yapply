import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "./db";
import { ApiError } from "./http";

const COOKIE_NAME = "yapply_session";
const MAX_AGE = 60 * 60 * 24 * 30;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must have at least 32 characters");
  }
  return value;
}

function signature(payload: string): Buffer {
  return createHmac("sha256", secret()).update(payload).digest();
}

function issueCookie(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Date.now() + MAX_AGE * 1000 }))
    .toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}

function readCookie(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra) return null;
  const actual = Buffer.from(mac, "base64url");
  const expected = signature(payload);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      sub?: unknown; exp?: unknown;
    };
    if (typeof parsed.sub !== "string" || typeof parsed.exp !== "number" || parsed.exp < Date.now()) {
      return null;
    }
    return parsed.sub;
  } catch {
    return null;
  }
}

export interface User { id: string; username: string }

export async function currentUser(request: NextRequest): Promise<User | null> {
  const id = readCookie(request.cookies.get(COOKIE_NAME)?.value);
  if (!id) return null;
  const result = await db().query<User>(
    "SELECT id, username FROM users WHERE id = $1 AND banned_at IS NULL AND deleted_at IS NULL",
    [id],
  );
  return result.rows[0] ?? null;
}

export async function requireUser(request: NextRequest): Promise<User> {
  const user = await currentUser(request);
  if (!user) throw new ApiError(401, "Start a guest session first");
  return user;
}

export async function createGuest(): Promise<{ user: User; cookie: string }> {
  const id = randomUUID();
  const username = `Guest_${randomBytes(5).toString("hex")}`;
  const result = await db().query<User>(
    "INSERT INTO users (id, email, username) VALUES ($1, $2, $3) RETURNING id, username",
    [id, `guest+${id}@example.invalid`, username],
  );
  return { user: result.rows[0], cookie: issueCookie(id) };
}

export const sessionCookie = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  },
};
