'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client-api';
import type { ScoreResponse } from '@/lib/scores';

export function MatchScore({ matchId, endedAt }: { matchId: string; endedAt: string | null }) {
  const [result, setResult] = useState<ScoreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [delayed, setDelayed] = useState(false);
  useEffect(() => {
    if (!endedAt) return;
    const remaining = new Date(endedAt).getTime() + 90_000 - Date.now();
    if (remaining <= 0) { setDelayed(true); return; }
    const timer = setTimeout(() => setDelayed(true), remaining);
    return () => clearTimeout(timer);
  }, [endedAt]);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const data = await api<ScoreResponse>(`/api/matches/${matchId}/score`);
        if (disposed) return;
        setResult(data); setError(null);
        if (data.status === 'pending' || data.status === 'not_finished') timer = setTimeout(() => void poll(), 4000);
      } catch (caught) {
        if (!disposed) {
          setError(caught instanceof Error ? caught.message : 'Could not load score');
          timer = setTimeout(() => void poll(), 8000);
        }
      }
    }
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [matchId]);

  return <section className="panel score-panel" aria-live="polite"><h2>Your conversation score</h2>
    {error && <p className="error" role="alert">{error}</p>}
    {(!result || result.status === 'pending') && <p>{delayed
      ? 'Conversation scoring is still pending. The scoring service may be unavailable; return later to check again.'
      : 'Waiting for your conversation score. This usually takes a minute or more.'}</p>}
    {result?.status === 'not_finished' && <p>Your match has not finished yet.</p>}
    {result?.status === 'unavailable' && <p>There wasn’t enough analyzed speech to produce an overall score.</p>}
    {result?.status === 'ready' && result.score && <>
      <div className="overall-score">{result.score.overall}<small>/ 100</small><span>+{result.score.xpEarned} XP</span></div>
      <dl className="score-dimensions">{Object.entries(result.score.dimensions).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value ?? 'Not assessed'}</dd></div>)}</dl>
      {result.score.feedback.improve.length > 0 && <><h3>Things to try next time</h3><ul>{result.score.feedback.improve.map((item, index) => <li key={index}>{item.original && <span>{item.original} → </span>}{item.correction} {item.explanation}</li>)}</ul></>}
    </>}
  </section>;
}
