'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, MessageSquareText, Sparkles, Volume2 } from 'lucide-react';
import { api } from '@/lib/client-api';
import { buildSpeechReport, type ReportAttempt } from '@/lib/speech-report';
import type { ScoreResponse } from '@/lib/scores';

function average(values: (number | null)[]): number | null {
  const usable = values.filter((value): value is number => value !== null);
  return usable.length ? Math.round(usable.reduce((sum, value) => sum + value, 0) / usable.length) : null;
}

function ScoreBar({ label, value, detail }: { label: string; value: number | null; detail: string }) {
  return <div className="report-bar-row">
    <div><strong>{label}</strong><span>{detail}</span></div>
    <div className="report-bar" role="progressbar" aria-label={label} aria-valuemin={0}
      aria-valuemax={100} aria-valuenow={value ?? undefined}>
      <span style={{ width: `${value ?? 0}%` }}/>
    </div>
    <b>{value ?? '—'}</b>
  </div>;
}

export function MatchScore({ matchId, endedAt, prompt, attempts }: {
  matchId: string;
  endedAt: string | null;
  prompt: string | null;
  attempts: ReportAttempt[];
}) {
  const [result, setResult] = useState<ScoreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [delayed, setDelayed] = useState(false);
  const report = useMemo(() => buildSpeechReport(attempts, prompt), [attempts, prompt]);
  const detailed = result?.status === 'ready' ? result.score : undefined;
  const topicScore = detailed?.dimensions.conversation ?? report.topicScore;
  const flowScore = report.flowScore ?? detailed?.dimensions.fluency ?? null;
  const pronunciationScore = detailed?.dimensions.pronunciation ?? report.pronunciationScore;
  const uniqueWords = detailed?.metrics?.uniqueWords ?? report.uniqueWords;
  const overall = detailed?.overall ?? average([topicScore, flowScore, pronunciationScore]);

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
        if (data.status === 'pending' || data.status === 'not_finished') {
          timer = setTimeout(() => void poll(), 4000);
        }
      } catch (caught) {
        if (!disposed) {
          setError(caught instanceof Error ? caught.message : 'Could not load detailed coaching');
          timer = setTimeout(() => void poll(), 8000);
        }
      }
    }
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [matchId]);

  return <section className="score-report" aria-live="polite">
    <header className="report-heading">
      <div><span className="eyebrow">SPEAKING PERFORMANCE</span><h2>Your score report</h2>
        <p>A breakdown of vocabulary, topic focus, conversation flow, and pronunciation.</p></div>
      <div className="report-overall" aria-label={overall === null ? 'Score unavailable' : `Overall ${overall} out of 100`}>
        <strong>{overall ?? '—'}</strong><span>/ 100</span><small>Overall</small>
      </div>
    </header>

    <div className="report-kpis">
      <article><span className="kpi-icon coral"><Sparkles/></span><div><small>Unique words</small>
        <strong>{uniqueWords}</strong><p>distinct words used</p></div></article>
      <article><span className="kpi-icon olive"><MessageSquareText/></span><div><small>Challenge words</small>
        <strong>{report.challengeWords.length}<em> / {report.challengeWordTotal || '—'}</em></strong><p>prompt terms employed</p></div></article>
      <article><span className="kpi-icon gold"><BarChart3/></span><div><small>Topic focus</small>
        <strong>{topicScore ?? '—'}{topicScore !== null && <em>%</em>}</strong><p>stayed with the challenge</p></div></article>
      <article><span className="kpi-icon blue"><Volume2/></span><div><small>Pronunciation</small>
        <strong>{pronunciationScore ?? '—'}</strong><p>Azure speech assessment</p></div></article>
    </div>

    <div className="report-grid">
      <article className="report-card report-performance">
        <div className="report-card-title"><div><span className="eyebrow">SCORE BREAKDOWN</span>
          <h3>Performance by area</h3></div><span className="report-legend"><i/>Score out of 100</span></div>
        <ScoreBar label="Topic focus" value={topicScore}
          detail={`${report.challengeWords.length} of ${report.challengeWordTotal || 0} challenge terms used`}/>
        <ScoreBar label="Conversation flow" value={flowScore}
          detail={`${report.longPauseCount} long pauses · ${report.fillerCount} fillers`}/>
        <ScoreBar label="Pronunciation" value={pronunciationScore}
          detail={`${attempts.filter((attempt) => attempt.status === 'complete').length} analyzed clips`}/>
      </article>

      <article className="report-card">
        <span className="eyebrow">CHALLENGE VOCABULARY</span><h3>Words you put to work</h3>
        {report.challengeWords.length > 0
          ? <div className="word-chips">{report.challengeWords.map((word) => <span key={word}>{word}</span>)}</div>
          : <p className="muted">No challenge terms were detected in the analyzed speech.</p>}
        <div className="vocabulary-summary"><div><strong>{uniqueWords}</strong><span>unique words</span></div>
          <div><strong>{report.challengeWords.length}</strong><span>challenge words</span></div></div>
      </article>

      <article className="report-card">
        <span className="eyebrow">FLOW ANALYSIS</span><h3>What affected your rhythm</h3>
        <div className="deduction-row"><span>Long pauses</span><strong>{report.longPauseCount}</strong>
          <em>−{report.pausePenalty} pts</em></div>
        <div className="deduction-row"><span>“Um” and fillers</span><strong>{report.fillerCount}</strong>
          <em>−{report.fillerPenalty} pts</em></div>
        <p className="report-note">Flow starts from Azure fluency, then deducts for detected fillers and 2–8 second gaps between your analyzed clips.</p>
      </article>
    </div>

    {error && <p className="error" role="alert">{error}</p>}
    {(!result || result.status === 'pending') && <p className="report-status">{delayed
      ? 'The core report is ready. Detailed grammar and vocabulary coaching is still processing.'
      : 'Detailed grammar and vocabulary coaching is processing…'}</p>}
    {result?.status === 'unavailable' && attempts.length === 0 &&
      <p className="report-status">There wasn’t enough analyzed speech to produce a report.</p>}
    {detailed && <div className="report-coaching">
      <div><span>Grammar</span><strong>{detailed.dimensions.grammar}</strong></div>
      <div><span>Vocabulary</span><strong>{detailed.dimensions.vocabulary}</strong></div>
      <div><span>Follow-up questions</span><strong>{detailed.metrics?.followUpQuestions ?? '—'}</strong></div>
      {detailed.feedback.improve.length > 0 && <section><h3>Things to try next time</h3><ul>
        {detailed.feedback.improve.map((item, index) => <li key={index}>{item.original && <span>{item.original} → </span>}
          {item.correction} {item.explanation}</li>)}
      </ul></section>}
    </div>}
  </section>;
}
