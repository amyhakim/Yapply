'use client';

import { ControlBar, RoomAudioRenderer, VideoTrack, isTrackReference, useConnectionState, useLocalParticipant, useRemoteParticipants, useTracks } from '@livekit/components-react';
import { ConnectionState, Track } from 'livekit-client';

export function LiveCall({ onLeave }: { onLeave: () => void }) {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const state = useConnectionState();
  const local = tracks.find(track => track.participant.identity === localParticipant.identity);
  const remote = tracks.find(track => track.participant.identity !== localParticipant.identity);
  const partner = remoteParticipants[0];

  return <>
    <RoomAudioRenderer />
    <div className="call-grid live-call-grid">
      <div className="partner-video">
        {remote && isTrackReference(remote) && !remote.publication.isMuted
          ? <VideoTrack trackRef={remote} className="portrait" />
          : <div className="live-placeholder"><span>✳</span><h2>{partner ? 'Your partner’s camera is off' : 'Waiting for your partner'}</h2><p>{partner ? 'You can still speak with your microphones on.' : 'Share the room code so they can join.'}</p></div>}
        <div className="video-bottom"><div className="partner-name">{partner?.name ?? 'Your partner'}</div></div>
      </div>
      <aside className="side-panel"><div className="self-video">
        {local && isTrackReference(local) && !local.publication.isMuted
          ? <VideoTrack trackRef={local} className="portrait" muted style={{ transform: 'scaleX(-1)' }}/>
          : <div className="camera-placeholder">Your camera is off</div>}
        <span className="self-tag">You</span>
      </div><div className="hint-card"><h3>Progress over perfection.</h3><p>Ask your partner about their hometown, their favorite food, or their weekend. You’ve got this.</p></div></aside>
    </div>
    <div className="live-controls">
      <p role="status">{state === ConnectionState.Connected ? 'Connected · use the controls to enable your mic and camera' : `Call ${state}…`}</p>
      <ControlBar controls={{ microphone: true, camera: true, screenShare: false, chat: false, leave: false }}/>
      <button className="secondary" onClick={onLeave}>Leave call</button>
    </div>
  </>;
}
