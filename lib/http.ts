import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // Report a consistent client error below.
  }
  throw new ApiError(400, "Expected a JSON object");
}
