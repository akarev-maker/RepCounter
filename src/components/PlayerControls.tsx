import { useEffect, useState } from 'react';
import { formatTime } from './formatTime';
import { IconPause, IconPlay } from './icons';

export interface Span {
  startMs: number;
  endMs: number;
}

/** A clickable dot on the timeline at the start of a rep. */
export interface RepMarker {
  key: string;
  ms: number;
  color: string;
  label: string;
}

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  durationMs: number;
  markers: RepMarker[];
  lostSpans: Span[];
  disabled: boolean;
  onSeek: (ms: number) => void;
}

export function PlayerControls({ videoRef, durationMs, markers, lostSpans, disabled, onSeek }: Props) {
  const [playing, setPlaying] = useState(false);
  const [tMs, setTMs] = useState(0);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      setTMs(v.currentTime * 1000);
      if (!v.paused) raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setPlaying(true);
      raf = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
      setTMs(v.currentTime * 1000);
    };
    const onTime = () => setTMs(v.currentTime * 1000);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onPause);
    v.addEventListener('seeked', onTime);
    v.addEventListener('timeupdate', onTime);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onPause);
      v.removeEventListener('seeked', onTime);
      v.removeEventListener('timeupdate', onTime);
    };
  }, [videoRef]);

  const toggle = () => {
    const v = videoRef.current;
    if (!v || disabled) return;
    if (v.paused) {
      if (v.ended) v.currentTime = 0;
      void v.play().catch(() => {});
    } else {
      v.pause();
    }
  };

  const setSpeed = (r: number) => {
    setRate(r);
    if (videoRef.current) videoRef.current.playbackRate = r;
  };

  const pct = (ms: number) => `${durationMs ? Math.min(100, (ms / durationMs) * 100) : 0}%`;

  return (
    <div className={`flex items-center gap-3 px-3 pb-3 pt-2 sm:px-4 ${disabled ? 'opacity-50' : ''}`}>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-label={playing ? 'Pause' : 'Play'}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-ink transition hover:bg-white/90 disabled:cursor-not-allowed"
      >
        {playing ? <IconPause size={16} /> : <IconPlay size={16} className="translate-x-px" />}
      </button>

      <div className="relative min-w-0 flex-1">
        {/* Track */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/15">
          {lostSpans.map((s, i) => (
            <div
              key={i}
              className="absolute inset-y-0 bg-amber-400/70"
              style={{ left: pct(s.startMs), width: `calc(${pct(s.endMs)} - ${pct(s.startMs)})` }}
            />
          ))}
          <div className="absolute inset-y-0 left-0 rounded-full bg-white/70" style={{ width: pct(tMs) }} />
        </div>
        <input
          type="range"
          className="scrubber relative"
          min={0}
          max={Math.max(1, Math.round(durationMs))}
          step={1}
          value={Math.round(tMs)}
          disabled={disabled}
          aria-label="Seek"
          onChange={(e) => onSeek(Number(e.target.value))}
        />
        {/* Rep markers */}
        {markers.map((m) => (
          <button
            key={m.key}
            type="button"
            disabled={disabled}
            onClick={() => onSeek(m.ms)}
            title={`${m.label} at ${formatTime(m.ms)}`}
            aria-label={`Jump to ${m.label.toLowerCase()}`}
            className="absolute top-[3px] h-3 w-3 -translate-x-1/2 rounded-full border-2 border-stage transition hover:scale-125"
            style={{ left: pct(m.ms), backgroundColor: m.color }}
          />
        ))}
      </div>

      <span className="shrink-0 text-xs font-medium tabular-nums text-white/70">
        {formatTime(tMs)} / {formatTime(durationMs)}
      </span>

      <div className="hidden shrink-0 rounded-lg bg-white/10 p-0.5 sm:flex">
        {[0.5, 1].map((r) => (
          <button
            key={r}
            type="button"
            disabled={disabled}
            onClick={() => setSpeed(r)}
            className={`h-7 rounded-md px-2 text-xs font-semibold transition ${
              rate === r ? 'bg-white text-ink' : 'text-white/70 hover:text-white'
            }`}
          >
            {r}×
          </button>
        ))}
      </div>
    </div>
  );
}
