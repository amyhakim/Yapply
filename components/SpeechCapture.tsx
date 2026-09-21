"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useLocalParticipant, useRoomContext } from "@livekit/components-react";
import { Track } from "livekit-client";
import { encodeWav, Pcm16StreamEncoder } from "@/lib/wav";
import { api } from "@/lib/client-api";

type CaptureMode = "scripted" | "unscripted";
type Result = {
  pronScore: number | null;
  recognizedText: string;
  mode: CaptureMode;
};
type StreamingAttempt = {
  write: (samples: Float32Array) => void;
  finish: () => void;
  cancel: () => void;
};
type Manual = { chunks: Float32Array[]; atMs: number; stream: StreamingAttempt | null };

function supportsStreamingUploads(): boolean {
  try {
    const request = new Request(window.location.href, {
      method: "POST", body: new ReadableStream(), duplex: "half",
    } as RequestInit & { duplex: "half" });
    return request.body !== null;
  } catch { return false; }
}

export function SpeechCapture({ matchId, startedAt, serverNow, receivedPerf, prompt, onSaved,
  finishCurrentRef }: {
  matchId: string;
  startedAt: string;
  serverNow: string;
  receivedPerf: number;
  prompt: string | null;
  onSaved: () => void;
  finishCurrentRef: RefObject<(() => void) | null>;
}) {
  const room = useRoomContext();
  const { isMicrophoneEnabled } = useLocalParticipant();
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
  const activeStreamsRef = useRef(new Set<StreamingAttempt>());
  const startingRef = useRef(false);
  const autoStartedTrackRef = useRef<MediaStreamTrack | null>(null);
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

  const startStream = useCallback((sampleRate: number, mode: CaptureMode,
    atMs: number, chunks: Float32Array[]): StreamingAttempt | null => {
    if (!supportsStreamingUploads() || pendingRef.current >= 2) return null;
    const encoder = new Pcm16StreamEncoder(sampleRate);
    const abort = new AbortController();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(value) { controller = value; },
    });
    let open = true;
    let cancelled = false;
    let finished = false;
    let settled = false;
    let failed = false;
    let retried = false;
    const retryAsWav = () => {
      if (!failed || !settled || !finished || cancelled || retried) return;
      retried = true;
      void submit(chunks, sampleRate, mode, atMs);
    };
    const attempt: StreamingAttempt = {
      write(samples) {
        if (!open) return;
        const bytes = encoder.write(samples);
        if (bytes.length) controller.enqueue(bytes);
      },
      finish() {
        if (!open) return;
        const tail = encoder.finish();
        if (tail.length) controller.enqueue(tail);
        controller.close();
        open = false;
        finished = true;
        activeStreamsRef.current.delete(attempt);
        retryAsWav();
      },
      cancel() {
        if (!open) return;
        cancelled = true;
        open = false;
        activeStreamsRef.current.delete(attempt);
        abort.abort();
      },
    };
    activeStreamsRef.current.add(attempt);
    pendingRef.current++;
    setPending(pendingRef.current);
    void api<Result>(`/api/matches/${matchId}/assess`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "x-attempt-id": crypto.randomUUID(),
        "x-assessment-mode": mode,
        "x-at-ms": String(atMs),
      },
      body, duplex: "half", signal: abort.signal,
    } as RequestInit & { duplex: "half" }).then((result) => {
      setLastResult(result);
      setError(null);
      onSavedRef.current();
    }).catch((caught) => {
      if (!cancelled) {
        failed = true;
        setError(caught instanceof Error ? `Streaming failed; retrying audio: ${caught.message}` :
          "Streaming failed; retrying audio");
      }
    }).finally(() => {
      pendingRef.current--;
      setPending(pendingRef.current);
      settled = true;
      retryAsWav();
    });
    return attempt;
  }, [matchId, submit]);

  const stopListening = useCallback(() => {
    finishCurrentRef.current = null;
    for (const attempt of activeStreamsRef.current) attempt.cancel();
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
  }, [finishCurrentRef]);

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
      let utteranceStream: StreamingAttempt | null = null;
      let utteranceAt = 0;
      let loudFrames = 0;
      let quietMs = 0;
      let capturedMs = 0;
      const flush = () => {
        if (utterance && capturedMs >= 500) {
          if (utteranceStream) utteranceStream.finish();
          else void submit(utterance, context!.sampleRate, "unscripted", utteranceAt);
        } else {
          utteranceStream?.cancel();
        }
        utterance = null;
        utteranceStream = null;
        capturedMs = 0;
        quietMs = 0;
        loudFrames = 0;
      };

      // End a recording before MatchClient closes the LiveKit room. Closing a
      // request body lets a pending assessment finish even after this component unmounts.
      finishCurrentRef.current = () => {
        const attempt = manualRef.current;
        if (attempt) {
          manualRef.current = null;
          setManual(false);
          if (attempt.chunks.length * frameMs >= 500) {
            if (attempt.stream) attempt.stream.finish();
            else void submit(attempt.chunks, context!.sampleRate, "scripted", attempt.atMs);
          } else {
            attempt.stream?.cancel();
          }
        } else {
          flush();
        }
        stopListening();
      };

      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (localTrack.mediaStreamTrack.readyState !== "live") {
          finishCurrentRef.current?.();
          return;
        }
        if (publication.isMuted) {
          utterance = null;
          utteranceStream?.cancel();
          utteranceStream = null;
          manualRef.current?.stream?.cancel();
          manualRef.current = null;
          setManual(false);
          preRoll.length = 0;
          return;
        }
        const samples = event.data;
        if (manualRef.current) {
          utterance = null;
          utteranceStream?.cancel();
          utteranceStream = null;
          capturedMs = 0;
          quietMs = 0;
          preRoll.length = 0;
          manualRef.current.chunks.push(samples);
          manualRef.current.stream?.write(samples);
          if (manualRef.current.chunks.length * frameMs >= 18_000) {
            const attempt = manualRef.current;
            manualRef.current = null;
            setManual(false);
            if (attempt.stream) attempt.stream.finish();
            else void submit(attempt.chunks, context!.sampleRate, "scripted", attempt.atMs);
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
            utteranceStream = startStream(context!.sampleRate, "unscripted", utteranceAt,
              utterance);
            for (const frame of preRoll) utteranceStream?.write(frame);
            capturedMs = utterance.length * frameMs;
            preRoll.length = 0;
            quietMs = 0;
          }
          return;
        }
        utterance.push(samples);
        utteranceStream?.write(samples);
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
  }, [room, serverNow, startedAt, receivedPerf, startStream, submit, stopListening,
    finishCurrentRef]);

  useEffect(() => {
    const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)
      ?.audioTrack?.mediaStreamTrack;
    if (!isMicrophoneEnabled || !track || track.readyState !== "live") {
      autoStartedTrackRef.current = null;
      return;
    }
    if (autoStartedTrackRef.current === track) return;
    autoStartedTrackRef.current = track;
    void startListening();
  }, [room, isMicrophoneEnabled, startListening]);

  const startScripted = () => {
    if (!streamRef.current) return;
    manualRef.current = {
      chunks: [], atMs: Math.max(0, Math.round(
        new Date(serverNow).getTime() - new Date(startedAt).getTime() +
        performance.now() - receivedPerf)),
      stream: null,
    };
    manualRef.current.stream = startStream(streamRef.current.context.sampleRate,
      "scripted", manualRef.current.atMs, manualRef.current.chunks);
    setManual(true);
  };

  const stopScripted = () => {
    const attempt = manualRef.current;
    manualRef.current = null;
    setManual(false);
    if (attempt && streamRef.current) {
      if (attempt.chunks.length * 2048 / streamRef.current.context.sampleRate < 0.5) {
        attempt.stream?.cancel();
      } else if (attempt.stream) attempt.stream.finish();
      else void submit(attempt.chunks, streamRef.current.context.sampleRate, "scripted", attempt.atMs);
    }
  };

  return <section className="panel speech-panel">
    <h2>Pronunciation</h2>
    <p>With your call microphone on, short clips are analyzed for scoring and discarded afterward.</p>
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
    {lastResult && <p className="result">Clip analyzed. Your results appear when the match ends.</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
