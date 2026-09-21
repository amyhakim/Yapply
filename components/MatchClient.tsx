"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LiveKitRoom } from "@livekit/components-react";
import { api } from "@/lib/client-api";
import { SpeechCapture } from "./SpeechCapture";
import { LiveCall } from "./LiveCall";
import { MatchScore } from "./MatchScore";
import { Sparkles } from 'lucide-react';

type Match = {
  id: string; status: string; language_code: string; azure_locale: string | null;
  duration_secs: number; started_at: string | null; server_now: string; seat: number;
  ended_at: string | null;
  participant_count: number; room_code: string; challenge_prompt: string | null;
};
type Attempt = {
  id: string; mode: string; recognized_text: string | null;
  pron_score: string | null; accuracy: string | null; fluency: string | null;
  prosody: string | null; status: string;
  notable_words: { word: string; phoneme: string | null; score: number; errorType: string | null }[];
};

export function MatchClient({ matchId }: { matchId: string }) {
  const [match, setMatch] = useState<Match | null>(null);
  const [connection, setConnection] = useState<{ url: string; token: string } | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [clock, setClock] = useState(0);
  const [receivedPerf, setReceivedPerf] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const handleCallError = useCallback((caught: Error) => setError(caught.message), []);
  const [checkingResults, setCheckingResults] = useState(false);
  const finishCurrentRef = useRef<(() => void) | null>(null);
  const handleDisconnected = useCallback(() => {
    finishCurrentRef.current?.();
    setConnection(null);
  }, []);

  const refreshMatch = useCallback(async () => {
    const data = await api<{ match: Match }>(`/api/matches/${matchId}`);
    if (data.match.status === "complete") finishCurrentRef.current?.();
    setReceivedPerf(performance.now());
    setClock(performance.now());
    setMatch(data.match);
  }, [matchId]);
  const refreshResults = useCallback(async () => {
    const data = await api<{ attempts: Attempt[] }>(`/api/matches/${matchId}/results`);
    setAttempts(data.attempts);
  }, [matchId]);

  useEffect(() => {
    void refreshMatch().catch((caught) => setError(String(caught)));
    void refreshResults().catch(() => {});
    const poll = setInterval(() => {
      void refreshMatch().catch(() => {});
    }, 2_000);
    return () => clearInterval(poll);
  }, [refreshMatch, refreshResults]);

  useEffect(() => {
    if (match?.status !== "playing") return;
    // Tick locally between server updates so the display counts every second.
    const tick = setInterval(() => setClock(performance.now()), 1_000);
    return () => clearInterval(tick);
  }, [match?.status]);

  const connect = async () => {
    setBusy(true); setError(null);
    try {
      setConnection(await api<{ url: string; token: string }>(`/api/matches/${matchId}/token`, { method: "POST" }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "LiveKit failed"); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (match?.status !== "complete" || !match.ended_at) return;
    const deadline = new Date(match.ended_at).getTime() + 60_000;
    setCheckingResults(Date.now() < deadline);
    void refreshResults().catch(() => {});
    if (Date.now() >= deadline) return;
    const poll = setInterval(() => {
      if (Date.now() >= deadline) {
        clearInterval(poll);
        setCheckingResults(false);
      } else {
        void refreshResults().catch(() => {});
      }
    }, 2_000);
    return () => clearInterval(poll);
  }, [match?.status, match?.ended_at, refreshResults]);

  const updateStatus = async (action: "start" | "end") => {
    setBusy(true); setError(null);
    try {
      if (action === "end") finishCurrentRef.current?.();
      const data = await api<{ match: Match }>(`/api/matches/${matchId}/${action}`,
        { method: "POST" });
      setReceivedPerf(performance.now());
      setClock(performance.now());
      setMatch(data.match);
      if (action === "end") await refreshResults();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not ${action} match`);
    } finally { setBusy(false); }
  };

  const remaining = match?.started_at && receivedPerf
    ? Math.max(0, match.duration_secs - Math.floor((
      new Date(match.ended_at ?? match.server_now).getTime() - new Date(match.started_at).getTime() +
      (match.status === "playing" && !match.ended_at ? Math.max(0, clock - receivedPerf) : 0)) / 1000))
    : null;
  useEffect(() => {
    if (match?.status === "playing" && remaining === 0 && !busy) void updateStatus("end");
    // Timer completion is handled once per status transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.status, remaining]);

  if (!match) return <main className="match-page live-page"><Link href="/">Back to lobby</Link><p>Loading match…</p>
    {error && <p className="error" role="alert">{error}</p>}</main>;

  return <div className="app-shell friend-page">
    <header className="header"><Link className="wordmark" href="/">yapply<span className="logo-flower">✳</span></Link><span>
      {match.language_code === "es" ? "Spanish" : "English"} · Private friend room</span><Link href="/">Back to lobby</Link></header>
    <main>
    <div className="page-heading">
      <div><p className="eyebrow">{match.status}</p><h1>Practice together</h1></div>
      <span className="session-label"><span className="little-dot"/> FRIEND PRACTICE</span>
    </div>
    <section className="room solo-room" aria-label="Friend speaking challenge">
    <div className="room-top"><div className="language"><strong>{match.language_code === 'es' ? 'Spanish' : 'English'}</strong><span className="level">Friend challenge</span></div>
      <span className="timer">{remaining === null ? "2:00" :
        `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}</span>
    </div>
    <section className="room-summary friend-invite">
      <div><span className="muted">Room code</span><strong>{match.room_code}</strong></div>
      <div><span className="muted">Players</span><strong>{match.participant_count} / 2</strong></div>
      <div><span className="muted">Your seat</span><strong>{match.seat}</strong></div>
    </section>
    <div className="challenge"><div className="challenge-icon"><Sparkles size={28}/></div><div className="challenge-copy"><div className="eyebrow">YOUR SPEAKING CHALLENGE</div><h2>{match.challenge_prompt ?? 'Tell your partner about your hometown.'}</h2><p>Practice the phrase together, then keep the conversation going.</p></div><span className="challenge-doodle" aria-hidden="true">✿</span></div>
    <div className="friend-actions">
    {match.status === "queued" && <p>Share the room code with a friend. The call opens while you wait.</p>}
    {match.status === "matched" && match.seat === 1 &&
      <button disabled={busy} onClick={() => void updateStatus("start")}>Start match</button>}
    {match.status === "matched" && match.seat === 2 && <p>Waiting for the room creator to start.</p>}
    {match.status === "playing" && <button className="secondary" disabled={busy}
      onClick={() => void updateStatus("end")}>End match</button>}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {match.status !== "complete" && !connection && <section className="panel">
      <h2>Ready to say hello?</h2><p>Join, then enable your microphone and camera with the call controls. Nothing is captured until you enable it.</p>
      <button disabled={busy} onClick={() => void connect()}>Join live call</button>
    </section>}
    {connection && match.status !== "complete" &&
      <LiveKitRoom token={connection.token} serverUrl={connection.url} connect audio={false} video={false}
        onError={handleCallError} onDisconnected={handleDisconnected}>
        <LiveCall onLeave={() => {
          finishCurrentRef.current?.();
          setConnection(null);
          if (match.status === "playing") void updateStatus("end");
        }}/>
        {match.status === "playing" && match.started_at &&
          <SpeechCapture matchId={matchId} startedAt={match.started_at}
            serverNow={match.server_now} receivedPerf={receivedPerf}
            prompt={match.challenge_prompt} onSaved={() => void refreshResults()}
            finishCurrentRef={finishCurrentRef} />}
      </LiveKitRoom>}
    {match.status === "complete" && <p className="notice">Match finished. Your pronunciation feedback is below.</p>}
    </section>
    {match.status === "playing" &&
      <p className="muted">Your results and conversation score appear when the match ends.</p>}
    {match.status === "complete" && <MatchScore matchId={matchId} endedAt={match.ended_at}/>}
    {match.status === "complete" && <section className="panel">
      <h2>Your assessment results</h2>
      {attempts.length === 0 ? <p className="muted">{checkingResults
        ? "No attempt saved yet. Checking for final pronunciation feedback…" :
        "No pronunciation attempt was saved for this match. In your next match, turn on the microphone and check that the Pronunciation panel says Listening before you speak."}</p> :
        <div className="attempts">{attempts.map((attempt) =>
          <article className="attempt" key={attempt.id}>
            <div><span className="eyebrow">{attempt.mode}</span><strong>
              {attempt.pron_score ?? "—"} / 100</strong></div>
            <p>{attempt.recognized_text ?? (attempt.status === "processing" ? "Scoring…" :
              attempt.status === "failed" ? "Assessment failed" : "No speech recognized")}</p>
            <p className="muted">Accuracy {attempt.accuracy ?? "—"} · Fluency {attempt.fluency ?? "—"}
              {attempt.prosody !== null && ` · Prosody ${attempt.prosody}`}</p>
            {attempt.notable_words.length > 0 && <p className="feedback">Practice: {
              attempt.notable_words.filter((item) => item.phoneme === null)
                .map((item) => `${item.word} (${Math.round(item.score)})`).join(", ") ||
              attempt.notable_words.map((item) => `${item.word} /${item.phoneme}/`).join(", ")}</p>}
          </article>)}
        </div>}
    </section>}
    </main>
  </div>;
}
