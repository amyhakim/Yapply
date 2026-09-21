"use client";

import { useEffect } from "react";
import { useRemoteParticipants } from "@livekit/components-react";

/** Renders nothing. Must sit inside <LiveKitRoom>; reports whether anyone else is in the call. */
export function PartnerWatcher({ onChange }: { onChange: (present: boolean) => void }) {
  const present = useRemoteParticipants().length > 0;
  useEffect(() => {
    onChange(present);
    return () => onChange(false);
  }, [present, onChange]);
  return null;
}
