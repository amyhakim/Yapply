"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ControlBar, LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import { api } from "@/lib/client-api";
import { SpeechCapture } from "./SpeechCapture";

type Match = {
  id: string; status: string; language_code: string; azure_locale: string | null;
  duration_secs: number; started_at: string | null; server_now: string; seat: number;
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

  const refreshMatch = useCallback(async () => {
    const data = await api<{ match: Match }>(`/api/matches/${matchId}`);
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
      setClock(performance.now());
    }, 2_000);
    return () => clearInterval(poll);
  }, [refreshMatch, refreshResults]);

  useEffect(() => {
    if (!match || connection || match.status === "complete") return;
    void api<{ url: string; token: string }>(`/api/matches/${matchId}/token`, { method: "POST" })
      .then(setConnection)
      .catch((caught) => setError(caught instanceof Error ? caught.message : "LiveKit failed"));
  }, [match, connection, matchId]);

  const updateStatus = async (action: "start" | "end") => {
    setBusy(true); setError(null);
    try {
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
      new Date(match.server_now).getTime() - new Date(match.started_at).getTime() +
      Math.max(0, clock - receivedPerf)) / 1000))
    : null;
  useEffect(() => {
    if (match?.status === "playing" && remaining === 0 && !busy) void updateStatus("end");
    // Timer completion is handled once per status transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.status, remaining]);

  if (!match) return <main className="match-page"><p>Loading match…</p>
    {error && <p className="error" role="alert">{error}</p>}</main>;

  return <main className="match-page">
    <header><Link className="brand" href="/">Yapply</Link><span>
      {match.language_code === "es" ? "Spanish" : "English"} voice room</span></header>
    <div className="match-heading">
      <div><p className="eyebrow">{match.status}</p><h1>Practice together</h1></div>
      <span className="timer">{remaining === null ? "2:00" :
        `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}</span>
    </div>
    <section className="panel room-summary">
      <div><span className="muted">Room code</span><strong>{match.room_code}</strong></div>
      <div><span className="muted">Players</span><strong>{match.participant_count} / 2</strong></div>
      <div><span className="muted">Your seat</span><strong>{match.seat}</strong></div>
    </section>
    {match.status === "queued" && <p>Share the room code with a friend. The call opens while you wait.</p>}
    {match.status === "matched" && match.seat === 1 &&
      <button disabled={busy} onClick={() => void updateStatus("start")}>Start match</button>}
    {match.status === "matched" && match.seat === 2 && <p>Waiting for the room creator to start.</p>}
    {match.status === "playing" && <button className="secondary" disabled={busy}
      onClick={() => void updateStatus("end")}>End match</button>}
    {error && <p className="error" role="alert">{error}</p>}
    {connection && match.status !== "complete" &&
      <LiveKitRoom token={connection.token} serverUrl={connection.url} connect audio video={false}
        onError={(caught) => setError(caught.message)}>
        <section className="panel call-panel">
          <h2>Live call</h2>
          <p>Use the microphone control to speak. You can mute or leave at any time.</p>
          <RoomAudioRenderer />
          <ControlBar controls={{ microphone: true, camera: false, screenShare: false, chat: false }} />
        </section>
        {match.status === "playing" && match.started_at &&
          <SpeechCapture matchId={matchId} startedAt={match.started_at}
            serverNow={match.server_now} receivedPerf={receivedPerf}
            prompt={match.challenge_prompt} onSaved={() => void refreshResults()} />}
      </LiveKitRoom>}
    {match.status === "complete" && <p className="notice">Match finished. Your pronunciation feedback is below.</p>}
    <section className="panel">
      <h2>Your assessment results</h2>
      {attempts.length === 0 ? <p className="muted">Results will appear after you speak.</p> :
        <div className="attempts">{attempts.map((attempt) =>
          <article className="attempt" key={attempt.id}>
            <div><span className="eyebrow">{attempt.mode}</span><strong>
              {attempt.pron_score ?? "—"} / 100</strong></div>
            <p>{attempt.recognized_text ?? (attempt.status === "processing" ? "Scoring…" : "No speech recognized")}</p>
            <p className="muted">Accuracy {attempt.accuracy ?? "—"} · Fluency {attempt.fluency ?? "—"}
              {attempt.prosody !== null && ` · Prosody ${attempt.prosody}`}</p>
            {attempt.notable_words.length > 0 && <p className="feedback">Practice: {
              attempt.notable_words.filter((item) => item.phoneme === null)
                .map((item) => `${item.word} (${Math.round(item.score)})`).join(", ") ||
              attempt.notable_words.map((item) => `${item.word} /${item.phoneme}/`).join(", ")}</p>}
          </article>)}
        </div>}
    </section>
  </main>;
}
