import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { getMatch } from "@/lib/matches";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    await getMatch(id, user.id);
    const result = await db().query(
      `SELECT a.id, a.mode, a.recognized_text, a.reference_text, a.at_ms,
              a.pron_score, a.accuracy, a.fluency, a.prosody, a.status,
              COALESCE(json_agg(json_build_object(
                'word', r.word, 'phoneme', r.phoneme, 'score', r.score,
                'errorType', r.error_type, 'atMs', r.at_ms
              ) ORDER BY r.at_ms) FILTER (WHERE r.id IS NOT NULL), '[]') AS notable_words
         FROM pronunciation_attempts a
         LEFT JOIN pronunciation_results r ON r.attempt_id = a.id
        WHERE a.match_id = $1 AND a.user_id = $2
        GROUP BY a.id
        ORDER BY a.at_ms DESC`,
      [id, user.id],
    );
    return NextResponse.json({ attempts: result.rows });
  } catch (error) { return jsonError(error); }
}
