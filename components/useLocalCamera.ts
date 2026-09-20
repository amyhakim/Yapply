'use client';

import { useEffect, useRef, useState } from 'react';
import { mediaErrorMessage } from '@/lib/media-error';

export function useLocalCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<MediaStream | null>(null);
  const request = useRef(0);
  const pending = useRef(false);
  const mounted = useRef(false);
  function stop() {
    request.current++;
    current.current?.getTracks().forEach(track => track.stop());
    current.current = null;
    pending.current = false;
    if (mounted.current) { setStream(null); setBusy(false); }
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stop(); };
  }, []);
  async function toggle() {
    if (current.current) { stop(); return; }
    if (pending.current) return;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access is unavailable. Open the HTTPS site in a regular browser tab.'); return;
    }
    pending.current = true; setBusy(true);
    const id = ++request.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (!mounted.current || id !== request.current) { media.getTracks().forEach(track => track.stop()); return; }
      current.current = media; setStream(media);
      media.getVideoTracks()[0]?.addEventListener('ended', stop, { once: true });
    } catch (caught) {
      if (mounted.current && id === request.current) setError(mediaErrorMessage(caught));
    } finally {
      if (mounted.current && id === request.current) { pending.current = false; setBusy(false); }
    }
  }
  return { stream, busy, error, toggle, stop };
}
