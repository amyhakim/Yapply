'use client';

import type { ReactNode } from 'react';
import { ArrowRight, Heart, Lightbulb } from 'lucide-react';

export function PracticeGrid({ stage, preview, hint, onHint, starter }: {
  stage: ReactNode; preview: ReactNode; hint: boolean; onHint: () => void; starter: string;
}) {
  return <div className="call-grid practice-grid">
    {stage}
    <aside className="side-panel">
      <div className="self-video">{preview}<span className="self-tag">You</span></div>
      <div className="hint-card"><div className="hint-top"><span className="bulb"><Lightbulb size={23}/></span><span className="tiny-sparkle">✧</span></div><h3>A little stuck?</h3><p>{hint ? starter : 'Start with one place you love. Tell us what makes it special.'}</p><button onClick={onHint}>{hint ? 'Hide speaking starter' : 'Give me a speaking starter'}<ArrowRight size={17}/></button></div>
      <div className="encouragement"><Heart size={17}/><p>Progress over perfection.<br/><strong>You’ve got this.</strong></p></div>
    </aside>
  </div>;
}
