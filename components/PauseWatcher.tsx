"use client";

import { useEffect, useRef } from "react";
import { useSpeakingParticipants } from "@livekit/components-react";
import { PauseWatch } from "@/lib/pause-watch";

/**
 * Renders nothing. Must sit inside <LiveKitRoom>. While `active`, watches for a stretch in which
 * nobody on either side of the call speaks, and calls `onLongPause` once when it gets too long.
 */
export function PauseWatcher({ active, onLongPause }: { active: boolean; onLongPause: () => void }) {
  const speaking = useSpeakingParticipants().length > 0;
  const speakingRef = useRef(speaking);
  const onLongPauseRef = useRef(onLongPause);
  speakingRef.current = speaking;
  onLongPauseRef.current = onLongPause;

  useEffect(() => {
    if (!active) return;
    const watch = new PauseWatch();
    let reported = false;
    const tick = setInterval(() => {
      if (!reported && watch.update(speakingRef.current, Date.now())) {
        reported = true;
        onLongPauseRef.current();
      }
    }, 500);
    return () => clearInterval(tick);
  }, [active]);

  return null;
}
