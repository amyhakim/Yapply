'use client';

import { Camera, CameraOff, Lightbulb, Mic, MicOff, Square } from 'lucide-react';

export function PracticeControls({ cameraOn, cameraBusy, onCamera, micOn, micDisabled, micBusy, onMic, hint, onHint, onFinish, finishDisabled, finishLabel, status }: {
  cameraOn: boolean; cameraBusy: boolean; onCamera: () => void;
  micOn: boolean; micDisabled?: boolean; micBusy?: boolean; onMic: () => void;
  hint: boolean; onHint: () => void; onFinish: () => void;
  finishDisabled?: boolean; finishLabel: string; status: string;
}) {
  return <div className="controls-bar practice-controls">
    <div className="connection" role="status">{status}</div>
    <div className="call-controls">
      <button className={`control ${!micOn ? 'selected' : ''}`} disabled={micDisabled || micBusy} onClick={onMic} aria-label={micOn ? 'Mute microphone' : 'Turn microphone on'} aria-pressed={micOn}><span>{micOn ? <Mic/> : <MicOff/>}</span>{micBusy ? 'Opening…' : micOn ? 'Mute' : 'Microphone'}</button>
      <button className={`control ${cameraOn ? 'selected' : ''}`} disabled={cameraBusy} onClick={onCamera} aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'} aria-pressed={cameraOn}><span>{cameraOn ? <Camera/> : <CameraOff/>}</span>{cameraBusy ? 'Opening…' : 'Camera'}</button>
      <button className={`control ${hint ? 'selected' : ''}`} onClick={onHint} aria-pressed={hint}><span><Lightbulb/></span>Hint</button>
      <span className="control-divider"/>
      <button className="control leave" disabled={finishDisabled} onClick={onFinish}><span><Square/></span>{finishLabel}</button>
    </div>
  </div>;
}
