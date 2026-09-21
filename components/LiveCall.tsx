'use client';

import { useEffect, useRef, useState } from 'react';
import { RoomAudioRenderer, VideoTrack, isTrackReference, useConnectionState, useLocalParticipant, useRemoteParticipants, useTracks } from '@livekit/components-react';
import { ConnectionState, Track } from 'livekit-client';
import { CameraOff, Maximize2 } from 'lucide-react';
import { PracticeControls } from './PracticeControls';
import { PracticeGrid } from './PracticeGrid';
import { mediaErrorMessage } from '@/lib/media-error';

export function LiveCall({ onLeave }: { onLeave: () => void }) {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const { localParticipant, isCameraEnabled, isMicrophoneEnabled } = useLocalParticipant();
  const partners = useRemoteParticipants();
  const state = useConnectionState();
  const [hint, setHint] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState<'camera' | 'microphone' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', escape);
    return () => { mounted.current = false; window.removeEventListener('keydown', escape); };
  }, []);

  async function toggle(source: 'camera' | 'microphone') {
    if (busy.current) return;
    setError(null);
    if (state !== ConnectionState.Connected) { setError('The call is not connected yet. Wait for Connected, or leave and rejoin the call.'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setError('Camera and microphone access require HTTPS or localhost. Open the site in a regular browser tab.'); return; }
    busy.current = true; setPending(source);
    try {
      // Request capture directly from the click; video={false} only controls initial capture.
      if (source === 'camera') await localParticipant.setCameraEnabled(!localParticipant.isCameraEnabled);
      else await localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled);
      if (!mounted.current) {
        // Release devices if permission was granted after leaving the room.
        if (source === 'camera') await localParticipant.setCameraEnabled(false);
        else await localParticipant.setMicrophoneEnabled(false);
      }
    } catch (caught) {
      if (mounted.current) setError(mediaErrorMessage(caught, source === 'camera' ? 'Camera' : 'Microphone'));
    } finally { busy.current = false; if (mounted.current) setPending(null); }
  }

  const local = tracks.find(track => track.participant.identity === localParticipant.identity);
  const remote = tracks.find(track => track.participant.identity === partners[0]?.identity);
  return <>
    <RoomAudioRenderer/>
    {error && <p className="api-error solo-error" role="alert">{error}</p>}
    {pending && <p className="solo-help" role="status">Opening your {pending}… Check for a browser permission prompt. If none appears, check this site’s permissions.</p>}
    <PracticeGrid hint={hint} onHint={() => setHint(!hint)} starter="Describe your hometown, then ask your partner what they like about theirs."
      preview={local && isTrackReference(local) && isCameraEnabled
        ? <VideoTrack trackRef={local} className="portrait" muted style={{ transform: 'scaleX(-1)' }}/>
        : <div className="camera-placeholder"><CameraOff size={28}/><span>Your camera is off</span></div>}
      stage={<div className={`partner-video solo-stage ${expanded ? 'expanded' : ''}`}>
        {remote && isTrackReference(remote) && !remote.publication.isMuted ? <VideoTrack trackRef={remote} className="portrait"/>
          : <div className="solo-center"><span className="solo-flower">✿</span><h2>{partners[0] ? 'Your partner’s camera is off' : 'Waiting for your partner'}</h2><p>{partners[0] ? 'You can speak with your microphones on.' : 'Share the room code so they can join.'}</p></div>}
        <div className="video-top"><span className="live-badge"><span/>{state === ConnectionState.Connected ? 'FRIEND PRACTICE' : state.toUpperCase()}</span><button className="glass-button" aria-label={expanded ? 'Minimize video' : 'Expand video'} onClick={() => setExpanded(!expanded)}><Maximize2 size={18}/></button></div>
        <div className="video-bottom"><div className="partner-name">{partners[0]?.name ?? 'Your partner'}<small>Private friend room</small></div></div>
      </div>}/>
    <PracticeControls cameraOn={isCameraEnabled} cameraBusy={pending !== null} onCamera={() => void toggle('camera')}
      micOn={isMicrophoneEnabled} micBusy={pending !== null} onMic={() => void toggle('microphone')}
      hint={hint} onHint={() => setHint(!hint)} onFinish={onLeave} finishLabel="Leave call" status={`Call ${state}`}/>
  </>;
}
