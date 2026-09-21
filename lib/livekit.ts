import { RoomServiceClient } from "livekit-server-sdk";

function roomService(): RoomServiceClient | null {
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) return null;
  const host = url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  return new RoomServiceClient(host, key, secret);
}

export async function closeLiveKitRoom(roomName: string): Promise<void> {
  await roomService()?.deleteRoom(roomName);
}

/**
 * The identities (user ids, see the token route) currently connected to the room. Returns null
 * when LiveKit cannot be asked, so callers can decide not to block on it. A room nobody has
 * joined yet does not exist on the server, which counts as empty.
 */
export async function participantIdentitiesInRoom(roomName: string): Promise<string[] | null> {
  const service = roomService();
  if (!service) return null;
  try {
    return (await service.listParticipants(roomName)).map((participant) => participant.identity);
  } catch (error) {
    const status = (error as { status?: number; code?: string }) ?? {};
    if (status.status === 404 || status.code === "not_found") return [];
    console.error("Could not list LiveKit participants", error);
    return null;
  }
}
