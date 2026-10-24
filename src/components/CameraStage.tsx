import { useEffect, useRef, useState } from 'react';
import {
  MAX_RECORDING_MS,
  describeCameraError,
  keepScreenOn,
  openCamera,
  startRecording,
  stopStream,
  type Facing,
} from '../video/recorder';
import { formatTime } from './formatTime';
import { IconSwap } from './icons';

interface Props {
  /** Called with the finished recording; it then goes through the normal upload path. */
  onRecorded: (file: File) => void;
  onClose: () => void;
}

type Phase = 'starting' | 'ready' | 'countdown' | 'recording' | 'saving' | 'error';

const COUNTDOWNS = [0, 3, 5, 10] as const;
const COUNTDOWN_KEY = 'ra.countdown.v1';

export function CameraStage({ onRecorded, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<ReturnType<typeof startRecording> | null>(null);
  const releaseWakeRef = useRef<() => void>(() => {});
  const startedAtRef = useRef(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // On phones the stage sits below the intro text; bring the whole camera into view.
  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  const [facing, setFacing] = useState<Facing>('user');
  const [phase, setPhase] = useState<Phase>('starting');
  const [error, setError] = useState<string | null>(null);
  const [aspect, setAspect] = useState(9 / 16);
  const [countdown, setCountdown] = useState<number>(() => {
    const saved = Number(localStorage.getItem(COUNTDOWN_KEY));
    return (COUNTDOWNS as readonly number[]).includes(saved) ? saved : 5;
  });
  const [remaining, setRemaining] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Open (or re-open after flipping) the camera.
  useEffect(() => {
    let cancelled = false;
    setPhase('starting');
    setError(null);
    openCamera(facing)
      .then((stream) => {
        if (cancelled) return stopStream(stream);
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          void v.play().catch(() => {});
        }
        setPhase('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        setError(describeCameraError(e));
        setPhase('error');
      });
    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [facing]);

  // Release everything if the component goes away mid-recording.
  useEffect(() => () => {
    const rec = recRef.current;
    recRef.current = null;
    void rec?.stop();
    releaseWakeRef.current();
  }, []);

  // Countdown ticks.
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (remaining <= 0) {
      beginRecording();
      return;
    }
    const t = window.setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, remaining]);

  // Elapsed timer, and a hard stop at the maximum length.
  useEffect(() => {
    if (phase !== 'recording') return;
    const t = window.setInterval(() => {
      const ms = Date.now() - startedAtRef.current;
      setElapsedMs(ms);
      if (ms >= MAX_RECORDING_MS) void finish();
    }, 250);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function start() {
    releaseWakeRef.current = await keepScreenOn();
    setRemaining(countdown);
    setPhase('countdown');
  }

  function beginRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    try {
      const rec = startRecording(stream);
      recRef.current = rec;
      void receiveRecording(rec);
    } catch {
      releaseWakeRef.current();
      stopStream(streamRef.current);
      streamRef.current = null;
      setError('This browser could not start recording. You can still upload a video.');
      setPhase('error');
      return;
    }
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setPhase('recording');
  }

  function finish() {
    const rec = recRef.current;
    if (!rec) return;
    setPhase('saving');
    releaseWakeRef.current();
    // receiveRecording owns success/error handling for manual and automatic stops.
    void rec.stop();
  }

  async function receiveRecording(rec: ReturnType<typeof startRecording>) {
    try {
      const file = await rec.finished;
      if (recRef.current !== rec) return; // The component was closed.
      recRef.current = null;
      releaseWakeRef.current();
      stopStream(streamRef.current);
      streamRef.current = null;
      onRecorded(file);
    } catch (e) {
      if (recRef.current !== rec) return;
      recRef.current = null;
      releaseWakeRef.current();
      stopStream(streamRef.current);
      streamRef.current = null;
      setError((e as Error).message || 'The recording failed. Try again.');
      setPhase('error');
    }
  }

  function cancelCountdown() {
    releaseWakeRef.current();
    setPhase('ready');
  }

  const busy = phase === 'countdown' || phase === 'recording' || phase === 'saving';

  return (
    <div ref={rootRef} className="scroll-mt-16 overflow-hidden rounded-2xl bg-stage">
      <div className="relative flex justify-center bg-black sm:px-4 sm:pt-4">
        <div
          className="relative max-w-full overflow-hidden sm:rounded-lg"
          style={{ aspectRatio: `${aspect}`, width: `min(100%, calc(min(68svh, 720px) * ${aspect}))` }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight);
            }}
            onResize={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight);
            }}
            // Front camera preview is mirrored like a mirror; the recording itself is not.
            className={`absolute inset-0 h-full w-full bg-black object-cover ${facing === 'user' ? '-scale-x-100' : ''}`}
          />

          {/* Top bar */}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            {phase === 'recording' ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-[13px] font-semibold text-white backdrop-blur">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                <span className="tabular-nums">{formatTime(elapsedMs).replace(/\.\d$/, '')}</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-full bg-black/60 px-3 py-1.5 text-[13px] font-semibold text-white backdrop-blur transition hover:bg-black/80 disabled:opacity-40"
              >
                Cancel
              </button>
            )}
            {!busy && phase !== 'error' && (
              <button
                type="button"
                onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
                aria-label="Switch camera"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80"
              >
                <IconSwap size={18} />
              </button>
            )}
          </div>

          {phase === 'countdown' && remaining > 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
              <span key={remaining} className="text-8xl font-bold tabular-nums text-white drop-shadow-lg">
                {remaining}
              </span>
              <p className="mt-2 text-sm font-medium text-white/80">Get into position</p>
            </div>
          )}

          {phase === 'starting' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-white/70">Starting camera…</p>
            </div>
          )}

          {phase === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
              <p className="max-w-xs text-sm leading-relaxed text-white/80">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-semibold text-ink"
              >
                Back
              </button>
            </div>
          )}

          {/* Bottom controls */}
          {phase !== 'error' && phase !== 'starting' && (
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pb-5 pt-10">
              {phase === 'ready' && (
                <div className="flex items-center gap-1 rounded-full bg-black/50 p-1 text-[12px] font-semibold text-white/80 backdrop-blur">
                  <span className="px-2">Timer</span>
                  {COUNTDOWNS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setCountdown(s);
                        localStorage.setItem(COUNTDOWN_KEY, String(s));
                      }}
                      aria-pressed={countdown === s}
                      className={`h-7 min-w-9 rounded-full px-2 tabular-nums transition ${
                        countdown === s ? 'bg-white text-ink' : 'hover:text-white'
                      }`}
                    >
                      {s === 0 ? 'Off' : `${s}s`}
                    </button>
                  ))}
                </div>
              )}

              {phase === 'ready' && (
                <button
                  type="button"
                  onClick={() => void start()}
                  aria-label="Start recording"
                  className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white transition active:scale-95"
                >
                  <span className="h-14 w-14 rounded-full bg-red-500" />
                </button>
              )}
              {phase === 'countdown' && (
                <button
                  type="button"
                  onClick={cancelCountdown}
                  className="h-11 rounded-full bg-white/90 px-6 text-sm font-semibold text-ink"
                >
                  Cancel
                </button>
              )}
              {phase === 'recording' && (
                <button
                  type="button"
                  onClick={() => void finish()}
                  aria-label="Stop recording"
                  className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white transition active:scale-95"
                >
                  <span className="h-7 w-7 rounded-md bg-red-500" />
                </button>
              )}
              {phase === 'saving' && <p className="pb-6 text-sm font-medium text-white/80">Finishing…</p>}
            </div>
          )}
        </div>
      </div>

      <p className="px-5 py-3 text-center text-xs leading-relaxed text-white/50">
        Video only, no sound, so music from other apps keeps playing. The recording stays on this
        device and is never saved.
      </p>
    </div>
  );
}
