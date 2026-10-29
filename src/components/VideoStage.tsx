import { useEffect, useRef, useState } from 'react';
import { armColor, containRect, drawOverlay } from '../analysis/drawOverlay';
import { frameAt } from '../analysis/analyzeVideo';
import { ACCEPTED_VIDEO_TYPES } from '../video/probeVideo';
import type { ArmTrack, Side } from '../types';
import { PlayerControls, type RepMarker, type Span } from './PlayerControls';
import { IconCamera, IconUpload } from './icons';
import { CameraStage } from './CameraStage';
import { canRecord } from '../video/recorder';
import type { FramingNeed } from '../analysis/framing';

interface Props {
  videoUrl: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Mutable per-arm frame store; grows during analysis, read every animation frame. */
  tracksRef: React.RefObject<ArmTrack[]>;
  stepMs: number;
  markers: RepMarker[];
  /** Detected totals per track (same order as tracksRef), or null before counting. */
  totals: number[] | null;
  lostSpans: Span[];
  analyzing: boolean;
  decodeError: boolean;
  onPickFile: (file: File) => void;
  /** Load and count the built-in sample clip. */
  onSample: () => void;
  /** Open straight into the camera (the last set was recorded in the browser). */
  preferCamera?: boolean;
  onRecorded: (file: File) => void;
  onLoadedMetadata: (video: HTMLVideoElement) => void;
  onDecodeError: () => void;
  /** Body points the exercise needs in view, for the camera's live framing check. */
  framing: FramingNeed | null;
}

interface HudArm {
  side: Side | null;
  count: number;
  lost: boolean;
}

/** How long a rep's note stays on the video after the rep finishes. */
const NOTE_MS = 1500;

const armShort = (side: Side | null) => (side === 'left' ? 'L' : side === 'right' ? 'R' : '');

export function VideoStage(props: Props) {
  const { videoUrl } = props;
  if (!videoUrl) return <EmptyStage onPickFile={props.onPickFile} onSample={props.onSample} onRecorded={props.onRecorded} preferCamera={props.preferCamera} framing={props.framing} />;
  return <LoadedStage {...props} videoUrl={videoUrl} />;
}

function EmptyStage({
  onPickFile,
  onSample,
  onRecorded,
  preferCamera,
  framing,
}: {
  onPickFile: (f: File) => void;
  onSample: () => void;
  onRecorded: (f: File) => void;
  preferCamera?: boolean;
  framing: FramingNeed | null;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  // On a non-https page the camera API is missing; still show Record so the
  // camera screen can explain why it can't start.
  const recordable = canRecord() || !window.isSecureContext;
  const [camera, setCamera] = useState(!!preferCamera && recordable);

  if (camera) return <CameraStage onRecorded={onRecorded} onClose={() => setCamera(false)} framing={framing} />;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onPickFile(f);
      }}
      className={`stage-gradient relative flex aspect-[4/5] w-full flex-col items-center justify-center overflow-hidden rounded-[20px] px-6 text-center text-ink transition sm:aspect-[16/11] ${
        dragging ? 'ring-2 ring-ink ring-offset-2 ring-offset-canvas' : ''
      }`}
    >
      {/* Framing guides, a hint of where the body should be. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-6 sm:inset-8">
        {['left-0 top-0 border-l-2 border-t-2 rounded-tl-xl', 'right-0 top-0 border-r-2 border-t-2 rounded-tr-xl', 'left-0 bottom-0 border-l-2 border-b-2 rounded-bl-xl', 'right-0 bottom-0 border-r-2 border-b-2 rounded-br-xl'].map((c) => (
          <span key={c} className={`absolute h-8 w-8 border-ink/20 ${c}`} />
        ))}
      </div>

      <div className="relative flex max-w-[340px] flex-col items-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-[14px] bg-ink text-cream">
          {recordable ? <IconCamera size={24} /> : <IconUpload size={24} />}
        </span>
        <h2 className="display-caps mt-5 text-[26px] leading-tight sm:text-[28px]">
          {recordable ? 'Record or add a set' : 'Add a recorded set'}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink/70">
          {recordable
            ? 'Film it here with your camera, or drop in a clip you already have (MOV, MP4, WebM).'
            : 'Drop a clip here or choose one from your device. MOV, MP4 and WebM are supported.'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {recordable && (
            <button
              type="button"
              onClick={() => setCamera(true)}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-[18px] text-sm font-medium text-cream transition hover:bg-black sm:px-5"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              Record a set
            </button>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`inline-flex h-11 items-center gap-2 rounded-full px-[18px] text-sm font-medium transition sm:px-5 ${
              recordable
                ? 'border border-ink/20 bg-white/35 text-ink hover:bg-white/50'
                : 'bg-ink text-cream hover:bg-black'
            }`}
          >
            <IconUpload size={16} />
            Upload video
          </button>
        </div>
        <button
          type="button"
          onClick={onSample}
          className="mt-4 text-sm font-medium text-ink underline decoration-ink/35 underline-offset-4 transition hover:decoration-ink"
        >
          No video? Try a sample set
        </button>
        <p className="mt-3 text-xs text-ink/50">The video stays on this device.</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_VIDEO_TYPES}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPickFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function LoadedStage({
  videoUrl,
  videoRef,
  tracksRef,
  stepMs,
  markers,
  totals,
  lostSpans,
  analyzing,
  decodeError,
  onLoadedMetadata,
  onDecodeError,
}: Props & { videoUrl: string }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dims, setDims] = useState<{ vw: number; vh: number } | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [hud, setHud] = useState<HudArm[]>([]);
  const [note, setNote] = useState<RepMarker | null>(null);
  // The draw loop reads the latest markers without restarting.
  const markersRef = useRef(markers);
  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  // Draw loop: replay stored analysis for whatever frame is on screen.
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!video || !canvas || !box) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    const resize = () => {
      const r = box.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      cssW = r.width;
      cssH = r.height;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      lastKey = '';
    };
    const ro = new ResizeObserver(resize);
    ro.observe(box);

    let raf = 0;
    let lastKey = '';
    let lastHud = '';
    let lastNote = '';
    const tick = () => {
      const tracks = tracksRef.current ?? [];
      const tMs = video.currentTime * 1000;
      const frames = tracks.map((t) => (video.videoWidth ? frameAt(t.frames, tMs, stepMs) : null));
      const key = `${tracks.map((t, i) => `${t.side}:${frames[i]?.tMs ?? -1}:${t.frames.length}`).join(',')}|${cssW}x${cssH}`;
      if (key !== lastKey) {
        lastKey = key;
        const rect = containRect(cssW, cssH, video.videoWidth, video.videoHeight);
        drawOverlay(
          ctx,
          tracks.map((t, i) => ({ frame: frames[i], color: armColor(t.side) })),
          rect,
          cssW,
          cssH,
          dpr,
        );
      }
      const h: HudArm[] = tracks.map((t, i) => ({
        side: t.side,
        // Past the last sampled frame (the clip's final moments), keep the final count.
        count: frames[i]?.count ?? (t.frames.length && tMs > t.frames[t.frames.length - 1].tMs ? t.frames[t.frames.length - 1].count : 0),
        lost: !!frames[i]?.trackingLost,
      }));
      const hk = h.map((x) => `${x.side}${x.count}${x.lost}`).join('|');
      if (hk !== lastHud) {
        lastHud = hk;
        setHud(h);
      }
      const n = markersRef.current.find((m) => m.note && m.endMs !== undefined && tMs >= m.endMs && tMs < m.endMs + NOTE_MS);
      if ((n?.key ?? '') !== lastNote) {
        lastNote = n?.key ?? '';
        setNote(n ?? null);
      }
      raf = requestAnimationFrame(tick);
    };
    resize();
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [videoRef, tracksRef, stepMs, videoUrl]);

  const showCounts = totals !== null || analyzing;
  const lostArms = hud.filter((a) => a.lost);
  const multi = hud.length > 1;

  const aspect = dims ? dims.vw / dims.vh : 9 / 16;

  const seek = (ms: number) => {
    const v = videoRef.current;
    if (!v || analyzing) return;
    v.pause();
    v.currentTime = ms / 1000;
  };

  return (
    <div className="overflow-hidden rounded-[20px] bg-stage">
      <div className="relative flex justify-center bg-[#141413] px-0 sm:px-4 sm:pt-4">
        <div
          ref={boxRef}
          className="relative max-w-full"
          style={{
            aspectRatio: `${aspect}`,
            // Fit the clip's own aspect ratio inside the stage, capped in height,
            // so there is no letterboxing between the video and the overlay.
            width: `min(100%, calc(min(68svh, 720px) * ${aspect}))`,
          }}
        >
          <video
            ref={videoRef}
            src={videoUrl}
            playsInline
            muted
            preload="auto"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) setDims({ vw: v.videoWidth, vh: v.videoHeight });
              setDurationMs(Number.isFinite(v.duration) ? v.duration * 1000 : 0);
              onLoadedMetadata(v);
            }}
            // Browser recordings often report their real duration only after a scan.
            onDurationChange={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) setDurationMs(d * 1000);
            }}
            onError={onDecodeError}
            onClick={() => {
              const v = videoRef.current;
              if (!v || analyzing) return;
              if (v.paused) void v.play().catch(() => {});
              else v.pause();
            }}
            className="absolute inset-0 h-full w-full bg-black object-contain sm:rounded-lg"
          />
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

          {/* HUD */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            {showCounts && hud.length > 0 ? (
              <div className="flex shrink-0 flex-col gap-1.5">
                {hud.map((arm, i) => (
                  <span
                    key={arm.side ?? i}
                    className="inline-flex items-center gap-1.5 self-start whitespace-nowrap rounded-full bg-black/70 px-3 py-1.5 text-[13px] font-semibold text-white backdrop-blur"
                  >
                    {multi && (
                      <span
                        className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: armColor(arm.side).solid }}
                      >
                        {armShort(arm.side)}
                      </span>
                    )}
                    <span className="tabular-nums">{arm.count}</span>
                    {totals && !analyzing && (
                      <span className="tabular-nums text-white/50">/ {totals[i] ?? 0}</span>
                    )}
                    <span className="text-white/70">reps</span>
                  </span>
                ))}
              </div>
            ) : (
              <span />
            )}
            {note?.note && !analyzing && lostArms.length === 0 && (
              <span
                className={`rounded-full px-3 py-1.5 text-[13px] font-semibold shadow ${
                  note.note.tone === 'warn' ? 'bg-amber-400 text-black' : 'bg-cream/95 text-ink'
                }`}
              >
                {note.note.text}
              </span>
            )}
            {lostArms.length > 0 && (
              <span className="rounded-full bg-amber-400 px-3 py-1.5 text-[13px] font-semibold text-black">
                Tracking lost
                {multi && lostArms.length === 1 ? ` · ${lostArms[0].side} arm` : ''}
              </span>
            )}
          </div>

          {decodeError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center">
              <p className="max-w-xs text-sm text-white/80">This clip can&apos;t be played here. See the note below.</p>
            </div>
          )}
        </div>

      </div>

      <PlayerControls
        videoRef={videoRef}
        durationMs={durationMs}
        markers={markers}
        lostSpans={lostSpans}
        disabled={analyzing || decodeError}
        onSeek={seek}
      />
    </div>
  );
}
