import { randomBytes, randomUUID } from "node:crypto";
import { db, transaction } from "./db";
import { ApiError } from "./http";
import { closeLiveKitRoom } from "./livekit";

export interface MatchView {
  id: string;
  livekit_room: string;
  status: string;
  language_code: string;
  azure_locale: string | null;
  duration_secs: number;
  server_now: string;
  started_at: string | null;
  ended_at: string | null;
  seat: number;
  participant_count: number;
  room_code: string;
  challenge_prompt: string | null;
  /** Set when the match ended early because of a rule (see EndReason), else null. */
  end_reason: EndReason | null;
  /** Seat of the player who caused the early end. */
  end_reason_seat: number | null;
}

export type EndReason = "language_switch" | "silent_mic";

/**
 * Ends a playing match for both players and closes the call. When an early-end reason is given it
 * is recorded, with the player responsible, so both screens can say what happened. Returns false
 * if the match was not playing, e.g. the timer or the other player got there first.
 */
export async function endMatch(
  matchId: string, early?: { reason: EndReason; userId: string },
): Promise<boolean> {
  const room = await transaction(async (client) => {
    const updated = await client.query<{ livekit_room: string }>(
      `UPDATE matches SET status = 'complete', ended_at = now()
        WHERE id = $1 AND status = 'playing' RETURNING livekit_room`,
      [matchId],
    );
    if (!updated.rows[0]) return null;
    if (early) {
      await client.query(
        `INSERT INTO challenge_events (match_id, participant_id, event_type, payload)
         SELECT $1, p.id, 'match_ended_early', $3::jsonb
           FROM match_participants p WHERE p.match_id = $1 AND p.user_id = $2`,
        [matchId, early.userId, JSON.stringify({ reason: early.reason })],
      );
    }
    return updated.rows[0].livekit_room;
  });
  if (!room) return false;
  await closeLiveKitRoom(room).catch(console.error);
  return true;
}

export async function getMatch(matchId: string, userId: string): Promise<MatchView> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(matchId)) {
    throw new ApiError(400, "Invalid match ID");
  }
  const expired = await db().query<{ livekit_room: string }>(
    `UPDATE matches SET status = 'complete', ended_at = started_at + duration_secs * interval '1 second'
      WHERE id = $1 AND status = 'playing'
        AND now() >= started_at + duration_secs * interval '1 second'
      RETURNING livekit_room`,
    [matchId],
  );
  if (expired.rows[0]) {
    await closeLiveKitRoom(expired.rows[0].livekit_room).catch(console.error);
  }
  const result = await db().query<MatchView>(
    `SELECT m.id, m.livekit_room, m.status, m.language_code, l.azure_locale, m.duration_secs,
            now() AS server_now,
            m.started_at, m.ended_at, p.seat,
            (SELECT count(*)::int FROM match_participants WHERE match_id = m.id) AS participant_count,
            i.room_code, c.prompt AS challenge_prompt,
            (SELECT e.payload->>'reason' FROM challenge_events e
              WHERE e.match_id = m.id AND e.event_type = 'match_ended_early'
              ORDER BY e.id DESC LIMIT 1) AS end_reason,
            (SELECT ep.seat::int FROM challenge_events e
               JOIN match_participants ep ON ep.id = e.participant_id
              WHERE e.match_id = m.id AND e.event_type = 'match_ended_early'
              ORDER BY e.id DESC LIMIT 1) AS end_reason_seat
       FROM matches m
       JOIN match_participants p ON p.match_id = m.id AND p.user_id = $2
       JOIN languages l ON l.code = m.language_code
       JOIN match_invites i ON i.match_id = m.id
       LEFT JOIN challenges c ON c.id = m.challenge_id
      WHERE m.id = $1`,
    [matchId, userId],
  );
  if (!result.rows[0]) throw new ApiError(404, "Match not found");
  return result.rows[0];
}

export async function createMatch(userId: string, language: string): Promise<string> {
  if (!/^(en|es)$/.test(language)) throw new ApiError(400, "Choose English or Spanish");
  return transaction(async (client) => {
    const locale = await client.query<{ azure_locale: string | null }>(
      "SELECT azure_locale FROM languages WHERE code = $1 AND enabled", [language],
    );
    if (!locale.rows[0]?.azure_locale) throw new ApiError(400, "Pronunciation is unavailable for this language");
    const challenge = await client.query<{ id: string }>(
      `SELECT id FROM challenges WHERE language_code = $1 AND type = 'pronunciation_battle'
       AND enabled ORDER BY created_at LIMIT 1`, [language],
    );
    if (!challenge.rows[0]) throw new ApiError(503, "Pronunciation challenges are not seeded");
    const id = randomUUID();
    const code = randomBytes(5).toString("hex").toUpperCase();
    await client.query(
      `INSERT INTO matches (id, match_type, mode, language_code, level, challenge_id,
                            livekit_room, status, purge_after)
       VALUES ($1, 'friend', 'challenge', $2, 'A1', $3, $4, 'queued', now() + interval '30 days')`,
      [id, language, challenge.rows[0].id, `match-${id}`],
    );
    await client.query(
      "INSERT INTO match_participants (match_id, seat, user_id) VALUES ($1, 1, $2)",
      [id, userId],
    );
    await client.query(
      `INSERT INTO match_invites (inviter_id, room_code, language_code, level, mode,
                                  challenge_id, match_id)
       VALUES ($1, $2, $3, 'A1', 'challenge', $4, $5)`,
      [userId, code, language, challenge.rows[0].id, id],
    );
    return id;
  });
}

export async function joinMatch(userId: string, roomCode: string): Promise<string> {
  if (!/^[A-F0-9]{10}$/.test(roomCode)) throw new ApiError(400, "Invalid room code");
  return transaction(async (client) => {
    const invite = await client.query<{
      match_id: string; inviter_id: string; status: string; expires_at: Date;
    }>(
      "SELECT match_id, inviter_id, status, expires_at FROM match_invites WHERE room_code = $1 FOR UPDATE",
      [roomCode],
    );
    const row = invite.rows[0];
    if (!row) throw new ApiError(404, "Room code not found");
    const existing = await client.query(
      "SELECT 1 FROM match_participants WHERE match_id = $1 AND user_id = $2",
      [row.match_id, userId],
    );
    if (existing.rowCount) return row.match_id;
    if (row.status !== "pending" || row.expires_at.getTime() <= Date.now()) {
      throw new ApiError(409, "Room code has expired or has been used");
    }
    if (row.inviter_id === userId) throw new ApiError(409, "Open the match you created");
    await client.query(
      "INSERT INTO match_participants (match_id, seat, user_id) VALUES ($1, 2, $2)",
      [row.match_id, userId],
    );
    await client.query(
      "UPDATE match_invites SET invitee_id = $1, status = 'accepted' WHERE room_code = $2",
      [userId, roomCode],
    );
    await client.query("UPDATE matches SET status = 'matched' WHERE id = $1", [row.match_id]);
    return row.match_id;
  });
}
