'use client';

import { useEffect, useState } from 'react';
import { RoomLobby } from '@/components/RoomLobby';
import { ArrowRight, AudioLines, Camera, CameraOff, Check, ChevronDown, ChevronRight, CircleHelp, Flag, Heart, Lightbulb, Maximize2, MessageCircle, Mic, MicOff, MoreHorizontal, PhoneOff, Settings2, ShieldCheck, Sparkles, Star, Volume2, X } from 'lucide-react';

export default function Home() {
  const [muted, setMuted] = useState(false);
  const [camera, setCamera] = useState(true);
  const [captions, setCaptions] = useState(false);
  const [hint, setHint] = useState(false);
  const [seconds, setSeconds] = useState(120);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [modal, setModal] = useState<'settings' | 'report' | 'help' | null>(null);
  const [reported, setReported] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sound, setSound] = useState(true);
  useEffect(() => { if (!playing) return; const timer = setInterval(() => setSeconds(s => { if (s <= 1) { setPlaying(false); setEnded(true); return 0; } return s - 1; }), 1000); return () => clearInterval(timer); }, [playing]);
  useEffect(() => { const listener = (e: KeyboardEvent) => { if(e.key === 'Escape') { setModal(null); setExpanded(false); } }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, []);
  function restart() { setSeconds(120); setEnded(false); setPlaying(true); }
  return <div className="app-shell">
    <header className="header">
      <a className="wordmark" href="/" aria-label="Yapply home">yapply<span className="logo-flower">✳</span></a>
      <div className="header-center"><span className="little-dot" />Boost your language skills</div>
      <div className="profile"><span className="streak"><span>✦</span> 7 day streak</span><span className="profile-avatar">J<span /></span></div>
    </header>
    <main>
      <div className="page-heading"><div><div className="eyebrow"></div><h1>Hola! <span>Learn Spanish</span></h1><p>Practice your Spanish through conversation.</p></div><span className="session-label"><span className="little-dot" /> FRIEND PRACTICE <span className="demo-label">DEMO</span></span></div>
      <RoomLobby />
      <section className="room" aria-label="Speaking practice room">
        <div className="room-top"><div className="language"><span className="flag">🇪🇸</span><strong>Spanish</strong><span className="level">B1 · Intermediate</span></div><div className={`timer ${seconds <= 20 ? 'urgent' : ''}`}><span className="timer-dot" />{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}<span> / 2:00</span></div><button className="icon-button" aria-label="About this session" onClick={() => setModal('help')}><MoreHorizontal size={23}/></button></div>
        <div className="challenge"><div className="challenge-icon"><Sparkles size={28}/></div><div className="challenge-copy"><div className="eyebrow">YOUR CONVERSATION CHALLENGE</div><h2>Make them fall in love with your hometown.</h2><p>Tell your partner what makes it special. A hidden gem? The food? Your people?</p><div className="bonus-row"><span><Star size={14}/> BONUS POINTS</span><span className="bonus"><Check size={13}/> Use the past tense</span><span className="bonus"><Check size={13}/> Ask 2 follow-up questions</span></div></div><span className="challenge-doodle" aria-hidden="true">✿</span></div>
        <div className="call-grid">
          <div className={`partner-video ${expanded ? 'expanded' : ''}`}>
    
            <div className="video-shade"/>
            <div className="video-top"><span className="live-badge"><span/> {playing ? 'PRACTICE IN PROGRESS' : 'PREVIEW ROOM'}</span><button className="glass-button" aria-label={expanded ? 'Minimize partner video' : 'Expand partner video'} onClick={() => setExpanded(!expanded)}><Maximize2 size={18}/></button></div>
            <div className="hello-sticker">¡Hola! <span>✦</span></div>
            {!playing && !ended && <button className="start-button" onClick={() => setPlaying(true)}>Start practice demo <ArrowRight size={17}/></button>}
            {ended && <div className="end-overlay"><div className="end-flower">✿</div><h2>Great work!</h2><p>Demo complete. Real feedback will appear<br/>once live conversations are connected.</p><button className="primary-button" onClick={restart}>Practice again <ArrowRight size={17}/></button></div>}
            {captions && !ended && <div className="captions">Sample caption: “¿Qué te gusta de tu ciudad?”</div>}
            <div className="video-bottom"><div className="partner-name">Alex <span>🇲🇽</span><small>Native Spanish speaker <span>·</span> Learning English</small></div><div className="audio-badge"><AudioLines size={21}/></div></div>
          </div>
          <aside className="side-panel">
            <div className="self-video">{camera ? <img className="portrait" src="null" alt=""/> : <div className="camera-placeholder"><CameraOff size={32}/><span>Your camera is off</span></div>}<div className="video-shade"/><span className="self-tag">You <span>· Your Name</span></span><span className="self-mic">{muted ? <MicOff size={17}/> : <Mic size={17}/>}</span><span className="preview-tag">SAMPLE PREVIEW</span></div>
            <div className="hint-card"><div className="hint-top"><span className="bulb"><Lightbulb size={23}/></span><span className="tiny-sparkle">✧</span></div><h3>A little stuck?</h3><p>{hint ? '“Mi lugar favorito es…” Tell Alex about a place you loved visiting, then ask about his hometown.' : 'Every great conversation starts with a little curiosity.'}</p><button onClick={() => setHint(!hint)}>{hint ? 'Hide conversation starter' : 'Give me a conversation starter'}<ArrowRight size={17}/></button></div>
            <div className="encouragement"><Heart size={17}/><p>Progress over perfection.<br/><strong>You’ve got this.</strong></p></div>
          </aside>
        </div>
        <div className="controls-bar"><div className="connection"><span className="signal"><i/><i/><i/></span><div>Demo room<small>No camera or mic connected</small></div></div><div className="call-controls"><button className={`control ${muted ? 'selected' : ''}`} onClick={() => setMuted(!muted)} aria-pressed={muted}><span>{muted ? <MicOff/> : <Mic/>}</span>{muted ? 'Unmute' : 'Mute'}</button><button className={`control ${!camera ? 'selected' : ''}`} onClick={() => setCamera(!camera)} aria-pressed={!camera}><span>{camera ? <Camera/> : <CameraOff/>}</span>Camera</button><button className={`control ${captions ? 'selected' : ''}`} onClick={() => setCaptions(!captions)} aria-pressed={captions}><span><MessageCircle/></span>Captions</button><button className="control" onClick={() => setModal('settings')}><span><Settings2/></span>Settings</button><span className="control-divider"/><button className="control leave" onClick={() => { setPlaying(false); setEnded(true); }}><span><PhoneOff/></span>Leave</button></div><button className="report-button" onClick={() => { setReported(false); setModal('report'); }}><Flag size={14}/> Report</button></div>
      </section>
     
    </main>
    {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}><button autoFocus className="modal-close icon-button" aria-label="Close dialog" onClick={() => setModal(null)}><X/></button><span className="modal-flower">✳</span><h2 id="modal-title">{modal === 'settings' ? 'Make yourself comfortable.' : modal === 'report' ? 'Your comfort comes first.' : 'Welcome to your practice room.'}</h2>{modal === 'settings' ? <><p>This is a visual demo. Device selection will be available when live calls are connected.</p><button className="setting-row" onClick={() => setSound(!sound)}><span><Volume2 size={20}/> Demo sound preference</span><span className={`toggle ${sound ? 'on' : ''}`}/></button><button className="setting-row" onClick={() => setCaptions(!captions)}><span><MessageCircle size={20}/> Sample captions</span><span className={`toggle ${captions ? 'on' : ''}`}/></button></> : modal === 'report' ? <><p>{reported ? 'Demo report noted locally. No report was sent and no real user was blocked.' : 'In a live room, you can report inappropriate behavior and block a partner. This preview does not send reports.'}</p><button className="primary-button" onClick={() => setReported(true)} disabled={reported}>{reported ? 'Demo report noted' : 'Try report & block'}<ShieldCheck size={18}/></button></> : <><p>Try a two-minute challenge, reveal a conversation starter, and explore the call controls. The people and captions are samples; no media is captured.</p><button className="primary-button" onClick={() => { setModal(null); restart(); }}>Let’s practice <ArrowRight size={18}/></button></>}</section></div>}
  </div>;
}
