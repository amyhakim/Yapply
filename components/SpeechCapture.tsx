"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { Track } from "livekit-client";
import { encodeWav } from "@/lib/wav";
import { api } from "@/lib/client-api";

type CaptureMode = "scripted" | "unscripted";
type Result = {
  pronScore: number | null;
  recognizedText: string;
  mode: CaptureMode;
};
type Manual = { chunks: Float32Array[]; atMs: number };

export function SpeechCapture({ matchId, startedAt, serverNow, receivedPerf, prompt, onSaved }: {
  matchId: string;
  startedAt: string;
  serverNow: string;
  receivedPerf: number;
  prompt: string | null;
  onSaved: () => void;
}) {
  const room = useRoomContext();
  const [listening, setListening] = useState(false);
  const [manual, setManual] = useState(false);
  const [pending, setPending] = useState(0);
  const [lastResult, setLastResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<{ context: AudioContext; source: MediaStreamAudioSourceNode;
    node: AudioWorkletNode; sink: GainNode } | null>(null);
  const manualRef = useRef<Manual | null>(null);
  const onSavedRef = useRef(onSaved);
  const pendingRef = useRef(0);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  onSavedRef.current = onSaved;

  const submit = useCallback(async (chunks: Float32Array[], sampleRate: number,
    mode: CaptureMode, atMs: number) => {
    if (pendingRef.current >= 2) return;
    const audio = encodeWav(chunks, sampleRate);
    if (audio.length < 16_044 || audio.length > 700_000) return;
    pendingRef.current++;
    setPending(pendingRef.current);
    const form = new FormData();
    form.set("attemptId", crypto.randomUUID());
    form.set("mode", mode);
    form.set("atMs", String(atMs));
    form.set("audio", new Blob([new Uint8Array(audio)], { type: "audio/wav" }), "attempt.wav");
    try {
      const result = await api<Result>(`/api/matches/${matchId}/assess`, {
        method: "POST", body: form,
      });
      setLastResult(result);
      setError(null);
      onSavedRef.current();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Assessment failed");
    } finally {
      pendingRef.current--;
      setPending(pendingRef.current);
    }
  }, [matchId]);

  const stopListening = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.node.port.onmessage = null;
      stream.source.disconnect();
      stream.node.disconnect();
      stream.sink.disconnect();
      void stream.context.close();
      streamRef.current = null;
    }
    manualRef.current = null;
    setManual(false);
    setListening(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; stopListening(); };
  }, [stopListening]);

  const startListening = useCallback(async () => {
    if (streamRef.current || startingRef.current) return;
    const publication = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    const localTrack = publication?.audioTrack;
    if (!localTrack || publication.isMuted) {
      setError("Enable your microphone in the call controls first");
      return;
    }
    let context: AudioContext | null = null;
    startingRef.current = true;
    try {
      context = new AudioContext();
      await context.audioWorklet.addModule("/pcm-capture.js");
      const source = context.createMediaStreamSource(new MediaStream([localTrack.mediaStreamTrack]));
      const node = new AudioWorkletNode(context, "pcm-capture");
      const sink = context.createGain();
      sink.gain.value = 0;
      source.connect(node).connect(sink).connect(context.destination);
      await context.resume();
      if (!mountedRef.current) {
        await context.close();
        return;
      }
      streamRef.current = { context, source, node, sink };
      setListening(true);
      setError(null);

      const frameMs = 2048 / context.sampleRate * 1000;
      const anchorElapsedMs = new Date(serverNow).getTime() - new Date(startedAt).getTime() +
        performance.now() - receivedPerf;
      const anchorPerf = performance.now();
      const matchTimeMs = () => Math.max(0,
        Math.round(anchorElapsedMs + performance.now() - anchorPerf));
      const preRollCount = Math.ceil(450 / frameMs);
      const preRoll: Float32Array[] = [];
      let utterance: Float32Array[] | null = null;
      let utteranceAt = 0;
      let loudFrames = 0;
      let quietMs = 0;
      let capturedMs = 0;
      const flush = () => {
        if (utterance && capturedMs >= 600) {
          void submit(utterance, context!.sampleRate, "unscripted", utteranceAt);
        }
        utterance = null;
        capturedMs = 0;
        quietMs = 0;
        loudFrames = 0;
      };

      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (publication.isMuted || localTrack.mediaStreamTrack.readyState !== "live") {
          utterance = null;
          manualRef.current = null;
          preRoll.length = 0;
          return;
        }
        const samples = event.data;
        if (manualRef.current) {
          utterance = null;
          capturedMs = 0;
          quietMs = 0;
          preRoll.length = 0;
          manualRef.current.chunks.push(samples);
          if (manualRef.current.chunks.length * frameMs >= 18_000) {
            const attempt = manualRef.current;
            manualRef.current = null;
            setManual(false);
            void submit(attempt.chunks, context!.sampleRate, "scripted", attempt.atMs);
          }
          return;
        }
        let power = 0;
        for (let i = 0; i < samples.length; i++) power += samples[i] * samples[i];
        const loud = Math.sqrt(power / samples.length) >= 0.018;
        if (!utterance) {
          preRoll.push(samples);
          if (preRoll.length > preRollCount) preRoll.shift();
          loudFrames = loud ? loudFrames + 1 : 0;
          if (loudFrames >= 2) {
            utterance = [...preRoll];
            utteranceAt = Math.max(0, matchTimeMs() - Math.round(preRoll.length * frameMs));
            capturedMs = utterance.length * frameMs;
            preRoll.length = 0;
            quietMs = 0;
          }
          return;
        }
        utterance.push(samples);
        capturedMs += frameMs;
        quietMs = loud ? 0 : quietMs + frameMs;
        if (quietMs >= 850 || capturedMs >= 18_000) flush();
      };
    } catch (caught) {
      if (context) await context.close();
      setError(caught instanceof Error ? caught.message : "Could not start microphone analysis");
    } finally {
      startingRef.current = false;
    }
  }, [room, serverNow, startedAt, receivedPerf, submit]);

  const startScripted = () => {
    if (!streamRef.current) return;
    manualRef.current = {
      chunks: [], atMs: Math.max(0, Math.round(
        new Date(serverNow).getTime() - new Date(startedAt).getTime() +
        performance.now() - receivedPerf)),
    };
    setManual(true);
  };

  const stopScripted = () => {
    const attempt = manualRef.current;
    manualRef.current = null;
    setManual(false);
    if (attempt && streamRef.current) {
      void submit(attempt.chunks, streamRef.current.context.sampleRate, "scripted", attempt.atMs);
    }
  };

  return <section className="panel speech-panel">
    <h2>Pronunciation</h2>
    <p>Only your microphone is analyzed. Short clips are sent to Azure and discarded after scoring.</p>
    {!listening ?
      <button onClick={() => void startListening()}>Start pronunciation analysis</button> :
      <button className="secondary" onClick={stopListening}>Stop analysis</button>}
    {listening && <span className="state">Listening for short turns · {pending} scoring</span>}
    {prompt && listening && <div className="prompt">
      <strong>Pronunciation Battle</strong>
      <p>Say: “{prompt}”</p>
      {!manual ?
        <button onClick={startScripted}>Record phrase</button> :
        <button onClick={stopScripted}>Finish phrase</button>}
    </div>}
    {lastResult && <p className="result">Latest {lastResult.mode} score: <strong>
      {lastResult.pronScore ?? "—"}</strong> / 100 · “{lastResult.recognizedText}”</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
