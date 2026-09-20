import { RoomServiceClient } from "livekit-server-sdk";

export async function closeLiveKitRoom(roomName: string): Promise<void> {
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) return;
  const host = url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  await new RoomServiceClient(host, key, secret).deleteRoom(roomName);
}
