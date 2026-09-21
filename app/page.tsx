'use client';

import { useEffect, useRef, useState } from 'react';
import { RoomLobby } from '@/components/RoomLobby';
import { PracticeControls } from '@/components/PracticeControls';
import { PracticeGrid } from '@/components/PracticeGrid';
import { CameraPreview } from '@/components/CameraPreview';
import { useLocalCamera } from '@/components/useLocalCamera';
import { ArrowRight, AudioLines, Check, Heart, Lightbulb, Maximize2, Mic, MicOff, MoreHorizontal, Square, Sparkles, Star } from 'lucide-react';

export default function Home() {
  const camera = useLocalCamera();
  const [status, setStatus] = useState<'idle' | 'requesting' | 'recording' | 'done'>('idle');
  const [seconds, setSeconds] = useState(30);
  const [muted, setMuted] = useState(false);
  const [hint, setHint] = useState(false);
  const [help, setHelp] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const url = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mounted = useRef(false);
  const requesting = useRef(false);

  function stop() {
    camera.stop();
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current?.state !== 'inactive') recorder.current?.stop();
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (mounted.current) { setStatus('done'); setMuted(false); }
  }

  useEffect(() => {
    mounted.current = true;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', escape);
    return () => {
      mounted.current = false;
      if (timer.current) clearInterval(timer.current);
      if (recorder.current) {
        recorder.current.onstop = null;
        recorder.current.ondataavailable = null;
        recorder.current.onerror = null;
        if (recorder.current.state !== 'inactive') recorder.current.stop();
      }
      stream.current?.getTracks().forEach(track => track.stop());
      if (url.current) URL.revokeObjectURL(url.current);
      window.removeEventListener('keydown', escape);
    };
  }, []);

  async function start() {
    if (requesting.current || recorder.current?.state === 'recording') return;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Recording is unavailable in this browser. Try a current browser on HTTPS or localhost.');
      return;
    }
    requesting.current = true;
    setStatus('requesting');
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { input.getTracks().forEach(track => track.stop()); return; }
      stream.current = input;
      const capture = new MediaRecorder(input);
      recorder.current = capture;
      const chunks: Blob[] = [];
      capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      capture.onstop = () => {
        if (!mounted.current) return;
        const blob = new Blob(chunks, { type: capture.mimeType || chunks[0]?.type || 'audio/webm' });
        if (blob.size) {
          url.current = URL.createObjectURL(blob);
          setRecordingUrl(url.current);
        } else setError('No recording was captured. Check your microphone and try again.');
      };
      capture.onerror = () => { setError('Recording was interrupted. Please try again.'); stop(); };
      capture.start();
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = null;
      setRecordingUrl(null);
      setSeconds(30); setCompleted(false); setMuted(false); setStatus('recording');
      const deadline = performance.now() + 30_000;
      timer.current = setInterval(() => {
        const left = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
        setSeconds(left);
        if (left === 0) { setCompleted(true); stop(); }
      }, 100);
    } catch (caught) {
      stream.current?.getTracks().forEach(track => track.stop());
      stream.current = null;
      if (mounted.current) {
        setStatus('idle');
        setError(caught instanceof DOMException && caught.name === 'NotAllowedError'
          ? 'Microphone access was not allowed. Enable it in your browser’s site settings, then try again.'
          : 'Could not access your microphone. Check that it is connected and available, then try again.');
      }
    } finally { requesting.current = false; }
  }

  function toggleMute() {
    const next = !muted;
    stream.current?.getAudioTracks().forEach(track => { track.enabled = !next; });
    setMuted(next);
  }
  const playing = status === 'recording';

  return <div className="app-shell">
    <header className="header">
      <a className="wordmark" href="/" aria-label="Yapply home">yapply<span className="logo-flower">✳</span></a>
      <div className="header-center"><span className="little-dot"/>Boost your language skills</div>
      <div className="profile"><span className="streak"><span>✦</span> Welcome back</span><span className="profile-avatar">Y<span/></span></div>
    </header>
    <main>
      <div className="page-heading"><div><h1>Hola! <span>Learn a new language!</span></h1><p>Strengthen your language skills with real conversation!</p></div></div>
      <RoomLobby/>
      <section className="room solo-room" aria-label="Solo 30-second speaking challenge">
        <div className="room-top"><div className="language"><span className="flag">🇪🇸</span><strong>Spanish</strong><span className="level">Solo challenge</span></div><div className={`timer ${seconds <= 5 ? 'urgent' : ''}`} aria-label={`${seconds} seconds remaining`}><span className="timer-dot"/>0:{String(seconds).padStart(2, '0')}<span> / 0:30</span></div><button className="icon-button" aria-label="About solo practice" aria-expanded={help} onClick={() => setHelp(!help)}><MoreHorizontal size={23}/></button></div>
        {help && <p className="solo-help">Start when you’re ready, allow your microphone, and speak for 30 seconds. Listen back afterward. Your audio stays in this tab and is discarded when you retry or leave. There is no AI partner or automatic scoring.</p>}
        <div className="challenge"><div className="challenge-icon"><Sparkles size={28}/></div><div className="challenge-copy"><div className="eyebrow">YOUR 30-SECOND SPEAKING CHALLENGE</div><h2>Make us fall in love with your hometown.</h2><p>Describe what makes it special. A hidden gem? The delicious food? </p><div className="bonus-row"><span><Star size={14}/> TRY TO INCLUDE</span><span className="bonus"><Check size={13}/> One favorite place</span><span className="bonus"><Check size={13}/> A reason you love it</span></div></div><span className="challenge-doodle" aria-hidden="true">✿</span></div>
        {(error || camera.error) && <p className="api-error solo-error" role="alert">{error || camera.error}</p>}
        {camera.busy && <p className="solo-help" role="status">Waiting for camera permission. Check your browser’s permission prompt.</p>}
        <PracticeGrid hint={hint} onHint={() => setHint(!hint)} starter="Mi ciudad se llama… Mi lugar favorito es… Me encanta porque…" preview={<CameraPreview stream={camera.stream}/>} stage={
          <div className={`partner-video solo-stage ${expanded ? 'expanded' : ''}`}>
            <div className="video-top"><span className="live-badge"><span/>{playing ? (muted ? 'MICROPHONE MUTED' : 'RECORDING LOCALLY') : status === 'done' ? 'PRACTICE FINISHED' : null}</span><button className="glass-button" aria-label={expanded ? 'Minimize challenge' : 'Expand challenge'} onClick={() => setExpanded(!expanded)}><Maximize2 size={18}/></button></div>
            <div className="solo-center">
              <span className="solo-flower" aria-hidden="true">✿</span>
              {status === 'done' ? <><h2>{completed ? '30 seconds. One step forward.' : 'Every little practice counts.'}</h2><p>Listen back. Did you describe a place and explain why you love it?</p>{recordingUrl && <audio controls src={recordingUrl} aria-label="Listen to your speaking practice"/>}<p className="solo-note">Self-review only · no automatic score</p><button className="primary-button" onClick={() => void start()}>Try again <ArrowRight size={17}/></button></>
                : <><h2>{playing ? 'Your hometown, in your words.' : 'Show us what you got.'}</h2><p>{playing ? '' : 'Speak in Spanish, then listen back to your recording.'}</p>{!playing && <button className="primary-button" disabled={status === 'requesting'} onClick={() => void start()}>{status === 'requesting' ? 'Waiting for microphone permission…' : 'Start 30-second challenge'}<ArrowRight size={17}/></button>}{playing && <div className="solo-countdown" aria-hidden="true">{seconds}<small>seconds left</small></div>}</>}
            </div>
            <div className="video-bottom"><div className="partner-name">Your speaking space</div><div className="audio-badge"><AudioLines size={21}/></div></div>
          </div>
        }/>
        <PracticeControls cameraOn={!!camera.stream} cameraBusy={camera.busy} onCamera={() => void camera.toggle()} micOn={playing && !muted} micDisabled={!playing} onMic={toggleMute} hint={hint} onHint={() => setHint(!hint)} onFinish={stop} finishDisabled={!playing} finishLabel="Finish early"/>
      </section>
    </main>
  </div>;
}
